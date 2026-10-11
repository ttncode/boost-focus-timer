import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  clear(): void {
    this.items.clear();
  }
}

const storage = new MemoryStorage();
Object.assign(globalThis, { window: { localStorage: storage } });

const { localDb } = await import("../src/components/lib/local-db.ts");

type Todo = { id: string; created_at: string; user_id: string; title: string; position: number; done?: boolean };

beforeEach(() => storage.clear());

test("insert().select().single() returns the stored row with an id and timestamps", async () => {
  const { data, error } = await localDb.from<Todo>("todos").insert({ user_id: "u1", title: "Write", position: 1 }).select().single();
  assert.equal(error, null);
  assert.equal(data?.title, "Write");
  assert.ok(data?.id);
  assert.ok(data?.created_at);
});

test("filters, ordering and range compose like the supabase client", async () => {
  await localDb.from("todos").insert([
    { user_id: "u1", title: "b", position: 2 },
    { user_id: "u1", title: "a", position: 1 },
    { user_id: "u2", title: "other", position: 0 },
    { user_id: "u1", title: "c", position: 3 },
  ]);
  const { data } = await localDb.from<Todo>("todos").select("*").eq("user_id", "u1").order("position").range(0, 1);
  assert.deepEqual(
    data?.map((row) => row.title),
    ["a", "b"],
  );
});

test("update and delete only touch matching rows", async () => {
  await localDb.from("todos").insert([
    { id: "1", user_id: "u1", title: "keep", position: 1 },
    { id: "2", user_id: "u1", title: "change", position: 2 },
  ]);
  await localDb.from("todos").update({ done: true }).eq("id", "2");
  await localDb.from("todos").delete().eq("id", "1");
  const { data } = await localDb.from<Todo>("todos").select("*");
  assert.deepEqual(data, [{ ...data?.[0], id: "2", title: "change", done: true }]);
});

test("writes are echoed to realtime listeners until the channel is removed", async () => {
  const events: string[] = [];
  const channel = localDb
    .channel("todos")
    .on("postgres_changes", { event: "*", table: "todos" }, (payload) => events.push(payload.eventType))
    .subscribe();
  await localDb.from("todos").insert({ id: "1", title: "x" });
  await localDb.from("todos").update({ title: "y" }).eq("id", "1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  localDb.removeChannel(channel);
  await localDb.from("todos").delete().eq("id", "1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ["INSERT", "UPDATE"]);
});
