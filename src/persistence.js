import { BASE, normalizeState, projectionParamsFromState, householdPlanProfile, clamp } from "./model.js";

const STORAGE_KEY = "fin-cockpit-state-v2";
const LAYOUT_KEY = "fin-cockpit-layout-v2";
const THEME_KEY = "fin-cockpit-theme";
const TOUR_KEY = "fin-cockpit-guided-tour-v1";
const DISCLAIMER_KEY = "disclaimer_acknowledged_v1";
const PRIVACY_CONSENT_KEY = "fin-cockpit-privacy-consent-v1";
const SCENARIO_HISTORY_KEY = "fin-cockpit-scenario-history-v1";
const LOCAL_STORAGE_KEYS = Object.freeze([
  STORAGE_KEY,
  LAYOUT_KEY,
  THEME_KEY,
  TOUR_KEY,
  DISCLAIMER_KEY,
  PRIVACY_CONSENT_KEY,
  SCENARIO_HISTORY_KEY
]);
const DEFAULT_LAYOUT = {
  rail: 176,
  insights: 306,
  viewport: 1680,
  viewportMode: "auto",
  fontScale: 1
};

const DEFAULT_VIEW_IDS = new Set(["overview", "planner", "tax", "simulations", "schedule"]);

function readJsonStorage(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { value: fallback, warning: "" };
    return { value: JSON.parse(raw), warning: "" };
  } catch (error) {
    try {
      localStorage.removeItem(key);
    } catch (removeError) {}
    return {
      value: fallback,
      warning: `Saved browser data for ${key} was unreadable and has been reset.`
    };
  }
}

function persistJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true, warning: "" };
  } catch (error) {
    return {
      ok: false,
      warning: error?.name === "QuotaExceededError"
        ? "Browser storage is full; latest dashboard changes could not be saved."
        : "Browser storage is unavailable; latest dashboard changes could not be saved."
    };
  }
}

/**
 * Returns true if the user has already acknowledged the disclaimer
 * (either via the new flag or via the legacy privacy-consent flag).
 * If only the legacy flag is found, migrates forward to the new flag.
 */
