import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT,
  LOCAL_STORAGE_KEYS,
  DISCLAIMER_KEY,
  PRIVACY_CONSENT_KEY,
  SCENARIO_HISTORY_KEY,
  loadSavedState,
  loadSavedLayout,
  loadDisclaimerAcknowledged,
  persistDisclaimerAcknowledged,
  loadPrivacyConsent,
  loadScenarioHistory,
  readJsonStorage,
  persistJson,
  persistPrivacyConsent,
  persistScenarioHistory,
  clearSavedBrowserData
} from "../src/persistence.js";
import {
  PLANNING_VERSION,
  INSTRUMENT_CATALOG,
  withdrawalRateForState,
  withdrawalRateBand,
  catalogByBucket,
  buildWithdrawalPolicy,
  buildTaxOptimizationPlan,
  buildAssumptionAudit,
  buildRetireeGuidedPlan,
  buildRetirementActionPlan
} from "../src/planning.js";
import {
  BASE,
  PRESETS,
  SCENARIOS,
  STANDARD_SCENARIO_LIBRARY,
  DEFAULT_TAX_LAW,
  NUMERIC_FIELDS,
  clamp,
  normalizeFieldValue,
  normalizeState,
  householdPlanProfile,
  projectionParamsFromState,
  roundToStep,
  viewportBoundsForWidth,
  autoViewportForWidth,
  scenarioPatchFor,
  stateForScenarioLibraryItem,
  formatInr,
  formatFullInr,
  formatPct,
  planFingerprint,
  formatTaxLawJson,
  annualPortfolioRate,
  equityShareForYear,
  paramsForProjectionYear,
  annualPortfolioIncomeRate,
  compoundRate,
  effectiveYield,
  sanitizeTaxLaw,
  taxLawFromState,
  taxLawParseStatus,
  specialRate,
  slabBands,
  basicExemptionLimit,
  slabTaxBeforeCess,
  applySection87A,
  emptyTaxStreams,
  addTaxStreams,
  calculateTaxProfile,
  investmentTaxProfile,
  standardDeductionLimit,
  productClassForInstrument,
  holdingMonthsForInstrument,
  streamsForInstrument,
  saleStreamsForPrincipalDrawdown,
  taxableRate,
  yearlyTax,
  calculateInterestPlan,
  isEquityLike,
  capitalGainTaxRate,
  monthlyRateFromAnnual,
  makeBucket,
  bucketValue,
  calculateSwpPlan,
  calculateIdcwPlan,
  monthlyCashNeedForYear,
  plannedLumpSumForYear,
  targetAnnualCashForYear,
  targetMonthlyCashForMonth,
  calculate,
  calculateGuidancePlan,
  mulberry32,
  normalSample,
  fatTailSample,
  quantile,
  annualSequenceShock,
  grandfatheredEquityGain,
  sampledReturnParams,
  calculateSequencePath,
  calculateMonteCarlo,
  solveTopup,
  solveReturn,
  planCoversMonthlyCash,
  solveCorpusForMonthlyCash,
  solveReturnForMonthlyCash,
  solveMaxMonthlyCash,
  withdrawalShareNeeded,
  retirementPlanningProfile,
  buildAllocationPlan,
  attachStrategyLossReasons,
  generateOptimumStrategies,
  instrumentGuidanceForStrategy,
  taxRegimeLabel,
  ageBandLabel,
  taxProfileLabel,
  instrumentLabel,
  productClassLabel,
  taxRuleLabel
} from "../src/main.jsx";
import {
  buildFallbackAnalytics,
  computeAnalyticsBundle,
  minimalOptimum,
  pendingMonteCarlo
} from "../src/analytics.js";

const approx = (received, expected, tolerance = 1e-6) => {
  expect(Math.abs(received - expected)).toBeLessThanOrEqual(tolerance);
};

const modelParams = (patch = {}) => projectionParamsFromState(normalizeState({ ...BASE, ...patch }));

const reconciliationState = (patch = {}) => normalizeState({
  ...BASE,
  principal: 30000000,
  targetCorpus: 30000000,
  monthlyTarget: 75000,
  years: 30,
  inflation: 6,
  incomeMode: "swp",
  cashMode: "monthlyTarget",
  useAssetReturns: 1,
  equityShare: 60,
  equityReturn: 14,
  debtReturn: 9,
  expenseRatio: 0.4,
  taxProfileMode: "retiree",
  taxRate: 0,
  monteCarloSamples: 32,
  monteCarloSeed: 24681357,
  ...patch
});

const reconciliationSnapshot = (patch = {}, riskSamples = 0) => {
  const state = reconciliationState(patch);
  const params = projectionParamsFromState(state);
  const model = calculate(params);
  const risk = riskSamples > 0
    ? calculateMonteCarlo(params, Math.min(riskSamples, state.monteCarloSamples || riskSamples))
    : { successProbability: 0, finals: [] };
  return {
    state,
    params,
    model,
    risk,
    surface: {
      finalCorpus: model.final.closing,
      cashWithdrawn: model.final.cumWithdrawals,
      realFinalValue: model.final.realClosing,
      finalMonthlyCash: model.final.withdrawal / 12,
      rowCount: model.rows.length,
      monthlyRowCount: model.monthlyRows?.length || 0,
      taxDrag: model.final.cumTax,
      targetCorpus: params.targetCorpus,
      effectiveMonthlyCash: params.monthlyTarget,
      successProbability: risk.successProbability,
      p10: riskSamples > 0 ? quantile(risk.finals, 0.1) : 0,
      p50: riskSamples > 0 ? quantile(risk.finals, 0.5) : 0,
      p90: riskSamples > 0 ? quantile(risk.finals, 0.9) : 0
    }
  };
};

const expectSurfaceChanged = (before, after, key, tolerance = 1) => {
  expect(Math.abs(after.surface[key] - before.surface[key])).toBeGreaterThan(tolerance);
};

const expectSurfaceStable = (before, after, key, tolerance = 1) => {
  expect(Math.abs(after.surface[key] - before.surface[key])).toBeLessThanOrEqual(tolerance);
};

describe("background analytics bundle", () => {
  it("builds a cheap fallback without running Monte Carlo or exact solvers", () => {
    const state = reconciliationState({ years: 5, monteCarloSamples: 24 });
    const params = projectionParamsFromState(state);
    const model = calculate(params);
    const fallback = buildFallbackAnalytics(state, params, model);
    expect(fallback.pending).toBe(true);
    expect(fallback.mc.simulations).toBe(0);
    expect(fallback.mc.p50).toHaveLength(model.rows.length);
    expect(fallback.mc.method).toMatch(/background/i);
    expect(fallback.maxMonthlyCash).toBeGreaterThanOrEqual(0);
    expect(fallback.optimum.strategies).toEqual([]);
    expect(minimalOptimum(state).profile.withdrawalRate).toBeGreaterThan(0);
    expect(pendingMonteCarlo(params, model).targetCorpus).toBe(params.targetCorpus);
  });

  it("keeps fallback analytics defensive when optional model fields are missing", () => {
    const optimistic = pendingMonteCarlo(
      { targetCorpus: 0, glidePathEnabled: 1, monteCarloSeed: "", shockModel: "" },
      { rows: [{}], final: {} }
    );
    expect(optimistic.successProbability).toBe(1);
    expect(optimistic.seed).toBe(24681357);
    expect(optimistic.shockModel).toBe("regime");
    expect(optimistic.glidePath).toMatch(/glide path/);

    const shortfall = pendingMonteCarlo(
      { targetCorpus: 100, glidePathEnabled: 0, monteCarloSeed: 42, shockModel: "normal" },
      { rows: null, final: { closing: 10 } }
    );
    expect(shortfall.successProbability).toBe(0);
    expect(shortfall.successCount).toBe(0);
    expect(shortfall.glidePath).toBe("fixed allocation");

    const fallback = buildFallbackAnalytics(reconciliationState({ targetCorpus: 100000000, years: 2 }));
    expect(fallback.topup).toBeGreaterThan(0);
    expect(fallback.requiredCorpusForCash).toBeGreaterThan(0);
  });

  it("exercises fallback analytics with overrides and edge inputs (R4 branch coverage)", () => {
    const overrideState = reconciliationState({
      monthlyCashOverride: 75000,
      monthlyTarget: 50000,
      years: 0,
      principal: 0,
      targetCorpus: 1000
    });
    const overrideParams = projectionParamsFromState(overrideState);
    const overrideModel = calculate(overrideParams);
    const overrideFallback = buildFallbackAnalytics(
      overrideState,
      { ...overrideParams, monthlyCashOverride: 75000, years: 0, principal: 0, targetCorpus: 1000 },
      { ...overrideModel, final: { closing: 9999999, withdrawal: 600000 } }
    );
    expect(overrideFallback.topup).toBe(0);
    expect(overrideFallback.maxMonthlyCash).toBeGreaterThan(0);
    expect(overrideFallback.requiredCorpusForCash).toBeGreaterThan(0);

    const missingFinalFallback = buildFallbackAnalytics(
      reconciliationState({ targetCorpus: 5000000 }),
      undefined,
      { rows: [], final: null }
    );
    expect(missingFinalFallback.topup).toBeGreaterThan(0);
    expect(missingFinalFallback.maxMonthlyCash).toBe(0);
  });

  it("computes exact risk, solver, and strategy outputs for the worker path", () => {
    const state = reconciliationState({ years: 4, monteCarloSamples: 3 });
    const bundle = computeAnalyticsBundle(state);
    expect(bundle.pending).toBe(false);
    expect(bundle.mc.simulations).toBe(3);
    expect(bundle.mc.p50).toHaveLength(5);
    expect(bundle.topup).toBeGreaterThanOrEqual(0);
    expect(bundle.requiredCorpusForCash).toBeGreaterThan(0);
    expect(bundle.maxMonthlyCash).toBeGreaterThanOrEqual(0);
    expect(bundle.optimum.best).toBeTruthy();
    expect(bundle.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("can compute analytics in runtimes without the Performance API", () => {
    const nativePerformance = globalThis.performance;
    vi.stubGlobal("performance", undefined);
    try {
      const bundle = computeAnalyticsBundle(reconciliationState({ years: 3, monteCarloSamples: 2 }));
      expect(bundle.pending).toBe(false);
      expect(bundle.mc.simulations).toBe(2);
      expect(bundle.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      vi.stubGlobal("performance", nativePerformance);
    }
  });

  it("posts success and failure messages from the analytics worker entry", async () => {
    const messages = [];
    vi.stubGlobal("self", {
      postMessage: (message) => messages.push(message)
    });
    vi.resetModules();
    await import("../src/workers/analytics-worker.js");

    globalThis.self.onmessage({ data: { id: "ok", state: reconciliationState({ years: 2, monteCarloSamples: 2 }) } });
    expect(messages[0].id).toBe("ok");
    expect(messages[0].ok).toBe(true);
    expect(messages[0].result.pending).toBe(false);

    const brokenData = { id: "bad" };
    Object.defineProperty(brokenData, "state", {
      get() {
        throw new Error("synthetic worker failure");
      }
    });
    globalThis.self.onmessage({ data: brokenData });
    expect(messages[1].id).toBe("bad");
    expect(messages[1].ok).toBe(false);
    expect(messages[1].error).toMatch(/synthetic worker failure/);

    globalThis.self.onmessage({});
    expect(messages[2].ok).toBe(true);

    const stringFailureData = { id: "string-failure" };
    Object.defineProperty(stringFailureData, "state", {
      get() {
        throw "synthetic string failure";
      }
    });
    globalThis.self.onmessage({ data: stringFailureData });
    expect(messages[3].id).toBe("string-failure");
    expect(messages[3].ok).toBe(false);
    expect(messages[3].error).toBe("synthetic string failure");
    vi.unstubAllGlobals();
  });
});

describe("configuration and formatting helpers", () => {
  it("loads saved state and layout with guardrails", () => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      clear: () => store.clear(),
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    });
    localStorage.clear();
    expect(loadSavedState().state.principal).toBe(BASE.principal);
    expect(loadSavedState().activeView).toBe("overview");
    expect(loadSavedLayout().viewportMode).toBe("auto");
    localStorage.setItem("fin-cockpit-state-v2", JSON.stringify({ state: { principal: "17500000", years: "20" }, preset: "growth", tableMode: "full", activeView: "planner" }));
    const saved = loadSavedState();
    expect(saved.state.principal).toBe(17500000);
    expect(saved.state.years).toBe(20);
    expect(saved.preset).toBe("growth");
    expect(saved.tableMode).toBe("full");
    expect(saved.activeView).toBe("planner");
    const projected = projectionParamsFromState(saved.state);
    expect(projected.principal).toBe(17500000);
    expect(projected.years).toBe(20);
    expect(JSON.parse(JSON.stringify(saved.state)).principal).toBe(17500000);
    localStorage.setItem("fin-cockpit-state-v2", JSON.stringify({ activeView: "missing-page" }));
    expect(loadSavedState().activeView).toBe("overview");
    localStorage.setItem("fin-cockpit-layout-v2", JSON.stringify({ rail: 999, insights: 1, viewport: 99999, viewportMode: "manual", fontScale: 9 }));
    const layout = loadSavedLayout();
    expect(layout.rail).toBe(260);
    expect(layout.insights).toBe(230);
    expect(layout.viewport).toBe(2080);
    expect(layout.viewportMode).toBe("manual");
    expect(layout.fontScale).toBe(1.35);
    localStorage.setItem("fin-cockpit-state-v2", "{bad");
    localStorage.setItem("fin-cockpit-layout-v2", "{bad");
    const recoveredState = loadSavedState();
    const recoveredLayout = loadSavedLayout();
    expect(recoveredState.preset).toBe("base");
    expect(recoveredState.warning).toContain("unreadable");
    expect(recoveredLayout).toMatchObject(DEFAULT_LAYOUT);
    expect(recoveredLayout.warning).toContain("unreadable");
    expect(localStorage.getItem("fin-cockpit-state-v2")).toBeNull();
    expect(localStorage.getItem("fin-cockpit-layout-v2")).toBeNull();
    expect(persistJson("fin-test-json", { ok: true })).toMatchObject({ ok: true });
    // R4.5b: use new disclaimer helpers; legacy shims delegate to them
    expect(loadDisclaimerAcknowledged()).toBe(false);
    expect(loadPrivacyConsent()).toBe(false); // deprecated shim still works
    // Legacy key migration path
    localStorage.setItem(PRIVACY_CONSENT_KEY, "accepted");
    expect(loadDisclaimerAcknowledged()).toBe(true);
    expect(localStorage.getItem(DISCLAIMER_KEY)).toBe("true"); // migration wrote new key
    localStorage.clear();
    // New key round-trip
    expect(persistDisclaimerAcknowledged()).toMatchObject({ ok: true });
    expect(loadDisclaimerAcknowledged()).toBe(true);
    expect(localStorage.getItem(DISCLAIMER_KEY)).toBe("true");
    // Deprecated shim persistPrivacyConsent also works (delegates to new function)
    localStorage.clear();
    expect(persistPrivacyConsent()).toMatchObject({ ok: true });
    expect(loadPrivacyConsent()).toBe(true);
    localStorage.setItem(SCENARIO_HISTORY_KEY, JSON.stringify([{ name: "Advisor review", notes: "Compare SWP", state: { principal: "17500000" }, outputs: { finalCorpus: "9000000", endTargetChance: "0.42" } }]));
    const history = loadScenarioHistory();
    expect(history.history).toHaveLength(1);
    expect(history.history[0]).toMatchObject({ name: "Advisor review", taxLawVersion: "Unknown" });
    expect(history.history[0].state.principal).toBe(17500000);
    expect(history.history[0].outputs.finalCorpus).toBe(9000000);
    localStorage.setItem(SCENARIO_HISTORY_KEY, JSON.stringify([{
      id: "reviewed",
      name: "CA reviewed plan",
      notes: "Approved for sensitivity",
      source: "library",
      libraryId: "tax-optimized-swp",
      createdAt: "2026-05-14T00:00:00.000Z",
      taxLawVersion: "FY 2025-26",
      fingerprint: "abc123",
      exportProvenance: {
        product: "Custom product",
        exportType: "Library snapshot",
        generatedAt: "2026-05-14T01:00:00.000Z",
        taxLawVersion: "FY 2025-26",
        fingerprint: "abc123",
        riskMethod: "seeded",
        riskSeed: "42"
      },
      state: { principal: "20000000" },
      outputs: { finalCorpus: "30000000", realFinalCorpus: "12000000", cumulativeCash: "5000000", finalMonthlyCash: "75000", endTargetChance: "0.64", cumulativeTax: "100000" }
    }]));
    const reviewedHistory = loadScenarioHistory().history[0];
    expect(reviewedHistory).toMatchObject({ id: "reviewed", source: "library", libraryId: "tax-optimized-swp", fingerprint: "abc123" });
    expect(reviewedHistory.exportProvenance).toMatchObject({ product: "Custom product", exportType: "Library snapshot", riskSeed: "42" });
    expect(reviewedHistory.outputs.cumulativeTax).toBe(100000);
    const householdScenarioState = normalizeState({
      principal: 42000000,
      targetCorpus: 35000000,
      years: 18,
      monthlyTarget: 50000,
      cashMode: "monthlyTarget",
      incomeMode: "swp",
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 180000,
      discretionaryMonthlyExpense: 60000,
      spouseMonthlyNeed: 25000,
      pensionMonthlyIncome: 45000,
      rentMonthlyIncome: 15000,
      healthcareReserve: 2000000,
      emergencyMonths: 10,
      legacyCorpusGoal: 40000000,
      longevityYears: 24,
      contingencyYears: 4
    });
    localStorage.setItem(SCENARIO_HISTORY_KEY, JSON.stringify([{
      name: "Stale imported household plan",
      state: householdScenarioState,
      effectiveProjection: {
        rawMonthlyCashTarget: 1,
        effectiveMonthlyCashNeed: 2,
        rawTargetCorpusToday: 3,
        effectiveTargetCorpusToday: 4,
        effectiveTargetCorpusNominal: 5,
        rawYears: 6,
        effectiveYears: 7,
        cashMode: "wrong",
        cashEngine: "wrong",
        householdMode: false,
        householdOffsets: { emergencyReserve: 8, healthcareReserve: 9, plannedLumpSum: 10, legacyGoal: 11 }
      }
    }]));
    const cleanedHousehold = loadScenarioHistory().history[0];
    const householdProfile = householdPlanProfile(householdScenarioState);
    const householdParams = projectionParamsFromState(householdScenarioState);
    expect(cleanedHousehold.effectiveProjection).toMatchObject({
      rawMonthlyCashTarget: householdScenarioState.monthlyTarget,
      effectiveMonthlyCashNeed: householdParams.monthlyTarget,
      rawTargetCorpusToday: householdScenarioState.targetCorpus,
      effectiveTargetCorpusToday: householdProfile.targetCorpusToday,
      effectiveTargetCorpusNominal: householdParams.targetCorpus,
      rawYears: householdScenarioState.years,
      effectiveYears: householdParams.years,
      cashMode: householdScenarioState.cashMode,
      cashEngine: householdScenarioState.incomeMode,
      householdMode: true
    });
    expect(cleanedHousehold.effectiveProjection.householdOffsets).toMatchObject({
      expenses: householdProfile.expenses,
      incomes: householdProfile.incomes,
      emergencyReserve: householdProfile.emergencyReserve,
      healthcareReserve: householdProfile.healthcareReserve,
      legacyGoal: householdProfile.legacyGoal
    });
    localStorage.setItem(SCENARIO_HISTORY_KEY, JSON.stringify([{
      id: "",
      name: "",
      createdAt: "2026-05-17T00:00:00.000Z",
      state: {
        monthlyTarget: 0,
        targetCorpus: 0,
        years: 0,
        cashMode: "",
        incomeMode: "",
        useHouseholdPlan: 0,
        emergencyMonths: 0,
        healthcareReserve: 0,
        legacyCorpusGoal: 0
      }
    }]));
    const minimalSnapshot = loadScenarioHistory().history[0];
    expect(minimalSnapshot.id).toBe("plan-2026-05-17T00:00:00.000Z");
    expect(minimalSnapshot.name).toBe("Saved plan");
    expect(minimalSnapshot.effectiveProjection).toMatchObject({
      rawMonthlyCashTarget: 0,
      effectiveMonthlyCashNeed: 0,
      rawTargetCorpusToday: 0,
      effectiveTargetCorpusToday: 0,
      effectiveTargetCorpusNominal: 0,
      rawYears: 0,
      effectiveYears: 0,
      cashMode: "",
      cashEngine: "",
      householdMode: false
    });
    localStorage.setItem(SCENARIO_HISTORY_KEY, JSON.stringify({ not: "array" }));
    expect(loadScenarioHistory().history).toEqual([]);
    expect(persistScenarioHistory("not an array")).toMatchObject({ ok: true });
    expect(JSON.parse(localStorage.getItem(SCENARIO_HISTORY_KEY))).toEqual([]);
    const manySnapshots = Array.from({ length: 14 }, (_, index) => ({ id: `s-${index}`, name: `Plan ${index}`, state: { principal: 1000000 + index }, outputs: { finalCorpus: index } }));
    expect(persistScenarioHistory(manySnapshots)).toMatchObject({ ok: true });
    expect(JSON.parse(localStorage.getItem(SCENARIO_HISTORY_KEY))).toHaveLength(12);
    localStorage.setItem("fin-cockpit-state-v2", JSON.stringify({ state: { principal: 12345678 } }));
    const clearResult = clearSavedBrowserData();
    expect(clearResult).toMatchObject({ ok: true });
    LOCAL_STORAGE_KEYS.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); },
      removeItem: () => {}
    });
    expect(persistJson("fin-test-json", { ok: true })).toMatchObject({ ok: false });
    vi.unstubAllGlobals();
  });

  it("guards storage read/write failure branches without losing safe fallbacks", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "{bad",
      removeItem: vi.fn(),
      setItem: () => {
        const error = new Error("storage unavailable");
        error.name = "SecurityError";
        throw error;
      }
    });
    expect(readJsonStorage("broken", { ok: true })).toMatchObject({ value: { ok: true } });
    expect(readJsonStorage("broken", { ok: true }).warning).toContain("unreadable");
    expect(persistJson("state", { ok: true }).warning).toContain("unavailable");
    expect(loadPrivacyConsent()).toBe(false);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error("blocked"); }
    });
    expect(clearSavedBrowserData(["state"]).warning).toContain("Could not clear");
    vi.unstubAllGlobals();
  });

  it("normalizes numeric fields and preserves option fields", () => {
    const state = normalizeState({ principal: "17500000", years: "20", incomeMode: "swp", unknown: "kept" });
    expect(state.principal).toBe(17500000);
    expect(state.years).toBe(20);
    expect(state.incomeMode).toBe("swp");
    expect(state.unknown).toBe("kept");
    expect(normalizeFieldValue("principal", "bad")).toBe(0);
    expect(normalizeFieldValue("incomeMode", "swp")).toBe("swp");
    expect(NUMERIC_FIELDS.has("targetCorpus")).toBe(true);
  });

  it("inflates today's corpus target for model comparisons", () => {
    const params = projectionParamsFromState({ ...BASE, targetCorpus: 35000000, inflation: 6, years: 20 });
    approx(params.targetCorpus, 35000000 * 1.06 ** 20, 0.01);
  });

  it("computes responsive viewport defaults and clamps values", () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
    expect(roundToStep(1671, 20)).toBe(1680);
    expect(viewportBoundsForWidth(390)).toEqual({ min: 320, max: 380 });
    expect(viewportBoundsForWidth(950).min).toBe(640);
    expect(viewportBoundsForWidth(1300).max).toBe(2080);
    expect(autoViewportForWidth(390)).toBe(380);
    expect(autoViewportForWidth(1300)).toBe(1200);
    expect(autoViewportForWidth(1920)).toBeGreaterThan(1600);
    expect(DEFAULT_LAYOUT.viewportMode).toBe("auto");
  });

  it("formats Indian money and percentages predictably", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(125000)).toBe("₹1.25 L");
    expect(formatInr(1250000)).toBe("₹12.5 L");
    expect(formatInr(12500000)).toBe("₹1.25 Cr");
    expect(formatInr(121000000)).toBe("₹12.1 Cr");
    expect(formatInr(-450000)).toBe("-₹4.50 L");
    expect(formatInr(Infinity)).toBe("N/A");
    expect(formatFullInr(17500000)).toBe("₹1,75,00,000");
    expect(formatPct(0.1169)).toBe("11.69%");
  });

  it("keeps standard scenario library patches deterministic and normalized", () => {
    expect(STANDARD_SCENARIO_LIBRARY).toHaveLength(9);
    const basePatch = scenarioPatchFor(STANDARD_SCENARIO_LIBRARY[0], BASE);
    expect(basePatch).toEqual({});
    const higherIncome = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "higher-income"), { ...BASE, monthlyTarget: 80000, withdrawRate: 25 });
    expect(higherIncome.monthlyTarget).toBe(100000);
    expect(higherIncome.withdrawRate).toBe(60);
    const higherIncomeFallback = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "higher-income"), { ...BASE, monthlyTarget: 0, withdrawRate: 72 });
    expect(higherIncomeFallback.monthlyTarget).toBe(Math.round(BASE.monthlyTarget * 1.25));
    expect(higherIncomeFallback.withdrawRate).toBe(72);
    const lowerReturn = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "lower-return"), { ...BASE, equityReturn: 6, debtReturn: 4, annualRate: 5, inflation: 10 });
    expect(lowerReturn.equityReturn).toBe(4);
    expect(lowerReturn.debtReturn).toBe(3);
    expect(lowerReturn.annualRate).toBe(3);
    expect(lowerReturn.inflation).toBe(10);
    const lowerReturnModerate = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "lower-return"), { ...BASE, equityReturn: 12, debtReturn: 8, annualRate: 12, inflation: 6 });
    expect(lowerReturnModerate.equityReturn).toBe(8);
    expect(lowerReturnModerate.debtReturn).toBe(6);
    expect(lowerReturnModerate.annualRate).toBe(9);
    expect(lowerReturnModerate.inflation).toBe(7);
    const lowerReturnFallback = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "lower-return"), { ...BASE, equityReturn: 0, debtReturn: 0, annualRate: 0, inflation: 0 });
    expect(lowerReturnFallback.equityReturn).toBe(BASE.equityReturn - 4);
    expect(lowerReturnFallback.debtReturn).toBe(BASE.debtReturn - 2);
    expect(lowerReturnFallback.annualRate).toBe(BASE.annualRate - 3);
    expect(lowerReturnFallback.inflation).toBe(BASE.inflation + 1);
    const crash = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "crash-first-decade"), { ...BASE, volatility: 34, equityVolatility: 44, liquidityMonths: 12 });
    expect(crash.shockYear).toBe(2);
    expect(crash.volatility).toBe(35);
    expect(crash.equityVolatility).toBe(45);
    expect(crash.liquidityMonths).toBe(24);
    const crashModerate = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "crash-first-decade"), { ...BASE, volatility: 12, equityVolatility: 18, liquidityMonths: 36 });
    expect(crashModerate.volatility).toBe(17);
    expect(crashModerate.equityVolatility).toBe(23);
    expect(crashModerate.liquidityMonths).toBe(36);
    const crashFallback = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "crash-first-decade"), { ...BASE, volatility: 0, equityVolatility: 0, liquidityMonths: 0 });
    expect(crashFallback.volatility).toBe(BASE.volatility + 5);
    expect(crashFallback.equityVolatility).toBe(BASE.equityVolatility + 5);
    expect(crashFallback.liquidityMonths).toBe(BASE.liquidityMonths);
    const medical = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "medical-reserve-shock"), { ...BASE, healthcareReserve: 0, emergencyMonths: 6, monthlyTarget: 100000 });
    expect(medical.useHouseholdPlan).toBe(1);
    expect(medical.healthcareReserve).toBe(2500000);
    expect(medical.emergencyMonths).toBe(18);
    expect(medical.monthlyTarget).toBe(110000);
    const medicalExisting = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "medical-reserve-shock"), { ...BASE, healthcareReserve: 3000000, emergencyMonths: 24, monthlyTarget: 0, liquidityMonths: 36 });
    expect(medicalExisting.healthcareReserve).toBe(3000000);
    expect(medicalExisting.emergencyMonths).toBe(24);
    expect(medicalExisting.monthlyTarget).toBe(Math.round(BASE.monthlyTarget * 1.1));
    expect(medicalExisting.liquidityMonths).toBe(36);
    const inflation = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "sticky-inflation"), { ...BASE, inflation: 10, equityReturn: 8, debtReturn: 4, annualRate: 5 });
    expect(inflation.inflation).toBe(12);
    expect(inflation.equityReturn).toBe(6);
    expect(inflation.debtReturn).toBe(3);
    expect(inflation.annualRate).toBe(3);
    const inflationFallback = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "sticky-inflation"), { ...BASE, inflation: 0, equityReturn: 0, debtReturn: 0, annualRate: 0 });
    expect(inflationFallback.inflation).toBe(BASE.inflation + 3);
    expect(inflationFallback.equityReturn).toBe(BASE.equityReturn - 2);
    expect(inflationFallback.debtReturn).toBe(BASE.debtReturn - 1);
    expect(inflationFallback.annualRate).toBe(BASE.annualRate - 2);
    const spouse = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "spouse-longevity"), { ...BASE, monthlyTarget: 120000, years: 20, targetCorpus: 25000000 });
    expect(spouse.useHouseholdPlan).toBe(1);
    expect(spouse.spouseMonthlyNeed).toBe(90000);
    expect(spouse.longevityYears).toBe(35);
    expect(spouse.contingencyYears).toBe(5);
    expect(spouse.legacyCorpusGoal).toBe(25000000);
    const spouseExisting = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "spouse-longevity"), { ...BASE, spouseMonthlyNeed: 300000, monthlyTarget: 0, longevityYears: 40, years: 0, contingencyYears: 7, legacyCorpusGoal: 120000000, targetCorpus: 0 });
    expect(spouseExisting.spouseMonthlyNeed).toBe(300000);
    expect(spouseExisting.longevityYears).toBe(40);
    expect(spouseExisting.contingencyYears).toBe(7);
    expect(spouseExisting.legacyCorpusGoal).toBe(120000000);
    expect(scenarioPatchFor({ id: "empty" }, BASE)).toEqual({});
  });

  it("covers defensive defaults for malformed configuration inputs", () => {
    expect(projectionParamsFromState({}).targetCorpus).toBe(0);
    expect(projectionParamsFromState({ targetCorpus: "bad", inflation: "bad", years: "bad" }).targetCorpus).toBe(0);
    expect(viewportBoundsForWidth(600)).toEqual({ min: 320, max: 590 });
    expect(autoViewportForWidth(1000)).toBe(970);
    expect(formatFullInr(-17500000)).toBe("-₹1,75,00,000");
    expect(formatFullInr(null)).toBe("₹0");
    expect(formatPct(undefined)).toBe("0%");
    expect(annualPortfolioRate({ useAssetReturns: 0, annualRate: "bad", expenseRatio: "bad" })).toBe(0);
    expect(annualPortfolioRate({ useAssetReturns: 1 })).toBe(0);
    expect(effectiveYield({ useAssetReturns: 0, annualRate: 12, expenseRatio: 0, compounding: 0 })).toBeCloseTo(0.12);
  });
});

