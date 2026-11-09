import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDayData, calculateStats, focusMinutes } from "../src/components/pages/history/stats.ts";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

const crossingMidnight = {
  id: "s1",
  created_at: at(8, 23, 30).toISOString(),
  start_time: at(8, 23, 30).toISOString(),
  end_time: at(9, 0, 30).toISOString(),
  session_type: "focus",
  completed: true,
};

const noPauses = new Map<string, { start: string; end: string | null }[]>();
const chartWindow = { period: "custom", dayOffset: 0, customStartDate: "2026-11-08", customEndDate: "2026-11-09" } as const;

function dailyMinutes(pauses: typeof noPauses): number[] {
  return buildDayData(chartWindow, { sessions: [crossingMidnight], pauses }).map((day) => day.minutes);
}

test("a session crossing midnight counts on both days", () => {
  assert.deepEqual(dailyMinutes(noPauses), [30, 30]);
});

test("a pause reduces only the day it happened on", () => {
  const pauses = new Map([["s1", [{ start: at(8, 23, 40).toISOString(), end: at(8, 23, 50).toISOString() }]]]);
  assert.deepEqual(dailyMinutes(pauses), [20, 30]);
});

test("a pause spanning midnight reduces both days", () => {
  const pauses = new Map([["s1", [{ start: at(8, 23, 50).toISOString(), end: at(9, 0, 10).toISOString() }]]]);
  assert.deepEqual(dailyMinutes(pauses), [20, 20]);
});

test("focusMinutes ignores time outside the window", () => {
  const report = { sessions: [crossingMidnight], pauses: noPauses };
  assert.equal(focusMinutes(report, { start: at(9, 1), end: at(10, 0) }), 0);
});

test("today's minutes include the part after midnight, and the session counts on its start day", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: at(9, 1) });
  const stats = calculateStats({ sessions: [crossingMidnight], pauses: noPauses });
  assert.equal(stats.todayMinutes, 30);
  assert.equal(stats.todaySessions, 0);
});
