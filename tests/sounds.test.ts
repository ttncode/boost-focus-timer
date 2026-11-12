import assert from "node:assert/strict";
import { test } from "node:test";
import { SOUND_THEMES } from "../src/components/focus/sounds.ts";

test("every theme except Silent has a refill sound that stays quiet", () => {
  for (const theme of SOUND_THEMES) {
    const refill = theme.sounds.refill;
    if (theme.id === "silent") {
      assert.equal(refill, null);
      continue;
    }
    assert.ok(refill && refill.length > 0, `${theme.id} has no refill sound`);
    for (const tone of refill) assert.ok(tone.volume <= 0.15, `${theme.id} refill note is too loud`);
  }
});