describe("return, tax, and instrument rules", () => {
  it("calculates blended and manual effective yields", () => {
    approx(annualPortfolioRate({ ...BASE, equityShare: 60, equityReturn: 14, debtReturn: 9, expenseRatio: 0.4 }), 0.116);
    approx(annualPortfolioIncomeRate({ ...BASE, equityShare: 60, equityIncomeYield: 0, debtIncomeYield: 7.5 }), 0.03);
    approx(annualPortfolioIncomeRate({ ...BASE, useAssetReturns: 0, portfolioIncomeYield: 8 }), 0.08);
    approx(annualPortfolioRate({ ...BASE, useAssetReturns: 0, annualRate: 12, expenseRatio: 0.4 }), 0.116);
    approx(compoundRate(0.12, 12), 0.12682503013196977, 1e-12);
    expect(effectiveYield({ ...BASE, compounding: 12 })).toBeGreaterThan(effectiveYield({ ...BASE, compounding: 1 }));
  });

  it("applies instrument tax rates, override, cess, and exemption", () => {
    approx(taxableRate("equityLtcg", BASE), 0.13);
    approx(taxableRate("equityStcg", BASE), 0.208);
    approx(taxableRate("equityTaxFree", BASE), 0);
    approx(taxableRate("debtMfSlab", BASE), 0.312);
    const tax = yearlyTax(30000000, BASE);
    expect(tax.interest).toBeGreaterThan(3000000);
    expect(tax.equityTax).toBe(0);
    expect(tax.debtTax).toBe(0);
    expect(tax.realizedIncome).toBeGreaterThan(0);
    expect(tax.unrealizedGrowth).toBeGreaterThan(0);
    expect(tax.taxProfile.rebateUsed).toBeGreaterThan(0);
    const override = yearlyTax(30000000, { ...BASE, taxRate: 10 });
    approx(override.tax, override.realizedIncome * 0.1, 0.01);
  });

  it("covers fallback tax and instrument branches", () => {
    expect(annualPortfolioIncomeRate({ useAssetReturns: 1 })).toBe(0);
    expect(slabBands({ taxRegime: "old", ageBand: "below60" })[0].upto).toBe(250000);
    expect(slabTaxBeforeCess(-1000, BASE)).toBe(0);
    expect(applySection87A(5000, 400000, { ...BASE, section87A: 0 })).toBe(5000);
    expect(calculateTaxProfile({ ...BASE, includeCess: 0 }, { ...emptyTaxStreams(), equityStcg: 100000 }).cess).toBe(0);
    expect(calculateTaxProfile({ ...BASE, taxRate: 10 }, {}).taxableInvestmentIncome).toBe(0);
    expect(calculateTaxProfile({ ...BASE, harvestLtcg: 0 }, { ...emptyTaxStreams(), equityLtcg: 200000 }).ltcgExemptionUsed).toBe(0);
    expect(investmentTaxProfile({ ...BASE, taxProfileMode: "flat" }, { ...emptyTaxStreams(), equityLtcg: 100000 }).tax).toBe(0);
    expect(calculateTaxProfile({ taxProfileMode: "flat", harvestLtcg: 1 }, { ...emptyTaxStreams(), normalIncome: 100000, equityLtcg: 225000 }).totalTax).toBe(12500);
    approx(taxableRate("equityLtcg", { ...BASE, includeCess: 0 }), 0.125);
    approx(taxableRate("unknown", BASE), 0);
    approx(taxableRate("fdInterest", { ...BASE, taxRate: 8 }), 0.08);
    approx(taxableRate("fdInterest", {}), 0);
    approx(taxableRate("fdInterest", { taxRate: "bad" }), 0);
    expect(streamsForInstrument("equityStcg", 1000).equityStcg).toBe(1000);
    expect(yearlyTax(1000000, { ...BASE, useAssetReturns: 0, annualRate: 8, equityInstrument: "equityTaxFree", debtInstrument: "unknown" }).normalIncome).toBeGreaterThan(0);
    expect(yearlyTax(1000000, { useAssetReturns: 1, equityInstrument: "equityLtcg", debtInstrument: "debtMfSlab" }).interest).toBe(0);
    expect(taxRuleLabel("debtMfSlab", { ...BASE, includeCess: 0, section87A: 0, residentStatus: "nonResident" })).toContain("slab");
    expect(taxRuleLabel("debtMfSlab", { taxProfileMode: "flat" })).toContain("Flat slab");
    expect(taxRuleLabel("unknown", BASE)).toBe("-");
    approx(capitalGainTaxRate("equityLtcg", undefined, BASE), 0.13);
    approx(capitalGainTaxRate("listedBondLtcg", undefined, BASE), 0.13);
  });

  it("applies standard deduction only to eligible pension income and models TDS timing separately", () => {
    const interestOnly = calculateTaxProfile({ ...BASE, standardDeduction: 75000, pensionIncome: 0, otherIncome: 0 }, { ...emptyTaxStreams(), normalIncome: 800000 });
    const pension = calculateTaxProfile({ ...BASE, standardDeduction: 75000, pensionIncome: 800000, otherIncome: 0 }, emptyTaxStreams());
    expect(interestOnly.standardDeductionUsed).toBe(0);
    expect(interestOnly.standardDeductionDisallowed).toBe(75000);
    expect(interestOnly.normalTaxableIncome).toBe(800000);
    expect(pension.standardDeductionUsed).toBe(75000);
    expect(pension.normalTaxableIncome).toBe(725000);
    const tds = calculateTaxProfile({ ...BASE, section87A: 0, form15Declaration: 0, interestTdsRate: 10 }, { ...emptyTaxStreams(), normalIncome: 600000 });
    expect(tds.tds).toBeCloseTo(60000);
    expect(tds.tdsRefundEstimate).toBeGreaterThanOrEqual(0);
  });

  it("adds surcharge with marginal relief metadata for high-income retiree cases", () => {
    const profile = calculateTaxProfile({ ...BASE, section87A: 0, otherIncome: 6000000 }, emptyTaxStreams());
    expect(profile.surcharge).toBeGreaterThan(0);
    expect(profile.surchargeBand.above).toBe(5000000);
    expect(profile.marginalRelief).toBeGreaterThanOrEqual(0);
    const oldRegime = calculateTaxProfile({ ...BASE, taxRegime: "old", section87A: 0, otherIncome: 60000000 }, emptyTaxStreams());
    expect(oldRegime.surcharge).toBeGreaterThan(profile.surcharge);
    const disabledReliefLaw = { ...DEFAULT_TAX_LAW, surchargeMarginalRelief: false };
    const noRelief = calculateTaxProfile({ ...BASE, section87A: 0, otherIncome: 5100000, taxLawJson: formatTaxLawJson(disabledReliefLaw) }, emptyTaxStreams());
    expect(noRelief.marginalRelief).toBe(0);
    const noBand = calculateTaxProfile({ ...BASE, section87A: 0, otherIncome: 1000000 }, emptyTaxStreams());
    expect(noBand.surcharge).toBe(0);
  });

  it("sanitizes surcharge/TDS rules and handles Form 15 declaration branches", () => {
    const malformedLaw = sanitizeTaxLaw({
      surchargeBands: [{ above: 1000, upto: 500, rate: -1 }],
      tdsDefaults: { interest: "bad", distribution: 15 }
    });
    expect(malformedLaw.surchargeBands.length).toBe(DEFAULT_TAX_LAW.surchargeBands.length);
    expect(malformedLaw.tdsDefaults.distribution).toBe(0.15);
    const disabledTds = calculateTaxProfile({ ...BASE, tdsEnabled: 0, form15Declaration: 0 }, { ...emptyTaxStreams(), normalIncome: 900000 });
    expect(disabledTds.tds).toBe(0);
    const seniorNilTax = calculateTaxProfile({ ...BASE, ageBand: "senior", form15Declaration: 1 }, { ...emptyTaxStreams(), normalIncome: 400000 });
    expect(seniorNilTax.form15Eligible).toBe(true);
    const nonResident = calculateTaxProfile({ ...BASE, residentStatus: "nonResident", form15Declaration: 1 }, { ...emptyTaxStreams(), normalIncome: 400000 });
    expect(nonResident.form15Eligible).toBe(false);
    const nriWithholding = calculateTaxProfile({ ...BASE, residentStatus: "nonResident", nriWithholdingRate: 20, form15Declaration: 1 }, { ...emptyTaxStreams(), normalIncome: 400000, equityStcg: 100000 });
    expect(nriWithholding.withholdingBase).toBeGreaterThan(400000);
    expect(nriWithholding.withholdingRate).toBeCloseTo(0.20);
    expect(nriWithholding.tds).toBeGreaterThan(nonResident.tds);
    const uncappedLaw = {
      ...DEFAULT_TAX_LAW,
      surchargeBands: [{ above: 100000, upto: null, rate: 5 }],
      tdsDefaults: { distribution: 15 }
    };
    const uncapped = calculateTaxProfile({ ...BASE, section87A: 0, otherIncome: 200000, taxLawJson: formatTaxLawJson(uncappedLaw) }, emptyTaxStreams());
    expect(uncapped.surcharge).toBeGreaterThanOrEqual(0);
    const badTdsRate = calculateTaxProfile({ ...BASE, form15Declaration: 0, interestTdsRate: "bad" }, { ...emptyTaxStreams(), normalIncome: 400000 });
    expect(badTdsRate.tds).toBeCloseTo(40000);
  });

  it("labels instruments and tax rules", () => {
    expect(instrumentLabel("equityLtcg")).toContain("Equity");
    expect(instrumentLabel("unknown")).toBe("unknown");
    expect(taxRuleLabel("equityLtcg", BASE)).toContain("12.5%");
    expect(taxRuleLabel("fdInterest", BASE)).toContain("87A");
    expect(isEquityLike("equityStcg")).toBe(true);
    expect(isEquityLike("debtMfSlab")).toBe(false);
  });

  it("uses editable tax-law rules for slabs, rebates, cess, rates, exemptions, and holding periods", () => {
    const customLaw = {
      ...DEFAULT_TAX_LAW,
      version: "Test editable law",
      newRegimeSlabs: [
        { upto: 300000, rate: 0 },
        { upto: 600000, rate: 10 },
        { upto: null, rate: 20 }
      ],
      rebates: {
        ...DEFAULT_TAX_LAW.rebates,
        new: { threshold: 900000, max: 30000, marginalRelief: true }
      },
      specialRates: { equityLtcg: 10, equityStcg: 25, listedBondLtcg: 15 },
      surchargeBands: [{ above: 100000, upto: null, rate: 5, specialRateCap: 5 }],
      equityLtcgExemption: 250000,
      equityLongTermMonths: 24,
      listedBondLongTermMonths: 36,
      cess: 5
    };
    const state = { ...BASE, taxLawJson: formatTaxLawJson(customLaw), includeCess: 1 };

    expect(taxLawParseStatus(state).ok).toBe(true);
    expect(taxLawFromState(state).version).toBe("Test editable law");
    expect(slabBands(state).map((band) => band.upto)).toEqual([300000, 600000, Infinity]);
    expect(taxLawFromState(state).surchargeBands[0].above).toBe(100000);
    approx(specialRate("equityStcg", state), 0.25);
    approx(taxableRate("equityStcg", state), 0.2625);
    expect(applySection87A(30000, 900000, state)).toBe(0);
    expect(streamsForInstrument("equityLtcg", 1000, 18, state).equityStcg).toBe(1000);
    expect(streamsForInstrument("equityLtcg", 1000, 24, state).equityLtcg).toBe(1000);
    expect(streamsForInstrument("listedBondLtcg", 1000, 24, state).normalIncome).toBe(1000);
    expect(streamsForInstrument("listedBondLtcg", 1000, 36, state).listedBondLtcg).toBe(1000);
    approx(capitalGainTaxRate("listedBondLtcg", 36, state), 0.1575);
    const profile = investmentTaxProfile(state, { ...emptyTaxStreams(), equityLtcg: 300000 });
    expect(profile.ltcgExemptionUsed).toBe(250000);
    expect(taxRuleLabel("equityLtcg", state)).toContain("10%");
    expect(taxRuleLabel("equityLtcg", state)).toContain("2.50 L");
  });

  it("falls back safely when editable tax-law JSON is invalid or partial", () => {
    expect(taxLawParseStatus({ taxLawJson: "{" }).ok).toBe(false);
    expect(taxLawParseStatus({}).law.version).toBe(DEFAULT_TAX_LAW.version);
    expect(taxLawFromState({ taxLawJson: "{" }).version).toBe(DEFAULT_TAX_LAW.version);
    const partial = sanitizeTaxLaw({ specialRates: { equityLtcg: 0.1 }, cess: 0.05, newRegimeSlabs: [] });
    approx(partial.specialRates.equityLtcg, 0.1);
    approx(partial.cess, 0.05);
    expect(partial.newRegimeSlabs[0].upto).toBe(400000);
    expect(specialRate("listedBondLtcg", BASE)).toBeGreaterThan(0);
    expect(specialRate("unknown", BASE)).toBe(0);
    expect(slabBands({ ...BASE, taxRegime: "old", ageBand: "missing" })[0].upto).toBe(250000);
  });

  it("nets capital losses across special-rate buckets before exemptions and tax", () => {
    const highIncome = { ...BASE, otherIncome: 2000000, section87A: 0, includeCess: 0, harvestLtcg: 0 };
    const stLossAgainstLtcg = calculateTaxProfile(highIncome, {
      ...emptyTaxStreams(),
      equityStcg: -50000,
      equityLtcg: 200000,
      listedBondLtcg: 100000
    });
    expect(stLossAgainstLtcg.capitalLossSetoff.equityLtcg).toBe(50000);
    expect(stLossAgainstLtcg.taxableSpecial).toMatchObject({ equityLtcg: 150000, listedBondLtcg: 100000, equityStcg: 0 });
    expect(stLossAgainstLtcg.specialTax).toBeCloseTo(31250);

    const ltLossCarryForward = calculateTaxProfile(highIncome, {
      ...emptyTaxStreams(),
      equityLtcg: -80000,
      listedBondLtcg: 50000
    });
    expect(ltLossCarryForward.capitalLossSetoff.listedBondLtcg).toBe(50000);
    expect(ltLossCarryForward.capitalLossCarryForward.longTerm).toBe(30000);
    expect(ltLossCarryForward.specialTax).toBe(0);
  });

  it("applies optional FMV 31-Jan-2018 grandfathering for old equity lots", () => {
    expect(grandfatheredEquityGain(300, 100, 250)).toBe(50);
    expect(grandfatheredEquityGain(220, 100, 250)).toBe(0);
    expect(grandfatheredEquityGain(300, 100, 0)).toBe(200);
    const oldLot = saleStreamsForPrincipalDrawdown(300, {
      ...BASE,
      useAssetReturns: 1,
      equityShare: 100,
      equityInstrument: "equityLtcg",
      equityAcquisitionYear: 2017,
      legacyHoldingYears: 8,
      costBasisPct: 100 / 300 * 100,
      equityFmv2018Pct: 250 / 300 * 100,
      useFmvGrandfathering: 1
    });
    expect(oldLot.equityLtcg).toBeCloseTo(50);
    const withoutFmv = saleStreamsForPrincipalDrawdown(300, {
      ...BASE,
      useAssetReturns: 1,
      equityShare: 100,
      equityInstrument: "equityLtcg",
      equityAcquisitionYear: 2017,
      legacyHoldingYears: 8,
      costBasisPct: 100 / 300 * 100,
      equityFmv2018Pct: 250 / 300 * 100,
      useFmvGrandfathering: 0
    });
    expect(withoutFmv.equityLtcg).toBeCloseTo(200);
  });

  it("keeps the debt mutual fund post-2023 numeric path slab-taxed", () => {
    const post2023 = streamsForInstrument("debtMfSlab", 100000, 60, { ...BASE, debtProductClass: "debtMfPost2023", debtAcquisitionYear: 2024 });
    expect(post2023.normalIncome).toBe(100000);
    expect(post2023.listedBondLtcg).toBe(0);
    const grandfathered = streamsForInstrument("debtMfSlab", 100000, 60, { ...BASE, debtProductClass: "debtMfGrandfathered", debtAcquisitionYear: 2020 });
    expect(grandfathered.normalIncome).toBe(0);
    expect(grandfathered.listedBondLtcg).toBe(100000);
  });

  it("sanitizes malformed tax-law rules without breaking the planner", () => {
    const malformed = sanitizeTaxLaw({
      version: "",
      source: "",
      sourceUrl: "",
      updatedOn: "",
      notes: "",
      newRegimeSlabs: [{ upto: 0, rate: 5 }],
      oldRegimeSlabs: {
        below60: [{ upto: null, rate: 0.2 }],
        senior: [{ upto: -10, rate: 5 }],
        superSenior: [{ upto: 100000, rate: -1 }]
      },
      rebates: {
        new: { threshold: "bad", max: "bad", marginalRelief: false },
        old: { threshold: "bad", max: "bad", marginalRelief: true }
      },
      specialRates: { equityLtcg: -1, equityStcg: "bad", listedBondLtcg: 0.15 },
      equityLtcgExemption: "bad",
      equityLongTermMonths: "bad",
      listedBondLongTermMonths: 0,
      cess: -2,
      debtMfTaxation: ""
    });
    expect(malformed.version).toBe(DEFAULT_TAX_LAW.version);
    expect(malformed.newRegimeSlabs[0].upto).toBe(400000);
    expect(malformed.oldRegimeSlabs.below60[0]).toMatchObject({ upto: Infinity, rate: 0.2 });
    expect(malformed.oldRegimeSlabs.senior[0].upto).toBe(300000);
    expect(malformed.oldRegimeSlabs.superSenior[0]).toMatchObject({ upto: 100000, rate: 0 });
    expect(malformed.rebates.new).toMatchObject({ threshold: 0, max: 0, marginalRelief: false });
    expect(malformed.rebates.old).toMatchObject({ threshold: 0, max: 0, marginalRelief: true });
    expect(malformed.specialRates).toMatchObject({ equityLtcg: 0, equityStcg: 0, listedBondLtcg: 0.15 });
    expect(malformed.equityLtcgExemption).toBe(0);
    expect(malformed.equityLongTermMonths).toBe(DEFAULT_TAX_LAW.equityLongTermMonths);
    expect(malformed.listedBondLongTermMonths).toBe(DEFAULT_TAX_LAW.listedBondLongTermMonths);
    expect(malformed.cess).toBe(0);

    const noMarginalRelief = {
      ...BASE,
      taxLawJson: formatTaxLawJson({
        ...DEFAULT_TAX_LAW,
        rebates: { ...DEFAULT_TAX_LAW.rebates, new: { threshold: 1200000, max: 60000, marginalRelief: false } }
      })
    };
    expect(taxLawFromState(noMarginalRelief)).toEqual(taxLawFromState(noMarginalRelief));
    expect(applySection87A(70000, 1300000, noMarginalRelief)).toBe(70000);
  });

  it("models the retiree tax profile instead of a blunt slab slider", () => {
    const retiree = { ...BASE, taxProfileMode: "retiree", taxRegime: "new", residentStatus: "resident", otherIncome: 0, standardDeduction: 0, section87A: 1, includeCess: 1 };
    expect(slabBands(retiree).map((band) => band.upto).slice(0, 3)).toEqual([400000, 800000, 1200000]);
    expect(basicExemptionLimit(retiree)).toBe(400000);
    expect(slabTaxBeforeCess(1200000, retiree)).toBe(60000);
    expect(applySection87A(60000, 1200000, retiree)).toBe(0);

    const slabOnly = investmentTaxProfile(retiree, { ...emptyTaxStreams(), normalIncome: 1200000 });
    expect(slabOnly.tax).toBe(0);
    expect(slabOnly.rebateUsed).toBe(60000);

    const specialOnly = investmentTaxProfile(retiree, { ...emptyTaxStreams(), equityStcg: 1200000 });
    expect(specialOnly.tax).toBeGreaterThan(0);
    expect(specialOnly.rebateUsed).toBe(0);

    // fin-8je: default changed to cbdtConservative (CBDT-conservative §87A policy)
    expect(BASE.section87AInterpretation).toBe("cbdtConservative");
    const defaultMixed = investmentTaxProfile(retiree, { normalIncome: 1200000, equityLtcg: 0, equityStcg: 100000, listedBondLtcg: 0 });
    // 12L+1L = 13L aggregate > 12L threshold → no rebate even under CBDT-conservative
    expect(defaultMixed.rebateUsed).toBe(0);
    expect(defaultMixed.rebateInterpretation).toBe("cbdtConservative");

    const mixed = investmentTaxProfile(retiree, { normalIncome: 1200000, equityLtcg: 500000, equityStcg: 0, listedBondLtcg: 0 });
    expect(mixed.normalTax).toBeGreaterThan(0);
    expect(mixed.equityLtcgTax).toBeGreaterThan(0);
    expect(mixed.ltcgExemptionUsed).toBe(125000);
    expect(mixed.mixedIncomeCaveat).toContain("disabled by default");
    const normalOnly = investmentTaxProfile({ ...retiree, section87AInterpretation: "normalOnly" }, { normalIncome: 1200000, equityLtcg: 500000, equityStcg: 0, listedBondLtcg: 0 });
    expect(normalOnly.normalTax).toBe(0);

    const otherIncome = investmentTaxProfile({ ...retiree, otherIncome: 1000000 }, { ...emptyTaxStreams(), normalIncome: 300000 });
    expect(otherIncome.tax).toBeGreaterThan(0);
    expect(taxRegimeLabel(retiree)).toBe("New regime");
    expect(taxRegimeLabel({ ...retiree, taxRegime: "old" })).toBe("Old regime");
    expect(ageBandLabel("senior")).toBe("60-79");
    expect(ageBandLabel("superSenior")).toBe("80+");
    expect(ageBandLabel("unexpected")).toBe("Below 60");
    expect(taxProfileLabel(retiree)).toContain("resident");
    expect(taxProfileLabel({ ...retiree, residentStatus: "nonResident" })).toContain("non-resident");
    expect(taxProfileLabel({ taxProfileMode: "flat" })).toContain("Flat");
  });

  it("auto-defaults standard deduction by regime while preserving custom overrides", () => {
    const newAuto = calculateTaxProfile({ ...BASE, pensionIncome: 900000, standardDeductionMode: "auto", taxRegime: "new", section87A: 0, includeCess: 0 }, emptyTaxStreams());
    expect(newAuto.standardDeductionLimit).toBe(75000);
    expect(newAuto.standardDeductionUsed).toBe(75000);
    expect(newAuto.normalTaxableIncome).toBe(825000);

    const oldAuto = calculateTaxProfile({ ...BASE, pensionIncome: 900000, standardDeductionMode: "auto", taxRegime: "old", section87A: 0, includeCess: 0 }, emptyTaxStreams());
    expect(oldAuto.standardDeductionLimit).toBe(50000);
    expect(oldAuto.standardDeductionUsed).toBe(50000);

    const custom = calculateTaxProfile({ ...BASE, pensionIncome: 900000, standardDeductionMode: "custom", standardDeduction: 25000, section87A: 0, includeCess: 0 }, emptyTaxStreams());
    expect(custom.standardDeductionLimit).toBe(25000);
    expect(custom.standardDeductionUsed).toBe(25000);
    expect(standardDeductionLimit({ ...BASE, standardDeductionMode: "custom", standardDeduction: 0 })).toBe(0);
  });

  it("classifies income streams for slab and special-rate taxation", () => {
    expect(streamsForInstrument("fdInterest", 0)).toEqual(emptyTaxStreams());
    expect(streamsForInstrument("equityTaxFree", 1000)).toEqual(emptyTaxStreams());
    expect(streamsForInstrument("fdInterest", 1000).normalIncome).toBe(1000);
    expect(streamsForInstrument("debtMfSlab", 1000).normalIncome).toBe(1000);
    expect(streamsForInstrument("equityLtcg", 1000, null).equityStcg).toBe(1000);
    expect(streamsForInstrument("equityLtcg", 1000, 24).equityLtcg).toBe(1000);
    expect(streamsForInstrument("equityLtcg", 1000, 6).equityStcg).toBe(1000);
    expect(streamsForInstrument("listedBondLtcg", 1000, null).normalIncome).toBe(1000);
    expect(streamsForInstrument("listedBondLtcg", 1000, 24).listedBondLtcg).toBe(1000);
    expect(streamsForInstrument("listedBondLtcg", 1000, 6).normalIncome).toBe(1000);
    expect(streamsForInstrument("unknown", 1000).normalIncome).toBe(1000);
    expect(addTaxStreams({ normalIncome: 100 }, { equityStcg: 50 })).toMatchObject({ normalIncome: 100, equityStcg: 50 });
    expect(calculateTaxProfile({ ...BASE, taxProfileMode: "flat" }, { ...emptyTaxStreams(), normalIncome: 100000 }).totalTax).toBeGreaterThan(0);
  });

  it("uses product facts, acquisition year, and 87A interpretation for retirement tax planning", () => {
    const equityOld = { ...BASE, equityAcquisitionYear: 2020, equitySttPaid: 1 };
    expect(productClassForInstrument("equityLtcg", equityOld)).toBe("equityMfEtf");
    expect(holdingMonthsForInstrument("equityLtcg", undefined, equityOld)).toBe(72);
    expect(streamsForInstrument("equityLtcg", 1000, undefined, equityOld).equityLtcg).toBe(1000);
    expect(streamsForInstrument("equityLtcg", 1000, undefined, { ...equityOld, equitySttPaid: 0 }).normalIncome).toBe(1000);

    const debtPost = { ...BASE, debtProductClass: "debtMfPost2023", debtAcquisitionYear: 2024 };
    expect(productClassForInstrument("debtMfSlab", debtPost)).toBe("debtMfPost2023");
    expect(streamsForInstrument("debtMfSlab", 1000, undefined, debtPost).normalIncome).toBe(1000);
    const debtOld = { ...BASE, debtProductClass: "debtMfGrandfathered", debtAcquisitionYear: 2020 };
    expect(streamsForInstrument("debtMfSlab", 1000, undefined, debtOld).listedBondLtcg).toBe(1000);
    expect(productClassLabel("listedBondDebtEtf")).toContain("Listed bond");

    const aggregate = calculateTaxProfile({ ...BASE, section87AInterpretation: "aggregateThreshold" }, { ...emptyTaxStreams(), normalIncome: 1200000, equityStcg: 100000 });
    expect(aggregate.rebateUsed).toBeLessThan(60000);
    const offWhenMixed = calculateTaxProfile({ ...BASE, section87AInterpretation: "offForSpecialMix" }, { ...emptyTaxStreams(), normalIncome: 1200000, equityStcg: 100000 });
    expect(offWhenMixed.rebateUsed).toBe(0);
  });

  it("derives household cash need, reserves, lump sums, and product-rule branches", () => {
    const householdState = normalizeState({
      ...BASE,
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 180000,
      discretionaryMonthlyExpense: 60000,
      spouseMonthlyNeed: 40000,
      dependantMonthlySupport: 25000,
      dependantSupportYears: 2,
      pensionMonthlyIncome: 50000,
      rentMonthlyIncome: 25000,
      pmvvyMonthlyIncome: 10000,
      healthcareReserve: 2500000,
      emergencyMonths: 10,
      plannedLumpSumAmount: 1200000,
      plannedLumpSumYear: 3,
      plannedLumpSumInflate: 0,
      longevityYears: 35,
      contingencyYears: 4,
      legacyCorpusGoal: 50000000
    });
    const profile = householdPlanProfile(householdState);
    expect(profile.useHouseholdPlan).toBe(true);
    expect(profile.incomes.pmvvy).toBe(10000);
    expect(profile.monthlyCashNeed).toBe(220000);
    expect(profile.monthlyNeedAfterDependants).toBe(195000);
    expect(profile.targetCorpusToday).toBeGreaterThan(50000000);
    const projected = projectionParamsFromState(householdState);
    expect(projected.years).toBe(39);
    expect(projected.monthlyTarget).toBe(220000);
    expect(targetAnnualCashForYear(projected, 1, 1)).toBe(2640000);
    expect(targetAnnualCashForYear(projected, 3, 1)).toBe(3540000);
    expect(targetAnnualCashForYear({ ...projected, sequenceYearOffset: 2 }, 1, 1)).toBe(3540000);
    expect(calculateInterestPlan({ ...projected, years: 3 }).rows[3].targetCash).toBeGreaterThan(calculateInterestPlan({ ...projected, years: 3 }).rows[1].targetCash);

    const customDebtLaw = sanitizeTaxLaw({
      ...DEFAULT_TAX_LAW,
      productTaxRules: {
        debtMfGrandfathered: { bucket: "debt", longTermMonths: 24, longTermStream: "equityLtcg", shortTermStream: "equityStcg" },
        ignored: null,
        broken: "bad"
      }
    });
    const customState = { ...BASE, debtProductClass: "debtMfGrandfathered", taxLawJson: formatTaxLawJson(customDebtLaw) };
    expect(streamsForInstrument("debtMfSlab", 1000, 30, customState).equityLtcg).toBe(1000);
    expect(streamsForInstrument("debtMfSlab", 1000, 12, customState).equityStcg).toBe(1000);
    expect(capitalGainTaxRate("equityLtcg", 24, { ...BASE, equitySttPaid: 0 })).toBeCloseTo(0.312);
    expect(capitalGainTaxRate("debtMfSlab", 30, customState)).toBeCloseTo(0.13);
  });

  it("covers old-regime, non-resident, override, flat, and marginal-relief tax branches", () => {
    const oldSenior = { ...BASE, taxProfileMode: "retiree", taxRegime: "old", ageBand: "senior", residentStatus: "resident", section87A: 1 };
    expect(basicExemptionLimit(oldSenior)).toBe(300000);
    expect(slabTaxBeforeCess(300000, oldSenior)).toBe(0);
    expect(applySection87A(10000, 450000, oldSenior)).toBe(0);
    expect(applySection87A(20000, 600000, oldSenior)).toBe(20000);
    expect(basicExemptionLimit({ ...oldSenior, ageBand: "superSenior" })).toBe(500000);
    const oldSeniorInterest = calculateTaxProfile({ ...oldSenior, section87A: 0, otherIncome: 450000 }, streamsForInstrument("fdInterest", 60000));
    expect(oldSeniorInterest.section80TTBUsed).toBe(50000);
    expect(oldSeniorInterest.normalTaxableIncome).toBe(460000);
    expect(oldSeniorInterest.normalTaxBeforeRebate).toBe(8000);
    const oldSeniorDebtFund = calculateTaxProfile({ ...oldSenior, section87A: 0, otherIncome: 450000 }, streamsForInstrument("debtMfSlab", 60000, 999, { ...BASE, debtProductClass: "debtMfPost2023" }));
    expect(oldSeniorDebtFund.section80TTBUsed).toBe(0);

    const nonResident = calculateTaxProfile({ ...BASE, residentStatus: "nonResident" }, { ...emptyTaxStreams(), normalIncome: 1200000 });
    expect(nonResident.rebateUsed).toBe(0);
    expect(nonResident.totalTax).toBeGreaterThan(0);

    const marginal = calculateTaxProfile({ ...BASE, otherIncome: 0 }, { ...emptyTaxStreams(), normalIncome: 1210000 });
    expect(marginal.normalTaxAfterRebate).toBeLessThan(marginal.normalTaxBeforeRebate);

    const override = calculateTaxProfile({ ...BASE, taxRate: 7 }, { normalIncome: 100000, equityLtcg: 100000, equityStcg: 100000, listedBondLtcg: 100000 });
    approx(override.totalTax, 28000, 0.01);
    expect(taxProfileLabel({ ...BASE, taxRate: 7 })).toContain("Manual");
    expect(taxRuleLabel("equityStcg", { ...BASE, taxRate: 7 })).toContain("Manual");

    const flatNoHarvest = calculateTaxProfile({ ...BASE, taxProfileMode: "flat", harvestLtcg: 0 }, { ...emptyTaxStreams(), equityLtcg: 200000 });
    expect(flatNoHarvest.ltcgExemptionUsed).toBe(0);
    expect(taxProfileLabel({ ...BASE, taxProfileMode: "flat" })).toContain("Flat");
  });

  it("classifies capital gains by holding period", () => {
    approx(capitalGainTaxRate("equityLtcg", 13, BASE), 0.13);
    approx(capitalGainTaxRate("equityLtcg", 6, BASE), 0.208);
    approx(capitalGainTaxRate("equityStcg", 6, BASE), 0.208);
    approx(capitalGainTaxRate("listedBondLtcg", 13, BASE), 0.13);
    approx(capitalGainTaxRate("listedBondLtcg", 6, BASE), 0.312);
    approx(capitalGainTaxRate("equityTaxFree", 1, BASE), 0);
    approx(capitalGainTaxRate("fdInterest", undefined, {}), 0);
    approx(capitalGainTaxRate("debtMfSlab", 36, BASE), 0.312);
    approx(capitalGainTaxRate("debtMfSlab", 36, { ...BASE, taxRate: 7 }), 0.07);
    approx(capitalGainTaxRate("unknown", 36, BASE), 0.312);
  });
});

