/**
 * tests/section87a-marginal-relief.test.jsx
 *
 * fin-2os (R4.9.5j, 2026-05-24): §87A marginal-relief boundary regression tests.
 *
 * Ground truth: audit/round-4/r4.9.5j-fin-2os-ground-truth.md
 * Probe:        audit/round-4/r4.9.5j-pipeline-probe.mjs (confirmed JS correct)
 *
 * Statutory rule (ITA-1961 §87A proviso / CBDT Marginal Relief Memo, Oct 2024):
 *   For new-regime total income > ₹12,00,000:
 *     net_slab_tax = min(slab_tax(I), I − ₹12,00,000)
 *   At ₹12,00,001: net_tax = ₹1, total (with 4% cess) = ₹1.04.
 *
 * JS applySection87A (correct since fin-21i):
 *   excessOverThreshold = eligibilityIncome − rule.threshold
 *   return tax > excessOverThreshold ? Math.max(0, excessOverThreshold) : tax
 *
 * All scenarios: new regime, age <60, no capital gains, resident, §87A=1.
 * Inputs are AGGREGATE TAXABLE INCOME (already post-standard-deduction in JS
 * calculateTaxProfile normalIncome stream path).
 */

import { describe, expect, it } from "vitest";
import {
  applySection87A,
  slabTaxBeforeCess,
  calculateTaxProfile,
} from "../src/model.js";

// ─── Minimal params for new-regime, resident, <60, no capital gains ───────────
const NEW_REGIME_PARAMS = {
  taxRegime: "new",
  residentStatus: "resident",
  section87A: 1,
  section87AInterpretation: "cbdtConservative",
  ageBand: "below60",
  includeCess: 1,
  standardDeductionMode: "auto",
  tdsEnabled: 0,
  newRegimeBasicExemptionPolicy: "conservative",
  harvestLtcg: 0,
  otherIncome: 0,
  pensionIncome: 0,
  form15Declaration: 0,
};

// Helper: run full pipeline with normalIncome = agg_taxable (no deductions since
// pensionIncome=0 and standardDeductionUsed=0 when pensionIncome=0 and no auto-deduction)
function totalTaxAt(aggTaxable) {
  const streams = {
    normalIncome: aggTaxable,
    equityLtcg: 0,
    equityStcg: 0,
    listedBondLtcg: 0,
    normalLoss: 0,
    equityLtcl: 0,
    equityStcl: 0,
    listedBondLtcl: 0,
    section80TTBInterest: 0,
    carryForwardPool: null,
  };
  return calculateTaxProfile(NEW_REGIME_PARAMS, streams).totalTax;
}

// ─── applySection87A direct tests ─────────────────────────────────────────────

describe("fin-2os — applySection87A marginal relief (direct)", () => {
  it("returns 0 at exactly ₹12,00,000 — full rebate", () => {
    const slabTax = slabTaxBeforeCess(1_200_000, NEW_REGIME_PARAMS);
    expect(slabTax).toBe(60_000);
    const result = applySection87A(slabTax, 1_200_000, NEW_REGIME_PARAMS, 1_200_000, false);
    expect(result).toBe(0);
  });

  it("returns ₹1 at ₹12,00,001 — marginal relief caps slab_net at excess", () => {
    const slabTax = slabTaxBeforeCess(1_200_001, NEW_REGIME_PARAMS);
    expect(slabTax).toBe(60_000.15);
    // excessOverThreshold = 1; tax (60000.15) > excess (1) → returns 1
    const result = applySection87A(slabTax, 1_200_001, NEW_REGIME_PARAMS, 1_200_001, false);
    expect(result).toBe(1);
  });

  it("returns ₹30,000 at ₹12,30,000 — marginal relief still active", () => {
    const slabTax = slabTaxBeforeCess(1_230_000, NEW_REGIME_PARAMS);
    expect(slabTax).toBe(64_500);
    // excessOverThreshold = 30000; slab_tax > excess → returns 30000
    const result = applySection87A(slabTax, 1_230_000, NEW_REGIME_PARAMS, 1_230_000, false);
    expect(result).toBe(30_000);
  });

  it("returns ₹70,000 at ₹12,70,000 — marginal relief near breakeven", () => {
    const slabTax = slabTaxBeforeCess(1_270_000, NEW_REGIME_PARAMS);
    expect(slabTax).toBe(70_500);
    // excessOverThreshold = 70000; slab_tax (70500) > excess (70000) → returns 70000
    const result = applySection87A(slabTax, 1_270_000, NEW_REGIME_PARAMS, 1_270_000, false);
    expect(result).toBe(70_000);
  });

  it("returns slab_tax itself at ₹12,70,589 — excess > slab_tax, no relief", () => {
    const slabTax = slabTaxBeforeCess(1_270_589, NEW_REGIME_PARAMS);
    expect(slabTax).toBeCloseTo(70_588.35, 2);
    // excessOverThreshold = 70589; slab_tax (70588.35) <= excess (70589) → returns slabTax
    const result = applySection87A(slabTax, 1_270_589, NEW_REGIME_PARAMS, 1_270_589, false);
    expect(result).toBe(slabTax); // no marginal relief needed
  });

  it("returns slab_tax at ₹13,00,000 — well above breakeven, no relief", () => {
    const slabTax = slabTaxBeforeCess(1_300_000, NEW_REGIME_PARAMS);
    expect(slabTax).toBe(75_000);
    // excessOverThreshold = 100000 > slab_tax → returns slab_tax
    const result = applySection87A(slabTax, 1_300_000, NEW_REGIME_PARAMS, 1_300_000, false);
    expect(result).toBe(75_000);
  });
});

