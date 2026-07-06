/**
 * tests/v2-parity-goldens.test.jsx
 *
 * fin-8fb — v2.0 default-state numeric parity goldens.
 *
 * Cross-cutting acceptance (v2-feature-specs.md): "BEFORE changing engines,
 * capture default-state outputs ... into a new test file tests/v2-parity-goldens.test.jsx
 * and keep it green throughout (except documented F1 loss-scenario cases which
 * don't affect default state)."
 *
 * These goldens were captured from `calculate()` on normalizeState({}) (BASE
 * defaults, no shocks / no realized losses) for each incomeMode BEFORE any
 * v2.0 engine change landed. Default state never realizes a capital loss, so
 * F1's §74 carry-forward pool is a no-op against these goldens (pool stays
 * empty for the life of the run) — this file must stay green through F1-F5.
 */

import { describe, expect, it } from "vitest";
import { BASE, normalizeState, calculate, calculateMonteCarlo, projectionParamsFromState } from "../src/model.js";

function runMode(incomeMode) {
  const state = normalizeState({ ...BASE, incomeMode });
  const params = projectionParamsFromState(state);
  return calculate(params);
}

describe("fin-8fb — v2.0 parity goldens — default BASE state, pre-v2.0 engine", () => {
  it("interest mode: matches captured golden numbers", () => {
    const r = runMode("interest");
    const last = r.rows[r.rows.length - 1];
    const first = r.rows[1];
    const depletionRow = r.rows.find((row) => row.closing <= 0);

    expect(r.final.closing).toBeCloseTo(500224634.45947325, 6);
    expect(last.cumTax).toBeCloseTo(36210097.340453066, 6);
    expect(last.cumWithdrawals).toBeCloseTo(54419161.69557039, 6);
    expect(depletionRow).toBeUndefined();

    expect(first.tax).toBeCloseTo(0, 6);
    expect(first.withdrawal).toBeCloseTo(450000, 6);
    expect(first.closing).toBeCloseTo(33030000.000000004, 6);

    expect(last.tax).toBeCloseTo(4409715.471379412, 6);
    expect(last.withdrawal).toBeCloseTo(4640230.713835673, 6);
    expect(last.closing).toBeCloseTo(500224634.45947325, 6);

    expect(r.monthlyRows.length).toBe(0);
  });

  it("swp mode: matches captured golden numbers", () => {
    const r = runMode("swp");
    const last = r.rows[r.rows.length - 1];
    const first = r.rows[1];
    const depletionRow = r.rows.find((row) => row.closing <= 0);

    expect(r.final.closing).toBeCloseTo(133871219.98260939, 6);
    expect(last.cumTax).toBeCloseTo(13217023.96133546, 6);
    expect(last.cumWithdrawals).toBeCloseTo(117088749.29839386, 6);
    expect(depletionRow).toBeUndefined();

    expect(first.tax).toBeCloseTo(24873.490435553034, 6);
    expect(first.withdrawal).toBeCloseTo(1695889.8045089773, 6);
    expect(first.closing).toBeCloseTo(31671006.575208895, 6);

    expect(last.tax).toBeCloseTo(1219684.4529569533, 6);
    expect(last.withdrawal).toBeCloseTo(7206903.484506159, 6);
    expect(last.closing).toBeCloseTo(133871219.98260939, 6);

    expect(r.monthlyRows.length).toBe(360);
  });

  it("idcw mode: matches captured golden numbers", () => {
    const r = runMode("idcw");
    const last = r.rows[r.rows.length - 1];
    const first = r.rows[1];
    const depletionRow = r.rows.find((row) => row.closing <= 0);

    expect(r.final.closing).toBeCloseTo(323742056.2050957, 6);
    expect(last.cumTax).toBeCloseTo(26532110.96257118, 6);
    expect(last.cumWithdrawals).toBeCloseTo(92644864.82204579, 6);
    expect(depletionRow).toBeUndefined();

    expect(first.tax).toBeCloseTo(0, 6);
    expect(first.withdrawal).toBeCloseTo(1004400.0000000001, 6);
    expect(first.closing).toBeCloseTo(32475600.000000004, 6);

    expect(last.tax).toBeCloseTo(2964666.5501020467, 6);
    expect(last.withdrawal).toBeCloseTo(7047974.363457614, 6);
    expect(last.closing).toBeCloseTo(323742056.2050957, 6);

    expect(r.monthlyRows.length).toBe(0);
  });

  it("Monte Carlo determinism: same seed -> identical successProbability and p50 series across two consecutive runs", () => {
    const state = normalizeState({ ...BASE, incomeMode: "swp", monteCarloSamples: 50 });
    const params = projectionParamsFromState(state);
    const run1 = calculateMonteCarlo(params, 50);
    const run2 = calculateMonteCarlo(params, 50);

    expect(run2.successProbability).toBe(run1.successProbability);
    expect(run2.p50).toEqual(run1.p50);
    expect(run2.p10).toEqual(run1.p10);
    expect(run2.p90).toEqual(run1.p90);
  });
});
