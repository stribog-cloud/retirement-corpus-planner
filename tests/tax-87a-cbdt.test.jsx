/**
 * tests/tax-87a-cbdt.test.jsx
 *
 * fin-8je — Q10/Q11 §87A rebate: CBDT-conservative policy.
 *
 * CBDT-conservative (reference CBDT_CONSERVATIVE):
 *   - §87A applies to SLAB tax unconditionally when aggregate income ≤ threshold.
 *   - Special-rate income (STCG/LTCG) is NOT covered by §87A regardless.
 *   - When STCG/LTCG present but aggregate < 12L: slab rebate STILL granted in full.
 *
 * Legacy (offForSpecialMix / IMPL_LEGACY):
 *   - If ANY special-rate income present → §87A denied on ALL income (slab too).
 *   - More conservative than CBDT; over-denies rebate.
 *
 * Reference values (Python decimal.Decimal precision 50):
 *   yearly_tax(normal_gross=700000, equity_stcg=200000, age=45, regime=NEW,
 *              policy=CBDT_CONSERVATIVE) = 41600.0000
 *   (slab taxable = 700K-75K = 625K, slab tax = 11250, aggregate = 825K < 12L
 *    → rebate = 11250 (slab wiped), STCG tax = 200K*20%*1.04 = 41600)
 *
 * Under offForSpecialMix (old/wrong):
 *   same scenario → rebate = 0 → slab_net = 11250 → total = 11250*1.04 + 41600 = 53300
 *
 * Authority: audit/round-3/02-spec.md Q10/Q11; CBDT-87A-2024 circular.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  applySection87A,
  investmentTaxProfile
} from "../src/model.js";

// Reference values from Python (decimal.Decimal precision 50):
// slab gross = 7L, STCG = 2L, new regime, age 45
// slab taxable = 700000 - 75000 = 625000
// slab tax = (625000 - 400000) * 5% = 11250  (in 400K-800K band)
// aggregate = 625000 + 200000 = 825000 < 1200000 → CBDT: full rebate on slab → slab_net = 0
// STCG tax = 200000 * 20% = 40000, cess = 40000 * 1.04 = 41600
// Total CBDT = 0 + 41600 = 41600.00
const REF_CBDT_TAX = 41600;

// The wrongly over-conservative offForSpecialMix would give:
// slab_net = 11250, total = 11250 * 1.04 + 41600 = 11700 + 41600 = 53300
const WRONG_OFF_TAX = 53300;

describe("fin-8je — §87A CBDT-conservative (Q10/Q11)", () => {
  it("§87A rebate applies to slab tax even when STCG is present (aggregate < 12L)", () => {
    // slab gross = 7L, STCG = 2L, new regime → aggregate 8.25L < 12L
    // Should grant rebate on slab tax (CBDT-conservative)
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 1,
      // CBDT-conservative interpretation:
      section87AInterpretation: "cbdtConservative"
    });
    const streams = {
      normalIncome: 700000,
      equityStcg: 200000,
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // Total tax should be ~41600 (slab rebated, only STCG tax remains)
    expect(Math.abs(profile.tax - REF_CBDT_TAX)).toBeLessThan(50);
    // Rebate should be non-zero (slab rebated)
    expect(profile.rebateUsed).toBeGreaterThan(0);
  });

  it("§87A: offForSpecialMix over-denies rebate when STCG present (legacy bug)", () => {
    // Verify the old behavior is demonstrably wrong vs CBDT (for regression tracking)
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 1,
      section87AInterpretation: "offForSpecialMix"
    });
    const streams = {
      normalIncome: 700000,
      equityStcg: 200000,
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // offForSpecialMix denies rebate → higher tax than CBDT
    expect(profile.tax).toBeGreaterThan(REF_CBDT_TAX);
  });

  it("§87A: STCG tax itself is NOT reduced by rebate (spec invariant)", () => {
    // In CBDT mode, rebate only covers slab tax. STCG is charged at 20% always.
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 1,
      section87AInterpretation: "cbdtConservative"
    });
    const streams = {
      normalIncome: 700000,
      equityStcg: 200000,
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // STCG tax should be 200000 * 20% * 1.04 = 41600
    expect(Math.abs(profile.equityStcgTax - 41600)).toBeLessThan(50);
  });

  it("§87A: no rebate when aggregate income exceeds 12L threshold (new regime)", () => {
    // slab gross = 10L, STCG = 3L → aggregate = 9.25L + 3L = 12.25L > 12L → no rebate
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 1,
      section87AInterpretation: "cbdtConservative"
    });
    const streams = {
      normalIncome: 1000000,
      equityStcg: 300000,
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // No rebate above threshold
    expect(profile.rebateUsed).toBe(0);
  });

  it("applySection87A: cbdtConservative grants rebate when aggregate < threshold", () => {
    const params = normalizeState({
      ...BASE,
      taxRegime: "new",
      section87A: 1,
      residentStatus: "resident",
      section87AInterpretation: "cbdtConservative"
    });
    // slab tax = 11250, aggregate = 825K < 12L, hasSpecialRateIncome = true
    const result = applySection87A(11250, 625000, params, 825000, true);
    // With CBDT: rebate granted → normalAfterRebate = 0
    expect(result).toBe(0);
  });

  it("applySection87A: offForSpecialMix denies rebate when special income present", () => {
    const params = normalizeState({
      ...BASE,
      taxRegime: "new",
      section87A: 1,
      residentStatus: "resident",
      section87AInterpretation: "offForSpecialMix"
    });
    // offForSpecialMix: STCG present → no rebate
    const result = applySection87A(11250, 625000, params, 825000, true);
    expect(result).toBe(11250);  // unchanged - no rebate
  });

  it("Default section87AInterpretation is cbdtConservative", () => {
    // After fin-8je fix, the default should be cbdtConservative
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 1
      // No explicit section87AInterpretation → should default to cbdtConservative
    });
    const streams = {
      normalIncome: 700000,
      equityStcg: 200000
    };
    const profile = investmentTaxProfile(params, streams);
    // Default behavior should match CBDT (rebate granted when aggregate < 12L)
    expect(Math.abs(profile.tax - REF_CBDT_TAX)).toBeLessThan(50);
    expect(profile.rebateUsed).toBeGreaterThan(0);
  });
});
