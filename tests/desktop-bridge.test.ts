import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const items = new Map<string, string>();
const localStorage = {
  getItem: (key: string): string | null => items.get(key) ?? null,
  setItem: (key: string, value: string): void => void items.set(key, value),
  removeItem: (key: string): void => void items.delete(key),
};

const calls: [string, Record<string, unknown>][] = [];
const invoke = async (command: string, args: Record<string, unknown>): Promise<void> => {
  calls.push([command, args]);
};
Object.assign(globalThis, { localStorage, __TAURI__: { core: { invoke } } });

const { clearRunningTimer, hasBackgroundWorker, isDesktopApp, openLinkOnDesktop, readRunningTimer, trackRunningTimer } =
  await import("../src/components/lib/extension.ts");

const TIMER = { kind: "focus", sessionId: "s1", endAt: 5000, totalMs: 5000, goal: "Write" } as const;

beforeEach(() => {
  items.clear();
  calls.length = 0;
});

test("the desktop shell counts as the background worker", () => {
  assert.equal(isDesktopApp(), true);
  assert.equal(hasBackgroundWorker(), true);
});

test("a running timer is recorded and scheduled with the shell", () => {
  trackRunningTimer(TIMER);
  assert.deepEqual(readRunningTimer(), TIMER);
  assert.deepEqual(calls, [["schedule_end", { at: 5000, title: "Focus session complete", body: "Write · time for a break." }]]);
});

test("clearing the timer cancels the shell's notification", () => {
  trackRunningTimer(TIMER);
  calls.length = 0;
  clearRunningTimer();
  assert.equal(readRunningTimer(), null);
  assert.deepEqual(calls, [["cancel_end", {}]]);
});

test("links go to the default browser instead of a new webview", () => {
  let isPrevented = false;
  openLinkOnDesktop({ preventDefault: () => (isPrevented = true) }, "https://example.com");
  assert.equal(isPrevented, true);
  assert.deepEqual(calls, [["open_url", { url: "https://example.com" }]]);
});
