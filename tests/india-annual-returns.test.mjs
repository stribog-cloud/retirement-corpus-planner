import { describe, expect, it } from "vitest";
import { DATASET_META, INDIA_ANNUAL_RETURNS } from "../src/data/india-annual-returns.js";

function cagrPct(values) {
  const growth = values.reduce((product, pct) => product * (1 + pct / 100), 1);
  return (Math.pow(growth, 1 / values.length) - 1) * 100;
}

function meanPct(values) {
  return values.reduce((sum, pct) => sum + pct, 0) / values.length;
}

function fyIndex(fy) {
  return INDIA_ANNUAL_RETURNS.findIndex((row) => row.fy === fy);
}

describe("INDIA_ANNUAL_RETURNS dataset", () => {
  it("has exactly 35 entries spanning FY1990-91 through FY2024-25", () => {
    expect(INDIA_ANNUAL_RETURNS).toHaveLength(35);
    expect(INDIA_ANNUAL_RETURNS[0].fy).toBe("1990-91");
    expect(INDIA_ANNUAL_RETURNS.at(-1).fy).toBe("2024-25");
  });

  it("has sequential, correctly formatted fy strings", () => {
    for (let year = 1990; year <= 2024; year += 1) {
      const expectedFy = `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
      expect(INDIA_ANNUAL_RETURNS[year - 1990].fy).toBe(expectedFy);
    }
  });

  it("keeps every field a finite number rounded to at most 1 decimal place", () => {
    for (const row of INDIA_ANNUAL_RETURNS) {
      for (const field of ["equityNominalPct", "debtNominalPct", "inflationPct"]) {
        const value = row[field];
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.round(value * 10) / 10).toBeCloseTo(value, 10);
      }
    }
  });

  it("keeps equity within the plausible range and no year beyond +/-300%", () => {
    for (const row of INDIA_ANNUAL_RETURNS) {
      expect(Math.abs(row.equityNominalPct)).toBeLessThanOrEqual(300);
    }
  });

  it("keeps debt within [2, 16] for every year", () => {
    for (const row of INDIA_ANNUAL_RETURNS) {
      expect(row.debtNominalPct).toBeGreaterThanOrEqual(2);
      expect(row.debtNominalPct).toBeLessThanOrEqual(16);
    }
  });

  it("keeps inflation within [1, 15] for every year", () => {
    for (const row of INDIA_ANNUAL_RETURNS) {
      expect(row.inflationPct).toBeGreaterThanOrEqual(1);
      expect(row.inflationPct).toBeLessThanOrEqual(15);
    }
  });

  it("produces a full-window equity CAGR within [11%, 17%]", () => {
    const equityCagr = cagrPct(INDIA_ANNUAL_RETURNS.map((row) => row.equityNominalPct));
    expect(equityCagr).toBeGreaterThanOrEqual(11);
    expect(equityCagr).toBeLessThanOrEqual(17);
  });

  it("produces a full-window debt CAGR within [6.5%, 9.5%]", () => {
    const debtCagr = cagrPct(INDIA_ANNUAL_RETURNS.map((row) => row.debtNominalPct));
    expect(debtCagr).toBeGreaterThanOrEqual(6.5);
    expect(debtCagr).toBeLessThanOrEqual(9.5);
  });

  it("produces a full-window inflation mean within [5.5%, 8.5%]", () => {
    const inflationMean = meanPct(INDIA_ANNUAL_RETURNS.map((row) => row.inflationPct));
    expect(inflationMean).toBeGreaterThanOrEqual(5.5);
    expect(inflationMean).toBeLessThanOrEqual(8.5);
  });

  it("honors the anchor fiscal years used to sanity-check historical events", () => {
    // FY1991-92: Harshad Mehta boom.
    expect(INDIA_ANNUAL_RETURNS[fyIndex("1991-92")].equityNominalPct).toBeGreaterThan(200);
    // FY2008-09: global financial crisis crash.
    expect(INDIA_ANNUAL_RETURNS[fyIndex("2008-09")].equityNominalPct).toBeLessThan(-30);
    // FY2020-21: COVID recovery rally.
    expect(INDIA_ANNUAL_RETURNS[fyIndex("2020-21")].equityNominalPct).toBeGreaterThan(50);
  });

  it("exposes DATASET_META consistent with the array contents", () => {
    expect(DATASET_META.id).toBe("india-fy-annual-v1");
    expect(DATASET_META.firstFy).toBe("1990-91");
    expect(DATASET_META.lastFy).toBe("2024-25");
    expect(DATASET_META.count).toBe(INDIA_ANNUAL_RETURNS.length);
    expect(Array.isArray(DATASET_META.sources)).toBe(true);
    expect(DATASET_META.sources.length).toBeGreaterThan(0);
    for (const source of DATASET_META.sources) {
      expect(typeof source).toBe("string");
      expect(source.length).toBeGreaterThan(0);
    }
  });
});