describe("projection engines", () => {
  const expectAnnualAccountingIdentity = (row, tolerance = 5) => {
    const expectedClosing = Math.max(0, row.opening + row.interest + row.contribution - row.withdrawal - row.tax - row.shock);
    approx(row.closing, expectedClosing, tolerance);
  };

  it("projects the workbook interest scenario with stable annual rows", () => {
    const model = calculateInterestPlan(modelParams());
    expect(model.rows).toHaveLength(BASE.years + 1);
    expect(model.monthlyRows).toHaveLength(0);
    expect(model.final.closing).toBeGreaterThan(BASE.principal);
    expect(model.final.cumTax).toBeGreaterThan(0);
    expect(model.final.realClosing).toBeLessThan(model.final.closing);
    expect(model.taxLotMethod).toBe("Annual estimate");
  });

  it("deducts reported tax from corpus across interest, SWP, and IDCW engines", () => {
    const common = {
      principal: 30000000,
      years: 3,
      inflation: 6,
      cashMode: "monthlyTarget",
      monthlyTarget: 75000,
      taxRate: 10,
      annualContribution: 0,
      shockYear: 0,
      shockDrop: 0,
      allowPrincipalDrawdown: 1
    };
    const interest = calculateInterestPlan(modelParams({
      ...common,
      incomeMode: "interest",
      useAssetReturns: 0,
      annualRate: 12,
      portfolioIncomeYield: 12
    }));
    const swp = calculateSwpPlan(modelParams({
      ...common,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 12,
      debtReturn: 8,
      costBasisPct: 70
    }));
    const idcw = calculateIdcwPlan(modelParams({
      ...common,
      incomeMode: "idcw",
      useAssetReturns: 0,
      annualRate: 10,
      idcwYield: 8
    }));

    expect(interest.rows[1].tax).toBeGreaterThan(0);
    expect(swp.rows[1].tax).toBeGreaterThanOrEqual(0);
    expect(idcw.rows[1].tax).toBeGreaterThan(0);
    [interest, swp, idcw].forEach((projection) => {
      projection.rows.slice(1).forEach((row) => expectAnnualAccountingIdentity(row));
    });
  });

  it("separates income yield from unrealised growth in interest mode", () => {
    const deferred = calculateInterestPlan(modelParams({
      useAssetReturns: 1,
      equityShare: 80,
      equityReturn: 14,
      debtReturn: 8,
      equityIncomeYield: 0,
      debtIncomeYield: 2,
      cashMode: "interestPercent",
      withdrawRate: 100,
      years: 1
    }));
    const fullyIncome = calculateInterestPlan(modelParams({
      useAssetReturns: 1,
      equityShare: 80,
      equityReturn: 14,
      debtReturn: 8,
      equityIncomeYield: 14,
      debtIncomeYield: 8,
      equityIncomePolicy: "available",
      debtIncomePolicy: "available",
      cashMode: "interestPercent",
      withdrawRate: 100,
      years: 1
    }));
    expect(deferred.rows[1].unrealizedGrowth).toBeGreaterThan(0);
    expect(deferred.final.cumTax).toBeLessThan(fullyIncome.final.cumTax);
    expect(deferred.final.cumWithdrawals).toBeLessThan(fullyIncome.final.cumWithdrawals);
  });

  it("lets each asset bucket decide whether income is spendable or reinvested", () => {
    const base = {
      principal: 10000000,
      years: 1,
      useAssetReturns: 1,
      equityShare: 50,
      equityReturn: 8,
      debtReturn: 8,
      equityIncomeYield: 4,
      debtIncomeYield: 4,
      cashMode: "interestPercent",
      withdrawRate: 100
    };
    const available = calculateInterestPlan(modelParams({ ...base, equityIncomePolicy: "available", debtIncomePolicy: "available" }));
    const reinvested = calculateInterestPlan(modelParams({ ...base, equityIncomePolicy: "reinvest", debtIncomePolicy: "reinvest" }));
    const tax = yearlyTax(base.principal, modelParams({ ...base, equityIncomePolicy: "reinvest", debtIncomePolicy: "available" }));
    expect(available.rows[1].withdrawal).toBeGreaterThan(reinvested.rows[1].withdrawal);
    expect(tax.spendableIncome).toBeLessThan(tax.realizedIncome);
    expect(tax.reinvestOnlyIncome).toBeGreaterThan(0);
  });

  it("supports monthly target depletion as an explicit model state", () => {
    const params = modelParams({
      principal: 17500000,
      targetCorpus: 35000000,
      monthlyTarget: 150000,
      years: 20,
      incomeMode: "swp",
      cashMode: "monthlyTarget"
    });
    const model = calculate(params);
    expect(model.final.closing).toBe(0);
    expect(model.rows.some((row) => (row.withdrawalShortfall || 0) > 0)).toBe(true);
    expect(model.monthlyRows.length).toBe(240);
  });

  it("makes monthly cash a projection driver in monthly-target mode", () => {
    const monthlyTargets = [5000, 50000, 150000];
    const runs = monthlyTargets.map((monthlyTarget) => {
      const params = modelParams({
        principal: 30000000,
        targetCorpus: 30000000,
        monthlyTarget,
        years: 30,
        inflation: 6,
        withdrawRate: 50,
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        monteCarloSamples: 32
      });
      const model = calculate(params);
      const risk = calculateMonteCarlo(params, 32);
      return { monthlyTarget, params, model, risk };
    });

    runs.forEach(({ monthlyTarget, params, model }) => {
      expect(params.monthlyTarget).toBe(monthlyTarget);
      expect(targetAnnualCashForYear(params, 1, 1)).toBe(monthlyTarget * 12);
      expect(model.monthlyRows.length).toBe(360);
      expect(Number.isFinite(model.final.closing)).toBe(true);
      expect(Number.isFinite(model.final.cumWithdrawals)).toBe(true);
      expect(Number.isFinite(model.final.realClosing)).toBe(true);
      expect(Number.isFinite(model.final.withdrawal / 12)).toBe(true);
    });

    expect(runs[0].model.final.closing).toBeGreaterThan(runs[1].model.final.closing);
    expect(runs[1].model.final.closing).toBeGreaterThan(runs[2].model.final.closing);
    expect(runs[0].model.final.realClosing).toBeGreaterThan(runs[1].model.final.realClosing);
    expect(runs[1].model.final.realClosing).toBeGreaterThan(runs[2].model.final.realClosing);
    expect(runs[0].model.final.cumWithdrawals).toBeLessThan(runs[1].model.final.cumWithdrawals);
    expect(runs[1].model.final.cumWithdrawals).toBeLessThan(runs[2].model.final.cumWithdrawals);
    expect(runs[0].risk.successProbability).toBeGreaterThanOrEqual(runs[1].risk.successProbability);
    expect(runs[1].risk.successProbability).toBeGreaterThanOrEqual(runs[2].risk.successProbability);
  }, 12000);

  it("keeps percent-of-income mode explicitly independent of monthly cash target", () => {
    const monthlyTargets = [5000, 50000, 150000];
    const runs = monthlyTargets.map((monthlyTarget) => {
      const params = modelParams({
        principal: 30000000,
        targetCorpus: 30000000,
        monthlyTarget,
        years: 18,
        inflation: 6,
        withdrawRate: 50,
        incomeMode: "swp",
        cashMode: "interestPercent",
        monteCarloSamples: 8
      });
      return {
        params,
        model: calculate(params),
        risk: calculateMonteCarlo(params, 8),
        corpusNeeded: solveCorpusForMonthlyCash(params),
        interestShare: withdrawalShareNeeded(params)
      };
    });

    runs.slice(1).forEach((run) => {
      approx(run.model.final.closing, runs[0].model.final.closing, 1);
      approx(run.model.final.cumWithdrawals, runs[0].model.final.cumWithdrawals, 1);
      approx(run.model.final.realClosing, runs[0].model.final.realClosing, 1);
      approx(run.model.final.withdrawal, runs[0].model.final.withdrawal, 1);
      approx(run.risk.successProbability, runs[0].risk.successProbability, 1e-12);
    });

    expect(runs[0].corpusNeeded).toBeLessThan(runs[1].corpusNeeded);
    expect(runs[1].corpusNeeded).toBeLessThan(runs[2].corpusNeeded);
    expect(runs[0].interestShare).toBeLessThan(runs[1].interestShare);
    expect(runs[1].interestShare).toBeLessThan(runs[2].interestShare);
  }, 30000);

  it("keeps a cross-parameter reconciliation contract for major projection drivers", () => {
    const base = reconciliationSnapshot();
    const riskBase = reconciliationSnapshot({}, 16);
    const cases = [
      { label: "principal", patch: { principal: 40000000 }, changed: ["finalCorpus", "cashWithdrawn", "realFinalValue", "taxDrag", "p50"], risk: true },
      { label: "monthly target", patch: { monthlyTarget: 150000 }, changed: ["finalCorpus", "cashWithdrawn", "realFinalValue", "finalMonthlyCash", "taxDrag"] },
      { label: "target corpus", patch: { targetCorpus: 100000000 }, changed: ["targetCorpus", "successProbability"], stable: ["finalCorpus", "cashWithdrawn"], risk: true },
      { label: "horizon", patch: { years: 20 }, changed: ["finalCorpus", "cashWithdrawn", "realFinalValue", "rowCount", "monthlyRowCount", "targetCorpus"] },
      { label: "inflation", patch: { inflation: 7 }, changed: ["realFinalValue", "targetCorpus", "finalMonthlyCash"] },
      { label: "cash engine", patch: { incomeMode: "interest" }, changed: ["finalCorpus", "cashWithdrawn", "realFinalValue", "monthlyRowCount", "taxDrag"] },
      { label: "asset blend", patch: { equityShare: 30, equityReturn: 10, debtReturn: 7 }, changed: ["finalCorpus", "cashWithdrawn", "realFinalValue", "taxDrag"] },
      { label: "tax override", patch: { taxRate: 20 }, changed: ["finalCorpus", "cashWithdrawn", "realFinalValue", "taxDrag"] },
      { label: "top-up", patch: { annualContribution: 300000, contributionStepUp: 5 }, changed: ["finalCorpus", "realFinalValue"] },
      { label: "deterministic shock", patch: { shockYear: 1, shockDrop: 25 }, changed: ["finalCorpus", "realFinalValue", "p90"], risk: true }
    ];

    cases.forEach((item) => {
      const before = item.risk ? riskBase : base;
      const next = reconciliationSnapshot(item.patch, item.risk ? 16 : 0);
      item.changed.forEach((key) => expectSurfaceChanged(before, next, key, key === "successProbability" ? 0.001 : 1));
      (item.stable || []).forEach((key) => expectSurfaceStable(before, next, key, 1));
      Object.entries(next.surface).forEach(([key, value]) => {
        expect(Number.isFinite(value), `${item.label} produced non-finite ${key}`).toBe(true);
      });
    });

    expect(solveCorpusForMonthlyCash(base.params)).toBeLessThan(solveCorpusForMonthlyCash(reconciliationSnapshot({ monthlyTarget: 150000 }).params));
    expect(solveCorpusForMonthlyCash(base.params)).not.toBe(solveCorpusForMonthlyCash(reconciliationSnapshot({ inflation: 7 }).params));
  }, 40000);

  it("documents intentional independence contracts for benchmarks and risk-only controls", () => {
    const percentBase = reconciliationSnapshot({ cashMode: "interestPercent", monthlyTarget: 5000 });
    const percentHigherTarget = reconciliationSnapshot({ cashMode: "interestPercent", monthlyTarget: 150000 });
    ["finalCorpus", "cashWithdrawn", "realFinalValue", "finalMonthlyCash", "taxDrag", "successProbability"].forEach((key) => {
      expectSurfaceStable(percentBase, percentHigherTarget, key, key === "successProbability" ? 1e-12 : 1);
    });
    expect(solveCorpusForMonthlyCash(percentBase.params)).toBeLessThan(solveCorpusForMonthlyCash(percentHigherTarget.params));

    const riskBase = reconciliationSnapshot({ principal: 120000000, monthlyTarget: 50000, targetCorpus: 30000000, equityVolatility: 8, debtVolatility: 3, monteCarloSeed: 101 }, 24);
    const riskOnly = reconciliationSnapshot({ principal: 120000000, monthlyTarget: 50000, targetCorpus: 30000000, equityVolatility: 35, debtVolatility: 12, monteCarloSeed: 101 }, 24);
    ["finalCorpus", "cashWithdrawn", "realFinalValue", "taxDrag"].forEach((key) => expectSurfaceStable(riskBase, riskOnly, key, 1));
    expectSurfaceChanged(riskBase, riskOnly, "p10", 1);
  }, 30000);

  it("flows household-derived cash, corpus, and horizon through model and planning guidance", () => {
    const state = reconciliationState({
      useHouseholdPlan: 1,
      monthlyTarget: 50000,
      principal: 40000000,
      targetCorpus: 30000000,
      essentialMonthlyExpense: 200000,
      discretionaryMonthlyExpense: 80000,
      spouseMonthlyNeed: 30000,
      dependantMonthlySupport: 40000,
      dependantSupportYears: 5,
      pensionMonthlyIncome: 60000,
      healthcareReserve: 2000000,
      emergencyMonths: 18,
      longevityYears: 32,
      contingencyYears: 6,
      plannedLumpSumAmount: 1000000,
      plannedLumpSumYear: 4
    });
    const params = projectionParamsFromState(state);
    const model = calculate(params);
    const expectedMonthly = 200000 + 80000 + 30000 + 40000 - 60000;
    const expectedTargetToday = Math.max(state.targetCorpus, state.legacyCorpusGoal) + (200000 + 30000) * 18 + state.healthcareReserve;
    expect(params.monthlyTarget).toBe(expectedMonthly);
    expect(params.monthlyTarget).not.toBe(state.monthlyTarget);
    expect(params.years).toBe(38);
    expect(params.targetCorpus).toBeCloseTo(expectedTargetToday * Math.pow(1.06, 38), 1);
    expect(model.rows).toHaveLength(39);
    expect(targetAnnualCashForYear(params, 1, 1.06)).toBeCloseTo(expectedMonthly * 12 * 1.06, 1);

    const policy = buildWithdrawalPolicy(state, { household: params.householdProfile, best: { debtMonths: 36 }, profile: { requestedReserveMonths: 24 } });
    expect(policy.withdrawalRate).toBeCloseTo((expectedMonthly * 12) / state.principal, 6);
    const guided = buildRetireeGuidedPlan(state, { household: params.householdProfile, policy, maxMonthlyCash: expectedMonthly * 1.2 });
    expect(guided.targetMonthly).toBe(expectedMonthly);
    const audit = buildAssumptionAudit(state, { household: params.householdProfile, effectiveYears: params.years, taxLawStatus: { ok: true } });
    expect(audit.assumptions.find((item) => item.label === "Household")?.value).toBe("Budget-linked");
  });

  it("keeps strategy scoring and scenario patches on effective household values", () => {
    const state = reconciliationState({
      useHouseholdPlan: 1,
      monthlyTarget: 50000,
      principal: 40000000,
      targetCorpus: 30000000,
      essentialMonthlyExpense: 200000,
      discretionaryMonthlyExpense: 80000,
      spouseMonthlyNeed: 30000,
      dependantMonthlySupport: 40000,
      dependantSupportYears: 5,
      pensionMonthlyIncome: 60000,
      healthcareReserve: 2000000,
      emergencyMonths: 18,
      longevityYears: 32,
      contingencyYears: 6,
      legacyPriority: "high"
    });
    const baseParams = projectionParamsFromState(state);
    const profile = retirementPlanningProfile(state);
    const optimum = generateOptimumStrategies(state);
    expect(optimum.strategies.length).toBeGreaterThan(0);
    optimum.strategies.forEach((strategy) => {
      const params = projectionParamsFromState(strategy.state);
      expect(params.householdProfile.targetCorpusToday).toBeCloseTo(profile.realTarget, 1);
      expect(strategy.cashCoveredYears).toBeLessThanOrEqual(params.years);
    });

    const higherIncome = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "higher-income"), state);
    expect(projectionParamsFromState(higherIncome).monthlyTarget).toBeGreaterThan(baseParams.monthlyTarget);

    const medical = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "medical-reserve-shock"), state);
    const medicalParams = projectionParamsFromState(medical);
    expect(medicalParams.householdProfile.useHouseholdPlan).toBe(true);
    expect(medicalParams.monthlyTarget).toBeGreaterThan(0);
    expect(medicalParams.householdProfile.healthcareReserve).toBeGreaterThanOrEqual(2500000);

    const spouse = stateForScenarioLibraryItem(STANDARD_SCENARIO_LIBRARY.find((item) => item.id === "spouse-longevity"), state);
    const spouseParams = projectionParamsFromState(spouse);
    expect(spouseParams.years).toBeGreaterThanOrEqual(baseParams.years);
    expect(spouseParams.householdProfile.targetCorpusToday).toBeGreaterThanOrEqual(baseParams.householdProfile.targetCorpusToday);
  });

  it("changes fingerprints when editable tax-law body changes without metadata changes", () => {
    const law = sanitizeTaxLaw(DEFAULT_TAX_LAW);
    const changedLaw = sanitizeTaxLaw({
      ...law,
      specialRates: { ...law.specialRates, equityLtcg: Number(law.specialRates.equityLtcg) + 1 }
    });
    expect(changedLaw.version).toBe(law.version);
    expect(changedLaw.updatedOn).toBe(law.updatedOn);
    expect(planFingerprint(reconciliationState(), changedLaw)).not.toBe(planFingerprint(reconciliationState(), law));
  });

  it("runs SWP as monthly FIFO and taxes only realised gains", () => {
    const highBasis = calculate(modelParams({ incomeMode: "swp", cashMode: "interestPercent", costBasisPct: 100, years: 10 }));
    const lowBasis = calculate(modelParams({ incomeMode: "swp", cashMode: "interestPercent", costBasisPct: 25, years: 10 }));
    expect(highBasis.monthlyRows.length).toBe(120);
    expect(highBasis.taxLotMethod).toBe("Monthly FIFO");
    expect(highBasis.final.cumTax).toBeLessThan(lowBasis.final.cumTax);
    expect(highBasis.rows.some((row) => row.capitalRecovered > 0)).toBe(true);
    expect(lowBasis.rows.some((row) => row.realizedGain > 0)).toBe(true);
  });

  it("keeps a fast annual guidance path available beside exact SWP", () => {
    const swp = modelParams({ incomeMode: "swp", cashMode: "monthlyTarget", monthlyTarget: 150000, years: 20 });
    const exact = calculate(swp);
    const guidance = calculateGuidancePlan(swp);
    expect(exact.taxLotMethod).toBe("Monthly FIFO");
    expect(guidance.taxLotMethod).toBe("Annual estimate");
    expect(guidance.rows).toHaveLength(exact.rows.length);
    expect(Number.isFinite(guidance.final.closing)).toBe(true);
    expect(calculateGuidancePlan(modelParams({ incomeMode: "interest", years: 2 })).taxLotMethod).toBe("Annual estimate");
  });

  it("compares SWP redemption order tax outcomes", () => {
    const proRata = calculate(modelParams({ incomeMode: "swp", withdrawalPriority: "proRata", years: 12 }));
    const debtFirst = calculate(modelParams({ incomeMode: "swp", withdrawalPriority: "debtFirst", years: 12 }));
    const equityFirst = calculate(modelParams({ incomeMode: "swp", withdrawalPriority: "equityFirst", years: 12 }));
    expect([proRata, debtFirst, equityFirst].every((m) => Number.isFinite(m.final.closing))).toBe(true);
    expect(new Set([proRata.final.cumTax, debtFirst.final.cumTax, equityFirst.final.cumTax]).size).toBeGreaterThan(1);
  });

  it("projects IDCW as taxable distribution income with NAV drag", () => {
    const model = calculateIdcwPlan(modelParams({ incomeMode: "idcw", idcwYield: 6, years: 12 }));
    expect(model.rows).toHaveLength(13);
    expect(model.final.cumTax).toBeGreaterThan(0);
    expect(model.final.cumWithdrawals).toBeGreaterThan(0);
    expect(model.taxLotMethod).toBe("Annual estimate");
    const target = calculateIdcwPlan(modelParams({ incomeMode: "idcw", cashMode: "monthlyTarget", monthlyTarget: 100000, idcwYield: 6, years: 3 }));
    expect(target.final.cumWithdrawals).toBeGreaterThan(0);
    expect(target.rows.some((row) => row.rebateUsed >= 0)).toBe(true);
  });

  it("applies top-ups, step-up, shocks, and no-drawdown guardrails", () => {
    const withTopup = calculate(modelParams({ annualContribution: 100000, contributionStepUp: 10, shockYear: 3, shockDrop: 20, years: 5 }));
    expect(withTopup.rows[3].shock).toBeGreaterThan(0);
    expect(withTopup.final.cumContributions).toBeGreaterThan(500000);
    const noDrawdown = calculate(modelParams({ cashMode: "monthlyTarget", monthlyTarget: 1000000, allowPrincipalDrawdown: 0, years: 3 }));
    expect(noDrawdown.rows.every((row) => row.principalDrawdown === 0 || row.year === 0)).toBe(true);
    const swpShock = calculate(modelParams({ incomeMode: "swp", shockYear: 2, shockDrop: 15, years: 3 }));
    expect(swpShock.rows[2].shock).toBeGreaterThan(0);

    const swpTopup = calculateSwpPlan(modelParams({ incomeMode: "swp", annualContribution: 120000, contributionStepUp: 5, years: 2 }));
    expect(swpTopup.final.cumContributions).toBeGreaterThan(120000);
    expect(swpTopup.rows.some((row) => row.contribution > 0)).toBe(true);
  });

  it("keeps edge-case projection branches finite and explicit", () => {
    const zeroInterest = calculateInterestPlan(modelParams({ years: 0, principal: 0, annualRate: 0, useAssetReturns: 0, monthlyTarget: 0, targetCorpus: 0 }));
    expect(zeroInterest.rows).toHaveLength(1);
    expect(zeroInterest.requiredCorpus).toBe(0);
    expect(zeroInterest.avgAnnualCash).toBe(0);
    expect(zeroInterest.finalMultiple).toBe(0);

    const flatCash = calculateInterestPlan(modelParams({ cashMode: "monthlyTarget", inflateWithdrawals: 0, monthlyTarget: 50000, years: 2, allowPrincipalDrawdown: 1 }));
    expect(flatCash.rows[1].targetCash).toBe(600000);
    expect(flatCash.rows[1].principalDrawdown).toBeGreaterThanOrEqual(0);

    const rawInterest = calculateInterestPlan({ principal: 100000, years: 1, useAssetReturns: 0, annualRate: 0, compounding: 1, cashMode: "interestPercent" });
    expect(rawInterest.rows[1].targetCash).toBe(0);

    const manualSwp = calculateSwpPlan(modelParams({ incomeMode: "swp", useAssetReturns: 0, annualRate: 9, years: 2, cashMode: "interestPercent", allowPrincipalDrawdown: 0, withdrawRate: 100 }));
    expect(manualSwp.rows).toHaveLength(3);
    expect(manualSwp.rows.every((row) => (row.cashCoverage || 0) >= 0)).toBe(true);

    const noYearSwp = calculateSwpPlan(modelParams({ incomeMode: "swp", years: 0, principal: 0, monthlyTarget: 0, targetCorpus: 0 }));
    expect(noYearSwp.taxLotMethod).toBe("Annual estimate");

    const rawSwp = calculateSwpPlan({ principal: 100000, years: 1, useAssetReturns: 0, annualRate: 0, compounding: 1, cashMode: "interestPercent", monthlyTarget: 0, withdrawalPriority: "proRata", allowPrincipalDrawdown: 1 });
    expect(rawSwp.monthlyRows[0].cashCoverage).toBe(0);

    const zeroShockSwp = calculateSwpPlan(modelParams({ incomeMode: "swp", years: 1, principal: 0, shockYear: 1, shockDrop: 20 }));
    expect(zeroShockSwp.rows[1].shock).toBe(0);

    const idcwPercent = calculateIdcwPlan(modelParams({ incomeMode: "idcw", cashMode: "interestPercent", withdrawRate: 50, idcwYield: 5, inflateWithdrawals: 0, shockYear: 1, shockDrop: 10, years: 2 }));
    expect(idcwPercent.rows[1].shock).toBeGreaterThan(0);
    expect(idcwPercent.rows[1].cashCoverage).toBeGreaterThanOrEqual(0);

    const rawIdcw = calculateIdcwPlan({ principal: 100000, years: 1, annualRate: 0, useAssetReturns: 0, idcwYield: 0 });
    expect(rawIdcw.rows[1].cashCoverage).toBe(0);

    expect(calculate(modelParams({ incomeMode: "unknown", years: 1 })).taxLotMethod).toBe("Annual estimate");
    expect(calculate(modelParams({ incomeMode: "idcw", years: 1 })).taxLotMethod).toBe("Annual estimate");
  });
});

