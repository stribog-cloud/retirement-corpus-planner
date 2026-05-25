/**
 * tests/solve-corpus-section87a-cliff.test.jsx
 *
 * fin-nkt (R4.9.5j, 2026-05-24): regression guard — solveCorpusForMonthlyCash
 * post-fin-2os §87A solver verification (no-op close).
 *
 * Investigation: audit/round-4/r4.9.5j-fin-nkt-investigation.md
 * Verdict B: post-fin-2os marginal-relief ramp is smooth; bisection converges
 * correctly in all three regime probes. No source change to solver was needed.
 *
 * These tests lock in the verified-correct behavior so a future regression
 * (e.g. disabling marginalRelief or re-introducing a step function) is caught.
 *
 * Scenario: interest mode, annualRate=10%, portfolioIncomeYield=7.5%
 * (debtIncome = corpus × 0.075), fdInterest instrument → normalIncome stream.
 * No pensionIncome → no standard deduction → normalTaxableIncome = normalIncome.
 * §87A cliff corpus: 1,200,000 / 0.075 = ₹1,60,00,000.
 * Breakeven corpus: ≈1,270,588 / 0.075 ≈ ₹1,69,41,176.
 *
 * Author: Hilbert
 * Spec: audit/round-3/02-spec.md Q11, Q28; audit/round-4/r4.9.5j-fin-nkt-investigation.md
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  solveCorpusForMonthlyCash,
  planCoversMonthlyCash,
  yearlyTax,
  calculateTaxProfile,
} from "../src/model.js";

// ─── Shared param builder ─────────────────────────────────────────────────────
function makeParams(monthlyTarget, patch = {}) {
  return projectionParamsFromState(normalizeState({
    ...BASE,
    incomeMode: "interest",
    cashMode: "monthlyTarget",
    monthlyTarget,
    useAssetReturns: 0,
    annualRate: 10,
    compounding: 1,
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
    section87AInterpretation: "cbdtConservative",
    debtInstrument: "fdInterest",
    equityShare: 0,
    otherIncome: 0,
    pensionIncome: 0,
    harvestLtcg: 0,
    ...patch,
  }));
}

// ─── Shared §87A pipeline helper ──────────────────────────────────────────────
// Runs calculateTaxProfile with pure normalIncome (no pensionIncome → no std deduction).
const NEW_REGIME_TAX_PARAMS = {
  taxRegime: "new",
  residentStatus: "resident",
  section87A: 1,
  section87AInterpretation: "cbdtConservative",
  ageBand: "below60",
  includeCess: 1,
  standardDeductionMode: "auto",
  tdsEnabled: 0,
  harvestLtcg: 0,
  otherIncome: 0,
  pensionIncome: 0,
  form15Declaration: 0,
};

const EMPTY_SPECIAL = {
  equityLtcg: 0, equityStcg: 0, listedBondLtcg: 0,
  normalLoss: 0, equityLtcl: 0, equityStcl: 0, listedBondLtcl: 0,
  section80TTBInterest: 0, carryForwardPool: null,
};

function totalTaxAt(aggTaxable) {
  return calculateTaxProfile(
    NEW_REGIME_TAX_PARAMS,
    { normalIncome: aggTaxable, ...EMPTY_SPECIAL }
  ).totalTax;
}

// ─── Test group 1: Solver convergence (default drawdown=1) ───────────────────
describe("fin-nkt — solveCorpusForMonthlyCash §87A cliff (default, drawdown allowed)", () => {
  it("cliff target (₹1,06,000/mo): solver converges to finite corpus, no overshoot", () => {
    // With drawdown, solver finds corpus via principal drawdown; taxable income < ₹12L.
    // No cliff pathology.
    const params = makeParams(106_000);
    const corpus = solveCorpusForMonthlyCash(params);

    expect(Number.isFinite(corpus)).toBe(true);
    expect(corpus).toBeGreaterThan(0);
    expect(planCoversMonthlyCash({ ...params, principal: corpus })).toBe(true);
    // fin-rkm: tolerance-based; corpus - 1 must NOT cover (solver is tight)
    expect(planCoversMonthlyCash({ ...params, principal: corpus - 1 })).toBe(false);
  });

  it("mid-band target (₹1,07,000/mo): solver converges; taxable income below cliff", () => {
    const params = makeParams(107_000);
    const corpus = solveCorpusForMonthlyCash(params);

    expect(Number.isFinite(corpus)).toBe(true);
    expect(planCoversMonthlyCash({ ...params, principal: corpus })).toBe(true);
    expect(planCoversMonthlyCash({ ...params, principal: corpus - 1 })).toBe(false);

    // At solved corpus, taxable income is well below the ₹12L §87A cliff
    const t = yearlyTax(corpus, params);
    expect(t.taxProfile.normalTaxableIncome).toBeLessThan(1_200_000);
  });

  it("above-band target (₹1,08,000/mo): solver converges; no cliff interference", () => {
    const params = makeParams(108_000);
    const corpus = solveCorpusForMonthlyCash(params);

    expect(Number.isFinite(corpus)).toBe(true);
    expect(planCoversMonthlyCash({ ...params, principal: corpus })).toBe(true);
    expect(planCoversMonthlyCash({ ...params, principal: corpus - 1 })).toBe(false);
  });
});

// ─── Test group 2: planCoversMonthlyCash monotone near cliff ─────────────────
describe("fin-nkt — planCoversMonthlyCash monotone in §87A marginal-relief band", () => {
  it("no T→F transition near cliff for target=₹1,00,000/mo (drawdown=1)", () => {
    // In the marginal-relief band (₁.6Cr–₁.694Cr corpus) net monthly dips ~0.2%.
    // The 0.5% coverage tolerance absorbs this → planCoversMonthlyCash stays true.
    const params = makeParams(100_000);
    const probeCorpora = [
      15_000_000, 15_500_000, 16_000_000, 16_050_000,
      16_100_000, 16_200_000, 16_500_000, 16_941_176, 17_000_000,
    ];

    let prevCovers = planCoversMonthlyCash({ ...params, principal: probeCorpora[0] });
    let nonMonotoneCount = 0;

    for (let i = 1; i < probeCorpora.length; i++) {
      const covers = planCoversMonthlyCash({ ...params, principal: probeCorpora[i] });
      // A T→F transition = increasing corpus reduced coverage = bisection pathology
      if (prevCovers && !covers) nonMonotoneCount++;
      prevCovers = covers;
    }

    expect(nonMonotoneCount).toBe(0);
  });

  it("no T→F transition for target=₹1,01,000/mo above-breakeven scan (drawdown=0)", () => {
    // With no drawdown, target=101K/mo requires corpus above breakeven (~₁.694Cr).
    // The gap in the marginal-relief band (where netMonthly < 101K) must not create T→F.
    const params = makeParams(101_000, { allowPrincipalDrawdown: 0 });
    const scanPoints = [
      16_000_000, 16_200_000, 16_500_000, 16_800_000,
      16_941_000, 16_941_187, 17_000_000, 17_080_000, 17_100_000,
    ];

    let prevCovers = planCoversMonthlyCash({ ...params, principal: scanPoints[0] });
    let nonMonotoneCount = 0;

    for (let i = 1; i < scanPoints.length; i++) {
      const covers = planCoversMonthlyCash({ ...params, principal: scanPoints[i] });
      if (prevCovers && !covers) nonMonotoneCount++;
      prevCovers = covers;
    }

    expect(nonMonotoneCount).toBe(0);
  });
});

// ─── Test group 3: §87A marginal-relief continuity pre-conditions ─────────────
describe("fin-nkt — §87A marginal-relief pre-conditions for solver correctness", () => {
  it("net monthly dip in marginal-relief band is ≤0.5% (within 0.995 coverage tolerance)", () => {
    // Cliff corpus (₁.6Cr): tax=0, netMonthly=₁,00,000.
    // Breakeven corpus (₁.694Cr): deepest dip, netMonthly≈₹99,765.
    // Dip fraction ≈ 0.235% < 0.5% → planCoversMonthlyCash stays true throughout.
    const baseParams = makeParams(100_000);

    const tAtCliff = yearlyTax(16_000_000, baseParams);
    const netMonthlyAtCliff = (tAtCliff.streams.normalIncome - tAtCliff.tax) / 12;

    const tAtBreakeven = yearlyTax(16_941_176, baseParams);
    const netMonthlyAtBreakeven = (tAtBreakeven.streams.normalIncome - tAtBreakeven.tax) / 12;

    const dipFraction = (netMonthlyAtCliff - netMonthlyAtBreakeven) / netMonthlyAtCliff;
    expect(dipFraction).toBeLessThan(0.005); // < 0.5%
    expect(netMonthlyAtBreakeven).toBeLessThan(netMonthlyAtCliff); // dip exists
  });

  it("DEFAULT_TAX_LAW has marginalRelief=true (structural invariant)", () => {
    // If marginalRelief is disabled, the §87A cliff returns as a hard ₹60K jump.
    // That would break bisection. This test guards against accidental config drift.
    const params = makeParams(100_000);
    const law = JSON.parse(params.taxLawJson || "{}");
    expect(law?.rebates?.new?.marginalRelief).toBe(true);
  });
});

// ─── Test group 4: Python reference parity at probe points (ground truth) ─────
describe("fin-nkt — JS pipeline matches Python ground truth at §87A boundary points", () => {
  // Ground truth from audit/round-4/r4.9.5j-fin-2os-ground-truth.md (Lovelace).
  // Parity already verified in section87a-marginal-relief.test.jsx; re-asserted
  // here as cross-reference anchors for the three dispatch probe scenarios.

  it("at ₹12,00,000 aggregate taxable → totalTax = ₹0 (cliff probe, full rebate)", () => {
    expect(totalTaxAt(1_200_000)).toBe(0);
  });

  it("at ₹12,00,001 aggregate taxable → totalTax = ₹1.04 (marginal relief, 1p above cliff)", () => {
    expect(totalTaxAt(1_200_001)).toBe(1.04);
  });

  it("at ₹12,30,000 aggregate taxable → totalTax = ₹31,200 (mid-band probe)", () => {
    // excessOverThreshold=30000, cess=1200 → total=31200
    expect(totalTaxAt(1_230_000)).toBe(31_200);
  });

  it("at ₹13,00,000 aggregate taxable → totalTax = ₹78,000 (above-band probe, full slab)", () => {
    // slab_tax=75000 < excess=100000 → net=75000, cess=3000, total=78000
    expect(totalTaxAt(1_300_000)).toBe(78_000);
  });
});
