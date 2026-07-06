import {
  calculate,
  calculateHistoricalBacktest,
  calculateMonteCarlo,
  generateOptimumStrategies,
  normalizeState,
  projectionParamsFromState,
  retirementPlanningProfile,
  solveCorpusForMonthlyCash,
  solveMaxMonthlyCash,
  solveReturn,
  solveReturnForMonthlyCash,
  solveTopup,
  withdrawalShareNeeded
} from "./model.js";
// fin-8fb F4 — Historical Backtest Lab: only the dataset identity is needed
// here (for the memoization cache key); the array itself is model.js's
// default argument to calculateHistoricalBacktest.
import { DATASET_META } from "./data/india-annual-returns.js";

// ─── LRU cache helpers ─────────────────────────────────────────────────────
// Bounded LRU cache (max 64 entries) keyed by stable input hash.
// Pure-function results are stored so identical inputs return cached values.
function makeLruCache(maxSize = 64) {
  const map = new Map();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      // Move to end (most recently used)
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      if (map.has(key)) map.delete(key);
      else if (map.size >= maxSize) {
        // Evict least recently used (first entry)
        map.delete(map.keys().next().value);
      }
      map.set(key, value);
      return value;
    },
    size() { return map.size; },
    clear() { map.clear(); }
  };
}