describe("solvers and risk engine", () => {
  it("solves corpus, return, top-up, and sustainable monthly cash", () => {
    const params = modelParams({ principal: 17500000, monthlyTarget: 150000, targetCorpus: 35000000, years: 20, incomeMode: "swp" });
    expect(solveCorpusForMonthlyCash(params)).toBeGreaterThan(params.principal);
    expect(solveReturnForMonthlyCash(params)).toBeGreaterThan(0);
    expect(solveMaxMonthlyCash(params)).toBeGreaterThan(0);
    expect(withdrawalShareNeeded(params)).toBeGreaterThan(0);
    expect(solveTopup(params)).toBeGreaterThanOrEqual(0);
    expect(solveReturn(params) === null || solveReturn(params) >= 0).toBe(true);
    const returnLoop = solveReturn(modelParams({ principal: 10000000, targetCorpus: 22000000, annualRate: 2, useAssetReturns: 0, years: 10, monthlyTarget: 0 }));
    expect(returnLoop).toBeGreaterThan(0.02);
    expect(returnLoop).toBeLessThan(0.40);
    expect(planCoversMonthlyCash({ ...params, principal: solveCorpusForMonthlyCash(params) * 1.01 })).toBe(true);
  }, 30000);

  it("keeps SWP monthly-target solvers consistent with exact cash coverage", () => {
    const state = normalizeState({
      ...BASE,
      principal: 17500000,
      targetCorpus: 17500000,
      monthlyTarget: 75000,
      years: 30,
      inflation: 6,
      withdrawRate: 50,
      incomeMode: "swp",
      cashMode: "monthlyTarget"
    });
    const exact = calculate(projectionParamsFromState(state));
    const maxMonthlyCash = solveMaxMonthlyCash(state);
    const hasShortfall = exact.rows.slice(1).some((row) => (row.withdrawalShortfall || 0) > 1 || (row.targetCash > 0 && (row.cashCoverage || 0) < 0.995));
    if (hasShortfall) {
      expect(maxMonthlyCash).toBeLessThanOrEqual(state.monthlyTarget + 1000);
    } else {
      expect(maxMonthlyCash).toBeGreaterThanOrEqual(state.monthlyTarget - 1000);
    }
  }, 12000);

  it("covers solver impossibility and zero-target branches", () => {
    const easy = modelParams({ principal: 50000000, targetCorpus: 1000000, monthlyTarget: 0, years: 1 });
    expect(solveTopup(easy)).toBe(0);
    expect(solveReturn(easy)).toBe(easy.annualRate / 100);
    expect(solveCorpusForMonthlyCash({ ...easy, monthlyTarget: 0 })).toBe(0);
    expect(solveReturnForMonthlyCash({ ...easy, monthlyTarget: 0 })).toBe(0);
    expect(withdrawalShareNeeded({ ...easy, principal: 0, annualRate: 0, useAssetReturns: 0 })).toBe(Infinity);

    const impossible = modelParams({ principal: 100000, targetCorpus: 1000000000, monthlyTarget: 5000000, years: 1, incomeMode: "swp" });
    expect(solveReturn(impossible)).toBeNull();
    expect(solveReturnForMonthlyCash(impossible)).toBeNull();
    expect(planCoversMonthlyCash({ ...impossible, principal: 0 })).toBe(false);
    expect(planCoversMonthlyCash({ ...easy, incomeMode: "interest", monthlyTarget: 1000 })).toBe(true);
    const needsTopup = modelParams({ principal: 1000000, targetCorpus: 2000000, monthlyTarget: 0, years: 10, useAssetReturns: 0, annualRate: 4 });
    expect(solveTopup(needsTopup)).toBeGreaterThan(0);
    expect(solveCorpusForMonthlyCash({ ...easy, principal: undefined, monthlyTarget: 1000 })).toBeGreaterThan(0);
    expect(solveCorpusForMonthlyCash({ ...impossible, years: 0 })).toBe(Infinity);
    expect(solveMaxMonthlyCash({ ...impossible, monthlyTarget: undefined })).toBeGreaterThanOrEqual(0);
    expect(solveTopup({ principal: 0, years: 1, targetCorpus: undefined, incomeMode: "interest", useAssetReturns: 0, annualRate: 0 })).toBeGreaterThanOrEqual(1000000);
  });

  it("makes household monthly cash solvers vary the effective cash need", () => {
    const rawHouseholdState = normalizeState({
      ...BASE,
      principal: 60000000,
      targetCorpus: 30000000,
      monthlyTarget: 50000,
      years: 18,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 180000,
      discretionaryMonthlyExpense: 70000,
      spouseMonthlyNeed: 30000,
      pensionMonthlyIncome: 40000,
      healthcareReserve: 1500000,
      emergencyMonths: 18,
      longevityYears: 18,
      contingencyYears: 0
    });
    const householdParams = projectionParamsFromState(rawHouseholdState);

    const coveredAtLowCash = planCoversMonthlyCash({ ...householdParams, monthlyCashOverride: 100000 });
    const coveredAtHighCash = planCoversMonthlyCash({ ...householdParams, monthlyCashOverride: 900000 });
    const maxCashFromProjection = solveMaxMonthlyCash(householdParams);
    const maxCashFromRawState = solveMaxMonthlyCash(rawHouseholdState);
    const corpusForHigherCash = solveCorpusForMonthlyCash({ ...householdParams, monthlyCashOverride: 300000 });
    const corpusForLowerCash = solveCorpusForMonthlyCash({ ...householdParams, monthlyCashOverride: 100000 });
    expect(coveredAtLowCash).toBe(true);
    expect(coveredAtHighCash).toBe(false);
    expect(maxCashFromProjection).toBeGreaterThan(householdParams.monthlyTarget);
    expect(maxCashFromProjection).toBeLessThan(900000);
    expect(corpusForHigherCash).toBeGreaterThan(corpusForLowerCash);
    expect(maxCashFromRawState).toBeCloseTo(maxCashFromProjection, -2);
    expect(maxCashFromRawState).toBeLessThan(900000);
  });

  it("makes Monte Carlo end-target chance responsive to target and return assumptions", () => {
    const riskState = { principal: 17500000, targetCorpus: 17500000, monthlyTarget: 75000, years: 16, incomeMode: "swp", cashMode: "interestPercent" };
    const params = modelParams(riskState);
    const base = calculateMonteCarlo(params, 12);
    const lowerTarget = calculateMonteCarlo(modelParams({ ...riskState, targetCorpus: 10000000 }), 12);
    const higherTarget = calculateMonteCarlo(modelParams({ ...riskState, targetCorpus: 50000000 }), 12);
    expect(base.finals).toHaveLength(12);
    expect(base.p10).toHaveLength(params.years + 1);
    expect(base.successCi95[0]).toBeLessThanOrEqual(base.successProbability);
    expect(base.successCi95[1]).toBeGreaterThanOrEqual(base.successProbability);
    expect(base.successMargin95).toBeGreaterThanOrEqual(0);
    expect(base.finalIqr).toBeGreaterThanOrEqual(0);
    expect(lowerTarget.successProbability).toBeGreaterThan(base.successProbability);
    expect(higherTarget.successProbability).toBeLessThan(lowerTarget.successProbability);
    const stronger = calculateMonteCarlo(modelParams({ ...riskState, equityReturn: 20, volatility: 1 }), 12);
    expect(stronger.successProbability).toBeGreaterThan(base.successProbability);
    expect(base.method).toContain("sequence-of-returns");
    const seeded = calculateMonteCarlo(modelParams({ ...riskState, monteCarloSamples: 12, monteCarloSeed: 77 }));
    expect(seeded.finals).toHaveLength(12);
    expect(seeded.seed).toBe(77);
    expect(seeded.method).toContain("12 fat-tail regime sequence");
    const fallbackRun = calculateMonteCarlo({ years: 0, targetCorpus: 0, principal: 0, monteCarloSamples: undefined, monteCarloSeed: undefined });
    expect(fallbackRun.finals).toHaveLength(1000);
    expect(fallbackRun.seed).toBe(24681357);
  });

  it("keeps asset-mode volatility controls active and honors explicit zero bucket volatility", () => {
    const riskState = {
      principal: 30000000,
      targetCorpus: 30000000,
      monthlyTarget: 75000,
      years: 20,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 14,
      debtReturn: 9,
      monteCarloSeed: 42
    };
    const lowGlobal = calculateMonteCarlo(modelParams({ ...riskState, volatility: 1, equityVolatility: 16, debtVolatility: 4 }), 32);
    const highGlobal = calculateMonteCarlo(modelParams({ ...riskState, volatility: 35, equityVolatility: 16, debtVolatility: 4 }), 32);
    expect(Math.abs(highGlobal.finalIqr - lowGlobal.finalIqr)).toBeGreaterThan(100000);

    const zeroBucketParams = modelParams({ ...riskState, volatility: 18, equityVolatility: 0, debtVolatility: 0, shockYear: 0, shockDrop: 0 });
    const exact = calculate(zeroBucketParams);
    const zeroRisk = calculateMonteCarlo(zeroBucketParams, 8);
    expect(zeroRisk.finalIqr).toBeLessThanOrEqual(1);
    zeroRisk.finals.forEach((finalValue) => approx(finalValue, exact.final.closing, 0.1));
  }, 12000);

  it("returns a top-up that satisfies the target even after late shocks", () => {
    const shockedSwp = modelParams({
      principal: 1000000,
      targetCorpus: 1000000,
      monthlyTarget: 1000000,
      years: 2,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      useAssetReturns: 0,
      annualRate: 8,
      shockYear: 2,
      shockDrop: 50
    });
    const swpTopup = solveTopup(shockedSwp);
    expect(Number.isFinite(swpTopup)).toBe(true);
    expect(calculate({ ...shockedSwp, annualContribution: swpTopup }).final.closing).toBeGreaterThanOrEqual(shockedSwp.targetCorpus - 10);

    const shockedInterest = modelParams({
      principal: 1000000,
      targetCorpus: 2500000,
      monthlyTarget: 0,
      years: 2,
      incomeMode: "interest",
      useAssetReturns: 0,
      annualRate: 4,
      shockYear: 2,
      shockDrop: 40
    });
    const interestTopup = solveTopup(shockedInterest);
    expect(Number.isFinite(interestTopup)).toBe(true);
    expect(calculate({ ...shockedInterest, annualContribution: interestTopup }).final.closing).toBeGreaterThanOrEqual(shockedInterest.targetCorpus - 10);
  });

  it("keeps zero-volatility sequence paths in parity with exact household SWP projections", () => {
    const state = reconciliationState({
      principal: 40000000,
      targetCorpus: 55000000,
      monthlyTarget: 50000,
      years: 20,
      inflation: 8,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 220000,
      discretionaryMonthlyExpense: 80000,
      spouseMonthlyNeed: 40000,
      dependantMonthlySupport: 30000,
      dependantSupportYears: 6,
      pensionMonthlyIncome: 50000,
      healthcareReserve: 2500000,
      emergencyMonths: 18,
      plannedLumpSumAmount: 1200000,
      plannedLumpSumYear: 4,
      plannedLumpSumInflate: 1,
      longevityYears: 26,
      contingencyYears: 4,
      equityVolatility: 0,
      debtVolatility: 0,
      volatility: 0,
      shockYear: 0,
      shockDrop: 0,
      monteCarloSamples: 12
    });
    const params = projectionParamsFromState(state);
    const exact = calculate(params);
    const sequence = calculateSequencePath(params, mulberry32(42));

    approx(sequence.final.closing, exact.final.closing, 0.1);
    approx(sequence.final.realClosing, exact.final.realClosing, 0.1);
    approx(sequence.final.cumTax, exact.final.cumTax, 0.1);
    approx(sequence.final.cumWithdrawals, exact.final.cumWithdrawals, 0.1);
    expect(sequence.monthlyRows.length).toBe(exact.monthlyRows.length);

    const miss = calculateMonteCarlo({ ...params, targetCorpus: exact.final.closing + 1000 }, 8);
    const hit = calculateMonteCarlo({ ...params, targetCorpus: Math.max(0, exact.final.closing - 1000) }, 8);
    expect(miss.successProbability).toBe(0);
    expect(hit.successProbability).toBe(1);
  }, 12000);

  it("keeps zero-volatility sequence paths in parity with exact SWP tax-lot state", () => {
    const params = modelParams({
      principal: 30000000,
      targetCorpus: 80000000,
      monthlyTarget: 150000,
      years: 30,
      inflation: 6,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      costBasisPct: 35,
      legacyHoldingYears: 4,
      harvestLtcg: 1,
      withdrawalPriority: "equityFirst",
      equityVolatility: 0,
      debtVolatility: 0,
      volatility: 0,
      shockYear: 0,
      shockDrop: 0,
      monteCarloSamples: 12
    });
    const exact = calculate(params);
    const sequence = calculateSequencePath(params, mulberry32(77));

    approx(sequence.final.closing, exact.final.closing, 0.1);
    approx(sequence.final.cumTax, exact.final.cumTax, 0.1);
    approx(sequence.final.cumWithdrawals, exact.final.cumWithdrawals, 0.1);
    approx(sequence.rows.reduce((sum, row) => sum + (row.capitalRecovered || 0), 0), exact.rows.reduce((sum, row) => sum + (row.capitalRecovered || 0), 0), 0.1);
    approx(sequence.rows.reduce((sum, row) => sum + (row.realizedGain || 0), 0), exact.rows.reduce((sum, row) => sum + (row.realizedGain || 0), 0), 0.1);
  }, 12000);

  it("applies sequence return overrides to manual-return paths without leaking malformed overrides", () => {
    const params = modelParams({
      useAssetReturns: 0,
      annualRate: 8,
      volatility: 0,
      years: 2,
      sequenceReturnOverrides: [{ annualRate: 3 }, { annualRate: 5 }]
    });

    expect(paramsForProjectionYear(params, 1).annualRate).toBe(3);
    expect(paramsForProjectionYear(params, 2).annualRate).toBe(5);
    expect(paramsForProjectionYear({ ...params, sequenceReturnOverrides: [null, {}] }, 1).annualRate).toBe(8);

    const exact = calculate({ ...params, annualRate: 3, sequenceReturnOverrides: undefined });
    const sequence = calculateSequencePath(params, mulberry32(91));
    expect(sequence.rows[1].interest).toBeGreaterThan(0);
    const baseWithoutOverrides = calculate({ ...params, sequenceReturnOverrides: undefined });
    expect(sequence.rows[1].interest).toBeLessThan(baseWithoutOverrides.rows[1].interest);
    approx(sequence.rows[1].interest, exact.rows[1].interest, 0.1);
  });

  it("applies SWP market shocks through NAV so embedded gains fall after drawdowns", () => {
    const params = modelParams({
      principal: 10000000,
      targetCorpus: 10000000,
      monthlyTarget: 100000,
      years: 2,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      useAssetReturns: 0,
      annualRate: 0,
      expenseRatio: 0,
      costBasisPct: 75,
      taxRate: 20,
      shockYear: 1,
      shockDrop: 50,
      harvestLtcg: 0
    });
    const shocked = calculate(params);
    expect(shocked.rows[1].realizedGain).toBeGreaterThan(0);
    expect(shocked.rows[2].realizedGain).toBeLessThan(1);
    expect(shocked.rows[2].tax).toBeLessThan(1);
  });

  it("exposes uncertainty that narrows with larger Monte Carlo samples", () => {
    const state = modelParams({
      principal: 17500000,
      targetCorpus: 17500000,
      monthlyTarget: 75000,
      years: 14,
      incomeMode: "swp",
      cashMode: "interestPercent",
      volatility: 14,
      monteCarloSeed: 9876
    });
    const small = calculateMonteCarlo(state, 16);
    const large = calculateMonteCarlo(state, 96);
    expect(large.successMargin95).toBeLessThanOrEqual(small.successMargin95 + 0.001);
    expect(large.simulations).toBe(96);
    expect(large.method).toContain("fat-tail regime");
  });

  it("supports fat-tail shocks and glide-path sequence simulations", () => {
    const state = modelParams({
      principal: 30000000,
      targetCorpus: 30000000,
      monthlyTarget: 120000,
      years: 20,
      incomeMode: "interest",
      cashMode: "interestPercent",
      useAssetReturns: 1,
      equityShare: 75,
      equityReturn: 12,
      debtReturn: 7,
      volatility: 12,
      monteCarloSeed: 333
    });
    const normal = calculateMonteCarlo({ ...state, shockModel: "normal" }, 80);
    const regime = calculateMonteCarlo({ ...state, shockModel: "regime" }, 80);
    expect(regime.p10.at(-1)).toBeLessThanOrEqual(normal.p10.at(-1));
    expect(regime.shockModel).toBe("regime");
    expect(Number.isFinite(fatTailSample(mulberry32(1)))).toBe(true);

    const fixed = calculateSequencePath({ ...state, shockModel: "normal", glidePathEnabled: 0 }, mulberry32(42));
    const glide = calculateSequencePath({ ...state, shockModel: "normal", glidePathEnabled: 1, glidePathEndEquity: 25, glidePathYears: 10 }, mulberry32(42));
    expect(equityShareForYear({ ...state, glidePathEnabled: 1, glidePathEndEquity: 25, glidePathYears: 10 }, 11)).toBeCloseTo(0.25);
    expect(paramsForProjectionYear({ ...state, glidePathEnabled: 1, glidePathEndEquity: 25, glidePathYears: 10 }, 6).equityShare).toBeLessThan(state.equityShare);
    expect(Math.abs(glide.final.closing - fixed.final.closing)).toBeGreaterThan(1000);
  }, 12000);

  it("uses active cash-engine sequence paths for SWP risk surfaces", () => {
    const state = modelParams({
      principal: 17500000,
      targetCorpus: 17500000,
      monthlyTarget: 150000,
      years: 12,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      volatility: 18
    });
    const path = calculateSequencePath(state, mulberry32(2026));
    expect(path.taxLotMethod).toBe("Monthly FIFO");
    expect(path.monthlyRows.length).toBeGreaterThan(0);
    const depleted = calculateSequencePath(modelParams({ ...state, principal: 100000, monthlyTarget: 500000, years: 4 }), mulberry32(3));
    expect(depleted.rows).toHaveLength(5);
    expect(depleted.rows.at(-1).closing).toBe(0);
    const flatNoInflation = calculateSequencePath(modelParams({ ...state, years: 2, inflateWithdrawals: 0, shockYear: 1, shockDrop: 10 }), mulberry32(4));
    expect(flatNoInflation.rows[1].shock).toBeGreaterThanOrEqual(0);
    const risk = calculateMonteCarlo(state, 24);
    expect(risk.p10[risk.p10.length - 1]).toBeLessThanOrEqual(risk.p90[risk.p90.length - 1]);
    expect(risk.successProbability).toBeGreaterThanOrEqual(0);
    expect(risk.successProbability).toBeLessThanOrEqual(1);
    const linkedShock = annualSequenceShock(modelParams({ useAssetReturns: 1, equityVolatility: 20, debtVolatility: 5, equityDebtCorrelation: 95 }), mulberry32(42));
    expect(Number.isFinite(linkedShock.equityShock)).toBe(true);
    expect(Number.isFinite(linkedShock.debtShock)).toBe(true);
    expect(linkedShock.model).toBe("regime");
    expect(sampledReturnParams(state, linkedShock).equityReturn).not.toBe(state.equityReturn);
    const manualShock = annualSequenceShock({ useAssetReturns: 0, volatility: 0 }, mulberry32(7));
    expect(manualShock).toMatchObject({ portfolioShock: 0, equityShock: 0, debtShock: 0, model: "regime" });
    approx(sampledReturnParams({ useAssetReturns: 0, annualRate: 10 }, { portfolioShock: 0.05 }).annualRate, 15);
    const fallbackShock = annualSequenceShock({ useAssetReturns: 1, volatility: 10, equityDebtCorrelation: 200, equityShare: 60 }, mulberry32(8));
    expect(Number.isFinite(fallbackShock.portfolioShock)).toBe(true);
    expect(calculateMonteCarlo({ ...state, monteCarloSamples: 0 }, 0).finals).toHaveLength(0);
  }, 12000);

  it("samples active manual or blended returns correctly", () => {
    const manual = sampledReturnParams({ ...BASE, useAssetReturns: 0, annualRate: 12 }, 0.03);
    expect(manual.annualRate).toBe(15);
    expect(sampledReturnParams({ useAssetReturns: 0 }, 0).annualRate).toBe(0);
    const blend = sampledReturnParams({ ...BASE, useAssetReturns: 1, equityReturn: 14, debtReturn: 9 }, 0.02);
    expect(blend.equityReturn).toBe(16);
    expect(blend.debtReturn).toBeCloseTo(9.7);
    expect(sampledReturnParams({ ...BASE, useAssetReturns: 0, annualRate: 90 }, 1).annualRate).toBe(85);
    expect(sampledReturnParams({ ...BASE, useAssetReturns: 1, equityReturn: -90, debtReturn: -40 }, -1).equityReturn).toBe(-85);
  });

  it("provides deterministic pseudo-random samples and quantiles", () => {
    const rngA = mulberry32(123);
    const rngB = mulberry32(123);
    expect(rngA()).toBe(rngB());
    expect(Number.isFinite(normalSample(mulberry32(99)))).toBe(true);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([42], 0.95)).toBe(42);
    expect(quantile([], 0.5)).toBe(0);
    const flatRisk = calculateMonteCarlo(modelParams({ years: 0, volatility: 0, targetCorpus: 0 }), 0);
    expect(flatRisk.successProbability).toBe(0);
    expect(flatRisk.worst).toBe(0);
    const deterministicRisk = calculateMonteCarlo(modelParams({ years: 1, volatility: 0, targetCorpus: 0 }), 2);
    expect(deterministicRisk.successProbability).toBe(1);
  });

  // R4.9.5a-3 / fin-3ay — Q-MC-ENDURANCE: trivial-full scenario
  // Starting corpus Rs100Cr, withdrawals Rs1L/month, 10y horizon — nearly all paths endure (N=50 for speed)
  it("reports enduranceProbability near 1 for a vastly over-funded plan (trivial-full)", () => {
    const trivialFull = calculateMonteCarlo(
      modelParams({
        principal: 1000000000, // Rs100Cr
        monthlyTarget: 100000, // Rs1L/month
        years: 10,
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        targetCorpus: 1000000000, // Rs100Cr — high but reachable for over-funded plan
        volatility: 12
      }),
      50
    );
    expect(trivialFull.enduranceProbability).toBeGreaterThan(0.95);
    expect(typeof trivialFull.enduranceMargin95).toBe("number");
    expect(trivialFull.enduranceMargin95).toBeGreaterThanOrEqual(0);
    expect(trivialFull.enduranceCi95).toBeDefined();
    expect(trivialFull.enduranceCi95.lower).toBeLessThanOrEqual(trivialFull.enduranceCi95.upper);
    // endurance (corpus > 0) is at least as likely as success (corpus >= target) when target > 0
    expect(trivialFull.enduranceProbability).toBeGreaterThanOrEqual(trivialFull.successProbability);
  }, 20000);

  // R4.9.5a-3 / fin-3ay — Q-MC-ENDURANCE: boundary-empty scenario
  // Tiny starting corpus Rs1L, withdrawals Rs2L/month — corpus depletes in month 1, endurance near 0 (N=50 for speed)
  it("reports enduranceProbability near 0 for a deeply under-funded plan (boundary-empty)", () => {
    const boundaryEmpty = calculateMonteCarlo(
      modelParams({
        principal: 100000, // Rs1L
        monthlyTarget: 200000, // Rs2L/month (2x the corpus, depletes immediately)
        years: 10,
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        targetCorpus: 100000000, // Rs1Cr target — far beyond reach for a depleted plan
        volatility: 12
      }),
      50
    );
    expect(boundaryEmpty.enduranceProbability).toBeLessThan(0.05);
    expect(typeof boundaryEmpty.enduranceMargin95).toBe("number");
    expect(boundaryEmpty.enduranceMargin95).toBeGreaterThanOrEqual(0);
    expect(boundaryEmpty.enduranceCi95).toBeDefined();
    expect(boundaryEmpty.enduranceCi95.lower).toBeLessThanOrEqual(boundaryEmpty.enduranceCi95.upper);
    // endurance (corpus > 0) is at least as likely as success (corpus >= Rs1Cr target) when target > 0
    expect(boundaryEmpty.enduranceProbability).toBeGreaterThanOrEqual(boundaryEmpty.successProbability);
  }, 20000);
});

