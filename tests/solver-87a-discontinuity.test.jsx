/**
 * tests/solver-87a-discontinuity.test.jsx
 *
 * fin-21i — HS18: solver handles §87A ₹12L rebate-cliff discontinuity.
 *
 * Problem: solveCorpusForMonthlyCash uses bisection which assumes monotonicity.
 * Near the §87A ₹12L new-regime threshold, there is a potential non-monotone
 * region: tax jumps by up to ₹60K when income crosses ₹12L (rebate disappears).
 * Without marginal relief, this creates a cliff where planCoversMonthlyCash
 * could be true→false→true as corpus increases (non-monotone).
 *
 * The implementation defends against this via:
 *   1. `marginalRelief: true` in DEFAULT_TAX_LAW.rebates.new — the rebate
 *      transition is smooth (not a cliff), so monotonicity holds.
 *   2. The bisection tolerance-based termination (fin-rkm) still converges
 *      even if slight non-monotonicity exists.
 *
 * This test suite verifies:
 *   a) solveCorpusForMonthlyCash converges to a finite, valid corpus near the
 *      §87A boundary (regression guard).
 *   b) The returned corpus satisfies planCoversMonthlyCash (solver is sound).
 *   c) The §87A marginal relief makes the coverage function smooth near ₹12L
 *      income, preventing cliff-induced solver failure.
 *
 * Spec: audit/round-3/05-precision-hotspots.md HS18.
 * Authority: audit/round-3/02-spec.md Q11 (§87A rebate), Q28 (corpus solver).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  solveCorpusForMonthlyCash,
  planCoversMonthlyCash,
  applySection87A
} from "../src/model.js";

// Scenario: retiree with ~₹12L annual income (interest mode, new regime)
// 10% return × ₹1.2Cr corpus = ₹12L income — exactly at §87A threshold
function make87AStraddleParams(monthlyTarget = 75000, patch = {}) {
  return projectionParamsFromState(normalizeState({
    ...BASE,
    incomeMode: "interest",
    cashMode: "monthlyTarget",
    monthlyTarget,
    useAssetReturns: 0,
    annualRate: 10, // 10% — at ₹1.2Cr corpus → exactly ₹12L income
    years: 25,
    inflation: 0,
    inflateWithdrawals: 0,
    annualContribution: 0,
    shockYear: 0,
    shockDrop: 0,
    taxRegime: "new",
    ageBand: "below60",
    section87A: 1,
    residentStatus: "resident",
    section87AInterpretation: "aggregateThreshold",
    ...patch
  }));
}

describe("fin-21i — solver §87A ₹12L discontinuity (HS18)", () => {
  it("solveCorpusForMonthlyCash converges to a finite corpus near §87A boundary", () => {
    // Near ₹12L income the §87A cliff creates a potential non-monotone region.
    // Solver must converge (not hang or return Infinity) even if the coverage
    // function has a local dip at the cliff boundary.
    const params = make87AStraddleParams(75000);
    const corpus = solveCorpusForMonthlyCash(params);

    expect(corpus).toBeDefined();
    expect(Number.isFinite(corpus)).toBe(true);
    expect(corpus).toBeGreaterThan(0);
  });

  it("returned corpus satisfies planCoversMonthlyCash (solver is sound at §87A boundary)", () => {
    // Key invariant: whatever corpus the solver returns, it must satisfy
    // the coverage predicate. A broken solver might return a corpus in the
    // non-monotone dip that does NOT cover.
    const params = make87AStraddleParams(75000);
    const corpus = solveCorpusForMonthlyCash(params);
    expect(Number.isFinite(corpus)).toBe(true);

    const targetParams = { ...params, principal: corpus };
    expect(planCoversMonthlyCash(targetParams)).toBe(true);
  });

  it("§87A marginal relief: tax transition is smooth across ₹12L threshold (prevents cliff)", () => {
    // With marginalRelief=true, applySection87A returns excessOverThreshold
    // when income > ₹12L. This makes the transition smooth:
    //   income=₹12L: tax=0 (full rebate applied, rebate=tax<60K)
    //   income=₹12L+₹1: effective tax = ₹1 (excess = ₹1)
    //   income=₹13L: effective tax = ₹1L (excess = ₹1L)
    // This smoothness prevents non-monotone coverage behavior.
    const params = normalizeState({
      ...BASE,
      taxRegime: "new",
      ageBand: "below60",
      section87A: 1,
      residentStatus: "resident",
      section87AInterpretation: "aggregateThreshold"
    });

    // Just above ₹12L: income = ₹12L + ₹1
    // slab tax on ₹12L: 4L@0 + 4L@5% + 4L@10% = 0 + 20K + 40K = 60K
    // With marginal relief at ₹12L+₹1: excessOverThreshold = ₹1 → tax = ₹1
    const taxBeforeCess = 60000; // slab tax at ₹12L
    const normalIncome = 1200000; // ₹12L normal income (= aggregate)
    const taxAtThreshold = applySection87A(taxBeforeCess, normalIncome, params, normalIncome, false);
    // At exactly ₹12L: eligible for rebate → tax = max(0, 60000 - min(60000, 60000)) = 0
    expect(taxAtThreshold).toBe(0);

    // Just above threshold: income ₹12L + ₹10K
    const taxAboveThreshold = applySection87A(taxBeforeCess, 1210000, params, 1210000, false);
    // Marginal relief: excessOverThreshold = ₹10K. tax > excessOverThreshold → return excessOverThreshold
    // So: effective tax = ₹10K (smooth transition, not ₹60K cliff)
    expect(Math.abs(taxAboveThreshold - 10000)).toBeLessThan(100);
    // Confirm marginal relief keeps tax below the full slab tax at just-above-threshold
    expect(taxAboveThreshold).toBeLessThan(taxBeforeCess);
  });

  it("solveCorpusForMonthlyCash valid for §87A: solved corpus covers, solved - ₹50K does not", () => {
    // Verify solver is tight at the §87A boundary scenario
    const params = make87AStraddleParams(75000);
    const corpus = solveCorpusForMonthlyCash(params);
    expect(Number.isFinite(corpus)).toBe(true);

    // The corpus must cover
    expect(planCoversMonthlyCash({ ...params, principal: corpus })).toBe(true);
    // Corpus - ₹50K must NOT cover (solver is tight — within ₹1 per fin-rkm)
    expect(planCoversMonthlyCash({ ...params, principal: corpus - 50000 })).toBe(false);
  });
});