function loadDisclaimerAcknowledged() {
  try {
    // Step 1: Check new flag.
    const newRaw = localStorage.getItem(DISCLAIMER_KEY);
    if (newRaw === "true" || newRaw === true) return true;

    // Step 2: Check legacy flag (backward-compatible migration).
    const legacyRaw = localStorage.getItem(PRIVACY_CONSENT_KEY);
    if (legacyRaw) {
      let legacyAccepted = false;
      if (legacyRaw === "accepted") legacyAccepted = true;
      else {
        try { legacyAccepted = Boolean(JSON.parse(legacyRaw)?.accepted); }
        catch (_) { legacyAccepted = false; }
      }
      if (legacyAccepted) {
        // Migrate: write new flag so future loads skip this branch.
        try { localStorage.setItem(DISCLAIMER_KEY, "true"); } catch (_) {}
        return true;
      }
    }

    // Step 3: Both absent — show modal.
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Persists the new disclaimer acknowledgement flag.
 * Called when the user clicks "I understand".
 */
function persistDisclaimerAcknowledged() {
  try {
    localStorage.setItem(DISCLAIMER_KEY, "true");
    return { ok: true, warning: "" };
  } catch (error) {
    return {
      ok: false,
      warning: error?.name === "QuotaExceededError"
        ? "Browser storage is full; acknowledgement could not be saved."
        : "Browser storage is unavailable; acknowledgement could not be saved."
    };
  }
}

/** @deprecated Use loadDisclaimerAcknowledged — retained for export compatibility. */
function loadPrivacyConsent() {
  return loadDisclaimerAcknowledged();
}

/** @deprecated Use persistDisclaimerAcknowledged — retained for export compatibility. */
function persistPrivacyConsent() {
  return persistDisclaimerAcknowledged();
}

function clearSavedBrowserData(keys = LOCAL_STORAGE_KEYS) {
  const removed = [];
  const failed = [];
  keys.forEach((key) => {
    try {
      localStorage.removeItem(key);
      removed.push(key);
    } catch (error) {
      failed.push(key);
    }
  });
  return {
    ok: failed.length === 0,
    removed,
    failed,
    warning: failed.length
      ? `Could not clear saved browser data for ${failed.join(", ")}. Use browser site-data controls as a fallback.`
      : ""
  };
}

function cleanEffectiveProjectionEvidence(item = {}, normalizedState = normalizeState({})) {
  const params = projectionParamsFromState(normalizedState);
  const household = householdPlanProfile(normalizedState);
  const effectiveTargetToday = household.useHouseholdPlan ? household.targetCorpusToday : Number(normalizedState.targetCorpus) || 0;
  return {
    rawMonthlyCashTarget: Number(normalizedState.monthlyTarget) || 0,
    effectiveMonthlyCashNeed: Number(params.monthlyTarget) || 0,
    rawTargetCorpusToday: Number(normalizedState.targetCorpus) || 0,
    effectiveTargetCorpusToday: Number(effectiveTargetToday) || 0,
    effectiveTargetCorpusNominal: Number(params.targetCorpus) || 0,
    rawYears: Number(normalizedState.years) || 0,
    effectiveYears: Number(params.years) || 0,
    cashMode: String(normalizedState.cashMode || ""),
    cashEngine: String(normalizedState.incomeMode || ""),
    householdMode: Boolean(household.useHouseholdPlan),
    householdOffsets: {
      expenses: household.expenses,
      incomes: household.incomes,
      emergencyReserve: Number(household.emergencyReserve) || 0,
      healthcareReserve: Number(household.healthcareReserve) || 0,
      plannedLumpSum: Number(household.plannedLumpSum) || 0,
      plannedLumpSumYear: Number(household.plannedLumpSumYear) || 0,
      legacyGoal: Number(household.legacyGoal) || 0
    }
  };
}

function cleanScenarioSnapshot(item = {}) {
  const createdAt = typeof item.createdAt === "string" && item.createdAt
    ? item.createdAt
    : new Date().toISOString();
  const state = normalizeState(item.state || {});
  return {
    id: typeof item.id === "string" && item.id ? item.id : `plan-${createdAt}`,
    name: String(item.name || "Saved plan").slice(0, 80),
    notes: String(item.notes || "").slice(0, 600),
    source: String(item.source || "manual").slice(0, 40),
    libraryId: String(item.libraryId || "").slice(0, 80),
    createdAt,
    taxLawVersion: String(item.taxLawVersion || "Unknown"),
    fingerprint: String(item.fingerprint || ""),
    exportProvenance: {
      product: String(item.exportProvenance?.product || "Retirement Corpus & Income Planner"),
      exportType: String(item.exportProvenance?.exportType || "Saved scenario snapshot"),
      generatedAt: String(item.exportProvenance?.generatedAt || createdAt),
      taxLawVersion: String(item.exportProvenance?.taxLawVersion || item.taxLawVersion || "Unknown"),
      fingerprint: String(item.exportProvenance?.fingerprint || item.fingerprint || ""),
      riskMethod: String(item.exportProvenance?.riskMethod || ""),
      riskSeed: String(item.exportProvenance?.riskSeed || "")
    },
    state,
    effectiveProjection: cleanEffectiveProjectionEvidence(item, state),
    outputs: {
      finalCorpus: Number(item.outputs?.finalCorpus) || 0,
      realFinalCorpus: Number(item.outputs?.realFinalCorpus) || 0,
      cumulativeCash: Number(item.outputs?.cumulativeCash) || 0,
      finalMonthlyCash: Number(item.outputs?.finalMonthlyCash) || 0,
      endTargetChance: Number(item.outputs?.endTargetChance) || 0,
      cumulativeTax: Number(item.outputs?.cumulativeTax) || 0
    }
  };
}

function loadScenarioHistory() {
  const { value, warning } = readJsonStorage(SCENARIO_HISTORY_KEY, []);
  const items = Array.isArray(value) ? value : [];
  return {
    history: items.map(cleanScenarioSnapshot).slice(0, 12),
    warning
  };
}

function persistScenarioHistory(history = []) {
  const items = Array.isArray(history) ? history.map(cleanScenarioSnapshot).slice(0, 12) : [];
  return persistJson(SCENARIO_HISTORY_KEY, items);
}

function loadSavedState(validViewIds = DEFAULT_VIEW_IDS) {
  const { value: saved, warning } = readJsonStorage(STORAGE_KEY, {});
  return {
    state: normalizeState(saved.state || {}),
    preset: saved.preset || "base",
    tableMode: saved.tableMode || "milestones",
    activeView: validViewIds.has(saved.activeView) ? saved.activeView : "overview",
    warning
  };
}

function loadSavedLayout() {
  const { value: saved, warning } = readJsonStorage(LAYOUT_KEY, {});
  return {
    ...DEFAULT_LAYOUT,
    ...saved,
    rail: clamp(Number(saved.rail) || DEFAULT_LAYOUT.rail, 128, 260),
    insights: clamp(Number(saved.insights) || DEFAULT_LAYOUT.insights, 230, 420),
    viewport: clamp(Number(saved.viewport) || DEFAULT_LAYOUT.viewport, 1280, 2080),
    viewportMode: saved.viewportMode === "manual" ? "manual" : "auto",
    fontScale: clamp(Number(saved.fontScale) || DEFAULT_LAYOUT.fontScale, 0.75, 1.35),
    warning
  };
}

export {
  DEFAULT_LAYOUT,
  STORAGE_KEY,
  LAYOUT_KEY,
  THEME_KEY,
  TOUR_KEY,
  DISCLAIMER_KEY,
  PRIVACY_CONSENT_KEY,
  SCENARIO_HISTORY_KEY,
  LOCAL_STORAGE_KEYS,
  readJsonStorage,
  persistJson,
  loadDisclaimerAcknowledged,
  persistDisclaimerAcknowledged,
  loadPrivacyConsent,
  persistPrivacyConsent,
  clearSavedBrowserData,
  loadScenarioHistory,
  persistScenarioHistory,
  loadSavedState,
  loadSavedLayout
};