describe("scenario catalog sanity", () => {
  it("keeps scenario presets executable", () => {
    expect(Object.keys(PRESETS)).toEqual(["base", "income", "growth", "stress"]);
    expect(SCENARIOS.map((scenario) => scenario.name)).toEqual(["Active", "Income", "Growth", "Stress"]);
    Object.values(PRESETS).forEach((preset) => {
      const model = calculate(modelParams(preset.patch));
      expect(Number.isFinite(model.final.closing)).toBe(true);
      expect(model.rows.length).toBeGreaterThan(1);
    });
  });

  it("exposes low-level bucket helpers for tax lot invariants", () => {
    const bucket = makeBucket(100000, 0.12, "equityLtcg", { ...BASE, costBasisPct: 80, legacyHoldingYears: 2 });
    expect(bucketValue(bucket)).toBe(100000);
    expect(monthlyRateFromAnnual(0.12)).toBeGreaterThan(0);
  });
});

describe("optimum retirement strategy builder", () => {
  it("builds a retirement profile and ranks actionable strategies", () => {
    const state = normalizeState({
      ...BASE,
      principal: 30000000,
      monthlyTarget: 150000,
      years: 30,
      retirementObjective: "income",
      riskComfort: "balanced",
      cashFlex: "guarded",
      taxPreference: "optimize",
      legacyPriority: "medium",
      liquidityMonths: 24
    });
    const profile = retirementPlanningProfile(state);
    expect(profile.withdrawalRate).toBeCloseTo(0.06);
    expect(profile.idealEquity).toBeGreaterThan(20);
    expect(profile.requestedReserveMonths).toBe(24);

    const recommendation = generateOptimumStrategies(state);
    expect(recommendation.strategies).toHaveLength(4);
    expect(recommendation.best.score).toBeGreaterThan(0);
    expect(recommendation.best.patch.incomeMode).toBeTruthy();
    expect(recommendation.strategies[0].score).toBeGreaterThanOrEqual(recommendation.strategies[1].score);
    const guidance = instrumentGuidanceForStrategy(recommendation.best, recommendation.profile, state);
    expect(guidance.map((item) => item.title)).toContain("1. Cash Bucket");
    expect(guidance.map((item) => item.title)).toContain("4. Tax Moves");
  });

  it("diagnoses stretched income goals without pretending allocation alone solves them", () => {
    const stretched = generateOptimumStrategies(normalizeState({
      ...BASE,
      principal: 10000000,
      monthlyTarget: 150000,
      retirementObjective: "legacy",
      riskComfort: "growth",
      cashFlex: "flexible",
      legacyPriority: "high"
    }));
    expect(stretched.profile.urgentGap).toBe(true);
    expect(stretched.gapMessage).toContain("gap-planning");
    expect(stretched.best.status).toMatch(/Gap|Stretch|Income|Strong/);
  });

  it("covers conservative, flexible, simple-tax, and fallback optimizer branches", () => {
    const fallback = retirementPlanningProfile(normalizeState({
      ...BASE,
      principal: 0,
      monthlyTarget: 0,
      targetCorpus: 0,
      retirementObjective: "bad",
      riskComfort: "bad",
      cashFlex: "bad",
      taxPreference: "bad",
      legacyPriority: "bad",
      liquidityMonths: 0
    }));
    expect(fallback.withdrawalRate).toBe(Infinity);
    expect(fallback.objective.label).toBe("Reliable income");
    expect(fallback.reserveCoverage).toBe(Infinity);

    const flexibleSimple = generateOptimumStrategies(normalizeState({
      ...BASE,
      principal: 50000000,
      monthlyTarget: 100000,
      retirementObjective: "balance",
      riskComfort: "conservative",
      cashFlex: "flexible",
      taxPreference: "simple",
      legacyPriority: "low",
      liquidityMonths: 12
    }));
    const bucket = flexibleSimple.strategies.find((strategy) => strategy.id === "bucketedSwp");
    expect(bucket.patch.withdrawalPriority).toBe("proRata");
    expect(bucket.patch.debtInstrument).toBe("fdInterest");
    expect(flexibleSimple.gapMessage).toContain("room to optimise");

    const watch = generateOptimumStrategies(normalizeState({ ...BASE, principal: 30000000, monthlyTarget: 150000 }));
    expect(watch.gapMessage).toContain("workable plans");

    const strong = generateOptimumStrategies(normalizeState({ ...BASE, principal: 120000000, monthlyTarget: 50000, targetCorpus: 0, years: 20 }));
    expect(strong.strategies.some((strategy) => strategy.status === "Strong fit" || strategy.status === "Income covered")).toBe(true);

    const noTarget = generateOptimumStrategies(normalizeState({ ...BASE, principal: 50000000, monthlyTarget: 0, targetCorpus: 0, years: 5 }));
    expect(noTarget.strategies.every((strategy) => Number.isFinite(strategy.score))).toBe(true);

    const zeroPlan = generateOptimumStrategies(normalizeState({ ...BASE, principal: 0, monthlyTarget: 0, targetCorpus: 0, years: 0 }));
    expect(zeroPlan.strategies.every((strategy) => Number.isFinite(strategy.score))).toBe(true);

    const guidance = instrumentGuidanceForStrategy(null, fallback, { ...BASE, taxRate: 5 });
    expect(guidance[1].allocation).toContain("% debt");
    expect(guidance[3].guidance).toContain("tax profile");
  });
});

