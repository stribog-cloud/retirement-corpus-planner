/**
 * tests/per-lot-bisection-resolution.test.jsx
 *
 * fin-f08 — HS11: per-lot bisection in redeemNetFromBucket must converge to ₹1 resolution.
 *
 * The per-lot bisection in redeemNetFromBucket determines how much gross to sell
 * from each lot to deliver exactly `targetNetCash` after tax. With 18 fixed
 * iterations on a ₹100L lot, resolution ≈ ₹100L/2^18 ≈ ₹382. With tolerance-based
 * termination (|hi-lo| < 1), resolution ≤ ₹1.
 *
 * Spec: audit/round-3/05-precision-hotspots.md HS11.
 * Root cause: `for (let i = 0; i < 18; i++)` in redeemNetFromBucket — fixed
 *   iterations replaced by `while (hi - lo > 1)` for ₹1 resolution.
 *
 * Test strategy: use makeBucket directly with a large single lot (₹100L) and
 * a taxRate=0 context so that net == gross. This makes the bisection fully
 * observable: delivered_cash should be within ₹1 of target.
 *
 * Authority: audit/round-3/05-precision-hotspots.md HS11;
 *            audit/round-3/02-spec.md Q55 (SWP shortfall diagnosis).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  calculateSwpPlan,
  makeBucket,
  bucketValue
} from "../src/model.js";

// Helper: build a single large-lot equity bucket and directly test redemption
// via calculateSwpPlan (which calls redeemNetFromBucket internally)
function makeLargeLotSwpParams(principal, monthlyTarget, patch = {}) {
  return projectionParamsFromState(normalizeState({
    ...BASE,
    incomeMode: "swp",
    principal,
    equityShare: 100,
    debtShare: 0,
    equityInstrument: "equityLtcg",
    useAssetReturns: 0,
    annualRate: 0, // no growth — simpler to reason about
    years: 1,     // just one year (12 months)
    inflateWithdrawals: 0,
    inflation: 0,
    annualContribution: 0,
    taxRate: 0,
    section87A: 0,
    shockYear: 0,
    shockDrop: 0,
    monthlyTarget,
    cashMode: "monthlyTarget",
    legacyHoldingYears: 2, // ensure LTCG classification; no taxable gain at taxRate=0
    costBasisPct: 100,     // cost = NAV → realized gain = 0 → tax = 0 → net = gross
    ...patch
  }));
}

describe("fin-f08 — per-lot bisection ₹1 tolerance (HS11)", () => {
  it("per-lot bisection: ₹100L lot, ₹50K/month target → annual cash within ₹12 of target (₹1/month)", () => {
    // With taxRate=0 and costBasisPct=100, net == gross, so bisection must find
    // sale == target exactly. Tolerance-based bisection: error ≤ ₹1/lot/month.
    // 18-iteration bisection on ₹100L lot → resolution ₹100L/2^18 ≈ ₹382.
    // Tolerance-based → ≤ ₹1.
    // We can verify: annual withdrawal should be within ₹12 of 12 × ₹50K = ₹600K.
    const params = makeLargeLotSwpParams(10000000, 50000); // ₹1Cr lot, ₹50K/month
    const model = calculateSwpPlan(params);
    const year1 = model.rows[1];
    expect(year1).toBeDefined();
    // Monthly equivalent: should be within ₹2 of ₹50K (₹1 per-lot tolerance × 2 lots possible)
    const monthlyEquiv = year1.withdrawal / 12;
    expect(Math.abs(monthlyEquiv - 50000)).toBeLessThan(2);
  });

  it("per-lot bisection: ₹10Cr lot, ₹1L/month target → monthly cash within ₹1 (not ₹382)", () => {
    // ₹10Cr lot, 18 iterations → resolution ₹10Cr/2^18 ≈ ₹3,814 (NOT ₹1).
    // Tolerance-based → ≤ ₹1.
    // With taxRate=0, cost=100%: net=gross. Annual target = 12L. Delivered should be within ₹12.
    const params = makeLargeLotSwpParams(100000000, 100000); // ₹10Cr, ₹1L/month
    const model = calculateSwpPlan(params);
    const year1 = model.rows[1];
    expect(year1).toBeDefined();
    const monthlyEquiv = year1.withdrawal / 12;
    // With 18 iters on ₹10Cr: resolution ≈ ₹3,814 → monthlyEquiv could be off by ₹318/month
    // With tolerance: should be within ₹2 of ₹1L
    expect(Math.abs(monthlyEquiv - 100000)).toBeLessThan(2);
  });

  it("SWP cashCoverage ≥ 0.995 for all rows after per-lot bisection fix", () => {
    // Verify the fix does not break normal SWP operation
    const params = makeLargeLotSwpParams(5000000, 30000);
    const model = calculateSwpPlan(params);
    const rows = model.rows.slice(1);
    for (const row of rows) {
      expect(row.cashCoverage).toBeGreaterThanOrEqual(0.995);
    }
  });
});
