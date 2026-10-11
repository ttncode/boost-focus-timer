/*
 * A small supabase-js-style query builder over localStorage.
 * Tables live under `bft:db:<table>`, and every write is echoed to
 * `channel().on("postgres_changes")` listeners so open views stay in sync.
 */

export type Row = { id: string; created_at: string; updated_at?: string } & Record<string, unknown>;

export interface DbError {
  readonly message: string;
}

export interface DbResult<T> {
  readonly data: T | null;
  readonly error: DbError | null;
  readonly count?: number | null;
}

type ChangeEvent = "INSERT" | "UPDATE" | "DELETE";

export interface ChangePayload<T> {
  readonly eventType: ChangeEvent;
  readonly new: T;
  readonly old: Partial<T>;
  readonly table: string;
}

type Predicate = (row: Record<string, unknown>) => boolean;

type Action =
  | { kind: "select" }
  | { kind: "insert"; rows: Record<string, unknown>[] }
  | { kind: "upsert"; rows: Record<string, unknown>[]; onConflict: string }
  | { kind: "update"; patch: Record<string, unknown> }
  | { kind: "delete" };

const STORAGE_PREFIX = "bft:db:";

function readTable(table: string): Row[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + table);
    return raw ? (JSON.parse(raw) as Row[]) : [];
  } catch (error) {
    console.error(`local-db: unreadable table "${table}"`, error);
    return [];
  }
}

function writeTable(table: string, rows: readonly Row[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_PREFIX + table, JSON.stringify(rows));
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return String(a) < String(b) ? -1 : 1;
}

function pickColumn(row: Record<string, unknown>, column: string): unknown {
  return column.split("->").reduce<unknown>(
    (value, key) =>
      value && typeof value === "object" ? (value as Record<string, unknown>)[key.replace(/>/g, "")] : undefined,
    row,
  );
}

type Listener = { table: string; event: ChangeEvent | "*"; callback: (payload: ChangePayload<Row>) => void };

const listeners = new Set<Listener>();

function emit(table: string, payload: Omit<ChangePayload<Row>, "table">): void {
  queueMicrotask(() => {
    listeners.forEach((listener) => {
      const matchesEvent = listener.event === "*" || listener.event === payload.eventType;
      if (listener.table === table && matchesEvent) listener.callback({ ...payload, table });
    });
  });
}

export class Query<T extends Row = Row> implements PromiseLike<DbResult<T[]>> {
  private readonly predicates: Predicate[] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private window: { from: number; to: number } | null = null;
  private action: Action = { kind: "select" };
  private returning = true;

