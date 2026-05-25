/**
 * R4.9.5b-1 — Scenario card depletion annotation.
 *
 * Verifies:
 *   (a) depletionYear is computed correctly from a fixture rows array.
 *   (b) isZeroStart is set when starting corpus is zero.
 *   (c) When closing > 0, neither depletionYear nor isZeroStart is set.
 *   (d) The "Plan depleted at year N" annotation appears in the JSX source
 *       (structural check).
 *   (e) The "scenario starts at zero corpus" caption appears in the JSX source.
 *
 * Tests use the depletion-year logic extracted from overviewScenarioModels
 * as a pure function so the computation can be verified independently of
 * the React render tree.
 *
 * fin-c0g (R4.9.5b-1)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Extract the depletion-year logic as a pure function (mirrors main.jsx).
// ---------------------------------------------------------------------------

/**
 * scenarioDepletionInfo — mirrors the R4.9.5b-1 logic added to
 * overviewScenarioModels in src/main.jsx.
 *
 * @param {{ principal: number }} params
 * @param {{ closing: number }} final
 * @param {{ year: number; closing: number }[]} rows
 * @returns {{ depletionYear: number|null; isZeroStart: boolean }}
 */
function scenarioDepletionInfo(params, final, rows) {
  const startingCorpus = Number(params.principal) || 0;
  const closing = final.closing;
  let depletionYear = null;
  let isZeroStart = false;
  if (closing <= 0) {
    if (startingCorpus <= 0) {
      isZeroStart = true;
    } else {
      const deplRow = rows.slice(1).find((row) => row.closing <= 0);
      depletionYear = deplRow ? deplRow.year : null;
    }
  }
  return { depletionYear, isZeroStart };
}

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

/** Build a synthetic rows array with depletion at depYear. */
function makeRows(depYear, totalYears) {
  return Array.from({ length: totalYears + 1 }, (_, i) => ({
    year: i,
    closing: i < depYear ? 1_000_000 - i * 100_000 : 0
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scenarioDepletionInfo — depletion-year extraction", () => {
  it("returns depletionYear=5 for rows array depleting at year 5", () => {
    const params = { principal: 5_000_000 };
    const rows = makeRows(5, 30);
    const final = { closing: 0 };
    const { depletionYear, isZeroStart } = scenarioDepletionInfo(params, final, rows);
    expect(depletionYear).toBe(5);
    expect(isZeroStart).toBe(false);
  });

  it("returns depletionYear=1 for rows array depleting at year 1", () => {
    const params = { principal: 500_000 };
    const rows = makeRows(1, 10);
    const final = { closing: 0 };
    const { depletionYear, isZeroStart } = scenarioDepletionInfo(params, final, rows);
    expect(depletionYear).toBe(1);
    expect(isZeroStart).toBe(false);
  });

  it("returns depletionYear=30 for rows array depleting at last year", () => {
    // Build rows explicitly: all positive until year 30 which is zero
    const params = { principal: 3_000_000 };
    const rows = Array.from({ length: 31 }, (_, i) => ({
      year: i,
      closing: i < 30 ? 1_000_000 : 0
    }));
    const final = { closing: 0 };
    const { depletionYear, isZeroStart } = scenarioDepletionInfo(params, final, rows);
    expect(depletionYear).toBe(30);
    expect(isZeroStart).toBe(false);
  });

  it("returns isZeroStart=true when principal is zero (zero corpus input)", () => {
    const params = { principal: 0 };
    const rows = Array.from({ length: 31 }, (_, i) => ({ year: i, closing: 0 }));
    const final = { closing: 0 };
    const { depletionYear, isZeroStart } = scenarioDepletionInfo(params, final, rows);
    expect(isZeroStart).toBe(true);
    expect(depletionYear).toBeNull();
  });

  it("returns no depletion when final.closing > 0 (plan survives)", () => {
    const params = { principal: 10_000_000 };
    const rows = Array.from({ length: 31 }, (_, i) => ({ year: i, closing: 10_000_000 - i * 50_000 }));
    const final = { closing: rows[30].closing };
    const { depletionYear, isZeroStart } = scenarioDepletionInfo(params, final, rows);
    expect(depletionYear).toBeNull();
    expect(isZeroStart).toBe(false);
  });

  it("returns depletionYear=null when rows array has no depleted row despite final.closing=0", () => {
    // Edge case: rows all positive, final is 0 (shouldn't happen in practice, but guard).
    const params = { principal: 1_000_000 };
    const rows = Array.from({ length: 31 }, (_, i) => ({ year: i, closing: 100_000 }));
    const final = { closing: 0 };
    const { depletionYear, isZeroStart } = scenarioDepletionInfo(params, final, rows);
    expect(depletionYear).toBeNull();
    expect(isZeroStart).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Structural: JSX source contains the annotation strings
// ---------------------------------------------------------------------------

const mainJsx = readFileSync(resolve("src/main.jsx"), "utf8");

describe("Scenario chip depletion annotation in JSX source (R4.9.5b-1)", () => {
  it('renders "Plan depleted at year N" annotation string', () => {
    expect(mainJsx).toContain("Plan depleted at year");
  });

  it('renders "scenario starts at zero corpus" caption for zero-start case', () => {
    expect(mainJsx).toContain("scenario starts at zero corpus");
  });

  it("uses scenario.depletionYear in the annotation branch", () => {
    expect(mainJsx).toContain("scenario.depletionYear");
  });

  it("uses scenario.isZeroStart to distinguish zero-input from depletion", () => {
    expect(mainJsx).toContain("scenario.isZeroStart");
  });
});
