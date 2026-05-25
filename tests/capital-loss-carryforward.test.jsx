/**
 * tests/capital-loss-carryforward.test.jsx
 *
 * fin-e9e — Q55 §74 capital-loss carry-forward: 8-year FIFO pool.
 *
 * Spec (audit/round-3/02-spec.md Q55):
 *   - STCL offsets STCG + LTCG in current and future AYs (FIFO).
 *   - LTCL offsets LTCG only.
 *   - Carry-forward window: 8 AYs from the loss AY.
 *   - Pool state passed through `params.carryForwardPool` (mutated in place).
 *
 * Test setup: normalIncome=600000 ensures basic exemption (4L new regime) is
 * fully absorbed by slab income (taxable slab = 6L - 75K std = 5.25L > 4L),
 * so basic exemption setoff does NOT bleed into STCG/LTCG. This isolates the
 * carry-forward logic from the fin-w2c basic-exemption bug.
 *
 * Reference values (Python decimal.Decimal precision 50):
 *   Marginal STCG tax on 1L = 1L × 20% × 1.04 = 20800
 *   Marginal STCG tax on 3L = 3L × 20% × 1.04 = 62400
 *   Marginal LTCG tax on 1L (no exemption) = 1L × 12.5% × 1.04 = 13000
 *
 * Authority: audit/round-3/02-spec.md Q55; ITA-1961 §74(1)-(3).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  investmentTaxProfile,
  streamsForInstrument
} from "../src/model.js";

// Reference values (Python Decimal precision 50, marginal = total - base):
// net STCG after 2L STCL carry-forward = 1L → 1L × 20% × 1.04 = 20800
const REF_STCG_1L_TAX = 20800;
// Full 3L STCG without carry-forward: 3L × 20% × 1.04 = 62400
const REF_STCG_3L_TAX = 62400;
// LTCG 1L tax: 1L × 12.5% × 1.04 = 13000
const REF_LTCG_1L_TAX = 13000;

// Base params: 6L normal income exhausts basic exemption; section87A off to isolate STCG tax
function makeParams(patch = {}) {
  return normalizeState({
    ...BASE,
    taxProfileMode: "retiree",
    taxRegime: "new",
    ageBand: "below60",
    residentStatus: "resident",
    section87A: 0,
    harvestLtcg: 0,
    currentAY: 2027,
    ...patch
  });
}

describe("fin-e9e — §74 capital-loss carry-forward 8-year FIFO pool", () => {
  it("STCL from prior year reduces STCG tax via carry-forward pool", () => {
    // Pool pre-loaded with 2L STCL (realized in year 1, expiry AY 2034)
    const pool = {
      stclPool: [{ amount: 200000, expiryAY: 2034 }],
      ltclPool: []
    };
    const params = makeParams({ carryForwardPool: pool });
    const streams = {
      normalIncome: 600000,  // exhausts basic exemption (4L)
      equityStcg: 300000,    // 3L STCG in year 2
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // With 2L STCL carry-forward: net taxable STCG = 1L → marginal tax = 20800
    expect(Math.abs(profile.equityStcgTax - REF_STCG_1L_TAX)).toBeLessThan(50);
    // Pool should be depleted (2L fully consumed against 3L STCG)
    expect(pool.stclPool.length).toBe(0);
  });

  it("Without carry-forward pool: full STCG taxed (reference for regression)", () => {
    const params = makeParams();  // no carryForwardPool
    const streams = {
      normalIncome: 600000,
      equityStcg: 300000,
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // Without carry-forward: 3L STCG at 20% × 1.04 = 62400
    expect(Math.abs(profile.equityStcgTax - REF_STCG_3L_TAX)).toBeLessThan(50);
  });

  it("LTCL in pool does NOT reduce STCG (type-isolation invariant)", () => {
    // LTCL can only offset LTCG, not STCG
    const pool = {
      stclPool: [],
      ltclPool: [{ amount: 200000, expiryAY: 2034 }]  // 2L LTCL
    };
    const params = makeParams({ carryForwardPool: pool });
    const streams = {
      normalIncome: 600000,
      equityStcg: 300000,  // 3L STCG
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // LTCL cannot offset STCG → full 3L STCG taxed = 62400
    expect(Math.abs(profile.equityStcgTax - REF_STCG_3L_TAX)).toBeLessThan(50);
  });

  it("LTCL in pool reduces LTCG (type-match allowed)", () => {
    // 1.5L LTCL vs 1L LTCG → net LTCG = 0 (pool 0.5L remaining)
    const pool = {
      stclPool: [],
      ltclPool: [{ amount: 150000, expiryAY: 2034 }]
    };
    const params = makeParams({ carryForwardPool: pool });
    const streams = {
      normalIncome: 600000,
      equityStcg: 0,
      equityLtcg: 100000,  // 1L LTCG
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // 1.5L LTCL > 1L LTCG → net LTCG = 0 → no LTCG tax
    expect(profile.equityLtcgTax).toBeLessThan(50);
    // Pool: 1L consumed, 0.5L remaining
    expect(pool.ltclPool.length).toBe(1);
    expect(Math.abs(pool.ltclPool[0].amount - 50000)).toBeLessThan(1);
  });

  it("Expired entries are not applied (AY beyond 8-year window)", () => {
    // Entry with expiryAY=2026, currentAY=2027 → expired (expiryAY < currentAY)
    const pool = {
      stclPool: [{ amount: 200000, expiryAY: 2026 }],
      ltclPool: []
    };
    const params = makeParams({ carryForwardPool: pool });
    const streams = {
      normalIncome: 600000,
      equityStcg: 300000,
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    const profile = investmentTaxProfile(params, streams);
    // Expired loss not applied → full 3L taxed = 62400
    expect(Math.abs(profile.equityStcgTax - REF_STCG_3L_TAX)).toBeLessThan(50);
  });

  it("New STCL incurred this year is recorded in pool for future use", () => {
    // Negative STCG (loss) with zero gains → pool gains entry
    const pool = {
      stclPool: [],
      ltclPool: []
    };
    const params = makeParams({ currentAY: 2026, carryForwardPool: pool });
    const streams = {
      normalIncome: 600000,
      equityStcg: -200000,   // 2L STCL (negative gain = loss)
      equityLtcg: 0,
      listedBondLtcg: 0
    };
    investmentTaxProfile(params, streams);
    // Pool should contain the new STCL entry with expiryAY = 2026+8 = 2034
    expect(pool.stclPool.length).toBe(1);
    expect(pool.stclPool[0].amount).toBe(200000);
    expect(pool.stclPool[0].expiryAY).toBe(2034);
  });
});

/**
 * fin-m66 — Lot-level capital loss flows through streamsForInstrument to carry-forward pool.
 *
 * Root defect: previewLotSale used Math.max(0, sale - costCapital) which zeroed all losses
 * before they reached streamsForInstrument. This made the §74 pool dead code.
 *
 * These tests verify the full pipeline from a loss-producing lot sale to pool accumulation.
 * They were FAILING before the fin-m66 fix (loss clamped to 0) and must PASS after.
 */