// Stable JSON hash for an object (uses sorted keys for determinism)
function stableJsonHash(obj) {
  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  const text = stableStringify(obj);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

// Per-function LRU caches (module-level singletons, live for the page lifetime)
const _corpusCache = makeLruCache(64);
const _returnCashCache = makeLruCache(64);
const _maxCashCache = makeLruCache(64);
const _optimumCache = makeLruCache(64);
// R4.9.5j fin-7ke: MC results cache — keyed by paramsHash (stable JSON hash of
// all projection params including monteCarloSamples and monteCarloSeed).
// Bounded to 16 entries: each MC result holds p10/p50/p90 arrays (~31 elements
// each) + finals (up to 1000 elements), totalling ~16KB per entry → ~256KB max.
// If a state change does NOT affect MC inputs (e.g., UI-only toggle, view switch),
// the paramsHash is unchanged and the cached result is returned immediately,
// skipping the ~4s re-computation entirely.
const _mcCache = makeLruCache(16);
// fin-8fb F4 — Historical Backtest Lab result cache. Same 16-entry bound as
// MC: each entry holds a handful of cohorts (<=35) plus P10/P50/P90 arrays
// (years+1 elements each) — far smaller than an MC entry.
const _backtestCache = makeLruCache(16);

// Exposed for testing
export const _caches = { corpus: _corpusCache, returnCash: _returnCashCache, maxCash: _maxCashCache, optimum: _optimumCache, mc: _mcCache, backtest: _backtestCache };

// ─── Memoized solver wrappers ──────────────────────────────────────────────
function memoSolveCorpus(params, paramsHash) {
  const cached = _corpusCache.get(paramsHash);
  if (cached !== undefined) return cached;
  return _corpusCache.set(paramsHash, solveCorpusForMonthlyCash(params));
}

function memoSolveReturnCash(params, paramsHash) {
  const cached = _returnCashCache.get(paramsHash);
  if (cached !== undefined) return cached;
  return _returnCashCache.set(paramsHash, solveReturnForMonthlyCash(params));
}

function memoSolveMaxCash(params, paramsHash) {
  const cached = _maxCashCache.get(paramsHash);
  if (cached !== undefined) return cached;
  return _maxCashCache.set(paramsHash, solveMaxMonthlyCash(params));
}

function memoGenerateOptimum(normalized, normalizedHash) {
  const cached = _optimumCache.get(normalizedHash);
  if (cached !== undefined) return cached;
  return _optimumCache.set(normalizedHash, generateOptimumStrategies(normalized));
}

// R4.9.5j fin-7ke: incremental MC — skip re-computation when inputs unchanged.
// Key: paramsHash (covers all projection params including monteCarloSamples,
// monteCarloSeed, shockModel, and asset allocation). If UI-only state changes
// (view switch, mode toggle, column width resize) produce the same paramsHash,
// the prior MC result is returned immediately without re-running simulations.
function memoCalculateMonteCarlo(params, simulationCount, paramsHash) {
  // Cache key includes simulation count to guard against callers that pass an
  // explicit count different from params.monteCarloSamples (e.g., test harnesses).
  const key = `${paramsHash}:${simulationCount}`;
  const cached = _mcCache.get(key);
  if (cached !== undefined) return cached;
  return _mcCache.set(key, calculateMonteCarlo(params, simulationCount));
}

// fin-8fb F4 — Historical Backtest Lab: memoized like MC, keyed on paramsHash
// (covers years, backtestUseHistoricalInflation, and every return/inflation/
// withdrawal assumption) plus the dataset id, so a future dataset swap or
// version bump busts the cache even if paramsHash is unchanged.
function memoCalculateHistoricalBacktest(params, paramsHash) {
  const key = `${paramsHash}:${DATASET_META.id}`;
  const cached = _backtestCache.get(key);
  if (cached !== undefined) return cached;
  return _backtestCache.set(key, calculateHistoricalBacktest(params));
}

// ─── Fallback / placeholder helpers ───────────────────────────────────────
function pendingMonteCarlo(params, model) {
  const path = (model.rows || []).map((row) => row.closing || 0);
  const closing = model.final?.closing || 0;
  const targetCorpus = Number(params.targetCorpus) || 0;
  const successProbability = targetCorpus > 0 ? (closing >= targetCorpus ? 1 : 0) : 1;
  return {
    p10: path,
    p50: path,
    p90: path,
    finals: [closing],
    successProbability,
    successCount: successProbability ? 1 : 0,
    successStdError: 0,
    successMargin95: 0,
    successCi95: [successProbability, successProbability],
    finalIqr: 0,
    worst: closing,
    best: closing,
    targetCorpus,
    simulations: 0,
    seed: Math.round(Number(params.monteCarloSeed) || 24681357),
    shockModel: params.shockModel || "regime",
    glidePath: Number(params.glidePathEnabled) === 1 ? "glide path pending" : "fixed allocation",
    method: "Risk analytics updating in the background; exact projection is already refreshed"
  };
}

// fin-8fb F4 — Historical Backtest Lab placeholder, in the same spirit as
// pendingMonteCarlo: reuses the already-computed exact `model` path as an
// immediate approximation (cohortCount: 0 signals "not yet cohort-computed")
// so the UI card has something structurally valid to render before the slow
// bundle's real memoized cohort replay resolves.
function pendingHistoricalBacktest(params, model) {
  const horizon = Math.round(Number(params.years) || 0);
  const targetCorpus = Number(params.targetCorpus) || 0;
  const closing = model?.final?.closing || 0;
  const path = (model?.rows || []).map((row) => row.closing || 0);
  return {
    cohortCount: 0,
    horizon,
    successRate: targetCorpus > 0 ? (closing >= targetCorpus ? 1 : 0) : 1,
    worst: null,
    best: null,
    cohorts: [],
    percentileBands: { p10: path, p50: path, p90: path }
  };
}

function minimalOptimum(state) {
  const normalized = normalizeState(state);
  const profile = retirementPlanningProfile(normalized);
  return {
    profile,
    strategies: [],
    best: null,
    gapMessage: "Strategy analytics are updating in the background.",
    applyPatch: {}
  };
}

function buildFallbackAnalytics(state, params, model) {
  const normalized = normalizeState(state);
  const safeParams = params || projectionParamsFromState(normalized);
  const safeModel = model || calculate(safeParams);
  const monthlyTarget = Number(safeParams.monthlyCashOverride ?? safeParams.monthlyTarget) || 0;
  const years = Math.max(1, Math.round(Number(safeParams.years) || 1));
  return {
    mc: pendingMonteCarlo(safeParams, safeModel),
    topup: safeModel.final?.closing >= safeParams.targetCorpus ? 0 : Math.max(0, ((Number(safeParams.targetCorpus) || 0) - (safeModel.final?.closing || 0)) / years),
    requiredReturn: Number(safeParams.annualRate || 0) / 100,
    requiredCorpusForCash: Math.max(Number(safeParams.principal) || 0, monthlyTarget * 12 * 20),
    requiredReturnForCash: null,
    maxMonthlyCash: Math.max(0, (safeModel.final?.withdrawal || 0) / 12),
    interestShareForTarget: withdrawalShareNeeded(safeParams),
    optimum: minimalOptimum(normalized),
    backtest: Number(normalized.backtestEnabled) === 1 ? pendingHistoricalBacktest(safeParams, safeModel) : null,
    durationMs: 0,
    pending: true
  };
}

// ─── Fast analytics bundle (keystroke path) ───────────────────────────────
// Runs on every analytics trigger. Target ≤ 100 ms worker time.
// Contains: normalizeState, projectionParams, topup, solveReturn,
//           solveCorpusForMonthlyCash (memoized), solveReturnForMonthlyCash (memoized),
//           withdrawalShareNeeded.
// Does NOT contain: calculateMonteCarlo, solveMaxMonthlyCash, generateOptimumStrategies,
// calculateHistoricalBacktest (fin-8fb F4). Those are served by the slow path.
function computeFastBundle(state) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  // R4: each pure helper called exactly once per bundle invocation
  const normalized = normalizeState(state);
  const params = projectionParamsFromState(normalized);

  // Hash for memoization — covers all solver inputs
  const paramsHash = stableJsonHash(params);

  const topup = solveTopup(params);
  const requiredReturn = solveReturn(params);
  const requiredCorpusForCash = memoSolveCorpus(params, paramsHash);
  const requiredReturnForCash = memoSolveReturnCash(params, paramsHash);
  const interestShareForTarget = withdrawalShareNeeded(params);

  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    topup,
    requiredReturn,
    requiredCorpusForCash,
    requiredReturnForCash,
    interestShareForTarget,
    // Slow-path fields are absent — callers must merge with slow bundle or use placeholders
    durationMs: Math.max(0, ended - started),
    pending: false,
    slowPending: true  // slow fields (mc, maxMonthlyCash, optimum) not yet settled
  };
}

