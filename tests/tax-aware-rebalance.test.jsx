/**
 * tests/tax-aware-rebalance.test.jsx
 *
 * fin-8fb F5 — Opt-in tax-aware rebalancing.
 *
 * `rebalanceBucketsToShare` (calculateSwpPlan's annual equity/debt drift
 * correction) has always been tax-free: it moves value between buckets via
 * `transferBucketValueWithoutTax`, an in-kind transfer that realizes no
 * gain/loss. F5 adds an opt-in (`params.rebalanceTaxAware = 1`) taxed path:
 * the selling leg becomes a real FIFO lot sale routed through the same
 * `previewLotSale`/`context.streams` machinery the monthly redemption loop
 * uses, so its tax aggregates into the year's `annual.tax` and participates
 * in F1's within-year §74 netting and carry-forward exactly like any other
 * sale (see tests/carryforward-projection.test.jsx for the F1 primitives).
 *
 * Convention (documented on rebalanceBucketsToShare itself): the transfer is
 * sized on GROSS sale value — the selling bucket's value always drops by
 * exactly the computed rebalance amount, matching the tax-free path. Tax
 * comes out of sale proceeds, so the buying bucket receives (amount - tax)
 * as a new contribution lot at the current NAV, and the portfolio's total
 * value after a taxed rebalance is (before - tax). Default mode (0) is
 * untouched: the pre-F5 tax-free branch runs unchanged, and the new additive
 * yearly-row fields (`rebalanceGross`, `rebalanceTax`) stay 0.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  paramsForProjectionYear,
  calculateSwpPlan,
  calculateMonteCarlo,
  rebalanceBucketsToShare,
  bucketValue,
  emptyTaxStreams,
  applyYearEndCarryForward,
  investmentTaxProfile
} from "../src/model.js";

function taxParams(patch = {}) {
  return normalizeState({
    ...BASE,
    taxProfileMode: "retiree",
    taxRegime: "new",
    ageBand: "below60",
    residentStatus: "resident",
    section87A: 0,
    harvestLtcg: 0,
    useFmvGrandfathering: 0,
    ...patch
  });
}

describe("fin-8fb F5 — state field default & normalization", () => {
  it("rebalanceTaxAware defaults to 0", () => {
    expect(normalizeState({}).rebalanceTaxAware).toBe(0);
    expect(BASE.rebalanceTaxAware).toBe(0);
  });

  it("is a NUMERIC_FIELDS entry: non-numeric input normalizes to 0", () => {
    expect(normalizeState({ rebalanceTaxAware: "yes" }).rebalanceTaxAware).toBe(0);
    expect(normalizeState({ rebalanceTaxAware: 1 }).rebalanceTaxAware).toBe(1);
  });
});

describe("fin-8fb F5 — rebalanceBucketsToShare: direct unit tests", () => {
  it("deadband (0.2%) is respected in tax-aware mode: no sale, lots untouched", () => {
    const equity = { nav: 100, instrument: "equityLtcg", lots: [{ units: 501, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const debt = { nav: 100, instrument: "debtMfSlab", lots: [{ units: 499, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const context = { params: taxParams(), streams: emptyTaxStreams() };

    // total=100000, target 50% -> desiredEquity=50000, currentEquity=50100,
    // diff=100 <= 100000*0.002=200 -> inside the deadband, no-op.
    const result = rebalanceBucketsToShare({ equity, debt }, 0.5, true, context);

    expect(result).toEqual({ gross: 0, tax: 0, net: 0, realizedGain: 0, taxableGain: 0, exemptionUsed: 0, basicExemptionUsed: 0, rebateUsed: 0, rebateLost: 0, capitalRecovered: 0, longTermGain: 0, shortTermGain: 0 });
    expect(equity.lots).toEqual([{ units: 501, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }]);
    expect(context.streams).toEqual(emptyTaxStreams());
  });

  it("default (tax-free) mode still moves value between buckets, but reports zero gross/tax", () => {
    const equity = { nav: 150, instrument: "equityLtcg", lots: [{ units: 1000, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const debt = { nav: 100, instrument: "debtMfSlab", lots: [{ units: 300, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const totalBefore = bucketValue(equity) + bucketValue(debt);

    // taxAware omitted -> defaults to false -> the pre-F5 branch.
    const result = rebalanceBucketsToShare({ equity, debt }, 0.5);

    expect(result).toEqual({ gross: 0, tax: 0, net: 0, realizedGain: 0, taxableGain: 0, exemptionUsed: 0, basicExemptionUsed: 0, rebateUsed: 0, rebateLost: 0, capitalRecovered: 0, longTermGain: 0, shortTermGain: 0 });
    // Value DID move (equity dropped from 150000 to 90000) even though the
    // returned totals are all zero -- default mode has no "sale" concept.
    expect(bucketValue(equity)).toBeCloseTo(90000, 6);
    expect(bucketValue(debt)).toBeCloseTo(90000, 6);
    expect(bucketValue(equity) + bucketValue(debt)).toBeCloseTo(totalBefore, 6);
  });

  it("gain scenario: sells overweight equity at a gain -- gross/tax/net and lot mechanics", () => {
    // equity: 1000 units @ nav 150, cost 100/unit (long-term) = value 150000
    // debt:    300 units @ nav 100, cost 100/unit               = value 30000
    // total = 180000; target 50% -> desiredEquity = 90000; diff = 60000 (>> deadband 360)
    // -> sell 60000 gross from equity. unitsSold = 60000/150 = 400.
    // costCapital = 400*100 = 40000 -> realizedGain = 20000 (long-term equity gain).
    // harvestLtcg=0/section87A=0 in taxParams() means no exemption is
    // harvested and no rebate applies, so the gain is taxed at the flat new-
    // regime LTCG rate (12.5%) x 1.04 cess = 13% flat -> tax = 20000*0.13 = 2600.
    const equity = { nav: 150, instrument: "equityLtcg", lots: [{ units: 1000, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const debt = { nav: 100, instrument: "debtMfSlab", lots: [{ units: 300, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const totalBefore = bucketValue(equity) + bucketValue(debt);
    const context = { params: taxParams(), streams: emptyTaxStreams() };

    const result = rebalanceBucketsToShare({ equity, debt }, 0.5, true, context);

    expect(result.gross).toBeCloseTo(60000, 6);
    expect(result.tax).toBeCloseTo(2600, 6);
    expect(result.net).toBeCloseTo(57400, 6);
    expect(result.realizedGain).toBeCloseTo(20000, 6);
    expect(result.longTermGain).toBeCloseTo(20000, 6);
    expect(result.shortTermGain).toBeCloseTo(0, 6);
    expect(result.capitalRecovered).toBeCloseTo(40000, 6);

    // Total value drops exactly by the tax paid.
    const totalAfter = bucketValue(equity) + bucketValue(debt);
    expect(totalBefore - totalAfter).toBeCloseTo(result.tax, 6);
    expect(totalAfter).toBeCloseTo(totalBefore - 2600, 6);

    // Selling bucket's value dropped by exactly the gross rebalance amount.
    expect(bucketValue(equity)).toBeCloseTo(150000 - 60000, 6);
    expect(equity.lots[0].units).toBeCloseTo(600, 6);

    // Buying bucket got a new contribution lot at the CURRENT nav, sized to
    // the net-of-tax proceeds.
    const newLot = debt.lots[debt.lots.length - 1];
    expect(newLot.costPerUnit).toBe(debt.nav);
    expect(newLot.units).toBeCloseTo(result.net / debt.nav, 6);
    expect(newLot.units).toBeCloseTo(574, 6);

    // context.streams picked up the sale's gain for the year's aggregate tax profile.
    expect(context.streams.equityLtcg).toBeCloseTo(20000, 6);
  });

  it("loss scenario: sells an overweight-but-underwater lot at zero tax, and the loss is available to F1's carry-forward pool", () => {
    // equity: 1000 units @ nav 80, cost 100/unit -> underwater (loss), value 80000
    // debt:   5000 units @ nav 1,  cost 1/unit                        value 5000
    // total = 85000; target 50% -> desiredEquity = 42500; diff = 37500 (>> deadband 170)
    // -> sell 37500 gross from equity. unitsSold = 37500/80 = 468.75.
    // costCapital = 468.75*100 = 46875 -> realizedGain = 37500-46875 = -9375 (a loss).
    const equity = { nav: 80, instrument: "equityLtcg", lots: [{ units: 1000, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const debt = { nav: 1, instrument: "debtMfSlab", lots: [{ units: 5000, costPerUnit: 1, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const params = taxParams();
    const context = { params, streams: emptyTaxStreams() };

    const result = rebalanceBucketsToShare({ equity, debt }, 0.5, true, context);

    expect(result.gross).toBeCloseTo(37500, 6);
    expect(result.tax).toBe(0);
    expect(result.realizedGain).toBeCloseTo(-9375, 6);
    expect(result.longTermGain).toBeCloseTo(-9375, 6);
    expect(result.net).toBeCloseTo(37500, 6); // no tax on a loss -> net == gross
    expect(context.streams.equityLtcg).toBeCloseTo(-9375, 6);

    // F1 interaction: the loss the sale realized is a real stream entry, so
    // the SAME year-end commit F1 uses in calculateSwpPlan records it into
    // the §74 pool.
    const pool = { stclPool: [], ltclPool: [] };
    const carryForward = applyYearEndCarryForward(pool, params, context.streams, 1);
    expect(carryForward.taxBenefit).toBe(0); // nothing to offset yet (loss year)
    expect(pool.ltclPool).toHaveLength(1);
    expect(pool.ltclPool[0].amount).toBeCloseTo(9375, 6);
    expect(pool.stclPool).toHaveLength(0);
  });

  it("also works in the debt-to-equity direction (buying leg realizes the sale on the debt bucket)", () => {
    // debt overweight: 800 units @ nav 100, cost 60/unit = value 80000 (gain zone)
    // equity: 100 units @ nav 100, cost 100/unit          = value 10000
    // total = 90000; target 50% -> desiredEquity = 45000 > currentEquity(10000)
    // -> buy equity by selling 35000 gross from debt. debtMfSlab gains are
    // taxed as slab (normalIncome); otherIncome pushes the household above
    // the new-regime basic exemption so this marginal gain is actually taxed
    // (with zero other income a bare 14000 gain sits entirely inside the
    // exemption and would misleadingly show zero tax).
    const equity = { nav: 100, instrument: "equityLtcg", lots: [{ units: 100, costPerUnit: 100, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const debt = { nav: 100, instrument: "debtMfSlab", lots: [{ units: 800, costPerUnit: 60, fmv2018PerUnit: 0, acquisitionYear: 2015, holdingMonths: 60 }] };
    const context = { params: taxParams({ otherIncome: 500000 }), streams: emptyTaxStreams() };

    const result = rebalanceBucketsToShare({ equity, debt }, 0.5, true, context);

    expect(result.gross).toBeCloseTo(35000, 6);
    expect(result.realizedGain).toBeCloseTo(35000 * (1 - 60 / 100), 6); // 14000
    expect(result.tax).toBeCloseTo(728, 4);
    expect(bucketValue(debt)).toBeCloseTo(80000 - 35000, 6);

    const newEquityLot = equity.lots[equity.lots.length - 1];
    expect(newEquityLot.costPerUnit).toBe(equity.nav);
    expect(newEquityLot.units).toBeCloseTo(result.net / equity.nav, 6);
  });
});

describe("fin-8fb F5 — calculateSwpPlan: default mode is byte-parity unchanged", () => {
  function driftParams(rebalanceTaxAware) {
    return normalizeState({
      ...BASE,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 70,
      equityReturn: 20,
      debtReturn: 5,
      years: 5,
      monthlyTarget: 200000,
      cashMode: "monthlyTarget",
      shockYear: 0,
      shockDrop: 0,
      section87A: 0,
      rebalanceTaxAware
    });
  }

  // Captured from this exact scenario BEFORE fin-8fb F5 landed (the drift
  // between a 20% equity return and a 5% debt return guarantees the 0.2%
  // rebalance deadband is crossed from year 2 onward, so this scenario
  // exercises the rebalance call every year, unlike a scenario that never
  // drifts). See PR/session notes for the pre-F5 capture command.
  const golden = [
    { year: 1, opening: 30000000, tax: 59534.49459931319, realizedGain: 771235.8956504441, closing: 31836481.90705008 },
    { year: 2, opening: 31836481.907050077, tax: 93764.74370359429, realizedGain: 1069923.77529827, closing: 33755436.67681214 },
    { year: 3, opening: 33755436.67681214, tax: 127441.80717535652, realizedGain: 1366815.2523373393, closing: 35760351.9352751 },
    { year: 4, opening: 35760351.9352751, tax: 160662.74805581837, realizedGain: 1662804.4765420347, closing: 37854639.66429604 },
    { year: 5, opening: 37854639.66429603, tax: 193547.25341017137, realizedGain: 1958968.1509204453, closing: 40041524.405585974 }
  ];

  it("rebalanceTaxAware=0 (explicit) matches the pre-F5 captured golden rows exactly", () => {
    const params = projectionParamsFromState(driftParams(0));
    const report = calculateSwpPlan(params);

    for (const expected of golden) {
      const row = report.rows[expected.year];
      expect(row.opening).toBeCloseTo(expected.opening, 4);
      expect(row.tax).toBeCloseTo(expected.tax, 4);
      expect(row.realizedGain).toBeCloseTo(expected.realizedGain, 4);
      expect(row.closing).toBeCloseTo(expected.closing, 4);
    }
  });

  it("rebalanceGross/rebalanceTax are additive fields that stay 0 for every row in default mode, even though rebalances fire", () => {
    const params = projectionParamsFromState(driftParams(0));
    const report = calculateSwpPlan(params);

    expect(report.rows.every((row) => row.rebalanceGross === 0)).toBe(true);
    expect(report.rows.every((row) => row.rebalanceTax === 0)).toBe(true);
  });

  it("rebalanceTaxAware omitted entirely produces identical output to rebalanceTaxAware explicitly set to 0", () => {
    const withField = calculateSwpPlan(projectionParamsFromState(driftParams(0)));
    const { rebalanceTaxAware: _drop, ...stateWithoutField } = driftParams(0);
    const withoutField = calculateSwpPlan(projectionParamsFromState(normalizeState(stateWithoutField)));
    expect(withoutField.rows).toEqual(withField.rows);
  });
});

describe("fin-8fb F5 — calculateSwpPlan: taxed rebalancing produces real tax", () => {
  function gainOnlyParams(rebalanceTaxAware) {
    return normalizeState({
      ...BASE,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityInstrument: "equityLtcg",
      debtInstrument: "debtMfSlab",
      costBasisPct: 75,
      legacyHoldingYears: 3,
      useFmvGrandfathering: 0,
      harvestLtcg: 0,
      section87A: 0,
      cashMode: "monthlyTarget",
      monthlyTarget: 0, // isolate the rebalance leg -- no redemption tax/gain noise
      annualContribution: 0,
      shockYear: 0,
      shockDrop: 0,
      rebalanceTaxAware,
      years: 2,
      equityReturn: 20,
      debtReturn: 5
    });
  }

  it("taxed mode: year 2's rebalance realizes a gain, reports rebalanceGross/rebalanceTax > 0, and annual.tax exceeds the default-mode (0) tax", () => {
    const taxed = calculateSwpPlan(projectionParamsFromState(gainOnlyParams(1)));
    const untaxed = calculateSwpPlan(projectionParamsFromState(gainOnlyParams(0)));
    const taxedRow = taxed.rows[2];
    const defaultRow = untaxed.rows[2];

    expect(taxedRow.rebalanceGross).toBeCloseTo(1080000, 4);
    expect(taxedRow.rebalanceTax).toBeCloseTo(52356.52173912996, 4);
    // No monthly redemption in this scenario, so annual.tax is entirely the
    // rebalance leg's tax -- confirms it aggregates into the year's tax.
    expect(taxedRow.tax).toBeCloseTo(taxedRow.rebalanceTax, 6);

    expect(defaultRow.rebalanceGross).toBe(0);
    expect(defaultRow.rebalanceTax).toBe(0);
    expect(defaultRow.tax).toBe(0);

    expect(taxedRow.tax).toBeGreaterThan(defaultRow.tax);
    expect(taxedRow.closing).toBeLessThan(defaultRow.closing); // tax paid leaves less corpus
  });
});

describe("fin-8fb F5 — calculateSwpPlan: interaction with F1's §74 carry-forward pool", () => {
  function lossThenGainParams(rebalanceTaxAware) {
    return normalizeState({
      ...BASE,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityInstrument: "equityLtcg",
      debtInstrument: "debtMfSlab",
      // costBasisPct=120 -> initial lot cost is ABOVE the starting nav (1),
      // so a sale is a loss until the nav grows past 1.2.
      costBasisPct: 120,
      legacyHoldingYears: 3,
      useFmvGrandfathering: 0,
      harvestLtcg: 0,
      section87A: 0,
      cashMode: "monthlyTarget",
      monthlyTarget: 0, // isolate the rebalance leg
      annualContribution: 0,
      shockYear: 0,
      shockDrop: 0,
      rebalanceTaxAware,
      years: 3,
      // Year 1: debt collapses relative to equity -> equity is overweight at
      // the START of year 2 (nav ~1.05, still under the 1.2 cost -> a loss).
      // Year 2: equity grows much faster than debt -> equity is overweight
      // again at the START of year 3 (nav ~1.365, now over the 1.2 cost -> a
      // gain), small enough that the carried year-2 loss fully absorbs it.
      sequenceReturnOverrides: [
        { equityReturn: 5, debtReturn: -60 },
        { equityReturn: 30, debtReturn: 5 },
        { equityReturn: 8, debtReturn: 8 }
      ]
    });
  }

  it("year 2's rebalance realizes a loss (zero tax) and creates a carry-forward pool entry", () => {
    const params = projectionParamsFromState(lossThenGainParams(1));
    const report = calculateSwpPlan(params);
    const row2 = report.rows[2];

    expect(row2.rebalanceGross).toBeCloseTo(4680000, 4);
    expect(row2.rebalanceTax).toBe(0);
    expect(row2.tax).toBe(0);
    expect(row2.realizedGain).toBeCloseTo(-689024.8565965611, 4);
    expect(row2.longTermGain).toBeCloseTo(-689024.8565965611, 4);
  });

  it("year 3's rebalance realizes a smaller gain whose tax is fully absorbed by year 2's carried loss", () => {
    const params = projectionParamsFromState(lossThenGainParams(1));
    const report = calculateSwpPlan(params);
    const row3 = report.rows[3];

    expect(row3.rebalanceGross).toBeCloseTo(1414800, 4);
    expect(row3.realizedGain).toBeCloseTo(162409.9426386219, 4);
    expect(row3.longTermGain).toBeCloseTo(162409.9426386219, 4);
    // The rebalance leg itself would owe tax on this gain (rebalanceTax is
    // computed against a pool-free tax profile -- see rebalanceBucketsToShare)...
    expect(row3.rebalanceTax).toBeCloseTo(21113.292543020845, 4);
    // ...but the YEAR's actual tax (after F1's year-end carry-forward
    // true-up runs against the SAME context.streams) is fully offset by the
    // larger loss year 2's rebalance carried forward, since 162409.94 <
    // 689024.86. This is the pool-entry-created-and-consumed proof.
    expect(row3.tax).toBeCloseTo(0, 6);

    // Cross-check against the naive (no carry-forward) tax on the identical
    // gain, computed directly via investmentTaxProfile with no pool attached
    // -- same methodology tests/carryforward-projection.test.jsx uses for F1.
    const yearParams3 = paramsForProjectionYear(params, 3);
    const naive = investmentTaxProfile(yearParams3, { ...emptyTaxStreams(), equityLtcg: row3.longTermGain, equityStcg: row3.shortTermGain });
    expect(naive.tax).toBeCloseTo(21113.292543020845, 4);
    expect(row3.tax).toBeLessThan(naive.tax);
  });

  it("the deadband still applies inside the full engine: equal equity/debt returns never trigger a rebalance even in tax-aware mode", () => {
    const params = projectionParamsFromState(normalizeState({
      ...BASE,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 10,
      debtReturn: 10,
      monthlyTarget: 0,
      cashMode: "monthlyTarget",
      annualContribution: 0,
      shockYear: 0,
      shockDrop: 0,
      rebalanceTaxAware: 1,
      years: 3
    }));
    const report = calculateSwpPlan(params);

    expect(report.rows.every((row) => row.rebalanceGross === 0)).toBe(true);
    expect(report.rows.every((row) => row.rebalanceTax === 0)).toBe(true);
  });
});

describe("fin-8fb F5 — Monte Carlo determinism with rebalanceTaxAware=1", () => {
  it("same seed -> identical successProbability and percentile series across two consecutive runs", () => {
    const state = normalizeState({
      ...BASE,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 20,
      debtReturn: 5,
      rebalanceTaxAware: 1,
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