// ─── Full pipeline (calculateTaxProfile) tests ────────────────────────────────

describe("fin-2os — full pipeline §87A marginal relief (calculateTaxProfile)", () => {
  it("₹12,00,000 aggregate → totalTax = ₹0.00", () => {
    expect(totalTaxAt(1_200_000)).toBe(0);
  });

  it("₹12,00,001 aggregate → totalTax = ₹1.04  [ground truth]", () => {
    // Statutory: net_tax ≤ excess_income = ₹1; cess = ₹0.04; total = ₹1.04
    expect(totalTaxAt(1_200_001)).toBe(1.04);
  });

  it("₹12,30,000 aggregate → totalTax = ₹31,200", () => {
    // net = 30000, cess = 1200, total = 31200
    expect(totalTaxAt(1_230_000)).toBe(31_200);
  });

  it("₹12,70,000 aggregate → totalTax = ₹72,800", () => {
    // net = 70000, cess = 2800, total = 72800
    expect(totalTaxAt(1_270_000)).toBe(72_800);
  });

  it("₹12,70,589 aggregate → totalTax ≈ ₹73,411.884 (just past breakeven)", () => {
    // slab_tax=70588.35 < excess=70589 → net=70588.35, cess=2823.534, total=73411.884
    const result = totalTaxAt(1_270_589);
    expect(result).toBeCloseTo(73_411.884, 2);
  });

  it("₹12,80,000 aggregate → totalTax = ₹74,880 (above breakeven, full slab path)", () => {
    // slab_tax=72000 < excess=80000 → net=72000, cess=2880, total=74880
    expect(totalTaxAt(1_280_000)).toBe(74_880);
  });

  it("₹13,00,000 aggregate → totalTax = ₹78,000 (no marginal relief)", () => {
    // slab_tax=75000 < excess=100000 → net=75000, cess=3000, total=78000
    expect(totalTaxAt(1_300_000)).toBe(78_000);
  });
});

// ─── Parity check: matches Python reference yearly_tax (post-fin-2os fix) ─────

describe("fin-2os — JS/Python parity at all boundary points", () => {
  /**
   * Ground truth (both pipelines, post-fix):
   * agg_taxable → expected_total_tax
   * Python: yearly_tax(gross=agg+75000, regime=NEW, age=45)
   * JS: calculateTaxProfile(normalIncome=agg)
   */
  const PARITY_CASES = [
    [1_200_000, 0,          "at threshold"],
    [1_200_001, 1.04,       "1p above threshold"],
    [1_230_000, 31_200,     "30K above"],
    [1_270_000, 72_800,     "70K above (near breakeven)"],
    [1_280_000, 74_880,     "80K above (past breakeven)"],
    [1_300_000, 78_000,     "100K above (full slab path)"],
  ];

  for (const [agg, expectedTax, label] of PARITY_CASES) {
    it(`agg=₹${agg.toLocaleString("en-IN")} (${label}) → ₹${expectedTax}`, () => {
      expect(totalTaxAt(agg)).toBe(expectedTax);
    });
  }
});
