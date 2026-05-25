/**
 * probability-display.test.js
 *
 * Unit tests for src/probability-display.js — R4-Q10 rounding rule for
 * Plan Endurance and Target Confidence tiles.
 *
 * Rounding convention: 0.475 → "50%" (half-up — Math.round rounds 9.5 → 10).
 * This is documented in src/probability-display.js and in the test below.
 *
 * Beads: fin-5g3  |  Phase: R4.9.5b-2  |  Persona: Hilbert
 */

import { describe, expect, it } from "vitest";
import { formatProbabilityForDisplay } from "../src/probability-display.js";

// ── spec cases from R4-Q10 ────────────────────────────────────────────────────

describe("formatProbabilityForDisplay — spec cases from R4-Q10", () => {
  it("p=0.0042, margin=undefined → rare (under 5%), rare=true, marginText=null", () => {
    const r = formatProbabilityForDisplay(0.0042, undefined);
    expect(r.primary).toBe("rare (under 5%)");
    expect(r.rare).toBe(true);
    expect(r.veryLikely).toBe(false);
    expect(r.marginText).toBeNull();
  });

  it("p=0.962, margin=0.01 → very likely (over 95%), veryLikely=true, marginText null (CI < 2pp)", () => {
    const r = formatProbabilityForDisplay(0.962, 0.01);
    expect(r.primary).toBe("very likely (over 95%)");
    expect(r.veryLikely).toBe(true);
    expect(r.rare).toBe(false);
    // margin = 0.01 (1pp) which is NOT > 0.02, so no marginText
    expect(r.marginText).toBeNull();
  });

  it("p=0.1042, margin=0.0566 → primary '10%', marginText '±6pp'", () => {
    // 0.1042 × 20 = 2.084 → Math.round(2.084) = 2 → 2/20 × 100 = 10
    const r = formatProbabilityForDisplay(0.1042, 0.0566);
    expect(r.primary).toBe("10%");
    // 0.0566 × 100 = 5.66 → Math.round(5.66) = 6 → "±6pp"
    expect(r.marginText).toBe("±6pp");
    expect(r.rare).toBe(false);
    expect(r.veryLikely).toBe(false);
  });

  it("p=0.5, margin=0.02 → primary '50%', marginText null (boundary: exactly 2pp not > 2pp)", () => {
    const r = formatProbabilityForDisplay(0.5, 0.02);
    expect(r.primary).toBe("50%");
    // margin = 0.02 exactly is NOT > 0.02, so marginText is null
    expect(r.marginText).toBeNull();
  });

  it("p=0.5, margin=0.0201 → primary '50%', marginText '±2pp'", () => {
    const r = formatProbabilityForDisplay(0.5, 0.0201);
    expect(r.primary).toBe("50%");
    // 0.0201 > 0.02: show margin; 0.0201 × 100 = 2.01 → Math.round(2.01) = 2 → "±2pp"
    expect(r.marginText).toBe("±2pp");
  });

  it("p=0.95, margin=0.02 → primary '95%', marginText null (endpoint of non-rare range)", () => {
    // 0.95 is NOT > 0.95, so it falls into the 5pp bucket path
    const r = formatProbabilityForDisplay(0.95, 0.02);
    expect(r.primary).toBe("95%");
    expect(r.rare).toBe(false);
    expect(r.veryLikely).toBe(false);
    expect(r.marginText).toBeNull();
  });

  it("p=0.96, margin=0.02 → primary 'very likely (over 95%)'", () => {
    const r = formatProbabilityForDisplay(0.96, 0.02);
    expect(r.primary).toBe("very likely (over 95%)");
    expect(r.veryLikely).toBe(true);
  });

  it("p=0.05, margin=0.02 → primary '5%' (low endpoint of non-rare range)", () => {
    // 0.05 is NOT < 0.05, so it falls into the 5pp bucket path
    // 0.05 × 20 = 1 → Math.round(1) = 1 → 1/20 × 100 = 5
    const r = formatProbabilityForDisplay(0.05, 0.02);
    expect(r.primary).toBe("5%");
    expect(r.rare).toBe(false);
  });

  it("p=0.049, margin=0.02 → primary 'rare (under 5%)'", () => {
    const r = formatProbabilityForDisplay(0.049, 0.02);
    expect(r.primary).toBe("rare (under 5%)");
    expect(r.rare).toBe(true);
  });

  /**
   * Half-up boundary: p=0.475.
   *
   * 0.475 × 20 = 9.5 → Math.round(9.5) = 10 (JS rounds ties to +Inf, i.e. half-up)
   * → 10/20 × 100 = 50%.
   *
   * This is the intentional documented choice in src/probability-display.js.
   * "50% not 45%" is the expected primary for this input.
   */
  it("p=0.475 → primary '50%' (half-up per Math.round convention — documented)", () => {
    const r = formatProbabilityForDisplay(0.475, undefined);
    expect(r.primary).toBe("50%");
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe("formatProbabilityForDisplay — edge cases", () => {
  it("p=0 → 'rare (under 5%)'", () => {
    const r = formatProbabilityForDisplay(0);
    expect(r.primary).toBe("rare (under 5%)");
    expect(r.rare).toBe(true);
  });

  it("p=1 → 'very likely (over 95%)'", () => {
    const r = formatProbabilityForDisplay(1);
    expect(r.primary).toBe("very likely (over 95%)");
    expect(r.veryLikely).toBe(true);
  });

  it("p=0.4267, margin=undefined → primary '45%', marginText null", () => {
    // 0.4267 × 20 = 8.534 → Math.round(8.534) = 9 → 9/20 × 100 = 45
    const r = formatProbabilityForDisplay(0.4267);
    expect(r.primary).toBe("45%");
    expect(r.marginText).toBeNull();
  });

  it("p=0.7234 → '70%'", () => {
    // 0.7234 × 20 = 14.468 → 14 → 70
    const r = formatProbabilityForDisplay(0.7234);
    expect(r.primary).toBe("70%");
  });

  it("margin=0.0786 → '±8pp'", () => {
    // 0.0786 × 100 = 7.86 → Math.round(7.86) = 8 → "±8pp"
    const r = formatProbabilityForDisplay(0.5, 0.0786);
    expect(r.marginText).toBe("±8pp");
  });

  it("NaN probability is treated as 0 (rare)", () => {
    const r = formatProbabilityForDisplay(NaN);
    expect(r.primary).toBe("rare (under 5%)");
    expect(r.rare).toBe(true);
  });

  it("no arguments → rare (under 5%)", () => {
    const r = formatProbabilityForDisplay();
    expect(r.primary).toBe("rare (under 5%)");
  });
});
