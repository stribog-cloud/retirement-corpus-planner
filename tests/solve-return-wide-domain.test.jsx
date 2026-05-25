/**
 * tests/solve-return-wide-domain.test.jsx
 *
 * fin-est — Q29: solveReturnForMonthlyCash returns null for 28% of feasible-looking
 * scenarios where Python reference converges.
 *
 * Root cause: JS solver search domain is [-0.10, 0.40] (40% max return).
 * Python reference solver searches to 100% or beyond. Scenarios where the
 * "required return" to make the plan feasible is >40% return null in JS.
 *
 * Fix: widen upper bound from 0.40 to 1.00 (100% return) and apply high-bound
 * expansion similar to fin-rkm/fin-f3n.27 pattern (double hi if not covered
 * at hi=1.0, up to some max like 3.0=300%).
 *
 * Evidence: audit/round-3/04-cross-check-report.md Cluster C (BR-1):
 *   - Scenario id=4: corpus=₹62L, monthly_cash=₹2.88L, horizon=33yr → Python ≈60.9%
 *   - 70/72 non-null Python values have null JS counterpart
 *
 * Authority: audit/round-3/02-spec.md Q29 (required return for corpus);
 *            audit/round-3/04-cross-check-report.md Cluster C.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  solveReturnForMonthlyCash,
  planCoversMonthlyCash,
  paramsForProjectionYear
} from "../src/model.js";

function makeReturnSolveParams(principal, monthlyTarget, years, patch = {}) {
  return projectionParamsFromState(normalizeState({
    ...BASE,
    incomeMode: "interest",
    cashMode: "monthlyTarget",
    principal,
    monthlyTarget,
    useAssetReturns: 0,
    annualRate: 8, // starting guess; solver replaces this
    years,
    inflation: 0,
    inflateWithdrawals: 0,
    annualContribution: 0,
    shockYear: 0,
    shockDrop: 0,
    taxRate: 0,
    section87A: 0,
    ...patch
  }));
}

describe("fin-est — solveReturnForMonthlyCash wide search domain (Q29)", () => {
  it("Scenario id=4 (₹62L corpus, ₹2.88L/month, 33yr): solver converges (not null)", () => {
    // Python reference: required return ≈ 60.9% — far above the 40% JS upper bound.
    // With hi=0.40: planCoversMonthlyCash at 40% returns false → solver returns null.
    // With hi=1.0 or wider: solver finds the required return.
    // Note: at 60.9% return on ₹62L for 33 years, the plan IS mathematically feasible
    // (the corpus grows fast enough to sustain ₹2.88L/month withdrawals).
    const params = makeReturnSolveParams(6200000, 288000, 33);
    const result = solveReturnForMonthlyCash(params);
    // With wide domain: should return a finite number, not null
    expect(result).not.toBeNull();
    expect(Number.isFinite(result)).toBe(true);
  });

  it("High-return scenario: corpus=₹50L, monthly=₹2L, 20yr → solver converges at >40%", () => {
    // ₹50L corpus, ₹2L/month = 48% withdrawal rate → requires high return
    // At 40% annual return, ₹50L → ₹50L * 1.4^20 = extremely large, so plan covers.
    // But at lower returns, it does not. The solver should find the threshold.
    const params = makeReturnSolveParams(5000000, 200000, 20);
    const result = solveReturnForMonthlyCash(params);
    // Must not be null — some return rate between -10% and 100% should make this work
    expect(result).not.toBeNull();
  });

  it("Normal feasible scenario (corpus=₹1Cr, monthly=₹50K, 25yr): returns ≤ 40% (not null)", () => {
    // A reasonable scenario should still work — regression test for the fix not breaking
    // the normal path (required return well within [−10%, 40%]).
    const params = makeReturnSolveParams(10000000, 50000, 25);
    const result = solveReturnForMonthlyCash(params);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result)).toBe(true);
    // Reasonable return for this scenario should be quite low (corpus >> needed)
    expect(result).toBeLessThan(0.40);
  });

  it("Returned rate satisfies planCoversMonthlyCash (solver is sound)", () => {
    // Verify solver result actually solves the problem
    const params = makeReturnSolveParams(6200000, 288000, 33);
    const rate = solveReturnForMonthlyCash(params);
    expect(rate).not.toBeNull();
    expect(Number.isFinite(rate)).toBe(true);

    // The rate should make the plan cover the monthly target
    const testParams = { ...params, useAssetReturns: 0, annualRate: rate * 100 };
    expect(planCoversMonthlyCash(testParams)).toBe(true);
  });

  it("Infeasible scenario: corpus=₹1L, monthly=₹1L, 100yr → returns null (correctly)", () => {
    // Even at 300% return this is not feasible: ₹1L corpus cannot sustain ₹1L/month for 100 years
    // (unless the compounding covers it, which at 300% it would — but let's try extreme)
    // Actually at 300%: ₹1L * (1 + 3.0) = ₹4L after year 1, minus ₹12L withdrawal = deeply negative
    // So null is the correct answer here.
    const params = makeReturnSolveParams(100000, 100000, 100);
    const result = solveReturnForMonthlyCash(params);
    // Should return null — genuinely infeasible even with wide domain
    expect(result).toBeNull();
  });
});