describe("retirement advice layer", () => {
  it("builds withdrawal policy, tax optimization, audit, and instrument catalog guidance", () => {
    const state = normalizeState({
      ...BASE,
      principal: 30000000,
      monthlyTarget: 150000,
      incomeMode: "interest",
      taxRegime: "new",
      residentStatus: "resident",
      otherIncome: 0
    });
    const optimum = generateOptimumStrategies(state);
    expect(PLANNING_VERSION).toContain("retirement");
    expect(INSTRUMENT_CATALOG.length).toBeGreaterThanOrEqual(8);
    expect(catalogByBucket().income.some((item) => item.id === "scss")).toBe(true);
    expect(withdrawalRateForState(state)).toBeCloseTo(0.06);
    expect(withdrawalRateBand(0.03).label).toBe("Comfortable");
    expect(withdrawalRateBand(0.05).label).toBe("Manageable");
    expect(withdrawalRateBand(0.07).label).toBe("Stretched");
    expect(withdrawalRateBand(0.09).label).toBe("Gap first");
    expect(withdrawalRateBand(Infinity).label).toBe("No corpus base");

    const policy = buildWithdrawalPolicy(state, { best: optimum.best, profile: optimum.profile });
    expect(policy.rules.map((rule) => rule.title)).toContain("Crash Response");
    expect(policy.summary).toContain("starting withdrawal rate");

    const tax = buildTaxOptimizationPlan(state, { taxProfile: { rebateUsed: 1000 }, taxLaw: taxLawFromState(state) });
    expect(tax.actions.map((item) => item.title)).toContain("Compare SWP");
    expect(tax.actions.map((item) => item.title)).toContain("Protect slab room");

    const audit = buildAssumptionAudit({ ...state, taxRate: 5, volatility: 2, equityShare: 70 }, { successProbability: 0.4, taxLawStatus: { ok: false } });
    expect(audit.confidence).toBe("Needs adviser review");
    expect(audit.flags.some((flag) => flag.text.includes("Tax-law JSON"))).toBe(true);

    const plan = buildRetirementActionPlan(state, {
      best: optimum.best,
      profile: optimum.profile,
      taxProfile: { rebateUsed: 1000 },
      taxLaw: taxLawFromState(state),
      taxLawStatus: { ok: true },
      successProbability: 0.6
    });
    expect(plan.checklist).toHaveLength(6);
    expect(plan.catalog.growth.some((item) => item.id === "equityIndex")).toBe(true);
  });

  it("covers policy branches for flexible, high-equity, low-equity, idcw, and manual tax cases", () => {
    const noCorpus = buildWithdrawalPolicy({ ...BASE, principal: 0, monthlyTarget: 100000 }, {});
    expect(noCorpus.band.tone).toBe("danger");
    expect(withdrawalRateForState({ principal: 1000000 })).toBe(0);
    expect(buildWithdrawalPolicy({ principal: 1000000, monthlyTarget: 10000 }).requestedMonths).toBe(24);
    expect(buildWithdrawalPolicy({ ...BASE, principal: 50000000, monthlyTarget: 100000 }, { best: { debtMonths: 36 }, profile: { requestedReserveMonths: 24 } }).warnings).toEqual([]);

    const flexible = buildWithdrawalPolicy({ ...BASE, cashFlex: "flexible", equityShare: 80 }, { best: { debtMonths: 10, equityShare: 80 }, profile: { requestedReserveMonths: 24 } });
    expect(flexible.rules.find((rule) => rule.title === "Crash Response").detail).toContain("reduce discretionary spend");
    expect(flexible.rules.find((rule) => rule.title === "Glide Path").detail).toContain("Glide equity down");
    expect(flexible.warnings).toContain("Defensive cover is thin for the selected cash reserve preference.");

    const lowEquity = buildWithdrawalPolicy({ ...BASE, equityShare: 20, incomeMode: "idcw" }, { best: { debtMonths: 30, equityShare: 20 }, profile: { requestedReserveMonths: 24 } });
    expect(lowEquity.rules.find((rule) => rule.title === "Glide Path").detail).toContain("Add growth exposure");
    expect(lowEquity.warnings).toContain("IDCW should not be treated as guaranteed retirement income.");

    const manualTax = buildTaxOptimizationPlan({ ...BASE, taxRate: 8, harvestLtcg: 0, debtInstrument: "fdInterest" }, { taxProfile: {}, taxLaw: {} });
    expect(manualTax.actions.map((item) => item.title)).toContain("Manual override active");
    expect(manualTax.actions.map((item) => item.title)).toContain("Review LTCG harvesting");
    expect(manualTax.actions.map((item) => item.title)).toContain("Watch TDS and slab drag");

    const listedDebt = buildTaxOptimizationPlan({ ...BASE, incomeMode: "swp", debtInstrument: "listedBondLtcg", otherIncome: 1000 }, { taxProfile: {}, taxLaw: {} });
    expect(listedDebt.actions.map((item) => item.title)).toContain("Verify listed-debt treatment");
    const noContextTax = buildTaxOptimizationPlan({ ...BASE, incomeMode: "swp", otherIncome: 1000, debtInstrument: "debtMfSlab" });
    expect(noContextTax.headline).toBe("Use LTCG exemption");
    const coherentAudit = buildAssumptionAudit({ ...BASE, useAssetReturns: 0, annualRate: 8, taxRate: 0, equityShare: 40, volatility: 6, targetCorpus: 0, monthlyTarget: 0, incomeMode: "" });
    expect(coherentAudit.confidence).toBe("Coherent planning case");
    expect(coherentAudit.assumptions.find((item) => item.label === "Return source").value).toBe("Manual annual return");
    expect(coherentAudit.assumptions.find((item) => item.label === "Cash engine").value).toBe("interest");
    expect(buildAssumptionAudit({ ...BASE, volatility: undefined, equityShare: 70 }, { taxLawStatus: { ok: true } }).flags.some((flag) => flag.text.includes("Volatility"))).toBe(true);
    expect(buildAssumptionAudit({ ...BASE, monthlyTarget: 0, targetCorpus: 500000000, years: 30 }, { taxLawStatus: { ok: true } }).confidence).toBe("Coherent planning case");
    expect(buildAssumptionAudit({ ...BASE, monthlyTarget: 0, taxRate: 5 }, { taxLawStatus: { ok: true } }).confidence).toBe("Planning estimate");
    expect(buildAssumptionAudit({ ...BASE, incomeMode: "idcw", targetCorpus: 500000000, years: 5 }, { taxLawStatus: { ok: true } }).flags.length).toBeGreaterThan(0);
  });

  it("builds explainable allocation plans, locked constraints, and household audit branches", () => {
    const locked = normalizeState({
      ...BASE,
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 150000,
      discretionaryMonthlyExpense: 50000,
      pensionMonthlyIncome: 25000,
      healthcareReserve: 1000000,
      lockCashBucket: 1,
      cashBucketMonthsOverride: 30,
      lockEquityShare: 1,
      equityShareOverride: 42,
      preferSimpleProducts: 1,
      avoidCreditRisk: 1,
      allowAnnuity: 0,
      debtProductClass: "debtMfPost2023"
    });
    const profile = retirementPlanningProfile(locked);
    expect(profile.requestedReserveMonths).toBe(30);
    expect(profile.idealEquity).toBe(42);
    const optimum = generateOptimumStrategies(locked);
    expect(optimum.best.allocationPlan.buckets.some((bucket) => bucket.id === "cash")).toBe(true);
    const manualPlan = buildAllocationPlan({ ...locked, equityShare: 42 }, calculate(projectionParamsFromState(locked)), profile, { id: "incomeFloor" });
    expect(manualPlan.refillSchedule.length).toBe(3);
    expect(manualPlan.buckets.find((bucket) => bucket.id === "goals").amount).toBeGreaterThan(0);
    expect(manualPlan.suitability.warnings.length).toBeGreaterThan(0);
    expect(optimum.strategies.some((strategy) => strategy.lostReasons.length > 0)).toBe(true);

    const audit = buildAssumptionAudit({ ...BASE, plannedLumpSumAmount: 1000000, plannedLumpSumYear: 0, useHouseholdPlan: 1 }, { taxLawStatus: { ok: true } });
    expect(audit.confidence).toBe("Needs adviser review");
    expect(audit.assumptions.find((item) => item.label === "Household").value).toBe("Budget-linked");
    const taxPlan = buildTaxOptimizationPlan({ ...BASE, debtProductClass: "debtMfPost2023", section87AInterpretation: "aggregateThreshold" }, { taxProfile: { rebateUsed: 1 }, taxLaw: DEFAULT_TAX_LAW });
    expect(taxPlan.actions.map((item) => item.title)).toContain("Check debt-fund acquisition date");
    expect(taxPlan.actions.map((item) => item.title)).toContain("87A aggregate sensitivity");

    const guided = buildRetireeGuidedPlan(locked, {
      household: householdPlanProfile(locked),
      best: optimum.best,
      profile,
      maxMonthlyCash: 180000
    });
    expect(guided.safeMonthlyRange.upper).toBeGreaterThan(0);
    expect(guided.bucketStrategy).toContain("months of defensive cover");
    expect(guided.incomeFloorPlan).toContain("Protect");
    expect(guided.householdFacts.join(" ")).toContain("dependant");
    expect(guided.annualReviewChecklist).toContain("Export adviser/CA review pack after material changes.");

    const idcwGuided = buildRetireeGuidedPlan({ ...BASE, incomeMode: "idcw", cashFlex: "flexible", essentialMonthlyExpense: 50000, pensionMonthlyIncome: 100000, monthlyTarget: 70000 }, {
      household: { expenses: { essential: 50000, spouse: 0 }, incomeFloor: 100000, monthlyCashNeed: 70000 },
      best: { debtMonths: 0, equityShare: 40 },
      maxMonthlyCash: 0
    });
    expect(idcwGuided.incomeFloorPlan).toContain("covers the essential floor");
    expect(idcwGuided.taxCaution).toContain("IDCW is taxable distribution cash");
    expect(idcwGuided.crashResponse).toContain("trim discretionary spend");

    const swpGuided = buildRetireeGuidedPlan({ ...BASE, incomeMode: "swp", principal: 30000000 }, {});
    expect(swpGuided.taxCaution).toContain("FIFO lots");
    expect(swpGuided.reserveMonths).toBeGreaterThanOrEqual(6);

    const minimalGuided = buildRetireeGuidedPlan({ incomeMode: "interest", liquidityMonths: 3, monthlyTarget: 0 }, {
      household: { expenses: { essential: 0, spouse: 0 }, incomeFloor: 0, monthlyCashNeed: 0 },
      policy: { requestedMonths: 0 },
      best: {},
      maxMonthlyCash: 25000
    });
    expect(minimalGuided.safeMonthlyRange).toEqual({ lower: 0, upper: 25000 });
    expect(minimalGuided.reserveMonths).toBe(6);
    expect(minimalGuided.equity).toBe(60);
  });

  it("covers fallback branches in household, tax law, allocation, and strategy explanations", () => {
    const householdZeroYears = normalizeState({
      ...BASE,
      useHouseholdPlan: 1,
      years: 0,
      essentialMonthlyExpense: 100000,
      plannedLumpSumAmount: 1000000,
      plannedLumpSumYear: 1,
      plannedLumpSumInflate: 1
    });
    const projected = projectionParamsFromState(householdZeroYears);
    expect(projected.years).toBeGreaterThan(0);
    expect(targetAnnualCashForYear(projected, 1, 1.1)).toBeCloseTo(2420000);

    const law = sanitizeTaxLaw({
      ...DEFAULT_TAX_LAW,
      surchargeBands: [{ above: "bad", upto: "bad", rate: 10 }],
      productTaxRules: {
        customDebt: { bucket: "debt", longTermMonths: "bad", effectiveFromYear: "bad" },
        skipMe: null
      }
    });
    const customState = { ...BASE, debtProductClass: "customDebt", taxLawJson: formatTaxLawJson(law) };
    expect(productClassForInstrument("missing", customState)).toBe("customDebt");
    expect(streamsForInstrument("debtMfSlab", 1000, 60, customState).listedBondLtcg).toBe(1000);
    expect(streamsForInstrument("debtMfSlab", 1000, 0, customState).normalIncome).toBe(1000);
    expect(applySection87A(10000, 400000, { ...BASE, section87AInterpretation: undefined })).toBe(0);

    const allocation = buildAllocationPlan(
      { principal: 10000000, monthlyTarget: 100000, equityShare: 0, years: 0 },
      { final: { cumTax: 0 }, rows: [] },
      {},
      {}
    );
    expect(allocation.cashMonths).toBe(24);
    expect(allocation.buckets.find((bucket) => bucket.id === "floor").description).toContain("FD");
    const explained = attachStrategyLossReasons([
      { id: "best", cashCoveredYears: 10, taxDrag: 100, equityShare: 40, state: { equityShare: 40 }, finalReal: 1000 },
      { id: "alt", cashCoveredYears: 10, taxDrag: 100, equityShare: 55, state: { equityShare: 40 }, finalReal: 980 }
    ]);
    expect(explained[1].lostReasons.some((reason) => reason.includes("Constraint"))).toBe(true);

    const simpleTax = buildTaxOptimizationPlan({ ...BASE, debtProductClass: "fdInterest", section87AInterpretation: "normalOnly", otherIncome: 1000 }, { taxProfile: {}, taxLaw: DEFAULT_TAX_LAW });
    expect(simpleTax.actions.map((item) => item.title)).not.toContain("87A aggregate sensitivity");
    expect(buildAssumptionAudit({ targetCorpus: 10000000, years: 10, volatility: 3, equityShare: 0 }, { taxLawStatus: { ok: true } }).flags.length).toBeGreaterThan(0);
  });

  it("covers model edge branches for glide paths, tax products, lots, and planner warnings", () => {
    const normalized = normalizeState({ standardDeductionMode: "invalid", shockModel: "thin", principal: "bad" });
    expect(normalized.standardDeductionMode).toBe("auto");
    expect(normalized.shockModel).toBe("regime");
    expect(normalized.principal).toBe(0);
    expect(formatInr(Number.NaN)).toBe("N/A");
    expect(formatFullInr(-1234)).toContain("-₹");
    expect(formatPct(undefined)).toBe("0%");
    expect(equityShareForYear({ equityShare: 50, useAssetReturns: 1, glidePathEnabled: 1, glidePathYears: 0, glidePathEndEquity: 0 }, "bad")).toBeCloseTo(0.5);
    expect(annualPortfolioIncomeRate({ useAssetReturns: 0, portfolioIncomeYield: undefined })).toBe(0);

    const customLaw = sanitizeTaxLaw({
      version: "",
      source: "",
      sourceUrl: "",
      updatedOn: "",
      newRegimeSlabs: [],
      oldRegimeSlabs: {
        below60: [],
        senior: [],
        superSenior: []
      },
      rebates: {
        new: { threshold: "bad", max: "bad", marginalRelief: false },
        old: { threshold: "bad", max: "bad", marginalRelief: true }
      },
      deductions: {
        section80TTB: { max: "bad", appliesTo: "" },
        standardDeduction: { new: "bad", old: "bad", appliesTo: "" }
      },
      surchargeBands: [{ above: 100, upto: 50, rate: -1 }],
      surchargeMarginalRelief: false,
      tdsDefaults: { interest: "bad", distribution: "bad" },
      equityLtcgExemption: "bad",
      equityLongTermMonths: "bad",
      listedBondLongTermMonths: "bad",
      productTaxRules: {
        debtMfPost2023: { stream: "normalIncome", longTermMonths: undefined, effectiveFromYear: undefined }
      },
      cess: "bad",
      debtMfTaxation: ""
    });
    const lawState = { ...BASE, taxLawJson: formatTaxLawJson(customLaw), taxRegime: "old", ageBand: "senior" };
    expect(taxLawParseStatus(lawState).ok).toBe(true);
    expect(slabBands(lawState).length).toBeGreaterThan(0);
    expect(standardDeductionLimit({ ...lawState, standardDeductionMode: "custom", standardDeduction: -1 })).toBe(0);
    expect(investmentTaxProfile({ ...lawState, tdsEnabled: 0 }, { normalIncome: 1000 }).tds).toBe(0);
    expect(investmentTaxProfile({ ...lawState, tdsEnabled: 1, residentStatus: "nonResident", nriWithholdingRate: "bad" }, { normalIncome: 1000 }).tds).toBeGreaterThan(0);

    expect(capitalGainTaxRate("equityTaxFree", 12, lawState)).toBe(0);
    expect(capitalGainTaxRate("equityLtcg", 3, { ...lawState, equitySttPaid: 0 })).toBeCloseTo((lawState.taxSlab || 0) / 100);
    expect(capitalGainTaxRate("equityLtcg", 3, { ...lawState, equitySttPaid: 1 })).toBeGreaterThan(0);
    expect(capitalGainTaxRate("listedBondLtcg", 1, lawState)).toBeCloseTo((lawState.taxSlab || 0) / 100);
    expect(capitalGainTaxRate("listedBondLtcg", 60, lawState)).toBeGreaterThan(0);
    expect(capitalGainTaxRate("fdInterest", 1, lawState)).toBeCloseTo((lawState.taxSlab || 0) / 100);
    expect(capitalGainTaxRate("debtMfSlab", 40, { ...lawState, debtProductClass: "unknownRule" })).toBeGreaterThan(0);
    expect(taxableRate("missing", lawState)).toBe(0);
    expect(productClassLabel("mysteryProduct")).toBe("mysteryProduct");
    expect(taxRuleLabel("missing", lawState)).toBe("-");
    expect(taxRuleLabel("debtMfSlab", { ...lawState, debtProductClass: "debtMfGrandfathered" })).toContain("Older lot sensitivity");

    const zeroSale = saleStreamsForPrincipalDrawdown(0, lawState);
    expect(zeroSale.normalIncome + zeroSale.equityLtcg + zeroSale.equityStcg + zeroSale.listedBondLtcg).toBe(0);
    const fmvSale = saleStreamsForPrincipalDrawdown(100000, {
      ...lawState,
      useAssetReturns: 1,
      equityShare: 100,
      equityInstrument: "equityLtcg",
      equitySttPaid: 1,
      useFmvGrandfathering: 1,
      equityAcquisitionYear: 2016,
      equityFmv2018Pct: 90,
      costBasisPct: 40,
      legacyHoldingYears: 8
    });
    expect(fmvSale.equityLtcg).toBeLessThan(60000);
    expect(grandfatheredEquityGain(0, 100, 200)).toBe(0);
    expect(makeBucket(1000, 0.1, "equityLtcg", { useFmvGrandfathering: 1, equityAcquisitionYear: 2017, equityFmv2018Pct: "bad" }).lots[0].fmv2018PerUnit).toBe(0);

    const household = householdPlanProfile({
      ...BASE,
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 100000,
      dependantMonthlySupport: 50000,
      dependantSupportYears: 1,
      pensionMonthlyIncome: 25000,
      plannedLumpSumAmount: 100000,
      plannedLumpSumYear: 2,
      plannedLumpSumInflate: 0
    });
    expect(monthlyCashNeedForYear({ ...BASE, householdProfile: household }, 2)).toBe(75000);
    expect(plannedLumpSumForYear({ ...BASE, householdProfile: household }, 2, 1.2)).toBe(100000);
    expect(targetMonthlyCashForMonth({ ...BASE, householdProfile: household, inflateWithdrawals: 0 }, 2, 1, 1.2)).toBe(175000);

    const glideDown = modelParams({ incomeMode: "swp", useAssetReturns: 1, equityShare: 85, glidePathEnabled: 1, glidePathEndEquity: 20, glidePathYears: 2, years: 3, annualContribution: 100000, shockYear: 1, shockDrop: 5 });
    const glideUp = modelParams({ incomeMode: "swp", useAssetReturns: 1, equityShare: 15, glidePathEnabled: 1, glidePathEndEquity: 80, glidePathYears: 2, years: 3, annualContribution: 100000, shockYear: 2, shockDrop: 3 });
    expect(calculateSwpPlan(glideDown).monthlyRows.length).toBeGreaterThan(0);
    expect(calculateSwpPlan(glideUp).monthlyRows.length).toBeGreaterThan(0);
    const swpWithFmvLots = calculateSwpPlan(modelParams({
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      monthlyTarget: 150000,
      useAssetReturns: 1,
      equityShare: 100,
      equityInstrument: "equityLtcg",
      equitySttPaid: 1,
      useFmvGrandfathering: 1,
      equityAcquisitionYear: 2016,
      equityFmv2018Pct: 90,
      costBasisPct: 40,
      legacyHoldingYears: 8,
      years: 1
    }));
    expect(swpWithFmvLots.monthlyRows.some((row) => row.realizedGain > 0)).toBe(true);
    expect(paramsForProjectionYear(glideUp, 3).equityShare).toBeGreaterThan(glideUp.equityShare);
    expect(equityShareForYear(glideDown, 3)).toBeLessThan(equityShareForYear(glideDown, 1));

    const idcwPercent = calculateIdcwPlan(modelParams({ incomeMode: "idcw", cashMode: "interestPercent", withdrawRate: 50, idcwYield: 6, years: 2 }));
    expect(idcwPercent.final.withdrawal).toBeGreaterThan(0);
    expect(calculateInterestPlan(modelParams({ years: 0 })).avgAnnualCash).toBe(0);

    const shock = annualSequenceShock({ ...BASE, shockModel: "normal", useAssetReturns: 0, volatility: 10 }, mulberry32(1));
    expect(shock.model).toBe("normal");
    expect(sampledReturnParams({ ...BASE, useAssetReturns: 0 }, -0.05).annualRate).toBeLessThan(BASE.annualRate);
    expect(sampledReturnParams({ ...BASE, useAssetReturns: 1 }, { equityShock: -0.02, debtShock: 0.01 }).equityReturn).toBeLessThan(BASE.equityReturn);
    expect(calculateMonteCarlo(modelParams({ glidePathEnabled: 1, useAssetReturns: 1, glidePathEndEquity: 35, years: 2, monteCarloSamples: 16 }), 16).method).toContain("glide path");

    const taxPlan = buildTaxOptimizationPlan({ ...BASE, debtInstrument: "fdInterest", taxRegime: "old", residentStatus: "resident", ageBand: "senior" }, { taxProfile: {}, taxLaw: DEFAULT_TAX_LAW });
    expect(taxPlan.actions.map((item) => item.title)).toContain("Check 80TTB room");
    const superSeniorTaxPlan = buildTaxOptimizationPlan({ ...BASE, debtInstrument: "fdInterest", taxRegime: "old", residentStatus: "resident", ageBand: "superSenior" }, { taxProfile: {}, taxLaw: DEFAULT_TAX_LAW });
    expect(superSeniorTaxPlan.actions.map((item) => item.title)).toContain("Check 80TTB room");
    const below60FdPlan = buildTaxOptimizationPlan({ ...BASE, debtInstrument: "fdInterest", taxRegime: "old", residentStatus: "resident", ageBand: "below60" }, { taxProfile: {}, taxLaw: DEFAULT_TAX_LAW });
    expect(below60FdPlan.actions.map((item) => item.title)).not.toContain("Check 80TTB room");
    const warningAudit = buildAssumptionAudit({ ...BASE, targetCorpus: 1000000000, principal: 10000000, years: 10 }, { taxLawStatus: { ok: true } });
    expect(warningAudit.flags.some((flag) => flag.text.includes("Corpus target is aggressive"))).toBe(true);
    expect(buildAssumptionAudit({ ...BASE, targetCorpus: 1000000000, principal: 10000000, years: undefined }, { taxLawStatus: { ok: true } }).flags.some((flag) => flag.text.includes("Corpus target is aggressive"))).toBe(true);
    expect(retirementPlanningProfile({ ...BASE, retirementObjective: "missing", riskComfort: "missing", cashFlex: "missing", taxPreference: "missing", legacyPriority: "missing", liquidityMonths: 0 }).requestedReserveMonths).toBeGreaterThanOrEqual(6);
  });

  // ===========================================================================
  // fin-c96.2 — R4.2: Marginal-relief cascade fix (Faraday rederivation)
  // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §4.4 and §5.3
  //
  // Each test covers one surcharge cliff. Assertions are at:
  //   (a) τ — exactly at threshold (no surcharge yet, baseline)
  //   (b) τ + 1 — one rupee above threshold (relief must bind, tax rises ≤ ₹1+cess)
  //   (c) τ + (relief_zone_width / 2) — midpoint (relief still binding, tax = τ_tax + excess)
  //
  // Tolerance: ≤ 0.5 (half-rupee) per assertion. Faraday's expected values in §5.3
  // already incorporate the CBDT pre-cess marginal relief method (SEMANTIC_MATCH per
  // audit/round-4/02-spec-q12-r4-rederivation.md §5.5), producing a cess-adjusted diff
  // of ₹1.04 per ₹1 income increase when the cap is binding. All assertions use the
  // code-computed values validated against Faraday's §5.3 table.
  //
  // Helper: new-regime profile with only otherIncome (no pension, no streams).
  // Standard deduction = 0 when pensionIncome = 0, so normalTaxableIncome = otherIncome.
  // ===========================================================================

  it("R4.2 fin-c96.2 — Cliff 1 (₹50L, surcharge 0→10%): marginal relief suppresses cliff (new regime)", () => {
    // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §4.4 Cliff 1, §5.3
    // Relief zone per spec: ₹50,00,000 < I < ₹51,12,320 (width ≈ ₹1,12,320 pre-cess)
    // At 50L the lower-band surcharge is 0%, so taxAtSurchargeThreshold = bare slab tax.
    // Faraday §5.3: this cliff was already EXACT_MATCH pre-fix; verify it remains correct.
    const HALF_RUPEE = 0.5;
    const nrParams = { ...BASE, section87A: 0 };

    // (a) at τ = ₹50,00,000: surcharge = 0, no relief
    const atTau = calculateTaxProfile({ ...nrParams, otherIncome: 5000000 }, emptyTaxStreams());
    approx(atTau.totalTax, 1123200, HALF_RUPEE); // ₹11,23,200 per spec §4.4 Cliff 1 Case B
    expect(atTau.marginalRelief).toBe(0);
    expect(atTau.surcharge).toBe(0);

    // (b) at τ + 1 = ₹50,00,001: relief binds, final tax = ₹11,23,201.04
    // Faraday §5.3 "Correct TotalTax at τ+1" = ₹11,23,201.04
    const atPlus1 = calculateTaxProfile({ ...nrParams, otherIncome: 5000001 }, emptyTaxStreams());
    approx(atPlus1.totalTax, 1123201.04, HALF_RUPEE);
    expect(atPlus1.marginalRelief).toBeGreaterThan(0);

    // (c) midpoint ₹50,56,160 (≈ τ + 56,160, half of pre-cess relief zone ₹1,12,320):
    // relief still binding; totalTax ≈ ₹11,81,606.40 = TotalTax(τ) + 56160×1.04
    const atMid = calculateTaxProfile({ ...nrParams, otherIncome: 5056160 }, emptyTaxStreams());
    approx(atMid.totalTax, 1181606.40, HALF_RUPEE);
    expect(atMid.marginalRelief).toBeGreaterThan(0);
  });

  it("R4.2 fin-c96.2 — Cliff 2 (₹1Cr, surcharge 10→15%): lower-band surcharge included in cap (new regime)", () => {
    // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §4.4 Cliff 2, §5.3
    // Relief zone per spec: ₹1,00,00,000 < I < ₹1,01,34,160 (width ≈ ₹1,34,160 pre-cess)
    // Root-cause fix: cap must include lower-band (10%) surcharge: slabTax(1Cr) × 1.10.
    // Without fix, Faraday §5.3 showed error of −₹2,68,320 (downward cliff). Now fixed.
    const HALF_RUPEE = 0.5;
    const nrParams = { ...BASE, section87A: 0 };

    // (a) at τ = ₹1,00,00,000: 10% surcharge band, no cliff (still in lower band)
    const atTau = calculateTaxProfile({ ...nrParams, otherIncome: 10000000 }, emptyTaxStreams());
    approx(atTau.totalTax, 2951520, HALF_RUPEE); // ₹29,51,520 per spec §4.4 Cliff 2 Case B
    expect(atTau.marginalRelief).toBe(0);

    // (b) at τ + 1 = ₹1,00,00,001: relief binds, final tax = ₹29,51,521.04
    // Faraday §5.3 "Correct TotalTax at τ+1" = ₹29,51,521.04
    const atPlus1 = calculateTaxProfile({ ...nrParams, otherIncome: 10000001 }, emptyTaxStreams());
    approx(atPlus1.totalTax, 2951521.04, HALF_RUPEE);
    expect(atPlus1.marginalRelief).toBeGreaterThan(0);

    // (c) midpoint ₹1,00,67,080 (≈ τ + 67,080, half of pre-cess relief zone ₹1,34,160):
    // relief still binding; totalTax ≈ ₹30,21,283.20 = TotalTax(τ) + 67080×1.04
    const atMid = calculateTaxProfile({ ...nrParams, otherIncome: 10067080 }, emptyTaxStreams());
    approx(atMid.totalTax, 3021283.20, HALF_RUPEE);
    expect(atMid.marginalRelief).toBeGreaterThan(0);
  });

  it("R4.2 fin-c96.2 — Cliff 3 (₹2Cr, surcharge 15→25%): lower-band surcharge included in cap (new regime)", () => {
    // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §4.4 Cliff 3, §5.3
    // Relief zone per spec: ₹2,00,00,000 < I < ₹2,05,80,320 (width ≈ ₹5,80,320 pre-cess)
    // Root-cause fix: cap must include lower-band (15%) surcharge: slabTax(2Cr) × 1.15.
    // Without fix, Faraday §5.3 showed error of −₹8,70,480 (downward cliff). Now fixed.
    const HALF_RUPEE = 0.5;
    const nrParams = { ...BASE, section87A: 0 };

    // (a) at τ = ₹2,00,00,000: 15% surcharge band, no cliff
    const atTau = calculateTaxProfile({ ...nrParams, otherIncome: 20000000 }, emptyTaxStreams());
    approx(atTau.totalTax, 6673680, HALF_RUPEE); // ₹66,73,680 per spec §4.4 Cliff 3 Case B
    expect(atTau.marginalRelief).toBe(0);

    // (b) at τ + 1 = ₹2,00,00,001: relief binds, final tax = ₹66,73,681.04
    // Faraday §5.3 "Correct TotalTax at τ+1" = ₹66,73,681.04
    const atPlus1 = calculateTaxProfile({ ...nrParams, otherIncome: 20000001 }, emptyTaxStreams());
    approx(atPlus1.totalTax, 6673681.04, HALF_RUPEE);
    expect(atPlus1.marginalRelief).toBeGreaterThan(0);

    // (c) midpoint ₹2,02,90,160 (≈ τ + 2,90,160, half of pre-cess relief zone ₹5,80,320):
    // relief still binding; totalTax ≈ ₹69,75,446.40 = TotalTax(τ) + 290160×1.04
    const atMid = calculateTaxProfile({ ...nrParams, otherIncome: 20290160 }, emptyTaxStreams());
    approx(atMid.totalTax, 6975446.40, HALF_RUPEE);
    expect(atMid.marginalRelief).toBeGreaterThan(0);
  });

  it("R4.2 fin-c96.2 — Cliff 4 (₹5Cr, surcharge 25→37%): lower-band surcharge in cap, old regime only", () => {
    // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §4.4 Cliff 4 Sub-case 4b, §5.3
    // Relief zone per spec (old regime): ₹5,00,00,000 < I < ₹5,18,48,600 (width ≈ ₹18,48,600 pre-cess)
    // Root-cause fix: cap must include lower-band (25%) surcharge: slabTax(5Cr) × 1.25.
    // Without fix, Faraday §5.3 showed error of −₹38,51,250 (downward cliff). Now fixed.
    const HALF_RUPEE = 0.5;
    const orParams = { ...BASE, taxRegime: "old", section87A: 0 };

    // (a) at τ = ₹5,00,00,000 (old regime): 25% surcharge band, no cliff yet
    const atTau = calculateTaxProfile({ ...orParams, otherIncome: 50000000 }, emptyTaxStreams());
    approx(atTau.totalTax, 19256250, HALF_RUPEE); // ₹1,92,56,250 per spec §4.4 Cliff 4 Sub-case 4b
    expect(atTau.marginalRelief).toBe(0);

    // (b) at τ + 1 = ₹5,00,00,001 (old regime): relief binds, final tax = ₹1,92,56,251.04
    // Faraday §5.3 "Correct TotalTax at τ+1 (OR)" = ₹1,92,56,251.04
    const atPlus1 = calculateTaxProfile({ ...orParams, otherIncome: 50000001 }, emptyTaxStreams());
    approx(atPlus1.totalTax, 19256251.04, HALF_RUPEE);
    expect(atPlus1.marginalRelief).toBeGreaterThan(0);

    // (c) midpoint ₹5,09,24,300 (≈ τ + 9,24,300, half of pre-cess relief zone ₹18,48,600):
    // relief still binding; totalTax ≈ ₹2,02,17,522 = TotalTax(τ) + 924300×1.04
    const atMid = calculateTaxProfile({ ...orParams, otherIncome: 50924300 }, emptyTaxStreams());
    approx(atMid.totalTax, 20217522, HALF_RUPEE);
    expect(atMid.marginalRelief).toBeGreaterThan(0);
  });

  it("R4.2 fin-c96.2 — §115BAC guard: no cliff at ₹5Cr in new regime (surcharge stays at 25%)", () => {
    // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §4.4 Cliff 4 Sub-case 4a, §5.3
    // ITA §115BAC(3)(a): new-regime surcharge capped at 25% for all income. There is no
    // rate change at ₹5Cr in the new regime, so marginalRelief must be 0 at all incomes
    // above ₹5Cr in the new regime. Without the guard, the old code incorrectly triggered
    // relief when income crossed into a new band despite the rate being unchanged.
    const nrParams = { ...BASE, section87A: 0 };

    // At τ = ₹5Cr (new regime): 25% band, no relief expected
    const atTau = calculateTaxProfile({ ...nrParams, otherIncome: 50000000 }, emptyTaxStreams());
    expect(atTau.marginalRelief).toBe(0);

    // At τ + 1 (new regime): no cliff, no relief. Tax increases normally.
    const atPlus1 = calculateTaxProfile({ ...nrParams, otherIncome: 50000001 }, emptyTaxStreams());
    expect(atPlus1.marginalRelief).toBe(0);
    // Tax increase per ₹1 income = 0.30 (slab) × 1.25 (surcharge) × 1.04 (cess) = 0.39
    approx(atPlus1.totalTax - atTau.totalTax, 0.39, 0.5);

    // At τ + 100 (new regime): still no relief
    const atPlus100 = calculateTaxProfile({ ...nrParams, otherIncome: 50000100 }, emptyTaxStreams());
    expect(atPlus100.marginalRelief).toBe(0);
    // Tax increase per ₹100 income = ₹39 (0.39 per rupee)
    approx(atPlus100.totalTax - atTau.totalTax, 39, 0.5);
  });
});
