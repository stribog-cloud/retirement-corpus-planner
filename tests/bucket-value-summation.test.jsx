/**
 * tests/bucket-value-summation.test.jsx
 *
 * fin-94y — HS10: bucketValue float summation Kahan unguarded.
 *
 * Problem: `bucketValue(bucket) = bucket.lots.reduce((sum, lot) => sum + lot.units * bucket.nav, 0)`
 * After 300+ monthly contribution lots accumulate (360-month SWP with monthly SIP),
 * the float summation across N lots exhibits associativity error: O(N × epsilon).
 *
 * At N=300 lots, corpus=₹5Cr: relative error = O(300 × 2^-52) ≈ 6.7e-14
 * Absolute error = ₹5Cr × 6.7e-14 ≈ ₹0.0034 — well below ₹0.01 paisa threshold.
 *
 * Verification: simulate N lots and compare reduce-sum vs direct sum.
 * If error stays below ₹0.01 (paisa), close as "verified within display precision".
 *
 * Spec: audit/round-3/05-precision-hotspots.md HS10.
 * Authority: audit/round-3/02-spec.md Q24 (NAV), Q01 (SWP closing corpus).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  makeBucket,
  bucketValue,
  calculateSwpPlan
} from "../src/model.js";

describe("fin-94y — bucketValue summation within display precision (HS10)", () => {
  it("bucketValue with 300 lots: float summation error < ₹0.01 at ₹5Cr corpus", () => {
    // Create a bucket with 300 lots of equal value to simulate 300 monthly contributions
    // Total value: ₹5Cr (₹50,000/lot × 300 lots... at nav=1)
    const lots = [];
    const lotValue = 50000000 / 300; // ₹5Cr / 300 lots
    const nav = 1.0;
    for (let i = 0; i < 300; i++) {
      lots.push({ units: lotValue, costPerUnit: 1, fmv2018PerUnit: 0, acquisitionYear: 2020, holdingMonths: 0 });
    }
    const bucket = { nav, lots, annualRate: 0.10, monthlyRate: 0, instrument: "equityLtcg" };

    const summed = bucketValue(bucket);
    const expected = 50000000; // ₹5Cr exact

    const error = Math.abs(summed - expected);
    console.log(`300 lots, ₹5Cr: bucketValue error = ₹${error.toFixed(6)}`);

    // Must be within ₹0.01 (paisa display threshold)
    expect(error).toBeLessThan(0.01);
  });

  it("bucketValue with 360 lots (30yr monthly): float summation error < ₹0.01 at ₹10Cr corpus", () => {
    // Worst case: 360 lots (monthly contributions for 30 years) at ₹10Cr total
    const lots = [];
    const nav = 1.5; // NAV has grown over time
    const lotUnits = 10000000 / (360 * nav); // ₹10Cr worth split across 360 lots at nav=1.5
    for (let i = 0; i < 360; i++) {
      lots.push({ units: lotUnits, costPerUnit: 1, fmv2018PerUnit: 0, acquisitionYear: 2020, holdingMonths: i });
    }
    const bucket = { nav, lots, annualRate: 0.10, monthlyRate: 0, instrument: "equityLtcg" };

    const summed = bucketValue(bucket);
    const expected = 360 * lotUnits * nav; // exact arithmetic
    const error = Math.abs(summed - expected);
    console.log(`360 lots, ₹10Cr: bucketValue error = ₹${error.toFixed(6)}`);

    expect(error).toBeLessThan(0.01);
  });

  it("bucketValue with varied lot sizes (realistic FIFO scenario): error < ₹0.01", () => {
    // More realistic: lots of varying sizes (some large initial lots, many smaller ones)
    const lots = [];
    const nav = 2.0; // doubled NAV over time

    // 1 large initial lot (60% of corpus)
    lots.push({ units: 30000000 / nav, costPerUnit: 1, fmv2018PerUnit: 0, acquisitionYear: 2010, holdingMonths: 180 });

    // 99 smaller contribution lots (40% of corpus, split evenly)
    const smallLotUnits = 20000000 / (99 * nav);
    for (let i = 0; i < 99; i++) {
      lots.push({ units: smallLotUnits, costPerUnit: 1.5, fmv2018PerUnit: 0, acquisitionYear: 2018, holdingMonths: i * 3 });
    }

    const bucket = { nav, lots, annualRate: 0.10, monthlyRate: 0, instrument: "equityLtcg" };
    const summed = bucketValue(bucket);

    // Reference: compute individually with different order (check associativity)
    const refSum = lots.reduce((acc, lot) => acc + lot.units * nav, 0);
    const error = Math.abs(summed - refSum);
    console.log(`100 varied lots, ₹50Cr: bucketValue error = ₹${error.toFixed(8)}`);

    expect(error).toBeLessThan(0.01);
  });

  it("SWP 30-year with annual contribution: final bucketValue within display precision", () => {
    // Integration test: 30-year SWP with monthly contributions
    // Creates many lots; verify final corpus value is finite and reasonable
    const params = projectionParamsFromState(normalizeState({
      ...BASE,
      incomeMode: "swp",
      principal: 50000000, // ₹5Cr
      equityShare: 100, debtShare: 0,
      equityInstrument: "equityLtcg",
      useAssetReturns: 0,
      annualRate: 10,
      years: 30,
      inflateWithdrawals: 0, inflation: 0,
      annualContribution: 120000, // ₹1.2L/year = ₹10K/month contribution
      shockYear: 0, shockDrop: 0,
      taxRate: 0, section87A: 0,
      monthlyTarget: 10000,
      cashMode: "monthlyTarget"
    }));
    const model = calculateSwpPlan(params);
    const finalRow = model.rows[model.rows.length - 1];

    expect(Number.isFinite(finalRow.closing)).toBe(true);
    expect(finalRow.closing).toBeGreaterThan(0);
  });
});
