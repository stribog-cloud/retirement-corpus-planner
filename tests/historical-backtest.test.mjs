/**
 * tests/historical-backtest.test.mjs
 *
 * fin-8fb F4 — Historical Backtest Lab engine tests.
 *
 * Covers (per v2-feature-specs.md "F4 — Historical Backtest Lab" and
 * "Cross-cutting acceptance for domain features"):
 *   1. Cohort math against a hand-computed 2-cohort toy dataset, cross-checked
 *      against calculate() called directly with the exact overrides the
 *      engine is supposed to build.
 *   2. Determinism — no RNG, repeated calls produce identical output.
 *   3. Success-definition parity with calculateMonteCarlo's successProbability
 *      numerator (closing >= targetCorpus, nothing more).
 *   4. backtestUseHistoricalInflation toggle — per-year historical inflation
 *      compounds cumulatively (delta=1 convention); default 0 keeps the
 *      user's single assumed inflation rate.
 *   5. Zero-cohort case (horizon > dataset length).
 *   6. Dataset-integration smoke test against the real 35-entry
 *      INDIA_ANNUAL_RETURNS dataset, with a runtime sanity budget.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  calculate,
  calculateHistoricalBacktest,
  calculateMonteCarlo,
  cumulativeInflationFactor,
  historicalInflationRateForYear,
  historicalReturnOverrideForYear,
  normalizeState,
  projectionParamsFromState,
  resolveDynamicSpending
} from "../src/model.js";
import { INDIA_ANNUAL_RETURNS } from "../src/data/india-annual-returns.js";

// A tiny, hand-authored 3-row dataset so cohort math can be cross-checked
// against calculate() with explicit overrides, independent of the real
// 35-entry INDIA_ANNUAL_RETURNS series.
const toyDataset = [
  { fy: "1990-91", equityNominalPct: 10, debtNominalPct: 6, inflationPct: 5 },
  { fy: "1991-92", equityNominalPct: -20, debtNominalPct: 4, inflationPct: 8 },
  { fy: "1992-93", equityNominalPct: 30, debtNominalPct: 5, inflationPct: 3 }
];

function toyParams(overrides = {}) {
  const state = normalizeState({
    ...BASE,
    years: 2,
    useAssetReturns: 1,
    equityShare: 50,
    equityReturn: 12, // irrelevant once overridden per cohort
    debtReturn: 7, // irrelevant once overridden per cohort
    incomeMode: "interest",
    cashMode: "interestPercent",
    withdrawRate: 40,
    inflation: 6,
    principal: 10000000,
    targetCorpus: 0,
    ...overrides
  });
  return projectionParamsFromState(state);
}

describe("calculateHistoricalBacktest — cohort math (hand-computed toy dataset)", () => {
  it("produces exactly 2 cohorts for a 3-row dataset with horizon 2", () => {
    const params = toyParams();
    const result = calculateHistoricalBacktest(params, toyDataset);
    expect(result.cohortCount).toBe(2);
    expect(result.horizon).toBe(2);
    expect(result.cohorts).toHaveLength(2);
  });

  it("matches calculate() called directly with the equivalent explicit sequenceReturnOverrides", () => {
    const params = toyParams();
    const result = calculateHistoricalBacktest(params, toyDataset);

    const cohort0 = calculate({
      ...params,
      sequenceReturnOverrides: [
        { equityReturn: 10, debtReturn: 6 },
        { equityReturn: -20, debtReturn: 4 }
      ]
    });
    const cohort1 = calculate({
      ...params,
      sequenceReturnOverrides: [
        { equityReturn: -20, debtReturn: 4 },
        { equityReturn: 30, debtReturn: 5 }
      ]
    });

    expect(result.cohorts[0].startFy).toBe("1990-91");
    expect(result.cohorts[0].endingCorpus).toBeCloseTo(cohort0.final.closing, 6);
    expect(result.cohorts[0].realEndingCorpus).toBeCloseTo(cohort0.final.realClosing, 6);
    expect(result.cohorts[0].depleted).toBe(false);
    expect(result.cohorts[0].depletionYear).toBeNull();

    expect(result.cohorts[1].startFy).toBe("1991-92");
    expect(result.cohorts[1].endingCorpus).toBeCloseTo(cohort1.final.closing, 6);
    expect(result.cohorts[1].realEndingCorpus).toBeCloseTo(cohort1.final.realClosing, 6);
  });

  it("worst/best cohort summaries pick the lowest/highest ending corpus", () => {
    const params = toyParams();
    const result = calculateHistoricalBacktest(params, toyDataset);
    const [c0, c1] = result.cohorts;
    const lower = c0.endingCorpus <= c1.endingCorpus ? c0 : c1;
    const higher = c0.endingCorpus <= c1.endingCorpus ? c1 : c0;
    expect(result.worst.startFy).toBe(lower.startFy);
    expect(result.worst.endingCorpus).toBeCloseTo(lower.endingCorpus, 6);
    expect(result.best.startFy).toBe(higher.startFy);
    expect(result.best.endingCorpus).toBeCloseTo(higher.endingCorpus, 6);
  });

  it("percentileBands report P10/P50/P90 across cohorts for every projection year (year 0..horizon)", () => {
    const params = toyParams();
    const result = calculateHistoricalBacktest(params, toyDataset);
    expect(result.percentileBands.p10).toHaveLength(3); // years 0, 1, 2
    expect(result.percentileBands.p50).toHaveLength(3);
    expect(result.percentileBands.p90).toHaveLength(3);
    // Year 0 is the principal sentinel for every cohort — bands collapse to it.
    expect(result.percentileBands.p10[0]).toBe(params.principal);
    expect(result.percentileBands.p50[0]).toBe(params.principal);
    expect(result.percentileBands.p90[0]).toBe(params.principal);
    // P10 <= P50 <= P90 at every year.
    for (let year = 0; year < result.percentileBands.p50.length; year++) {
      expect(result.percentileBands.p10[year]).toBeLessThanOrEqual(result.percentileBands.p50[year] + 1e-6);
      expect(result.percentileBands.p50[year]).toBeLessThanOrEqual(result.percentileBands.p90[year] + 1e-6);
    }
  });

  it("historicalReturnOverrideForYear blends equity/debt by equityShare when useAssetReturns !== 1", () => {
    const row = { fy: "x", equityNominalPct: 20, debtNominalPct: 8, inflationPct: 5 };
    const blended = historicalReturnOverrideForYear({ useAssetReturns: 0, equityShare: 30 }, row);
    expect(blended).toEqual({ annualRate: 0.3 * 20 + 0.7 * 8 });
    const direct = historicalReturnOverrideForYear({ useAssetReturns: 1 }, row);
    expect(direct).toEqual({ equityReturn: 20, debtReturn: 8 });
  });
});

describe("calculateHistoricalBacktest — determinism", () => {
  it("is a pure function of (params, dataset) — no RNG, repeated calls are identical", () => {
    const params = toyParams();
    const r1 = calculateHistoricalBacktest(params, toyDataset);
    const r2 = calculateHistoricalBacktest(params, toyDataset);
    expect(r2).toEqual(r1);
  });

  it("is deterministic against the real default dataset too", () => {
    const params = projectionParamsFromState(normalizeState({ ...BASE, years: 30 }));
    const r1 = calculateHistoricalBacktest(params);
    const r2 = calculateHistoricalBacktest(params);
    expect(r2).toEqual(r1);
  });
});

describe("calculateHistoricalBacktest — success definition parity with calculateMonteCarlo", () => {
  it("counts a cohort as success iff final closing >= targetCorpus (mirrors MC's successProbability numerator)", () => {
    const base = toyParams();
    // Cohort 0 (1990-91 start) ends lower than cohort 1 (1991-92 start) for
    // this toy dataset/params combination (verified against calculate()
    // directly) — a target between the two makes exactly one cohort succeed.
    const cohort0 = calculate({
      ...base,
      sequenceReturnOverrides: [{ equityReturn: 10, debtReturn: 6 }, { equityReturn: -20, debtReturn: 4 }]
    });
    const cohort1 = calculate({
      ...base,
      sequenceReturnOverrides: [{ equityReturn: -20, debtReturn: 4 }, { equityReturn: 30, debtReturn: 5 }]
    });
    expect(cohort0.final.closing).toBeLessThan(cohort1.final.closing);

    const targetCorpus = (cohort0.final.closing + cohort1.final.closing) / 2;
    const params = { ...base, targetCorpus };
    const result = calculateHistoricalBacktest(params, toyDataset);

    expect(result.successRate).toBeCloseTo(0.5, 10);

    // Cross-check against MC's own literal criterion for a single sample
    // path equal to each cohort's return sequence: closing >= targetCorpus.
    expect(cohort0.final.closing >= targetCorpus).toBe(false);
    expect(cohort1.final.closing >= targetCorpus).toBe(true);
  });

  it("uses the same non-strict >= comparator as calculateMonteCarlo when target is unset (0)", () => {
    // targetCorpus === 0 → MC's `closing >= targetCorpus` is always true
    // (closing is never negative); the backtest must mirror that exactly.
    const params = toyParams({ targetCorpus: 0 });
    const result = calculateHistoricalBacktest(params, toyDataset);
    const mc = calculateMonteCarlo(params, 5);
    expect(result.successRate).toBe(1);
    expect(mc.successProbability).toBe(1);
  });
});

describe("calculateHistoricalBacktest — historical inflation toggle (delta=1 compounding)", () => {
  function inflationToyParams(overrides = {}) {
    const state = normalizeState({
      ...BASE,
      years: 2,
      useAssetReturns: 1,
      equityShare: 50,
      equityReturn: 12,
      debtReturn: 7,
      incomeMode: "interest",
      cashMode: "monthlyTarget",
      monthlyTarget: 100000,
      inflateWithdrawals: 1,
      inflation: 6,
      withdrawalRule: "fixed",
      principal: 10000000,
      targetCorpus: 0,
      ...overrides
    });
    return projectionParamsFromState(state);
  }

  it("backtestUseHistoricalInflation=1 compounds year-2's target by exactly (1 + year-1's historical inflation)", () => {
    const params = inflationToyParams({ backtestUseHistoricalInflation: 1 });
    const result = calculateHistoricalBacktest(params, toyDataset);

    const direct = calculate({
      ...params,
      sequenceReturnOverrides: [{ equityReturn: 10, debtReturn: 6 }, { equityReturn: -20, debtReturn: 4 }],
      sequenceInflationOverrides: [5, 8] // toyDataset[0].inflationPct, toyDataset[1].inflationPct
    });

    // Year 1 is uninflated (delta=1 base); Year 2 escalates by year-1's own
    // historical rate (5%), not the flat user-assumed rate (6%).
    expect(direct.rows[2].targetCash / direct.rows[1].targetCash).toBeCloseTo(1.05, 10);
    expect(result.cohorts[0].endingCorpus).toBeCloseTo(direct.final.closing, 6);
  });

  it("default (backtestUseHistoricalInflation=0) keeps the flat user-assumed inflation rate instead", () => {
    const params = inflationToyParams(); // backtestUseHistoricalInflation defaults to 0
    expect(params.backtestUseHistoricalInflation).toBe(0);
    const result = calculateHistoricalBacktest(params, toyDataset);

    const direct = calculate({
      ...params,
      sequenceReturnOverrides: [{ equityReturn: 10, debtReturn: 6 }, { equityReturn: -20, debtReturn: 4 }]
      // No sequenceInflationOverrides — engine must not have set one either.
    });

    // Escalates by the flat assumed 6% rate, not either historical year's rate.
    expect(direct.rows[2].targetCash / direct.rows[1].targetCash).toBeCloseTo(1.06, 10);
    expect(result.cohorts[0].endingCorpus).toBeCloseTo(direct.final.closing, 6);
  });

  it("cumulative compounding uses each year's own historical rate, not a full-window average", () => {
    // Cohort 1 (start=1) sees inflation 8% then 3%. Year-2 target must
    // escalate by 8% (year-1's own rate for THIS cohort), not by the
    // 3-row-window's blended/average rate.
    const params = inflationToyParams({ backtestUseHistoricalInflation: 1 });
    const direct = calculate({
      ...params,
      sequenceReturnOverrides: [{ equityReturn: -20, debtReturn: 4 }, { equityReturn: 30, debtReturn: 5 }],
      sequenceInflationOverrides: [8, 3]
    });
    expect(direct.rows[2].targetCash / direct.rows[1].targetCash).toBeCloseTo(1.08, 10);
  });
});

describe("calculateHistoricalBacktest — zero-cohort case", () => {
  it("returns a graceful zero-cohort shape when horizon exceeds the dataset length", () => {
    const params = toyParams({ years: 10 }); // toyDataset has only 3 rows
    const result = calculateHistoricalBacktest(params, toyDataset);
    expect(result).toEqual({
      cohortCount: 0,
      horizon: 10,
      successRate: 0,
      worst: null,
      best: null,
      cohorts: [],
      percentileBands: { p10: [], p50: [], p90: [] }
    });
  });

  it("returns a graceful zero-cohort shape when years is 0", () => {
    const params = toyParams({ years: 0 });
    const result = calculateHistoricalBacktest(params, toyDataset);
    expect(result.cohortCount).toBe(0);
    expect(result.horizon).toBe(0);
  });

  it("returns a graceful zero-cohort shape for an empty dataset", () => {
    const params = toyParams();
    const result = calculateHistoricalBacktest(params, []);
    expect(result.cohortCount).toBe(0);
    expect(result.cohorts).toEqual([]);
  });
});

describe("calculateHistoricalBacktest — real dataset integration smoke test", () => {
  it("produces 6 cohorts for horizon 30 against the bundled 35-entry INDIA_ANNUAL_RETURNS dataset", () => {
    expect(INDIA_ANNUAL_RETURNS).toHaveLength(35);
    const params = projectionParamsFromState(normalizeState({ ...BASE, years: 30 }));

    const started = Date.now();
    const result = calculateHistoricalBacktest(params); // default dataset argument
    const elapsedMs = Date.now() - started;

    expect(result.cohortCount).toBe(6);
    expect(result.horizon).toBe(30);
    expect(result.cohorts).toHaveLength(6);
    expect(result.percentileBands.p50).toHaveLength(31); // years 0..30
    expect(Number.isFinite(result.successRate)).toBe(true);
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    expect(result.worst).toBeTruthy();
    expect(result.best).toBeTruthy();
    expect(result.worst.endingCorpus).toBeLessThanOrEqual(result.best.endingCorpus);

    // fin-8fb F4 runtime budget: < 2s for 30-cohort x 30-year replay (this
    // smoke test only exercises 6 cohorts x 30 years, well under budget).
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("every cohort startFy is a real, sequential fiscal year drawn from the dataset", () => {
    const params = projectionParamsFromState(normalizeState({ ...BASE, years: 30 }));
    const result = calculateHistoricalBacktest(params);
    const startFys = result.cohorts.map((c) => c.startFy);
    expect(startFys).toEqual(INDIA_ANNUAL_RETURNS.slice(0, 6).map((row) => row.fy));
  });

  it("SWP mode with historical inflation exercises the monthly (fractional-year) compounding path", () => {
    // SWP's monthly redemption loop calls cumulativeInflationFactor with a
    // fractional yearsElapsed (monthIndex/12); this is the only engine path
    // that reaches that branch, so cover it via a real cohort run.
    const params = projectionParamsFromState(normalizeState({
      ...BASE,
      years: 3,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      monthlyTarget: 50000,
      backtestUseHistoricalInflation: 1,
      targetCorpus: 0
    }));
    const result = calculateHistoricalBacktest(params, INDIA_ANNUAL_RETURNS.slice(0, 5));
    expect(result.cohortCount).toBe(3);
    for (const cohort of result.cohorts) {
      expect(Number.isFinite(cohort.endingCorpus)).toBe(true);
    }
  });
});

describe("cumulativeInflationFactor — direct branch coverage", () => {
  it("falls back to Math.pow(1+inflation, yearsElapsed) when no override is set", () => {
    const params = { inflation: 6 };
    expect(cumulativeInflationFactor(params, 3)).toBeCloseTo(Math.pow(1.06, 3), 12);
    expect(cumulativeInflationFactor(params, 0)).toBe(1);
  });

  it("compounds a per-year override array cumulatively across whole years", () => {
    const params = { inflation: 6, sequenceInflationOverrides: [5, 8, 3] };
    expect(cumulativeInflationFactor(params, 0)).toBe(1);
    expect(cumulativeInflationFactor(params, 1)).toBeCloseTo(1.05, 12);
    expect(cumulativeInflationFactor(params, 2)).toBeCloseTo(1.05 * 1.08, 12);
    expect(cumulativeInflationFactor(params, 3)).toBeCloseTo(1.05 * 1.08 * 1.03, 12);
  });

  it("compounds a fractional yearsElapsed continuously at the in-progress year's rate", () => {
    const params = { inflation: 6, sequenceInflationOverrides: [5, 8, 3] };
    const wholeYear1 = cumulativeInflationFactor(params, 1);
    const halfwayYear2 = cumulativeInflationFactor(params, 1.5);
    // Fractional remainder into year 2 compounds at year 2's own rate (8%),
    // not year 1's rate or the flat assumed rate.
    expect(halfwayYear2).toBeCloseTo(wholeYear1 * Math.pow(1.08, 0.5), 12);
    // Continuity: month 12 (yearsElapsed=1) and "month 12.0" agree exactly.
    expect(cumulativeInflationFactor(params, 1.0)).toBeCloseTo(wholeYear1, 12);
  });

  it("falls back to the scalar assumed rate for a non-finite override entry", () => {
    const params = { inflation: 6, sequenceInflationOverrides: [5, undefined, "bad"] };
    // Year 2's entry is undefined (Number(undefined) is NaN) -> falls back
    // to the flat 6% assumed rate for that year only.
    expect(cumulativeInflationFactor(params, 2)).toBeCloseTo(1.05 * 1.06, 12);
    // Year 3's entry is non-numeric text -> also falls back to 6%.
    expect(cumulativeInflationFactor(params, 3)).toBeCloseTo(1.05 * 1.06 * 1.06, 12);
  });

  it("clamps to the last override entry when yearsElapsed exceeds the array length", () => {
    const params = { inflation: 6, sequenceInflationOverrides: [5] };
    // Year 2 has no entry of its own -> repeats year 1's rate (index clamp),
    // never falling through to the flat 6% assumed rate.
    expect(cumulativeInflationFactor(params, 2)).toBeCloseTo(1.05 * 1.05, 12);
  });
});

describe("historicalInflationRateForYear — direct branch coverage", () => {
  it("returns the flat assumed rate when no override is set", () => {
    expect(historicalInflationRateForYear({ inflation: 6 }, 1)).toBeCloseTo(0.06, 12);
  });

  it("returns the historical per-year rate when an override is present", () => {
    const params = { inflation: 6, sequenceInflationOverrides: [5, 8, 3] };
    expect(historicalInflationRateForYear(params, 1)).toBeCloseTo(0.05, 12);
    expect(historicalInflationRateForYear(params, 2)).toBeCloseTo(0.08, 12);
    expect(historicalInflationRateForYear(params, 3)).toBeCloseTo(0.03, 12);
  });

  it("falls back to the flat assumed rate for a non-finite override entry", () => {
    const params = { inflation: 6, sequenceInflationOverrides: [5, undefined] };
    expect(historicalInflationRateForYear(params, 2)).toBeCloseTo(0.06, 12);
  });

  it("clamps year below 1 up to the first entry and beyond the array length to the last entry", () => {
    const params = { inflation: 6, sequenceInflationOverrides: [5, 8] };
    expect(historicalInflationRateForYear(params, 0)).toBeCloseTo(0.05, 12);
    expect(historicalInflationRateForYear(params, 5)).toBeCloseTo(0.08, 12);
  });

  it("drives resolveDynamicSpending's guardrails held-inflation step with the historical rate", () => {
    // Exercises the call site inside resolveDynamicSpending (not just the
    // standalone helper): with a historical override present, a guardrails
    // inflation-hold year advances by the override's own rate.
    const params = {
      inflateWithdrawals: 1,
      sequenceInflationOverrides: [5, 8],
      guardrailBandPct: 20,
      guardrailAdjustPct: 10
    };
    const dyn = resolveDynamicSpending({
      rule: "guardrails",
      year: 2,
      openingCorpus: 1000000,
      baseAnnualCash: 50000,
      inflationFactor: 1.05,
      heldInflationFactor: 1,
      initialRate: 0.05,
      multiplier: 1,
      priorYearReturn: -0.1, // triggers the inflation-hold branch
      params
    });
    expect(dyn.inflationHeld).toBe(true);
    // Held factor is the PRIOR heldInflationFactor (unchanged this year);
    // the historical rate feeds candidateInflationFactor, which is what the
    // hold decision compares against — confirms no throw / NaN leakage from
    // routing through historicalInflationRateForYear.
    expect(Number.isFinite(dyn.nextInflationFactor)).toBe(true);
  });
});
