/**
 * fin-zrj.8 — Toast duration reading-rate calculation
 *
 * Verifies that toastDurationMs() computes display time using an average
 * reading rate of 250 wpm, with a floor of 2200 ms and a ceiling of 8000 ms.
 *
 * TDD: this test was written BEFORE the fix and was FAILING. After the fix
 * (adding toastDurationMs() and wiring showToast to use it), this test passes.
 */

import { describe, expect, it } from "vitest";
import { toastDurationMs } from "../src/main.jsx";

describe("fin-zrj.8 — toastDurationMs reading-rate calculation", () => {
  it(
    "test_short_message_returns_floor: a very short message (≤2 words) gets the minimum 2200ms",
    () => {
      // 1 word: (1/250) * 60000 = 240ms → floor 2200
      expect(toastDurationMs("OK")).toBe(2200);
      // 2 words: (2/250) * 60000 = 480ms → floor 2200
      expect(toastDurationMs("Saved successfully")).toBe(2200);
    }
  );

  it(
    "test_medium_message_scales_with_words: a medium-length message scales proportionally",
    () => {
      // 10 words: (10/250) * 60000 = 2400ms → above floor, below ceiling
      const tenWordMsg = "one two three four five six seven eight nine ten";
      const dur = toastDurationMs(tenWordMsg);
      expect(dur).toBeGreaterThan(2200);
      expect(dur).toBeLessThan(8000);
      // Exact: (10/250)*60000 = 2400
      expect(dur).toBe(2400);
    }
  );

  it(
    "test_long_message_returns_ceiling: a very long message (>33 words at 250wpm) is capped at 8000ms",
    () => {
      // 34 words: (34/250)*60000 = 8160ms → ceiling 8000
      const manyWords = Array(34).fill("word").join(" ");
      expect(toastDurationMs(manyWords)).toBe(8000);
    }
  );

  it(
    "test_exactly_at_ceiling_boundary: 33.33 words = exactly 8000ms",
    () => {
      // 33 words: (33/250)*60000 = 7920ms → below ceiling
      const thirtyThree = Array(33).fill("word").join(" ");
      expect(toastDurationMs(thirtyThree)).toBe(7920);

      // 34 words: (34/250)*60000 = 8160ms → clamped to 8000
      const thirtyFour = Array(34).fill("word").join(" ");
      expect(toastDurationMs(thirtyFour)).toBe(8000);
    }
  );

  it(
    "test_whitespace_trimming: leading/trailing spaces do not inflate word count",
    () => {
      // Same as 1-word message
      expect(toastDurationMs("  OK  ")).toBe(2200);
    }
  );
});
