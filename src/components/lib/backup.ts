/*
 * All app data lives in localStorage, so a backup is a copy of its entries. Only the record of a
 * running countdown stays out: it describes this moment on this device.
 */

const BACKUP_APP = "boost-focus-timer";
const BACKUP_VERSION = 1;
const DEVICE_ONLY_KEYS: ReadonlySet<string> = new Set(["bft:runningTimer"]);

type Entries = Readonly<Record<string, string>>;

function backedUpKeys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? "").filter((key) => key && !DEVICE_ONLY_KEYS.has(key));
}

function readEntries(storage: Storage): Entries {
  return Object.fromEntries(backedUpKeys(storage).map((key) => [key, storage.getItem(key) ?? ""]));
}

function replaceEntries(storage: Storage, entries: Entries): void {
  backedUpKeys(storage).forEach((key) => storage.removeItem(key));
  Object.entries(entries).forEach(([key, value]) => storage.setItem(key, value));
}

export function backupFileName(date: Date): string {
  return `boost-focus-timer-backup-${date.toISOString().slice(0, 10)}.json`;
}

export function createBackup(storage: Storage, date: Date): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: date.toISOString(), data: readEntries(storage) });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Returns the backed-up entries, or null when the text is not a backup this version can read. */
export function parseBackup(text: string): Entries | null {
  const backup = parseJson(text);
  if (!isRecord(backup) || backup.app !== BACKUP_APP || backup.version !== BACKUP_VERSION || !isRecord(backup.data)) return null;
  return Object.values(backup.data).every((value) => typeof value === "string") ? (backup.data as Entries) : null;
}

/** Replaces all backed-up entries. On failure, usually full storage, puts the old ones back and rethrows. */
export function restoreBackup(storage: Storage, entries: Entries): void {
  const previous = readEntries(storage);
  try {
    replaceEntries(storage, entries);
  } catch (error) {
    replaceEntries(storage, previous);
    throw error;
  }
}
