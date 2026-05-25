/**
 * tests/basic-exemption-setoff.test.jsx
 *
 * fin-w2c — Q57 basic exemption setoff: new regime CONSERVATIVE restricts to slab.
 *
 * Spec (audit/round-3/02-spec.md Q57):
 *   - Old regime: unused basic exemption can set off STCG+LTCG (ITA proviso §111A/§112A).
 *   - New regime CONSERVATIVE (default): basic exemption applies to slab income only.
 *     Unused basic exemption does NOT reduce STCG/LTCG.
 *   - New regime LIBERAL: setoff allowed (legal grey area, opt-in only).
 *
 * Reference values (Python decimal.Decimal precision 50):
 *   new_CONSERVATIVE: STCG=3L, normal=0 → basic setoff=0 → tax = 3L×20%×1.04 = 62400
 *   new_LIBERAL:      STCG=3L, normal=0 → basic setoff=3L → net STCG=0 → tax = 0
 *   old_regime:       STCG=3L, normal=0 → basic=2.5L → setoff=2.5L → STCG=0.5L → tax = 0.5L×20%×1.04 = 10400
 *
 * Authority: audit/round-3/02-spec.md Q57; ITA-1961 §111A/§112A proviso; §115BAC.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  investmentTaxProfile
} from "../src/model.js";

// Reference values (Python Decimal precision 50):
const REF_NEW_CONSERVATIVE = 62400;  // 3L STCG, new regime, CONSERVATIVE: no setoff
const REF_OLD_REGIME = 10400;        // 3L STCG, old regime: setoff 2.5L → 0.5L taxable × 20% × 1.04

describe("fin-w2c — Q57 basic exemption setoff new regime CONSERVATIVE", () => {
  it("New regime CONSERVATIVE: basic exemption does NOT reduce STCG (default)", () => {
    // normalIncome=0, STCG=3L. New regime basic exemption 4L unused but CONSERVATIVE → no setoff
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 0,
      harvestLtcg: 0
      // newRegimeBasicExemptionPolicy defaults to "conservative"
    });
    const streams = { normalIncome: 0, equityStcg: 300000, equityLtcg: 0, listedBondLtcg: 0 };
    const profile = investmentTaxProfile(params, streams);
    // 3L STCG fully taxed at 20% × 1.04 = 62400
    expect(Math.abs(profile.equityStcgTax - REF_NEW_CONSERVATIVE)).toBeLessThan(50);
    // basicExemptionUsed should be 0
    expect(profile.basicExemptionUsed).toBe(0);
  });

  it("New regime CONSERVATIVE explicit: same result as default", () => {
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 0,
      harvestLtcg: 0,
      newRegimeBasicExemptionPolicy: "conservative"
    });
    const streams = { normalIncome: 0, equityStcg: 300000, equityLtcg: 0, listedBondLtcg: 0 };
    const profile = investmentTaxProfile(params, streams);
    expect(Math.abs(profile.equityStcgTax - REF_NEW_CONSERVATIVE)).toBeLessThan(50);
    expect(profile.basicExemptionUsed).toBe(0);
  });

  it("New regime LIBERAL: basic exemption offsets STCG (opt-in)", () => {
    // 4L basic exemption unused, STCG=3L → setoff=3L → net STCG=0 → tax=0
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 0,
      harvestLtcg: 0,
      newRegimeBasicExemptionPolicy: "liberal"
    });
    const streams = { normalIncome: 0, equityStcg: 300000, equityLtcg: 0, listedBondLtcg: 0 };
    const profile = investmentTaxProfile(params, streams);
    // LIBERAL: 3L STCG fully offset by 4L unused basic → net STCG = 0 → tax = 0
    expect(profile.equityStcgTax).toBeLessThan(50);
    expect(profile.basicExemptionUsed).toBeGreaterThan(0);
  });

  it("Old regime: basic exemption always offsets STCG (ITA proviso §111A)", () => {
    // Old regime: basic exemption = 2.5L (below60), normal=0, STCG=3L
    // setoff = min(2.5L, 3L) = 2.5L → net STCG = 0.5L → tax = 0.5L × 20% × 1.04 = 10400
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "old",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 0,
      harvestLtcg: 0
    });
    const streams = { normalIncome: 0, equityStcg: 300000, equityLtcg: 0, listedBondLtcg: 0 };
    const profile = investmentTaxProfile(params, streams);
    // 0.5L STCG × 20% × 1.04 = 10400
    expect(Math.abs(profile.equityStcgTax - REF_OLD_REGIME)).toBeLessThan(50);
  });

  it("New regime CONSERVATIVE: basic exemption still offsets slab income (not STCG)", () => {
    // Normal income = 2L (< 4L basic exemption in new regime), no STCG
    // slab tax = 0 (2L < 4L), but basic exemption is NOT applied to STCG
    const params = normalizeState({
      ...BASE,
      taxProfileMode: "retiree",
      taxRegime: "new",
      ageBand: "below60",
      residentStatus: "resident",
      section87A: 0,
      harvestLtcg: 0
    });
    // Normal income 2L < basic exemption 4L: slab tax = 0
    const slabOnly = investmentTaxProfile(params, { normalIncome: 200000, equityStcg: 0 });
    expect(slabOnly.normalTax).toBeLessThan(1);

    // Same setup but with STCG: basicExemptionUnused = 4L - 2L = 2L (after std deduction)
    // but CONSERVATIVE → setoff = 0 → STCG fully taxed
    const withStcg = investmentTaxProfile(params, { normalIncome: 200000, equityStcg: 300000 });
    expect(Math.abs(withStcg.equityStcgTax - REF_NEW_CONSERVATIVE)).toBeLessThan(50);
    expect(withStcg.basicExemptionUsed).toBe(0);
  });
});
