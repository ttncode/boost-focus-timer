import assert from "node:assert/strict";
import { test } from "node:test";
import { coffeeFill, currentFrame, isRefill, type FrameState } from "../src/components/focus/animations.ts";

const COMPLETED: FrameState = { isOnBreak: false, hasStartedBreak: false, hasStarted: true, showDirectBreak: false, isCompleted: true, totalSeconds: 1500, currentSeconds: 0 };

test("extending a finished 25-minute session by 10 minutes refills the cup to 10/25", () => {
  const empty = currentFrame("coffee-cup", COMPLETED);
  const extended = currentFrame("coffee-cup", { ...COMPLETED, isCompleted: false, currentSeconds: 600 });
  assert.equal(empty, 26);
  assert.equal(coffeeFill(extended, 26), 0.4);
  assert.ok(isRefill(empty, extended));
});

test("the slow refill during a break and the drain during focus are not refills", () => {
  assert.equal(isRefill(20, 19), false);
  assert.equal(isRefill(5, 6), false);
  assert.equal(isRefill(26, 26), false);
});

test("coffeeFill maps the first frame to a full cup and the last to an empty one", () => {
  assert.equal(coffeeFill(1, 26), 1);
  assert.equal(coffeeFill(26, 26), 0);
  assert.equal(coffeeFill(13.5, 26), 0.5);
});