  private readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: { count?: string; head?: boolean }): this {
    void columns;
    void options;
    this.returning = true;
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.action = { kind: "insert", rows: Array.isArray(values) ? values : [values] };
    this.returning = false;
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ): this {
    const rows = Array.isArray(values) ? values : [values];
    this.action = { kind: "upsert", rows, onConflict: options?.onConflict ?? "id" };
    this.returning = false;
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.action = { kind: "update", patch };
    this.returning = false;
    return this;
  }

  delete(): this {
    this.action = { kind: "delete" };
    this.returning = false;
    return this;
  }

  private where(predicate: Predicate): this {
    this.predicates.push(predicate);
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.where((row) => pickColumn(row, column) === value);
  }

  neq(column: string, value: unknown): this {
    return this.where((row) => pickColumn(row, column) !== value);
  }

  gt(column: string, value: unknown): this {
    return this.where((row) => compare(pickColumn(row, column), value) > 0);
  }

  gte(column: string, value: unknown): this {
    return this.where((row) => compare(pickColumn(row, column), value) >= 0);
  }

  lt(column: string, value: unknown): this {
    return this.where((row) => compare(pickColumn(row, column), value) < 0);
  }

  lte(column: string, value: unknown): this {
    return this.where((row) => compare(pickColumn(row, column), value) <= 0);
  }

  in(column: string, values: readonly unknown[]): this {
    return this.where((row) => values.includes(pickColumn(row, column)));
  }

  is(column: string, value: null | boolean): this {
    return this.where((row) => (pickColumn(row, column) ?? null) === value);
  }

  not(column: string, operator: "is" | "eq", value: unknown): this {
    return this.where((row) => (pickColumn(row, column) ?? null) !== value);
  }

  contains(column: string, values: readonly unknown[]): this {
    return this.where((row) => {
      const cell = pickColumn(row, column);
      return Array.isArray(cell) && values.every((value) => cell.includes(value));
    });
  }

  ilike(column: string, pattern: string): this {
    const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
    return this.where((row) => regex.test(String(pickColumn(row, column) ?? "")));
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sorts = [...this.sorts, { column, ascending: options?.ascending ?? true }];
    return this;
  }

  limit(count: number): this {
    this.window = { from: this.window?.from ?? 0, to: (this.window?.from ?? 0) + count - 1 };
    return this;
  }

  range(from: number, to: number): this {
    this.window = { from, to };
    return this;
  }

  async single(): Promise<DbResult<T>> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    if (!data || data.length !== 1) return { data: null, error: { message: "Expected exactly one row" } };
    return { data: data[0], error: null };
  }

  async maybeSingle(): Promise<DbResult<T>> {
    const { data, error } = await this.run();
    return { data: data?.[0] ?? null, error };
  }

  then<R1 = DbResult<T[]>, R2 = never>(
    onFulfilled?: ((value: DbResult<T[]>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onFulfilled, onRejected);
  }

  private matches(row: Row): boolean {
    return this.predicates.every((predicate) => predicate(row));
  }

  private async run(): Promise<DbResult<T[]>> {
    const rows = readTable(this.table);
    switch (this.action.kind) {
      case "select":
        return this.runSelect(rows);
      case "insert":
        return this.runInsert(rows, this.action.rows);
      case "upsert":
        return this.runUpsert(rows, this.action);
      case "update":
        return this.runUpdate(rows, this.action.patch);
      case "delete":
        return this.runDelete(rows);
      default: {
        const unreachable: never = this.action;
        return unreachable;
      }
    }
  }

  private runSelect(rows: Row[]): DbResult<T[]> {
    const matched = rows.filter((row) => this.matches(row));
    const sorted = this.sorts.reduceRight(
      (list, { column, ascending }) =>
        [...list].sort((a, b) => compare(pickColumn(a, column), pickColumn(b, column)) * (ascending ? 1 : -1)),
      matched,
    );
    const windowed = this.window ? sorted.slice(this.window.from, this.window.to + 1) : sorted;
    return { data: windowed as T[], error: null, count: matched.length };
  }

  private runInsert(rows: Row[], values: Record<string, unknown>[]): DbResult<T[]> {
    const now = new Date().toISOString();
    const inserted = values.map((value) => ({ created_at: now, updated_at: now, ...value, id: (value.id as string) ?? newId() }) as Row);
    writeTable(this.table, [...rows, ...inserted]);
    inserted.forEach((row) => emit(this.table, { eventType: "INSERT", new: row, old: {} }));
    return { data: this.returning ? (inserted as T[]) : null, error: null };
  }

  private runUpsert(rows: Row[], action: Extract<Action, { kind: "upsert" }>): DbResult<T[]> {
    const keys = action.onConflict.split(",").map((key) => key.trim());
    const sameKey = (a: Record<string, unknown>, b: Record<string, unknown>) => keys.every((key) => a[key] === b[key]);
    const existing = action.rows.filter((value) => rows.some((row) => sameKey(row, value)));
    const fresh = action.rows.filter((value) => !existing.includes(value));
    const now = new Date().toISOString();
    const merged = rows.map((row) => {
      const patch = existing.find((value) => sameKey(row, value));
      return patch ? ({ ...row, ...patch, updated_at: now } as Row) : row;
    });
    writeTable(this.table, merged);
    merged
      .filter((row, index) => row !== rows[index])
      .forEach((row) => emit(this.table, { eventType: "UPDATE", new: row, old: {} }));
    const inserted = this.runInsert(merged, fresh).data ?? [];
    const updated = merged.filter((row, index) => row !== rows[index]);
    return { data: this.returning ? ([...updated, ...inserted] as T[]) : null, error: null };
  }

  private runUpdate(rows: Row[], patch: Record<string, unknown>): DbResult<T[]> {
    const changed: { before: Row; after: Row }[] = [];
    const next = rows.map((row) => {
      if (!this.matches(row)) return row;
      const after = { ...row, ...patch } as Row;
      changed.push({ before: row, after });
      return after;
    });
    writeTable(this.table, next);
    changed.forEach(({ before, after }) => emit(this.table, { eventType: "UPDATE", new: after, old: before }));
    return { data: this.returning ? (changed.map(({ after }) => after) as T[]) : null, error: null };
  }

  private runDelete(rows: Row[]): DbResult<T[]> {
    const removed = rows.filter((row) => this.matches(row));
    writeTable(this.table, rows.filter((row) => !this.matches(row)));
    removed.forEach((row) => emit(this.table, { eventType: "DELETE", new: {} as Row, old: row }));
    return { data: this.returning ? (removed as T[]) : null, error: null };
  }
}

export interface Channel {
  on<T extends Row = Row>(
    type: "postgres_changes",
    filter: { event: ChangeEvent | "*"; schema?: string; table: string; filter?: string },
    callback: (payload: ChangePayload<T>) => void,
  ): Channel;
  subscribe(callback?: (status: string) => void): Channel;
  readonly listeners: readonly Listener[];
}

function createChannel(): Channel {
  const own: Listener[] = [];
  const channel: Channel = {
    listeners: own,
    on(type, filter, callback) {
      void type;
      own.push({ table: filter.table, event: filter.event, callback: callback as Listener["callback"] });
      return channel;
    },
    subscribe(callback) {
      own.forEach((listener) => listeners.add(listener));
      callback?.("SUBSCRIBED");
      return channel;
    },
  };
  return channel;
}

export const localDb = {
  from<T extends Row = Row>(table: string): Query<T> {
    return new Query<T>(table);
  },
  channel(name: string): Channel {
    void name;
    return createChannel();
  },
  removeChannel(channel: Channel): void {
    channel.listeners.forEach((listener) => listeners.delete(listener));
  },
};

const USER_ID_KEY = "bft:userId";

/** Stable per-browser id that owns every row this browser writes. */
export function getLocalUserId(): string {
  if (typeof window === "undefined") return "guest";
  const existing = window.localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const created = newId();
  window.localStorage.setItem(USER_ID_KEY, created);
  return created;
}
