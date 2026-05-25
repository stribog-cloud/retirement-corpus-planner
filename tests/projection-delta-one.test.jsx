/**
 * tests/projection-delta-one.test.jsx
 *
 * fin-39m — Q05/Q18 delta-indexing fix: Year-1 withdrawal = base (no inflation step).
 *
 * Spec: withdrawal_year_t = target_annual × (1+g)^(t-1)
 *   Year-1: (1+g)^0 = 1.0  → base × 1    (uninflated, δ=1)
 *   Year-2: (1+g)^1         → base × (1+g)
 *
 * Reference (audit/reference/findash_ref/projection.py):
 *   withdrawal_year(3600000, 0.06, 1, delta_indexing=1) = 3600000.0 (Python Decimal)
 *   withdrawal_year(3600000, 0.06, 2, delta_indexing=1) = 3816000.0
 *
 * Project_horizon output with δ=1 (Python reference):
 *   Year 0: opening=30000000, withdrawal=0,       closing=30000000
 *   Year 1: opening=30000000, withdrawal=3600000, closing=29880000
 *   Year 2: opening=29880000, withdrawal=3816000, closing=29530080
 *   Year 3: opening=29530080, withdrawal=4044960, closing=28910609.28
 *
 * Authority: audit/round-3/02-spec.md Q05/Q18; Mangesh owner decision K-V01.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  calculateInterestPlan
} from "../src/model.js";

// Reference values from Python (decimal.Decimal precision 50):
// project_horizon(30_000_000, 3, 0.06, 300_000, delta_indexing=1,
//     equity_return=0.14, debt_return=0.09, equity_share_start=0.60, expense=0.004)
const REF_Y1_WITHDRAWAL = 3600000;   // base × (1+g)^0 = 3 600 000 (no inflation step)
const REF_Y1_CLOSING    = 29880000;  // opening + growth − withdrawal (no tax)
const REF_Y2_WITHDRAWAL = 3816000;   // base × (1+g)^1 = 3 816 000

// Tolerance: JS uses float; ₹5 absolute tolerance on withdrawal
const TOL = 5;

function makeParams(patch = {}) {
  return projectionParamsFromState(normalizeState({
    ...BASE,
    principal: 30000000,
    monthlyTarget: 300000,
    years: 3,
    inflation: 6,
    incomeMode: "interest",
    cashMode: "monthlyTarget",
    useAssetReturns: 1,
    equityShare: 60,
    equityReturn: 14,
    debtReturn: 9,
    expenseRatio: 0.4,
    inflateWithdrawals: 1,
    annualContribution: 0,
    shockYear: 0,
    shockDrop: 0,
    taxRate: 0,
    section87A: 0,
    // Minimise tax to isolate withdrawal arithmetic:
    taxRegime: "new",
    ageBand: "below60",
    ...patch
  }));
}

describe("fin-39m — δ=1 withdrawal stepping (Q05/Q18)", () => {
  it("Year-1 withdrawal equals the base annual cash without any inflation step", () => {
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const y1 = plan.rows[1];
    // With δ=1: Year-1 withdrawal = monthlyTarget × 12 × (1+g)^0 = 300 000 × 12 = 3 600 000
    expect(Math.abs(y1.withdrawal - REF_Y1_WITHDRAWAL)).toBeLessThanOrEqual(TOL);
  });

  it("Year-2 withdrawal equals base × (1+g)^1 (first inflation step)", () => {
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const y2 = plan.rows[2];
    expect(Math.abs(y2.withdrawal - REF_Y2_WITHDRAWAL)).toBeLessThanOrEqual(TOL);
  });

  it("Year-1 targetCash equals base annual cash (no inflation)", () => {
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const y1 = plan.rows[1];
    expect(Math.abs(y1.targetCash - REF_Y1_WITHDRAWAL)).toBeLessThanOrEqual(TOL);
  });

  it("Inflation index for real-corpus deflation stays (1+g)^year (unaffected by δ fix)", () => {
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const inflation = 0.06;
    const y1 = plan.rows[1];
    const y2 = plan.rows[2];
    // realClosing = closing / (1+g)^year  →  closing = realClosing × (1+g)^year
    const impliedFactor1 = y1.closing / y1.realClosing;
    const impliedFactor2 = y2.closing / y2.realClosing;
    expect(Math.abs(impliedFactor1 - Math.pow(1 + inflation, 1))).toBeLessThan(0.001);
    expect(Math.abs(impliedFactor2 - Math.pow(1 + inflation, 2))).toBeLessThan(0.001);
  });

  it("cashCoverage = 1.0 for year 1 when withdrawal equals target (fully funded plan)", () => {
    const params = makeParams();
    const plan = calculateInterestPlan(params);
    const y1 = plan.rows[1];
    expect(Math.abs(y1.cashCoverage - 1.0)).toBeLessThan(0.01);
  });

  it("inflateWithdrawals=0 keeps year-1 withdrawal = base regardless of δ fix", () => {
    const params = makeParams({ inflateWithdrawals: 0 });
    const plan = calculateInterestPlan(params);
    const y1 = plan.rows[1];
    const y2 = plan.rows[2];
    // When not inflating, all years = base annual
    const baseAnnual = 300000 * 12;
    expect(Math.abs(y1.withdrawal - baseAnnual)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(y2.withdrawal - baseAnnual)).toBeLessThanOrEqual(TOL);
  });
});
