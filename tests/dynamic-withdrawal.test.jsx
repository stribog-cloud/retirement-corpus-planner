/**
 * tests/dynamic-withdrawal.test.jsx
 *
 * fin-8fb F2 — Dynamic withdrawal rules (guardrails / percent-of-corpus).
 *
 * Covers:
 *   - resolveDynamicSpending: the pure per-year decision helper, in isolation
 *     (fixed passthrough, percentOfCorpus + floor, guardrails cut/raise/
 *     inflation-hold/clamp).
 *   - calculateSwpPlan / calculateInterestPlan / calculateIdcwPlan: engine
 *     integration — fixed-mode byte parity, engineered guardrail triggers,
 *     percentOfCorpus tracking, lump-sum non-scaling, ledger additive
 *     fields (spendingMultiplier, guardrailAction).
 *   - Monte Carlo determinism and solver convergence under guardrails.
 *   - normalizeState enum guard for withdrawalRule.
 *
 * Default-state parity (withdrawalRule defaults to "fixed", so v2.0 output
 * is unchanged) is covered by tests/v2-parity-goldens.test.jsx and must stay
 * green throughout this file's existence.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  calculateSwpPlan,
  calculateInterestPlan,
  calculateIdcwPlan,
  calculateMonteCarlo,
  projectionParamsFromState,
  resolveDynamicSpending,
  solveCorpusForMonthlyCash
} from "../src/model.js";

function crashOverrides(rates) {
  return rates.map((rate) => ({ equityReturn: rate, debtReturn: rate }));
}

function swpState(patch = {}) {
  return normalizeState({
    ...BASE,
    incomeMode: "swp",
    cashMode: "monthlyTarget",
    monthlyTarget: 200000,
    years: 6,
    allowPrincipalDrawdown: 1,
    useAssetReturns: 1,
    equityShare: 60,
    shockYear: 0,
    shockDrop: 0,
    annualContribution: 0,
    section87A: 0,
    otherIncome: 0,
    pensionIncome: 0,
    ...patch
  });
}

describe("fin-8fb F2 — normalizeState: withdrawalRule enum guard", () => {
  it("defaults to fixed and rejects unknown values", () => {
    expect(normalizeState({}).withdrawalRule).toBe("fixed");
    expect(normalizeState({ withdrawalRule: "guardrails" }).withdrawalRule).toBe("guardrails");
    expect(normalizeState({ withdrawalRule: "percentOfCorpus" }).withdrawalRule).toBe("percentOfCorpus");
    expect(normalizeState({ withdrawalRule: "bogus" }).withdrawalRule).toBe("fixed");
    expect(normalizeState({ withdrawalRule: 42 }).withdrawalRule).toBe("fixed");
  });

  it("seeds the new guardrail/percent-of-corpus/floor fields with documented defaults", () => {
    const state = normalizeState({});
    expect(state.guardrailBandPct).toBe(20);
    expect(state.guardrailAdjustPct).toBe(10);
    expect(state.percentOfCorpusRate).toBe(5);
    expect(state.spendingFloorMonthly).toBe(0);
  });
});

describe("fin-8fb F2 — resolveDynamicSpending (pure helper, direct unit tests)", () => {
  it("fixed mode returns the exact recurring-term expression unchanged, regardless of guardrail/percentOfCorpus fields", () => {
    const withInflation = resolveDynamicSpending({ rule: "fixed", baseAnnualCash: 120000, inflationFactor: 1.1, params: { inflateWithdrawals: 1, guardrailBandPct: 1, percentOfCorpusRate: 50, spendingFloorMonthly: 999999 } });
    expect(withInflation).toEqual({ annualCashTarget: 132000, nextMultiplier: 1, nextInflationFactor: 1.1, inflationHeld: false, guardrailAction: "none" });

    const withoutInflation = resolveDynamicSpending({ rule: "fixed", baseAnnualCash: 120000, inflationFactor: 1.1, params: { inflateWithdrawals: 0 } });
    expect(withoutInflation.annualCashTarget).toBe(120000);
  });

  it("an unrecognized rule string behaves exactly like fixed (defense in depth; normalizeState should never let one through)", () => {
    const result = resolveDynamicSpending({ rule: "not-a-real-rule", baseAnnualCash: 50000, inflationFactor: 1, params: { inflateWithdrawals: 1 } });
    expect(result.guardrailAction).toBe("none");
    expect(result.nextMultiplier).toBe(1);
    expect(result.annualCashTarget).toBe(50000);
  });

  it("percentOfCorpus ignores inflateWithdrawals and targets rate% of opening corpus", () => {
    const result = resolveDynamicSpending({ rule: "percentOfCorpus", openingCorpus: 1000000, params: { percentOfCorpusRate: 5, spendingFloorMonthly: 0 } });
    expect(result).toEqual({ annualCashTarget: 50000, nextMultiplier: 1, nextInflationFactor: 1, inflationHeld: false, guardrailAction: "none" });
  });

  it("percentOfCorpus floor (escalated nominally) overrides a small rate x corpus product", () => {
    const result = resolveDynamicSpending({
      rule: "percentOfCorpus",
      openingCorpus: 1000000,
      inflationFactor: 1.2,
      params: { percentOfCorpusRate: 1, spendingFloorMonthly: 10000, inflateWithdrawals: 1 }
    });
    // raw = 1% x 1,000,000 = 10,000; floor = 10,000 x 12 x 1.2 = 144,000 wins.
    expect(result.annualCashTarget).toBeCloseTo(144000, 6);
  });

  it("guardrails year 1 establishes state with no adjustment possible yet (initialRate not yet set)", () => {
    const result = resolveDynamicSpending({
      rule: "guardrails", year: 1, openingCorpus: 1000000, baseAnnualCash: 50000,
      inflationFactor: 1, heldInflationFactor: 1, initialRate: 0, multiplier: 1, priorYearReturn: null,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(result).toEqual({ annualCashTarget: 50000, nextMultiplier: 1, nextInflationFactor: 1, inflationHeld: false, guardrailAction: "none" });
  });

  it("guardrails: currentRate above the upper band cuts the multiplier by guardrailAdjustPct", () => {
    const result = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 400000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(result.guardrailAction).toBe("cut");
    expect(result.nextMultiplier).toBeCloseTo(0.9, 6);
    expect(result.annualCashTarget).toBeCloseTo(47700, 6);
    expect(result.inflationHeld).toBe(false);
  });

  it("guardrails: currentRate below the lower band raises the multiplier by guardrailAdjustPct", () => {
    const result = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 2000000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(result.guardrailAction).toBe("raise");
    expect(result.nextMultiplier).toBeCloseTo(1.1, 6);
    expect(result.annualCashTarget).toBeCloseTo(58300, 6);
  });

  it("guardrails: inflation-hold fires only when within-band AND prior year return negative AND currentRate above initialRate; multiplier is untouched", () => {
    const result = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 963636.3636363636, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: -0.05,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(result.guardrailAction).toBe("inflation-hold");
    expect(result.inflationHeld).toBe(true);
    expect(result.nextMultiplier).toBe(1);
    // Escalation frozen at last year's held factor (1), not the candidate (1.06).
    expect(result.nextInflationFactor).toBe(1);
    expect(result.annualCashTarget).toBeCloseTo(50000, 6);
  });

  it("a band breach reports as cut/raise even in a prior-loss year (band evaluated before inflation-hold)", () => {
    const result = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 400000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1,
      priorYearReturn: -0.4, // negative prior-year return, same as the inflation-hold case
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(result.guardrailAction).toBe("cut");
  });

  it("sanitizes non-finite/non-positive multiplier and heldInflationFactor inputs to safe defaults instead of propagating NaN", () => {
    const invalidMultiplier = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 1000000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: NaN, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(Number.isFinite(invalidMultiplier.annualCashTarget)).toBe(true);

    const invalidHeld = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 1000000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: -1, initialRate: 0.05, multiplier: 1, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(Number.isFinite(invalidHeld.annualCashTarget)).toBe(true);
  });

  it("missing rate/band/adjust fields fall back to 0 rather than throwing or producing NaN", () => {
    const percentNoRate = resolveDynamicSpending({ rule: "percentOfCorpus", openingCorpus: 1000000, params: {} });
    expect(percentNoRate.annualCashTarget).toBe(0);

    const guardrailsNoBandFields = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 1000000, baseAnnualCash: 50000,
      inflationFactor: 1, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: 0.1,
      params: {}
    });
    expect(Number.isFinite(guardrailsNoBandFields.annualCashTarget)).toBe(true);
    expect(guardrailsNoBandFields.guardrailAction).not.toBe("");
  });

  it("year >= 2 with initialRate still at 0 (e.g. a zero-principal year 1) makes no adjustment", () => {
    const result = resolveDynamicSpending({
      rule: "guardrails", year: 3, openingCorpus: 1000000, baseAnnualCash: 50000,
      inflationFactor: 1.1236, heldInflationFactor: 1.06, initialRate: 0, multiplier: 1, priorYearReturn: -0.2,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(result.guardrailAction).toBe("none");
    expect(result.nextMultiplier).toBe(1);
  });

  it("inflation-hold requires both a negative prior-year return AND currentRate above initialRate — neither alone is enough", () => {
    const noPriorReturnData = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 963636.3636363636, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: null,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(noPriorReturnData.guardrailAction).toBe("none");

    // currentRate below initialRate (but still within band) with a negative
    // prior return should not hold — the "still above initial rate" leg fails.
    const belowInitialRate = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 1200000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: -0.05,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(belowInitialRate.guardrailAction).toBe("none");
  });

  it("sanitizes a falsy inflationFactor/params.inflation to 0 rather than propagating NaN when inflateWithdrawals is on", () => {
    const falsyInflationFactor = resolveDynamicSpending({ rule: "fixed", baseAnnualCash: 120000, inflationFactor: 0, params: { inflateWithdrawals: 1 } });
    expect(falsyInflationFactor.annualCashTarget).toBe(0);

    const falsyInflationRate = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 1000000, baseAnnualCash: 50000,
      inflationFactor: 1, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 1, guardrailBandPct: 20, guardrailAdjustPct: 10 } // no `inflation` field
    });
    expect(Number.isFinite(falsyInflationRate.annualCashTarget)).toBe(true);
    expect(falsyInflationRate.nextInflationFactor).toBe(1);
  });

  it("guardrails with inflateWithdrawals off never escalates the recurring target (inflationRate forced to 0)", () => {
    const result = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 1000000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 0, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(result.nextInflationFactor).toBe(1);
    expect(result.annualCashTarget).toBeCloseTo(50000, 6);
  });

  it("guardrails multiplier is clamped to [0.5, 2.0] on both ends", () => {
    const cutClamped = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 400000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 0.52, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(cutClamped.guardrailAction).toBe("cut");
    expect(cutClamped.nextMultiplier).toBe(0.5);

    const raiseClamped = resolveDynamicSpending({
      rule: "guardrails", year: 2, openingCorpus: 5000000, baseAnnualCash: 50000,
      inflationFactor: 1.06, heldInflationFactor: 1, initialRate: 0.05, multiplier: 1.95, priorYearReturn: 0.1,
      params: { inflateWithdrawals: 1, inflation: 6, guardrailBandPct: 20, guardrailAdjustPct: 10 }
    });
    expect(raiseClamped.guardrailAction).toBe("raise");
    expect(raiseClamped.nextMultiplier).toBe(2);
  });
});

describe("fin-8fb F2 — calculateSwpPlan: fixed-mode byte parity", () => {
  it("withdrawalRule absent vs explicit 'fixed' with wildly different (ignored) dynamic fields produce deep-equal yearly rows", () => {
    const defaultState = normalizeState({ ...BASE, incomeMode: "swp" });
    const explicitFixedWithGarbageFields = normalizeState({
      ...BASE,
      incomeMode: "swp",
      withdrawalRule: "fixed",
      guardrailBandPct: 1,
      guardrailAdjustPct: 90,
      percentOfCorpusRate: 99,
      spendingFloorMonthly: 999999
    });

    const r1 = calculateSwpPlan(projectionParamsFromState(defaultState));
    const r2 = calculateSwpPlan(projectionParamsFromState(explicitFixedWithGarbageFields));

    expect(r2.rows).toEqual(r1.rows);
    expect(r2.monthlyRows).toEqual(r1.monthlyRows);
  });

  it("fixed-mode rows carry the additive ledger fields at their pass-through defaults", () => {
    const state = normalizeState({ ...BASE, incomeMode: "swp" });
    const report = calculateSwpPlan(projectionParamsFromState(state));
    for (const row of report.rows) {
      expect(row.spendingMultiplier).toBe(1);
      expect(row.guardrailAction).toBe("none");
    }
  });
});

describe("fin-8fb F2 — calculateSwpPlan: guardrails engine integration", () => {
  it("an engineered year-1 crash (-40%) triggers a capital-preservation cut in year 2 (multiplier drops by guardrailAdjustPct)", () => {
    const state = swpState({
      withdrawalRule: "guardrails",
      sequenceReturnOverrides: crashOverrides([-40, 8, 8, 8, 8, 8])
    });
    const report = calculateSwpPlan(projectionParamsFromState(state));

    expect(report.rows[1].guardrailAction).toBe("none");
    expect(report.rows[1].spendingMultiplier).toBe(1);
    expect(report.rows[2].guardrailAction).toBe("cut");
    expect(report.rows[2].spendingMultiplier).toBeCloseTo(0.9, 6);
  });

  it("an engineered boom triggers a prosperity raise", () => {
    const state = swpState({
      withdrawalRule: "guardrails",
      monthlyTarget: 100000,
      sequenceReturnOverrides: crashOverrides([60, 40, 20, 10, 8, 8])
    });
    const report = calculateSwpPlan(projectionParamsFromState(state));

    expect(report.rows[2].guardrailAction).toBe("raise");
    expect(report.rows[2].spendingMultiplier).toBeCloseTo(1.1, 6);
  });

  it("a mild dip (within-band) with a negative prior-year return triggers inflation-hold, leaving the multiplier untouched", () => {
    const state = swpState({
      withdrawalRule: "guardrails",
      monthlyTarget: 150000,
      sequenceReturnOverrides: crashOverrides([-5, 6, 6, 6, 6, 6])
    });
    const report = calculateSwpPlan(projectionParamsFromState(state));

    expect(report.rows[2].guardrailAction).toBe("inflation-hold");
    expect(report.rows[2].spendingMultiplier).toBeCloseTo(1, 6);
  });

  it("multiplier clamps at the 0.5 floor under a sustained severe crash", () => {
    const overrides = [-70, ...Array(14).fill(-15)];
    const state = swpState({
      withdrawalRule: "guardrails",
      guardrailAdjustPct: 40,
      monthlyTarget: 300000,
      years: 15,
      sequenceReturnOverrides: crashOverrides(overrides)
    });
    const report = calculateSwpPlan(projectionParamsFromState(state));
    const multipliers = report.rows.slice(1).map((row) => row.spendingMultiplier);

    expect(Math.min(...multipliers)).toBeCloseTo(0.5, 6);
    expect(multipliers.every((m) => m >= 0.5 - 1e-9)).toBe(true);
  });

  it("multiplier clamps at the 2.0 ceiling under a sustained boom", () => {
    const overrides = [60, ...Array(11).fill(40)];
    const state = swpState({
      withdrawalRule: "guardrails",
      monthlyTarget: 50000,
      years: 12,
      sequenceReturnOverrides: crashOverrides(overrides)
    });
    const report = calculateSwpPlan(projectionParamsFromState(state));
    const multipliers = report.rows.slice(1).map((row) => row.spendingMultiplier);

    expect(Math.max(...multipliers)).toBeCloseTo(2.0, 6);
    expect(multipliers.every((m) => m <= 2.0 + 1e-9)).toBe(true);
  });
});

describe("fin-8fb F2 — calculateSwpPlan: degenerate inflation input", () => {
  it("an inflation rate at -100% (non-positive yearly factor) does not throw or produce NaN monthly targets", () => {
    const state = swpState({ withdrawalRule: "guardrails", inflation: -100, years: 2 });
    const report = calculateSwpPlan(projectionParamsFromState(state));
    for (const row of report.monthlyRows) {
      expect(Number.isFinite(row.targetCash)).toBe(true);
    }
  });
});

describe("fin-8fb F2 — calculateSwpPlan: zero-principal edge case", () => {
  it("a zero-principal run under guardrails does not throw or produce NaN (initialRate falls back to 0)", () => {
    const state = swpState({ withdrawalRule: "guardrails", principal: 0, years: 2 });
    const report = calculateSwpPlan(projectionParamsFromState(state));
    expect(Number.isFinite(report.rows[1].targetCash)).toBe(true);
    expect(Number.isFinite(report.rows[2].targetCash)).toBe(true);
    expect(report.rows[2].guardrailAction).toBe("none");
  });
});

describe("fin-8fb F2 — calculateSwpPlan: percentOfCorpus engine integration", () => {
  it("annual recurring target tracks percentOfCorpusRate% of that year's opening corpus", () => {
    const state = swpState({
      withdrawalRule: "percentOfCorpus",
      percentOfCorpusRate: 5,
      sequenceReturnOverrides: crashOverrides(Array(6).fill(8))
    });
    const report = calculateSwpPlan(projectionParamsFromState(state));

    for (let year = 1; year <= 5; year++) {
      expect(report.rows[year].targetCash).toBeCloseTo(report.rows[year].opening * 0.05, 2);
      expect(report.rows[year].guardrailAction).toBe("none");
      expect(report.rows[year].spendingMultiplier).toBe(1);
    }
  });

  it("respects the nominal (inflation-escalated) floor when rate x corpus is small, and never depletes to negative", () => {
    const state = swpState({
      withdrawalRule: "percentOfCorpus",
      percentOfCorpusRate: 0.1,
      spendingFloorMonthly: 50000,
      sequenceReturnOverrides: crashOverrides(Array(5).fill(8))
    });
    const report = calculateSwpPlan(projectionParamsFromState(state));

    // Year 1: floor (50,000 x 12 x 1) = 600,000 dominates the tiny 0.1% x
    // corpus product; later years escalate the floor nominally (x1.06/yr).
    expect(report.rows[1].targetCash).toBeCloseTo(600000, 2);
    expect(report.rows[2].targetCash).toBeCloseTo(600000 * 1.06, 2);
    for (const row of report.rows) {
      expect(row.closing).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("fin-8fb F2 — lump sums are never scaled by the dynamic rule", () => {
  it("adding a planned lump sum changes the resolved target by exactly the lump-sum amount, even in a guardrails-cut year", () => {
    function household(lumpAmount) {
      return normalizeState({
        ...BASE,
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        useHouseholdPlan: 1,
        essentialMonthlyExpense: 100000,
        plannedLumpSumAmount: lumpAmount,
        plannedLumpSumYear: 2,
        plannedLumpSumInflate: 0,
        withdrawalRule: "guardrails",
        years: 3,
        allowPrincipalDrawdown: 1,
        useAssetReturns: 1,
        equityShare: 60,
        section87A: 0,
        sequenceReturnOverrides: crashOverrides([-40, 8, 8])
      });
    }
    const withLump = calculateSwpPlan(projectionParamsFromState(household(1000000)));
    const noLump = calculateSwpPlan(projectionParamsFromState(household(0)));

    expect(withLump.rows[2].guardrailAction).toBe("cut");
    expect(withLump.rows[2].guardrailAction).toBe(noLump.rows[2].guardrailAction);
    expect(withLump.rows[2].spendingMultiplier).toBeCloseTo(noLump.rows[2].spendingMultiplier, 6);
    expect(withLump.rows[2].targetCash - noLump.rows[2].targetCash).toBeCloseTo(1000000, 2);
  });
});

describe("fin-8fb F2 — calculateInterestPlan / calculateIdcwPlan: guardrails engine integration", () => {
  function engineState(mode) {
    return normalizeState({
      ...BASE,
      incomeMode: mode,
      cashMode: "monthlyTarget",
      monthlyTarget: 200000,
      withdrawalRule: "guardrails",
      years: 3,
      allowPrincipalDrawdown: 1,
      useAssetReturns: 1,
      equityShare: 60,
      idcwYield: 8,
      section87A: 0,
      sequenceReturnOverrides: crashOverrides([-40, 8, 8])
    });
  }

  it("calculateInterestPlan resolves the same cut and target as calculateSwpPlan's annual-target math", () => {
    const report = calculateInterestPlan(projectionParamsFromState(engineState("interest")));
    expect(report.rows[0].spendingMultiplier).toBe(1);
    expect(report.rows[0].guardrailAction).toBe("none");
    expect(report.rows[2].guardrailAction).toBe("cut");
    expect(report.rows[2].spendingMultiplier).toBeCloseTo(0.9, 6);
    // baseAnnualCash (2,400,000) x candidate inflation (1.06) x multiplier (0.9)
    expect(report.rows[2].targetCash).toBeCloseTo(2289600, 2);
  });

  it("calculateIdcwPlan integrates the same helper at its annual gross-up target site", () => {
    const report = calculateIdcwPlan(projectionParamsFromState(engineState("idcw")));
    expect(report.rows[2].guardrailAction).toBe("cut");
    expect(report.rows[2].spendingMultiplier).toBeCloseTo(0.9, 6);
    expect(report.rows[2].targetCash).toBeCloseTo(2289600, 2);
  });

  it("a zero-principal run under guardrails does not throw or produce NaN in either engine (initialRate falls back to 0)", () => {
    const interestReport = calculateInterestPlan(projectionParamsFromState(normalizeState({ ...engineState("interest"), principal: 0, years: 2 })));
    const idcwReport = calculateIdcwPlan(projectionParamsFromState(normalizeState({ ...engineState("idcw"), principal: 0, years: 2 })));
    for (const report of [interestReport, idcwReport]) {
      expect(Number.isFinite(report.rows[1].targetCash)).toBe(true);
      expect(Number.isFinite(report.rows[2].targetCash)).toBe(true);
    }
  });

  it("both engines default to fixed-mode parity fields when withdrawalRule is absent", () => {
    const interestReport = calculateInterestPlan(projectionParamsFromState(normalizeState({ ...BASE, incomeMode: "interest" })));
    const idcwReport = calculateIdcwPlan(projectionParamsFromState(normalizeState({ ...BASE, incomeMode: "idcw" })));
    for (const row of [...interestReport.rows, ...idcwReport.rows]) {
      expect(row.spendingMultiplier).toBe(1);
      expect(row.guardrailAction).toBe("none");
    }
  });
});

describe("fin-8fb F2 — Monte Carlo determinism under guardrails", () => {
  it("same seed -> identical successProbability and p50 series across two consecutive guardrails runs", () => {
    const state = normalizeState({
      ...BASE,
      incomeMode: "swp",
      withdrawalRule: "guardrails",
      monteCarloSamples: 30,
      monteCarloSeed: 4242
    });
    const params = projectionParamsFromState(state);
    const run1 = calculateMonteCarlo(params, 30);
    const run2 = calculateMonteCarlo(params, 30);

    expect(run2.successProbability).toBe(run1.successProbability);
    expect(run2.p50).toEqual(run1.p50);
    expect(run2.p10).toEqual(run1.p10);
    expect(run2.p90).toEqual(run1.p90);
  });
});

describe("fin-8fb F2 — solver convergence under guardrails", () => {
  it("solveCorpusForMonthlyCash still terminates with a finite, positive corpus when withdrawalRule is guardrails", () => {
    const state = normalizeState({
      ...BASE,
      incomeMode: "swp",
      withdrawalRule: "guardrails",
      monthlyTarget: 150000,
      years: 15
    });
    const params = projectionParamsFromState(state);
    const corpus = solveCorpusForMonthlyCash(params);

    expect(Number.isFinite(corpus)).toBe(true);
    expect(corpus).toBeGreaterThan(0);
  });
});
