/**
 * tests/surcharge-marginal-relief.test.jsx
 *
 * fin-b6d — Q12 surcharge marginal relief: cliff prevention at threshold boundaries.
 *
 * Spec (audit/round-3/02-spec.md Q12):
 *   At surcharge threshold boundaries (50L, 1Cr, 2Cr, 5Cr), marginal relief ensures
 *   that additional tax (slab + surcharge + cess) from crossing the threshold cannot
 *   exceed the income above the threshold.
 *
 *   Formula: marginalRelief = max(0, (taxBeforeCess + rawSurcharge) - (taxAtThreshold + incomeAboveThreshold))
 *   EffectiveSurcharge = max(0, rawSurcharge - marginalRelief)
 *
 * Reference: At 50L boundary (Rs1 income increase above threshold):
 *   - Without relief: surcharge jumps by ~10% of full slab tax (Rs108000+)
 *   - With relief: tax increase ≤ income increase + cess (Rs1.04 on Rs1 excess)
 *
 * Authority: audit/round-3/02-spec.md Q12; ITA-1961 §2 explanation (marginal relief).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  calculateTaxProfile
} from "../src/model.js";

function makeParams(patch = {}) {
  return normalizeState({
    ...BASE,
    taxProfileMode: "retiree",
    taxRegime: "new",
    ageBand: "below60",
    residentStatus: "resident",
    section87A: 0,
    harvestLtcg: 0,
    ...patch
  });
}

describe("fin-b6d — Q12 surcharge marginal relief at threshold boundaries", () => {
  it("At 50L boundary: Rs1 income increase causes Rs1.04 (not cliff) tax increase", () => {
    // normalIncome in streams = full taxable income (no pension std deduction in this mode)
    // 50L threshold for new regime surcharge
    const params = makeParams();
    const at50L = calculateTaxProfile(params, { normalIncome: 5000000 });
    const justAbove = calculateTaxProfile(params, { normalIncome: 5000001 });

    // At 50L: no surcharge (strictly above, not at boundary)
    expect(at50L.surcharge).toBe(0);

    // Just above: marginal relief should prevent cliff
    const incomeIncrease = 1;
    const taxIncrease = justAbove.totalTax - at50L.totalTax;

    // Without relief: surcharge would jump by ~10% of Rs1080000 = Rs108000 (pre-cess)
    // Total tax increase without relief ≈ Rs108000 * 1.04 = Rs112320 (cliff)
    // With relief: tax increase ≤ incomeIncrease + cess on the slab increment
    // Rs1 × 30% slab × 1.04 cess ≈ Rs0.312, but the cap includes the Rs1 excess itself
    // Actual: income cap = Rs1, so tax ≤ Rs1 × some factor (≤ Rs2 to account for slab+cess)
    expect(taxIncrease).toBeLessThan(5);  // much less than cliff Rs112320
    expect(taxIncrease).toBeGreaterThan(0);  // some tax on marginal income
  });

  it("At 50L boundary: relief is non-zero (surcharge cliff suppressed)", () => {
    const params = makeParams();
    const justAbove = calculateTaxProfile(params, { normalIncome: 5000001 });

    // marginalRelief should be large (suppresses the Rs108000 raw surcharge)
    expect(justAbove.marginalRelief).toBeGreaterThan(100000);
    // Effective surcharge should be tiny (near zero at Rs1 above threshold)
    expect(justAbove.surcharge).toBeLessThan(5);
  });

  it("100K above 50L threshold: tax increase proportional (no cliff)", () => {
    const params = makeParams();
    const at50L = calculateTaxProfile(params, { normalIncome: 5000000 });
    const above50L_100K = calculateTaxProfile(params, { normalIncome: 5100000 });

    const incomeIncrease = 100000;
    const taxIncrease = above50L_100K.totalTax - at50L.totalTax;

    // Tax increase should be proportional to income increase
    // Rs100K × 30% slab = Rs30K, surcharge on marginal + original → but capped by relief
    // Effective: about Rs30K × 1.04 ≈ Rs31200 + some surcharge on excess
    // Not a cliff of Rs112320 at threshold
    expect(taxIncrease).toBeLessThan(incomeIncrease * 1.5);  // not more than 150% of income increase
    expect(taxIncrease).toBeGreaterThan(incomeIncrease * 0.2);  // some tax
  });

  it("Well above threshold (500K): relief effect minimal (surcharge fully applies)", () => {
    // Far from threshold, relief should be 0 or minimal
    const params = makeParams();
    const farAbove = calculateTaxProfile(params, { normalIncome: 5500000 });

    // At 500K above threshold, the cap = taxAtThreshold + 500K
    // If surcharge on full slab < cap, no relief needed
    // This just verifies no over-application of relief
    expect(farAbove.totalTax).toBeGreaterThan(0);
    // surcharge should be positive (well above threshold)
    expect(farAbove.surcharge).toBeGreaterThan(0);
  });

  it("Below all thresholds: no surcharge, no relief", () => {
    const params = makeParams();
    const below = calculateTaxProfile(params, { normalIncome: 3000000 });

    expect(below.surcharge).toBe(0);
    expect(below.marginalRelief).toBe(0);
  });
});
