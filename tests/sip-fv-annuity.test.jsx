/**
 * tests/sip-fv-annuity.test.jsx
 *
 * fin-cr2 — Q61 SIP accumulation: FV-of-monthly-annuity vs lump-sum.
 *
 * Spec (audit/round-3/02-spec.md Q61):
 *   Annual contribution is treated as 12 equal monthly payments (SIP).
 *   FV of 1-year monthly SIP at annual rate R:
 *     r_monthly = (1 + R)^(1/12) − 1
 *     FV_year = (annualContribution/12) × ((1+r_monthly)^12 - 1) / r_monthly
 *   This is higher than lump-sum (annualContribution added at year-end):
 *     difference ≈ 4.5% for R=10% (intra-year compounding effect).
 *
 * Reference values (Python decimal.Decimal precision 50):
 *   monthly=10000, annual_return=10%, years=10:
 *     FV_annuity = 1998638.57  (spec correct)
 *     FV_lump    = 1912490.95  (old bug)
 *
 * Authority: audit/round-3/02-spec.md Q61; BMA-13 Chapter 2 (FV of ordinary annuity).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  calculateInterestPlan
} from "../src/model.js";

// Reference from Python (decimal.Decimal precision 50):
// monthly=10000, annual_return=10%, years=10: FV_annuity = 1998638.57
const REF_FV_ANNUITY = 1998638.57;
const REF_FV_LUMP    = 1912490.95;  // old lump-sum (wrong)

function makeParams(patch = {}) {
  return projectionParamsFromState(normalizeState({
    ...BASE,
    principal: 0,  // start from zero to isolate contribution effect
    monthlyTarget: 0,
    years: 10,
    inflation: 0,  // no inflation to simplify
    incomeMode: "interest",
    cashMode: "monthlyTarget",
    useAssetReturns: 0,
    annualRate: 10,
    expenseRatio: 0,
    taxRate: 0,
    section87A: 0,
    inflateWithdrawals: 0,
    annualContribution: 120000,  // 12 × 10000 monthly
    contributionStepUp: 0,
    shockYear: 0,
    shockDrop: 0,
    ...patch
  }));
}

describe("fin-cr2 — Q61 SIP FV-of-monthly-annuity accumulation", () => {
  it("10-year SIP at 10% matches FV-annuity reference (not lump-sum)", () => {
    // principal=0, annualContribution=120000 (Rs10000/month), 10% return, 10 years
    // FV-annuity: 1998638.57 (Python reference)
    // FV-lump: 1912490.95 (wrong)
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const finalCorpus = plan.final.closing;

    // FV-annuity should be the result (within Rs50)
    expect(Math.abs(finalCorpus - REF_FV_ANNUITY)).toBeLessThan(50);
    // Should definitely NOT match lump-sum
    expect(Math.abs(finalCorpus - REF_FV_LUMP)).toBeGreaterThan(50);
  });

  it("FV-annuity > FV-lump: monthly compounding yields more than year-end lump-sum", () => {
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const finalCorpus = plan.final.closing;
    // FV-annuity is ~4.5% higher than lump-sum
    expect(finalCorpus).toBeGreaterThan(REF_FV_LUMP);
  });

  it("Zero return rate: FV = total contribution (no compounding)", () => {
    // At 0% return: FV = 120000 × 10 = 1200000 regardless of annuity vs lump-sum
    const params = makeParams({ annualRate: 0 });
    const plan = calculateInterestPlan(params);
    expect(Math.abs(plan.final.closing - 1200000)).toBeLessThan(10);
  });

  it("Year-1 contribution in plan matches one-year FV-annuity", () => {
    // Year 1 contribution: FV of 12 monthly Rs10000 at 10% annual
    // r_monthly = (1.10)^(1/12) - 1 ≈ 0.007974
    // FV_1yr = 10000 × ((1.007974^12 - 1) / 0.007974) ≈ 125660
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const y1_contribution = plan.rows[1].contribution;
    const r_monthly = Math.pow(1.10, 1/12) - 1;
    const expected_fv_1yr = (120000/12) * ((Math.pow(1 + r_monthly, 12) - 1) / r_monthly);
    expect(Math.abs(y1_contribution - expected_fv_1yr)).toBeLessThan(1);
  });
});
