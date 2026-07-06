/**
 * tests/carryforward-projection.test.jsx
 *
 * fin-8fb F1 — §74 capital-loss carry-forward, live in projections.
 *
 * tests/capital-loss-carryforward.test.jsx already unit-tests the underlying
 * §74 primitives (applyAndUpdateCarryForwardPool, netCapitalGainStreams via
 * investmentTaxProfile) in isolation. This file covers the NEW projection-
 * level wiring added for F1:
 *   - applyYearEndCarryForward: the single-commit-per-year helper that
 *     threads a local pool through calculateSwpPlan / calculateInterestPlan
 *     without touching the monthly/lot-preview hot path (cache-safety design
 *     is documented on applyYearEndCarryForward itself in src/model.js).
 *   - calculateSwpPlan end-to-end: a real multi-year crash-then-recovery
 *     scenario where a realized loss reduces a LATER year's tax.
 *   - calculateInterestPlan end-to-end: principal-drawdown carry-forward.
 *   - Monte Carlo determinism with carry-forward active (pool must reset per
 *     path; two runs with the same seed must be identical).
 *
 * Default-state parity (no realized losses -> pool stays empty -> zero
 * behavior change) is covered by tests/v2-parity-goldens.test.jsx.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  calculateSwpPlan,
  calculateInterestPlan,
  calculateMonteCarlo,
  projectionParamsFromState,
  investmentTaxProfile,
  emptyTaxStreams,
  paramsForProjectionYear,
  assessmentYearForProjectionYear,
  applyYearEndCarryForward
} from "../src/model.js";

describe("fin-8fb F1 — assessmentYearForProjectionYear", () => {
  it("anchors projection year 1 at AY 2026-27 (2027) and advances by one AY per year", () => {
    expect(assessmentYearForProjectionYear(1)).toBe(2027);
    expect(assessmentYearForProjectionYear(2)).toBe(2028);
    expect(assessmentYearForProjectionYear(9)).toBe(2035);
    expect(assessmentYearForProjectionYear(10)).toBe(2036);
  });
});

describe("fin-8fb F1 — applyYearEndCarryForward (direct unit tests of the year-boundary helper)", () => {
  function yearParams(patch = {}) {
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

  it("records a new LT loss into the pool with no tax effect the year it arises (pool starts empty)", () => {
    const pool = { stclPool: [], ltclPool: [] };
    const params = yearParams();
    const streams = { ...emptyTaxStreams(), normalIncome: 600000, equityLtcg: -300000 };
    const result = applyYearEndCarryForward(pool, params, streams, 1);

    expect(result.taxBenefit).toBe(0);
    expect(pool.ltclPool).toEqual([{ amount: 300000, expiryAY: 2035 }]);
    expect(pool.stclPool).toEqual([]);
  });

  it("a carried LT loss does NOT offset a later year's ST gain (type isolation across years)", () => {
    const pool = { stclPool: [], ltclPool: [{ amount: 300000, expiryAY: 2035 }] };
    const params = yearParams();
    const streams = { ...emptyTaxStreams(), normalIncome: 600000, equityStcg: 500000 };
    const result = applyYearEndCarryForward(pool, params, streams, 2);

    expect(result.taxBenefit).toBe(0);
    // Pool untouched: LT loss cannot be consumed by an ST gain.
    expect(pool.ltclPool).toEqual([{ amount: 300000, expiryAY: 2035 }]);
  });

  it("the same carried LT loss DOES offset a later year's LT gain (type match allowed)", () => {
    const pool = { stclPool: [], ltclPool: [{ amount: 300000, expiryAY: 2035 }] };
    const params = yearParams();
    const streams = { ...emptyTaxStreams(), normalIncome: 600000, equityLtcg: 200000 };
    const result = applyYearEndCarryForward(pool, params, streams, 3);

    // 2L LTCG fully absorbed by the 3L pool: the whole marginal LTCG tax
    // (2L x 12.5% x 1.04 cess = 26000, matching the reference math in
    // tests/capital-loss-carryforward.test.jsx) is saved. The comparison
    // must isolate the LTCG-only component: applyYearEndCarryForward diffs
    // two calculateTaxProfile calls on the SAME streams (with/without pool),
    // so the shared normalIncome slab tax cancels out of the delta —
    // investmentTaxProfile's own base-stripping does not do this (it strips
    // an all-zero base, so its .tax also includes the slab tax on
    // normalIncome and is not a fair comparison here).
    expect(result.taxBenefit).toBeCloseTo(200000 * 0.125 * 1.04, 6);
    // Pool decremented: 3L - 2L = 1L remaining.
    expect(pool.ltclPool.length).toBe(1);
    expect(pool.ltclPool[0].amount).toBeCloseTo(100000, 6);
  });

  it("a pool entry expires after 8 assessment years (valid through year loss+8, gone by year loss+9)", () => {
    // Loss recorded in projection year 1 (AY 2027) -> expiryAY = 2035.
    const poolStillValid = { stclPool: [], ltclPool: [{ amount: 300000, expiryAY: 2035 }] };
    const paramsYear9 = yearParams();
    const streamsYear9 = { ...emptyTaxStreams(), normalIncome: 600000, equityLtcg: 200000 };
    // Projection year 9 -> AY 2035: entry expiryAY(2035) < currentAY(2035) is false -> still usable.
    const resultYear9 = applyYearEndCarryForward(poolStillValid, paramsYear9, streamsYear9, 9);
    expect(resultYear9.taxBenefit).toBeGreaterThan(0);

    // Fresh pool, projection year 10 -> AY 2036: expiryAY(2035) < currentAY(2036) -> expired.
    const poolExpired = { stclPool: [], ltclPool: [{ amount: 300000, expiryAY: 2035 }] };
    const paramsYear10 = yearParams();
    const streamsYear10 = { ...emptyTaxStreams(), normalIncome: 600000, equityLtcg: 200000 };
    const resultYear10 = applyYearEndCarryForward(poolExpired, paramsYear10, streamsYear10, 10);
    expect(resultYear10.taxBenefit).toBe(0);
    expect(poolExpired.ltclPool).toEqual([]);
  });

  it("never mutates the params object it is given (pool is attached to a fresh clone internally)", () => {
    const pool = { stclPool: [], ltclPool: [] };
    const params = yearParams();
    const frozenKeys = Object.keys(params);
    applyYearEndCarryForward(pool, params, { ...emptyTaxStreams(), equityLtcg: -100000 }, 1);
    expect(Object.keys(params)).toEqual(frozenKeys);
    expect(params.carryForwardPool).toBeUndefined();
  });
});

describe("fin-8fb.11 BLOCKER-A — STCL/LTCL pools are independent (§74/§70/§71); a residual LTCL must not zero out a coexisting STCL", () => {
  it("primitive repro: -100 STCG and -200 LTCG in one year, empty pool -> stclPool totals 100 AND ltclPool totals 200 (not stclPool dropped to 0)", () => {
    const pool = { stclPool: [], ltclPool: [] };
    const yearParams = { taxRegime: "new", residentStatus: "resident" };
    const finalStreams = { ...emptyTaxStreams(), equityStcg: -100, equityLtcg: -200 };

    applyYearEndCarryForward(pool, yearParams, finalStreams, 1);

    const stclTotal = pool.stclPool.reduce((sum, entry) => sum + entry.amount, 0);
    const ltclTotal = pool.ltclPool.reduce((sum, entry) => sum + entry.amount, 0);
    expect(stclTotal).toBe(100);
    expect(ltclTotal).toBe(200);
  });

  it("full-engine repro: a mixed-loss crash year (both an unabsorbed STCL and LTCL) carries the STCL into year 2, offsetting year 2's STCG", () => {
    const params = projectionParamsFromState(normalizeState({
      ...BASE,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 50,
      equityInstrument: "equityStcg",
      debtInstrument: "equityLtcg",
      costBasisPct: 75,
      legacyHoldingYears: 3,
      useFmvGrandfathering: 0,
      harvestLtcg: 0,
      allowPrincipalDrawdown: 1,
      cashMode: "monthlyTarget",
      monthlyTarget: 150000,
      withdrawalPriority: "proRata",
      years: 2,
      shockYear: 0,
      shockDrop: 0,
      annualContribution: 0,
      contributionStepUp: 0,
      section87A: 0,
      otherIncome: 0,
      pensionIncome: 0,
      // Year 1: both buckets crash -55%, realizing an unabsorbed loss in EACH
      // type (equity=ST-taxed, debt=LT-taxed) -- both go into the pool.
      // Year 2: equity recovers hard (+300%) into a real STCG; debt keeps
      // falling (-10%) so its year-2 stream stays <=0 (gains.equityLtcg
      // clamps to 0 that year) -- isolating the check to "does the carried
      // STCL (not LTCL, which has nothing to offset) reduce year 2's STCG".
      sequenceReturnOverrides: [
        { equityReturn: -55, debtReturn: -55 },
        { equityReturn: 300, debtReturn: -10 }
      ]
    }));
    const report = calculateSwpPlan(params);

    // Year 1 realizes unabsorbed losses in both buckets (equity=ST-taxed, debt=LT-taxed).
    expect(report.rows[1].shortTermGain).toBeCloseTo(-181623.76117859443, 4);
    expect(report.rows[1].longTermGain).toBeCloseTo(-182078.97152896214, 4);

    // Year 2 realizes a genuine STCG; the debt leg stays negative (no LTCG to carry-forward against).
    const row2 = report.rows[2];
    expect(row2.shortTermGain).toBeCloseTo(287117.6037393663, 4);
    expect(row2.longTermGain).toBeLessThan(0);

    // Year 2's naive (no-carry-forward) tax on the SAME gain streams, for comparison.
    const yearParams2 = paramsForProjectionYear(params, 2);
    const naive = investmentTaxProfile(yearParams2, { ...emptyTaxStreams(), equityStcg: row2.shortTermGain, equityLtcg: row2.longTermGain });
    expect(naive.tax).toBeCloseTo(59720.46157778819, 4);

    // The bug (longSetoff.remaining > 0 ? 0 : shortSetoff.remaining) drops the
    // STCL pool entirely whenever an LTCL residual coexists (as here), so
    // year 2's STCG got taxed at exactly the naive (no-STCL-relief) figure.
    // Since year 2's LTCG is <=0, ONLY the STCL fix can move this number: the
    // fix makes the STCL pool unconditional, so tax must land strictly below
    // naive, at the fixed figure below.
    expect(row2.tax).toBeCloseTo(21942.71925264055, 4);
    expect(row2.tax).toBeLessThan(naive.tax);
  });
});

describe("fin-8fb F1 — calculateSwpPlan: crash-then-recovery carries a real loss across years", () => {
  function crashRecoveryParams() {
    return normalizeState({
      ...BASE,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 100,
      equityInstrument: "equityLtcg",
      debtInstrument: "equityLtcg",
      costBasisPct: 75,
      legacyHoldingYears: 3,
      useFmvGrandfathering: 0,
      harvestLtcg: 0,
      allowPrincipalDrawdown: 1,
      cashMode: "monthlyTarget",
      monthlyTarget: 150000,
      withdrawalPriority: "equityFirst",
      years: 4,
      shockYear: 0,
      shockDrop: 0,
      annualContribution: 0,
      contributionStepUp: 0,
      section87A: 0,
      otherIncome: 0,
      pensionIncome: 0,
      // Year 1: -55% crash realizes an LTCL. Years 2-4: strong recovery.
      // Year 2 is a mixed transition year (nav still crosses back above cost
      // basis partway through), year 3+ trade entirely above cost basis.
      sequenceReturnOverrides: [-55, 100, 100, 100].map((rate) => ({ equityReturn: rate, debtReturn: rate }))
    });
  }

  it("year 1 and year 2 realize net long-term losses (crash phase)", () => {
    const params = projectionParamsFromState(crashRecoveryParams());
    const report = calculateSwpPlan(params);

    expect(report.rows[1].realizedGain).toBeCloseTo(-364112.81408756936, 6);
    expect(report.rows[1].longTermGain).toBeCloseTo(-364112.81408756936, 6);
    expect(report.rows[2].realizedGain).toBeCloseTo(-344121.97440830513, 6);
  });

  it("year 3's carried-forward losses reduce its taxable gain and tax versus a no-carry-forward baseline", () => {
    const params = projectionParamsFromState(crashRecoveryParams());
    const report = calculateSwpPlan(params);
    const row3 = report.rows[3];

    expect(row3.realizedGain).toBeCloseTo(906463.5045930134, 6);
    // Taxable gain is reduced by the two prior loss years (708,234.79 absorbed).
    expect(row3.taxableGain).toBeCloseTo(198228.71609713894, 6);
    expect(row3.tax).toBeCloseTo(25769.73309262807, 6);

    // Compare against the naive (no carry-forward) tax on the SAME gain,
    // computed directly via investmentTaxProfile with no pool attached.
    const yearParams3 = paramsForProjectionYear(params, 3);
    const naive = investmentTaxProfile(yearParams3, { ...emptyTaxStreams(), equityLtcg: row3.longTermGain, equityStcg: row3.shortTermGain });
    expect(naive.tax).toBeCloseTo(117840.25559709175, 6);
    expect(row3.tax).toBeLessThan(naive.tax);
    expect(naive.tax - row3.tax).toBeCloseTo(92070.52250446368, 4);
  });

  it("year 4's pool is exhausted: taxable gain and tax match the naive (no-pool) figure exactly", () => {
    const params = projectionParamsFromState(crashRecoveryParams());
    const report = calculateSwpPlan(params);
    const row4 = report.rows[4];

    expect(row4.realizedGain).toBeCloseTo(1710283.0094003973, 6);
    // Pool fully consumed by year 3 -> year 4 taxable gain equals realized gain.
    expect(row4.taxableGain).toBeCloseTo(row4.realizedGain, 6);

    const yearParams4 = paramsForProjectionYear(params, 4);
    const naive = investmentTaxProfile(yearParams4, { ...emptyTaxStreams(), equityLtcg: row4.longTermGain, equityStcg: row4.shortTermGain });
    expect(row4.tax).toBeCloseTo(naive.tax, 6);
  });

  it("the last monthly ledger row of each year reconciles with the annual row's closing (INV-L06 preserved under the year-end true-up)", () => {
    const params = projectionParamsFromState(crashRecoveryParams());
    const report = calculateSwpPlan(params);
    for (let year = 1; year <= 4; year++) {
      const lastMonthOfYear = report.monthlyRows.filter((row) => row.year === year).slice(-1)[0];
      expect(lastMonthOfYear.closing).toBeCloseTo(report.rows[year].closing, 4);
    }
  });
});

describe("fin-8fb F1 — calculateInterestPlan: principal-drawdown carry-forward", () => {
  function crashRecoveryInterestParams() {
    return normalizeState({
      ...BASE,
      incomeMode: "interest",
      useAssetReturns: 1,
      equityShare: 100,
      equityInstrument: "equityLtcg",
      debtInstrument: "equityLtcg",
      costBasisPct: 75,
      legacyHoldingYears: 3,
      useFmvGrandfathering: 0,
      harvestLtcg: 0,
      allowPrincipalDrawdown: 1,
      cashMode: "monthlyTarget",
      monthlyTarget: 150000,
      years: 4,
      shockYear: 0,
      shockDrop: 0,
      annualContribution: 0,
      contributionStepUp: 0,
      section87A: 0,
      otherIncome: 0,
      pensionIncome: 0,
      equityIncomeYield: 0,
      debtIncomeYield: 0,
      sequenceReturnOverrides: [-55, 100, 100, 100].map((rate) => ({ equityReturn: rate, debtReturn: rate }))
    });
  }

  it("documents the actual scope: saleStreamsForPrincipalDrawdown cannot realize a loss today, so the pool stays empty here even across a crash", () => {
    // saleStreamsForPrincipalDrawdown computes equity/debt gain as
    // Math.max(0, sale - cost) off a flat costBasisPct ratio applied to the
    // sale amount directly — it is not NAV/lot-based like SWP's buckets, so
    // it structurally cannot produce a negative (loss) stream regardless of
    // how negative sequenceReturnOverrides makes a year's return. The F1
    // year-end true-up is wired into calculateInterestPlan (same pattern as
    // calculateSwpPlan, single commit per year) and is exercised every year,
    // but with nothing but non-negative gains ever offered to it, the pool
    // never receives an entry and taxBenefit is always 0 in this engine as
    // it exists today. See model-contract.md for the documented scope note.
    const params = projectionParamsFromState(crashRecoveryInterestParams());
    const report = calculateInterestPlan(params);

    for (const row of report.rows) {
      expect(row.realizedGain).toBeGreaterThanOrEqual(0);
      expect(row.taxableGain).toBeCloseTo(row.realizedGain, 4);
    }
  });
});

describe("fin-8fb F1 — Monte Carlo determinism with carry-forward active", () => {
  it("same seed -> identical successProbability, p50 series, and finals across two consecutive runs (shock scenario)", () => {
    const state = normalizeState({
      ...BASE,
      incomeMode: "swp",
      shockYear: 5,
      shockDrop: 35,
      monteCarloSamples: 40,
      monteCarloSeed: 13579
    });
    const params = projectionParamsFromState(state);
    const run1 = calculateMonteCarlo(params, 40);
    const run2 = calculateMonteCarlo(params, 40);

    expect(run2.successProbability).toBe(run1.successProbability);
    expect(run2.p50).toEqual(run1.p50);
    expect(run2.p10).toEqual(run1.p10);
    expect(run2.p90).toEqual(run1.p90);
  });
});
