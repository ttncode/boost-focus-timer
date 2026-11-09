import assert from "node:assert/strict";
import { test } from "node:test";
import { backupFileName, createBackup, parseBackup, restoreBackup } from "../src/components/lib/backup.ts";

const EXPORT_DATE = new Date("2026-11-09T10:00:00.000Z");

function fakeStorage(initial: Record<string, string>, maxEntries = Infinity): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem(key: string, value: string) {
      if (!items.has(key) && items.size >= maxEntries) throw new Error("quota exceeded");
      items.set(key, value);
    },
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
}

const snapshot = (storage: Storage) =>
  Object.fromEntries(Array.from({ length: storage.length }, (_, index) => [storage.key(index), storage.getItem(storage.key(index) ?? "")]));

test("a backup round-trips every entry except the running countdown", () => {
  const source = fakeStorage({ "bft:db:todos": "[1]", lastFocusDuration: "25", "bft:runningTimer": "{}" });
  const entries = parseBackup(createBackup(source, EXPORT_DATE));
  assert.deepEqual(entries, { "bft:db:todos": "[1]", lastFocusDuration: "25" });
});

test("the file name carries the export date", () => {
  assert.equal(backupFileName(EXPORT_DATE), "boost-focus-timer-backup-2026-11-09.json");
});

test("anything but a readable backup is refused", () => {
  const invalid = [
    "not json",
    "null",
    "[]",
    JSON.stringify({ app: "other", version: 1, data: {} }),
    JSON.stringify({ app: "boost-focus-timer", version: 2, data: {} }),
    JSON.stringify({ app: "boost-focus-timer", version: 1, data: [] }),
    JSON.stringify({ app: "boost-focus-timer", version: 1, data: { key: 1 } }),
  ];
  invalid.forEach((text) => assert.equal(parseBackup(text), null, text));
});

test("restoring replaces old data and leaves the running countdown for the caller to cancel", () => {
  const target = fakeStorage({ old: "1", "bft:runningTimer": "{}" });
  restoreBackup(target, { fresh: "2" });
  assert.deepEqual(snapshot(target), { "bft:runningTimer": "{}", fresh: "2" });
});

test("a restore that runs out of space puts the old data back", () => {
  const target = fakeStorage({ a: "1", b: "2" }, 2);
  assert.throws(() => restoreBackup(target, { x: "7", y: "8", z: "9" }), /quota/);
  assert.deepEqual(snapshot(target), { a: "1", b: "2" });
});