describe("fin-m66 — lot-sale capital loss flows through streamsForInstrument to §74 pool", () => {
  it("streamsForInstrument passes negative STCG loss through (equityStcg instrument, < 12-month holding)", () => {
    // Short-term equity loss: instrument=equityLtcg, held 6 months (< 12) → maps to equityStcg stream
    const params = normalizeState({ ...BASE, taxRegime: "new" });
    const streams = streamsForInstrument("equityLtcg", -150000, 6, params);
    // Must carry the negative value in equityStcg (short-term by holding period)
    expect(streams.equityStcg).toBe(-150000);
    // Other streams untouched
    expect(streams.equityLtcg).toBe(0);
    expect(streams.normalIncome).toBe(0);
  });

  it("streamsForInstrument passes negative LTCG loss through (equityLtcg instrument, > 12-month holding)", () => {
    const params = normalizeState({ ...BASE, taxRegime: "new" });
    const streams = streamsForInstrument("equityLtcg", -200000, 15, params);
    // Long-term equity loss → equityLtcg stream (negative)
    expect(streams.equityLtcg).toBe(-200000);
    expect(streams.equityStcg).toBe(0);
  });

  it("loss from lot sale via streamsForInstrument accumulates in carry-forward pool when investmentTaxProfile is called", () => {
    // Simulate the lot-sale → stream → tax profile path for a loss lot.
    // Lot: bought at 10, sold at 7, held 15 months → LTCL of 3 units (3 monetary loss per unit).
    // Use investmentTaxProfile with the negative stream → pool should accumulate the LTCL.
    const pool = { stclPool: [], ltclPool: [] };
    const params = normalizeState({
      ...BASE,
      taxRegime: "new",
      currentAY: 2027,
      carryForwardPool: pool
    });
    // Produce streams the same way previewLotSale (post-fix) would produce them:
    // realizedGain = sale - costCapital = 7 - 10 = -3 (per unit), 1L units → -3L total
    const lossStreams = streamsForInstrument("equityLtcg", -300000, 15, params);
    expect(lossStreams.equityLtcg).toBe(-300000); // verify stream carries the loss

    // Add normalIncome to absorb basic exemption (prevents contamination)
    const combinedStreams = { ...lossStreams, normalIncome: 600000 };
    investmentTaxProfile(params, combinedStreams);

    // Pool must have accumulated the LTCL entry (fin-m66 fix required for this to work)
    expect(pool.ltclPool.length).toBe(1);
    expect(Math.abs(pool.ltclPool[0].amount - 300000)).toBeLessThan(1);
    expect(pool.ltclPool[0].expiryAY).toBe(2035); // 2027 + 8
  });

  it("LTCL from loss lot offsets LTCG in subsequent year via carry-forward pool (end-to-end §74 path)", () => {
    // Year 1 (AY 2027): 3L LTCL from a loss lot. Year 2 (AY 2028): 2L LTCG.
    // After carry-forward: net LTCG in AY 2028 = 0 (1L LTCL remaining in pool).
    const pool = { stclPool: [], ltclPool: [] };

    // Year 1: incur LTCL via streamsForInstrument (simulating previewLotSale post-fix)
    const params2027 = normalizeState({
      ...BASE,
      taxRegime: "new",
      currentAY: 2027,
      carryForwardPool: pool
    });
    const lossStreams2027 = { ...streamsForInstrument("equityLtcg", -300000, 15, params2027), normalIncome: 600000 };
    investmentTaxProfile(params2027, lossStreams2027);
    // After year 1: 3L LTCL in pool
    expect(pool.ltclPool.length).toBe(1);
    expect(Math.abs(pool.ltclPool[0].amount - 300000)).toBeLessThan(1);

    // Year 2: 2L LTCG — should be fully offset by pool LTCL, net LTCG = 0 → LTCG tax = 0
    const params2028 = normalizeState({
      ...BASE,
      taxRegime: "new",
      currentAY: 2028,
      carryForwardPool: pool,
      section87A: 0,  // disable rebate to isolate LTCG tax
      harvestLtcg: 0
    });
    const gainStreams2028 = { normalIncome: 600000, equityLtcg: 200000, equityStcg: 0, listedBondLtcg: 0 };
    const profile2028 = investmentTaxProfile(params2028, gainStreams2028);
    // LTCG fully offset: tax = 0 (marginal)
    expect(profile2028.equityLtcgTax).toBeLessThan(50);
    // 1L LTCL remaining in pool (3L - 2L = 1L)
    expect(pool.ltclPool.length).toBe(1);
    expect(Math.abs(pool.ltclPool[0].amount - 100000)).toBeLessThan(1);
  });
});
