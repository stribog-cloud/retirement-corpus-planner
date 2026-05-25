/**
 * percentile-sparkline.test.jsx
 *
 * Unit tests for the PercentileSparkline tick-position logic (R4.9.5b item 5).
 *
 * The sparkline component is defined inline in src/main.jsx and is a pure SVG
 * renderer with no external dependencies. We test it here via:
 *
 *  (a) Pure-logic tests: tick-position calculation extracted as a helper,
 *      verifying ordering, degenerate, and out-of-order inputs.
 *  (b) Structural tests: import the exported sparkline tick helper from
 *      src/main.jsx so the test can verify the component's public contract.
 *
 * We do NOT mount the React tree — no @testing-library/react is installed in
 * this project. Following the pattern of verdict-variants.test.jsx and
 * main.test.jsx, we test the pure functions directly.
 *
 * Beads: fin-5g3  |  Phase: R4.9.5b-2  |  Persona: Hilbert
 */

import { describe, expect, it } from "vitest";
import { calcSparklineTicks } from "../src/main.jsx";

// ── helper: expected positions ────────────────────────────────────────────────

// Default params match the PercentileSparkline component defaults
const W = 30; // width
const P = 4;  // pad
const INNER = W - P * 2; // 22

// ── normal input ──────────────────────────────────────────────────────────────

describe("calcSparklineTicks — normal input [10, 50, 90]", () => {
  it("returns exactly 3 ticks", () => {
    const ticks = calcSparklineTicks([10, 50, 90]);
    expect(ticks.length).toBe(3);
  });

  it("P10 tick is at left pad position", () => {
    const ticks = calcSparklineTicks([10, 50, 90]);
    expect(ticks[0].x).toBeCloseTo(P);
  });

  it("P90 tick is at right end position (pad + innerWidth)", () => {
    const ticks = calcSparklineTicks([10, 50, 90]);
    expect(ticks[2].x).toBeCloseTo(P + INNER);
  });

  it("P50 tick is at proportional center between P10 and P90", () => {
    const ticks = calcSparklineTicks([10, 50, 90]);
    // (50-10)/(90-10) = 40/80 = 0.5 → 0.5 * 22 + 4 = 15
    expect(ticks[1].x).toBeCloseTo(15);
  });

  it("tick x positions are strictly left < center < right", () => {
    const ticks = calcSparklineTicks([10, 50, 90]);
    expect(ticks[0].x).toBeLessThan(ticks[1].x);
    expect(ticks[1].x).toBeLessThan(ticks[2].x);
  });
});

// ── degenerate input ──────────────────────────────────────────────────────────

describe("calcSparklineTicks — degenerate [50, 50, 50]", () => {
  it("returns exactly 3 ticks", () => {
    const ticks = calcSparklineTicks([50, 50, 50]);
    expect(ticks.length).toBe(3);
  });

  it("all three ticks at center position", () => {
    const ticks = calcSparklineTicks([50, 50, 50]);
    const cx = P + INNER / 2; // 15
    expect(ticks[0].x).toBeCloseTo(cx);
    expect(ticks[1].x).toBeCloseTo(cx);
    expect(ticks[2].x).toBeCloseTo(cx);
  });
});

// ── out-of-order input ────────────────────────────────────────────────────────

describe("calcSparklineTicks — out-of-order [90, 50, 10]", () => {
  it("after sort: P10 at left, P50 at center, P90 at right", () => {
    const ticks = calcSparklineTicks([90, 50, 10]);
    expect(ticks[0].x).toBeCloseTo(P);
    expect(ticks[2].x).toBeCloseTo(P + INNER);
    // P50 at (50-10)/(90-10)*22+4 = 15
    expect(ticks[1].x).toBeCloseTo(15);
  });

  it("same positions as sorted input [10, 50, 90]", () => {
    const asc = calcSparklineTicks([10, 50, 90]);
    const desc = calcSparklineTicks([90, 50, 10]);
    expect(desc[0].x).toBeCloseTo(asc[0].x);
    expect(desc[1].x).toBeCloseTo(asc[1].x);
    expect(desc[2].x).toBeCloseTo(asc[2].x);
  });
});

// ── asymmetric distribution ───────────────────────────────────────────────────

describe("calcSparklineTicks — asymmetric [10, 20, 90]", () => {
  it("P50 is close to P10 side (skewed left)", () => {
    const ticks = calcSparklineTicks([10, 20, 90]);
    // (20-10)/(90-10) = 10/80 = 0.125 → 0.125 * 22 + 4 = 6.75
    expect(ticks[1].x).toBeCloseTo(6.75);
    expect(ticks[0].x).toBeLessThan(ticks[1].x);
    expect(ticks[1].x).toBeLessThan(ticks[2].x);
  });
});