// ─── Slow analytics bundle (idle/deferred path) ───────────────────────────
// Runs behind a longer debounce or requestIdleCallback.
// Contains: calculateMonteCarlo, solveMaxMonthlyCash (memoized), generateOptimumStrategies (memoized),
//           calculateHistoricalBacktest (memoized, fin-8fb F4 — null when backtestEnabled !== 1).
// Also includes fast-path results so callers can merge without a separate fast call.
function computeSlowBundle(state) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  // R4: recompute normalized + params once; no duplication with fast path
  const normalized = normalizeState(state);
  const params = projectionParamsFromState(normalized);

  const paramsHash = stableJsonHash(params);
  const normalizedHash = stableJsonHash(normalized);

  // Fast fields — included so the slow bundle is a complete analytics value
  const topup = solveTopup(params);
  const requiredReturn = solveReturn(params);
  const requiredCorpusForCash = memoSolveCorpus(params, paramsHash);
  const requiredReturnForCash = memoSolveReturnCash(params, paramsHash);
  const interestShareForTarget = withdrawalShareNeeded(params);

  // Slow fields — R4.9.5j fin-7ke: memoCalculateMonteCarlo caches MC results
  // keyed by paramsHash so unchanged inputs return instantly.
  const mc = memoCalculateMonteCarlo(params, normalized.monteCarloSamples, paramsHash);
  const maxMonthlyCash = memoSolveMaxCash(params, paramsHash);
  const optimum = memoGenerateOptimum(normalized, normalizedHash);
  // fin-8fb F4: skip the cohort replay entirely when the card is disabled.
  const backtest = Number(normalized.backtestEnabled) === 1
    ? memoCalculateHistoricalBacktest(params, paramsHash)
    : null;

  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    mc,
    topup,
    requiredReturn,
    requiredCorpusForCash,
    requiredReturnForCash,
    maxMonthlyCash,
    interestShareForTarget,
    optimum,
    backtest,
    durationMs: Math.max(0, ended - started),
    pending: false,
    slowPending: false
  };
}

// ─── Legacy full bundle (backward compatibility) ──────────────────────────
// Used by the analytics worker (which sends a complete bundle in one shot).
// Also used for main-thread fallback when worker is unavailable.
// Runs all computations; equivalent to the original computeAnalyticsBundle.
function computeAnalyticsBundle(state) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  // R4: each pure helper called exactly once — no redundant re-derivation
  const normalized = normalizeState(state);
  const params = projectionParamsFromState(normalized);

  const paramsHash = stableJsonHash(params);
  const normalizedHash = stableJsonHash(normalized);

  const result = {
    mc: memoCalculateMonteCarlo(params, normalized.monteCarloSamples, paramsHash),
    topup: solveTopup(params),
    requiredReturn: solveReturn(params),
    requiredCorpusForCash: memoSolveCorpus(params, paramsHash),
    requiredReturnForCash: memoSolveReturnCash(params, paramsHash),
    maxMonthlyCash: memoSolveMaxCash(params, paramsHash),
    interestShareForTarget: withdrawalShareNeeded(params),
    optimum: memoGenerateOptimum(normalized, normalizedHash),
    backtest: Number(normalized.backtestEnabled) === 1 ? memoCalculateHistoricalBacktest(params, paramsHash) : null,
    pending: false,
    slowPending: false
  };
  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { ...result, durationMs: Math.max(0, ended - started) };
}

export {
  buildFallbackAnalytics,
  computeAnalyticsBundle,
  computeFastBundle,
  computeSlowBundle,
  minimalOptimum,
  pendingMonteCarlo,
  pendingHistoricalBacktest,
  stableJsonHash,
  makeLruCache
};
