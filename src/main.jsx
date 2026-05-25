import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BadgeCheck,
  ChevronDown,
  CircleHelp,
  Columns3,
  Download,
  FileSpreadsheet,
  Gauge,
  History,
  IndianRupee,
  Landmark,
  LockKeyhole,
  Moon,
  PieChart,
  Printer,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Trash2,
  Upload,
  Wallet,
  X
} from "lucide-react";
import "./styles.css";
// R4.9.5g §7: archival disclaimer text is bundled at build time via Vite's
// `?raw` import. This keeps the PDF §7 disclaimer in lock-step with the
// canonical DISCLAIMER.md at the repository root with zero runtime fetch
// (and keeps the single-file bundle self-contained).
import DISCLAIMER_FULL_TEXT from "../DISCLAIMER.md?raw";
import {
  DEFAULT_LAYOUT,
  STORAGE_KEY,
  LAYOUT_KEY,
  THEME_KEY,
  TOUR_KEY,
  DISCLAIMER_KEY,
  PRIVACY_CONSENT_KEY,
  SCENARIO_HISTORY_KEY,
  loadSavedState,
  loadSavedLayout,
  loadDisclaimerAcknowledged,
  persistDisclaimerAcknowledged,
  loadPrivacyConsent,
  persistPrivacyConsent,
  clearSavedBrowserData,
  loadScenarioHistory,
  persistScenarioHistory,
  persistJson
} from "./persistence.js";
import {
  BASE,
  PRESETS,
  SCENARIOS,
  DEFAULT_TAX_LAW,
  NUMERIC_FIELDS,
  clamp,
  normalizeFieldValue,
  normalizeState,
  projectionParamsFromState,
  roundToStep,
  viewportBoundsForWidth,
  autoViewportForWidth,
  formatInr,
  formatFullInr,
  formatPct,
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
  cessMultiplier,
  slabBands,
  basicExemptionLimit,
  slabTaxBeforeCess,
  applySection87A,
  emptyTaxStreams,
  addTaxStreams,
  calculateTaxProfile,
  investmentTaxProfile,
  standardDeductionLimit,
  householdPlanProfile,
  acquisitionYearForKind,
  productClassForInstrument,
  productClassLabel,
  productRuleForInstrument,
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
  taxRuleLabel
} from "./model.js";
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
} from "./planning.js";
import { STANDARD_SCENARIO_LIBRARY } from "./scenario-library.js";
import {
  buildFallbackAnalytics,
  computeAnalyticsBundle,
  computeFastBundle,
  computeSlowBundle
} from "./analytics.js";
import AnalyticsWorker from "./workers/analytics-worker.js?worker&inline";
import { formatProbabilityForDisplay } from "./probability-display.js";

// ── R4.9.5b-2: PercentileSparkline helpers ─────────────────────────────────
// fin-5g3 — pure SVG sparkline for P10/P50/P90 tiles.

/**
 * Calculate tick x-positions for a 3-value percentile sparkline.
 * Exported so tests can verify positioning logic without mounting React.
 *
 * @param {number[]} values - [p10, p50, p90] (any order — sorted internally)
 * @param {number} [width=30] - total SVG width in px
 * @param {number} [pad=4] - horizontal padding on each side in px
 * @returns {{ x: number, key: string }[]} - array of 3 tick descriptors
 */
function calcSparklineTicks(values, width = 30, pad = 4) {
  const sorted = [...(values || [0, 0, 0])].sort((a, b) => a - b);
  const [v0, v1, v2] = sorted;
  const range = v2 - v0;
  const innerW = width - pad * 2;
  if (range === 0) {
    const cx = pad + innerW / 2;
    return [
      { x: cx, key: "p0" },
      { x: cx, key: "p1" },
      { x: cx, key: "p2" }
    ];
  }
  return [
    { x: pad,                               key: "p0" },
    { x: pad + ((v1 - v0) / range) * innerW, key: "p1" },
    { x: pad + innerW,                       key: "p2" }
  ];
}

/**
 * Tiny inline SVG sparkline rendering P10/P50/P90 as three vertical ticks
 * on a horizontal baseline. ~30px wide, purely decorative (aria-hidden).
 *
 * Visualizes the spread between percentiles without requiring statistical
 * reading. Degenerate case (all equal) shows a single centered tick.
 */
const PercentileSparkline = React.memo(function PercentileSparkline({ values, width = 30, height = 14, pad = 4 }) {
  const ticks = calcSparklineTicks(values, width, pad);
  const midY = height / 2;
  const tickH = 8;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="percentile-sparkline"
    >
      <line x1={pad} y1={midY} x2={width - pad} y2={midY} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
      {ticks.map((t) => (
        <line key={t.key} x1={t.x} y1={midY - tickH / 2} x2={t.x} y2={midY + tickH / 2} stroke="currentColor" strokeWidth="1.5" />
      ))}
    </svg>
  );
});

const APP_VIEWS = [
  { id: "overview", label: "Overview", detail: "Executive view", icon: BarChart3 },
  { id: "planner", label: "Guided Planner", detail: "Goals & strategy", icon: Target },
  { id: "tax", label: "Tax Studio", detail: "Rules & SWP tax", icon: Landmark },
  { id: "simulations", label: "Simulations", detail: "Risk & sensitivity", icon: ShieldCheck },
  { id: "schedule", label: "Ledger", detail: "Annual & monthly", icon: FileSpreadsheet }
];
const APP_VIEW_IDS = new Set(APP_VIEWS.map((view) => view.id));
const TOUR_STEPS = [
  { title: "Start With The Verdict", body: "Read the overview verdict before tuning returns. It tells you whether income, real corpus, or confidence is the binding constraint.", view: "overview", selector: ".decision-verdict", target: "Overview verdict" },
  { title: "Open The Trust Center", body: "Before trusting the numbers, read what is saved locally, which model limits apply, how tax rules are sourced, and what exports contain.", view: "overview", selector: ".trust-center-hero", target: "Trust Center", scrollBlock: "end" },
  { title: "Use The Cash Solver", body: "Change monthly cash, corpus, target, years, inflation, and cash engine here. Editing monthly cash switches the live plan into Monthly target mode so the KPI strip, charts, rail, and exports reconcile.", view: "overview", selector: ".whatif-card", target: "Monthly Cash Solver", scrollBlock: "end" },
  { title: "Answer The Guided Planner", body: "Move to the planner to translate retiree goals into a recommended portfolio, reserve, and withdrawal posture.", view: "planner", selector: "#optimizer .wizard-grid", target: "Planner questions", scrollBlock: "end" },
  { title: "Audit Tax Before Trusting It", body: "Tax Studio explains slab income, special-rate gains, SWP cost recovery, TDS timing, and the active ruleset provenance.", view: "tax", selector: "#tax .tax-command-center", target: "Tax review workflow", scrollBlock: "end" },
  { title: "Stress The Plan", body: "Simulations now use sequence-of-returns paths with the active cash engine, so bad early markets can change the answer.", view: "simulations", selector: ".risk-lab .risk-control-grid", target: "Risk controls", scrollBlock: "end" },
  { title: "Export The Evidence", body: "The Ledger and exports carry the same live assumptions, tax ruleset, projection schedule, and monthly FIFO trail when active.", view: "schedule", selector: "#schedule .table-wrap.schedule", target: "Ledger table", scrollBlock: "center" }
];

function scenarioPatchFor(item, state) {
  return typeof item.patch === "function" ? item.patch(state) : item.patch || {};
}

function stateForScenarioLibraryItem(item, state) {
  return normalizeState({ ...state, ...scenarioPatchFor(item, state) });
}

const DashboardContext = React.createContext(null);

const TOAST_META = {
  apply: { title: "Applied", Icon: Sparkles },
  download: { title: "Export ready", Icon: Download },
  reset: { title: "Restored", Icon: RotateCcw },
  risk: { title: "Risk scenario", Icon: Activity },
  success: { title: "Done", Icon: ShieldCheck }
};

const FALLBACK_COLORS = {
  bg: "#252637",
  panel: "#34364b",
  panel2: "#2c2e42",
  text: "#f7f8ff",
  muted: "#b8bdca",
  grid: "rgba(255,255,255,0.08)",
  teal: "#3099a6",
  coral: "#f2657d",
  gold: "#d0aa5d",
  blue: "#7784ff"
};

/* v8 ignore start -- browser chart lazy-loading is covered by Puppeteer smoke/e2e tests. */
let echartsLoader = null;
function loadECharts() {
  // R4.9.5i Step 0a: tree-shaken custom bundle (LineChart+BarChart+PieChart +
  // GridComponent+TooltipComponent+LegendComponent+CanvasRenderer only).
  // Saves ~40-60 KB raw vs full `import("echarts")`. See src/echarts-custom.js.
  echartsLoader ||= import("./echarts-custom.js").then((m) => m.default);
  return echartsLoader;
}
/* v8 ignore stop */

/* v8 ignore start -- UI behavior is covered by Puppeteer smoke/e2e tests. */
function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme];
}

function useCssColors(theme) {
  const [colors, setColors] = useState(FALLBACK_COLORS);
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const pick = (name) => styles.getPropertyValue(name).trim();
    setColors({
      bg: pick("--bg") || FALLBACK_COLORS.bg,
      panel: pick("--panel") || FALLBACK_COLORS.panel,
      panel2: pick("--panel-2") || FALLBACK_COLORS.panel2,
      text: pick("--text") || FALLBACK_COLORS.text,
      muted: pick("--muted") || FALLBACK_COLORS.muted,
      grid: pick("--grid") || FALLBACK_COLORS.grid,
      teal: pick("--teal") || FALLBACK_COLORS.teal,
      coral: pick("--coral") || FALLBACK_COLORS.coral,
      gold: pick("--gold") || FALLBACK_COLORS.gold,
      blue: pick("--blue") || FALLBACK_COLORS.blue
    });
  }, [theme]);
  return colors;
}

function useBrowserWidth() {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? DEFAULT_LAYOUT.viewport : window.innerWidth));
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return width;
}

function useDebouncedValue(value, delay = 500) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function createAnalyticsWorker() {
  if (typeof Worker === "undefined") return null;
  try {
    return new AnalyticsWorker();
  } catch (error) {
    return null;
  }
}

// R4.2.5b — Tiered analytics hook (R2 + R3 + R4 + R6 performance fix).
//
// Two-tier dispatch strategy:
//   Fast tier (≤ 100 ms worker): fires 32 ms after debounce settles.
//     Provides: topup, requiredReturn, requiredCorpusForCash, requiredReturnForCash,
//               interestShareForTarget. These are the KPI numbers the user reads while typing.
//     Sets snapshot.pending = false immediately → clears the "Analytics syncing" indicator.
//
//   Slow tier (≤ 800 ms worker): fires 500 ms after last state change.
//     Provides: mc (Monte Carlo), maxMonthlyCash, optimum (strategies).
//     Merges into existing snapshot so the KPI fields stay stable.
//     Sets snapshot.slowPending = false.
//
// While slow tier is pending, mc / maxMonthlyCash / optimum display the last
// settled values (via displayedAnalyticsValue / lastSettledAnalyticsRef below).
//
// Numeric correctness: all memoized paths use the same normalizeState() /
// projectionParamsFromState() input hash. Any input change invalidates the
// cache and triggers a fresh computation.
function useBackgroundAnalytics(state, params, model) {
  const fallback = useMemo(() => buildFallbackAnalytics(state, params, model), [state, params, model]);
  const fingerprint = useMemo(() => compactHash({ analytics: normalizeState(state) }), [state]);
  const [snapshot, setSnapshot] = useState(() => ({
    key: fingerprint,
    value: fallback,
    pending: true,
    error: ""
  }));
  // Fast-tier worker (receives "fast" tier messages)
  const workerRef = useRef(null);
  // Slow-tier worker (receives "slow" tier messages) — separate worker instance
  // so fast path is never blocked by slow computation.
  const slowWorkerRef = useRef(null);
  const requestRef = useRef(0);
  // Track the last fast result so we can merge slow results into it
  const lastFastValueRef = useRef(null);

  useEffect(() => {
    workerRef.current = createAnalyticsWorker();
    slowWorkerRef.current = createAnalyticsWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      slowWorkerRef.current?.terminate();
      slowWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    lastFastValueRef.current = null;

    setSnapshot((current) => ({
      key: fingerprint,
      value: current.value || fallback,
      pending: true,
      error: ""
    }));

    // ── Main-thread fallback (when workers unavailable) ──
    const runOnMainThread = () => {
      window.setTimeout(() => {
        if (cancelled || requestRef.current !== requestId) return;
        try {
          // Fast path — main thread, no worker
          const fastValue = computeFastBundle(state);
          const mergedFast = { ...fallback, ...fastValue };
          lastFastValueRef.current = mergedFast;
          if (!cancelled && requestRef.current === requestId) {
            setSnapshot({ key: fingerprint, value: mergedFast, pending: false, error: "" });
          }
        } catch (error) {
          if (!cancelled && requestRef.current === requestId) {
            setSnapshot({ key: fingerprint, value: fallback, pending: false, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }, 24);
      // Slow path on main thread with idle callback or timeout
      const dispatchSlow = () => {
        if (cancelled || requestRef.current !== requestId) return;
        try {
          const slowValue = computeSlowBundle(state);
          if (!cancelled && requestRef.current === requestId) {
            setSnapshot((current) => ({
              ...current,
              value: { ...(lastFastValueRef.current || fallback), ...slowValue },
              error: ""
            }));
          }
        } catch (_) { /* slow path errors are non-fatal; fast values remain */ }
      };
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(dispatchSlow, { timeout: 800 });
      } else {
        window.setTimeout(dispatchSlow, 500);
      }
    };

    // ── Fast tier (32ms after effect fires — existing timing preserved) ──
    const fastTimer = window.setTimeout(() => {
      if (cancelled || requestRef.current !== requestId) return;
      const worker = workerRef.current;
      if (!worker) {
        runOnMainThread();
        return;
      }
      const handleFastMessage = (event) => {
        const message = event.data || {};
        if (message.id !== requestId) return;
        worker.removeEventListener("message", handleFastMessage);
        worker.removeEventListener("error", handleFastError);
        if (cancelled || requestRef.current !== requestId) return;
        if (message.ok) {
          // Merge fast result over fallback so all fields are present
          const merged = { ...fallback, ...message.result };
          lastFastValueRef.current = merged;
          setSnapshot({ key: fingerprint, value: merged, pending: false, error: "" });
        } else {
          setSnapshot({ key: fingerprint, value: fallback, pending: false, error: message.error || "Background analytics failed" });
        }
      };
      const handleFastError = (error) => {
        worker.removeEventListener("message", handleFastMessage);
        worker.removeEventListener("error", handleFastError);
        workerRef.current?.terminate();
        workerRef.current = createAnalyticsWorker();
        if (!cancelled && requestRef.current === requestId) {
          setSnapshot({ key: fingerprint, value: fallback, pending: false, error: error.message || "Background analytics failed" });
        }
      };
      worker.addEventListener("message", handleFastMessage);
      worker.addEventListener("error", handleFastError);
      worker.postMessage({ id: requestId, state: normalizeState(state), tier: "fast" });
    }, 32);

    // ── Slow tier (500ms after effect fires — deferred heavy computation) ──
    const slowTimer = window.setTimeout(() => {
      if (cancelled || requestRef.current !== requestId) return;
      const slowWorker = slowWorkerRef.current;
      if (!slowWorker) {
        // Slow path on main thread (fallback)
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => {
            if (cancelled || requestRef.current !== requestId) return;
            try {
              const slowValue = computeSlowBundle(state);
              if (!cancelled && requestRef.current === requestId) {
                setSnapshot((current) => ({
                  ...current,
                  value: { ...(lastFastValueRef.current || fallback), ...slowValue },
                  error: ""
                }));
              }
            } catch (_) { /* non-fatal */ }
          }, { timeout: 800 });
        } else {
          window.setTimeout(() => {
            if (cancelled || requestRef.current !== requestId) return;
            try {
              const slowValue = computeSlowBundle(state);
              if (!cancelled && requestRef.current === requestId) {
                setSnapshot((current) => ({
                  ...current,
                  value: { ...(lastFastValueRef.current || fallback), ...slowValue },
                  error: ""
                }));
              }
            } catch (_) { /* non-fatal */ }
          }, 0);
        }
        return;
      }
      const handleSlowMessage = (event) => {
        const message = event.data || {};
        if (message.id !== requestId) return;
        slowWorker.removeEventListener("message", handleSlowMessage);
        slowWorker.removeEventListener("error", handleSlowError);
        if (cancelled || requestRef.current !== requestId) return;
        if (message.ok) {
          // Merge slow result; preserve fast KPI fields already in snapshot
          setSnapshot((current) => ({
            ...current,
            value: { ...(lastFastValueRef.current || fallback), ...message.result },
            error: ""
          }));
        }
        // Slow errors are non-fatal — fast KPI values already displayed
      };
      const handleSlowError = () => {
        slowWorker.removeEventListener("message", handleSlowMessage);
        slowWorker.removeEventListener("error", handleSlowError);
        slowWorkerRef.current?.terminate();
        slowWorkerRef.current = createAnalyticsWorker();
      };
      slowWorker.addEventListener("message", handleSlowMessage);
      slowWorker.addEventListener("error", handleSlowError);
      slowWorker.postMessage({ id: requestId, state: normalizeState(state), tier: "slow" });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(fastTimer);
      window.clearTimeout(slowTimer);
    };
  }, [fallback, fingerprint, state]);

  return snapshot;
}

// fin-1q6 (R4-Q18 Option A): the fast tier clears `pending` with a bundle whose
// `mc` is still the fallback (simulations:0); the real Monte Carlo arrives only
// when the slow tier merges later. The export must read the SETTLED slow-tier MC
// — not the fast-tier fallback — so the §2 tile detail shows the true sample
// count and the §7 sentinel ("Monte Carlo not yet computed") fires ONLY for a
// genuine samples=0 (slow tier never ran for this plan).
//
// selectExportMc reconciles a live bundle's MC against the last MC that actually
// settled with samples>0, keyed by plan fingerprint so a stale MC from a
// DIFFERENT plan can never leak in:
//   - live MC already has samples>0  -> use it (and it becomes the new "last good")
//   - live MC is samples:0 but a prior slow-tier MC settled for the SAME plan
//     fingerprint                     -> use that prior MC (the slow tier already ran)
//   - otherwise                       -> use the live MC (genuine pending; sentinel fires)
// Returns { mc, lastGood } where lastGood is the record to persist for next call.
function selectExportMc(liveMc, fingerprint, lastGood) {
  const liveSamples = Number(liveMc?.simulations) || 0;
  if (liveSamples > 0) {
    return { mc: liveMc, lastGood: { fingerprint, mc: liveMc } };
  }
  if (lastGood && lastGood.fingerprint === fingerprint && (Number(lastGood.mc?.simulations) || 0) > 0) {
    return { mc: lastGood.mc, lastGood };
  }
  return { mc: liveMc, lastGood };
}

// fin-zrj.8: reading-rate-based toast duration — floor 2200ms, ceiling 8000ms
function toastDurationMs(text) {
  const words = String(text || "").trim().split(/\s+/).length;
  const wpm = 250; // average adult reading rate
  const ms = (words / wpm) * 60_000;
  return Math.max(2200, Math.min(ms, 8000));
}

function toastIntentFor(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("downloaded")) return "download";
  if (text.includes("restored") || text.includes("cleared")) return "reset";
  if (text.includes("shock") || text.includes("risk")) return "risk";
  if (text.includes("safe monthly")) return "success";
  if (text.includes("applied")) return "apply";
  return "success";
}

function makeToast(message, intent = toastIntentFor(message)) {
  const meta = TOAST_META[intent] || TOAST_META.success;
  const now = typeof window !== "undefined" && window.performance?.now ? window.performance.now() : Date.now();
  return {
    id: now,
    intent,
    title: meta.title,
    message: String(message || "")
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compactHash(value) {
  const text = typeof value === "string" ? value : stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fd-${(hash >>> 0).toString(36).toUpperCase()}`;
}

function planFingerprint(state, taxLaw) {
  return compactHash({
    version: PLANNING_VERSION,
    state: normalizeState(state),
    taxLaw: taxLaw || {}
  });
}

function BrandedToast({ toast }) {
  const meta = toast ? TOAST_META[toast.intent] || TOAST_META.success : TOAST_META.success;
  const Icon = meta.Icon;
  return (
    <div
      className={`toast toast-${toast?.intent || "success"} ${toast ? "show" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={toast ? `${toast.title}: ${toast.message}` : undefined}
    >
      {toast ? (
        <>
          <span className="toast-icon" aria-hidden="true"><Icon /></span>
          <span className="toast-copy">
            <strong>{toast.title}</strong>
            <small>{toast.message}</small>
          </span>
          <span className="toast-glint" aria-hidden="true" />
        </>
      ) : null}
    </div>
  );
}

function tourTarget(selector) {
  if (typeof document === "undefined" || !selector) return null;
  if (selector === "#optimizer .wizard-grid") {
    return document.getElementById("optimizer")?.getElementsByClassName("wizard-grid")[0] || null;
  }
  if (selector === "#tax .tax-command-center") {
    return document.getElementById("tax")?.getElementsByClassName("tax-command-center")[0] || null;
  }
  if (selector === ".risk-lab .risk-control-grid") {
    return document.getElementsByClassName("risk-lab")[0]?.getElementsByClassName("risk-control-grid")[0] || null;
  }
  if (selector === "#schedule .table-wrap.schedule") {
    return document.getElementById("schedule")?.getElementsByClassName("table-wrap schedule")[0] || null;
  }
  if (selector.startsWith("#")) return document.getElementById(selector.slice(1));
  if (selector.startsWith(".")) return document.getElementsByClassName(selector.slice(1))[0] || null;
  return null;
}

function clearTourHighlights() {
  if (typeof document === "undefined") return;
  [...document.getElementsByClassName("tour-highlight")].forEach((item) => item.classList.remove("tour-highlight"));
}

function rectOverlapArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function chooseTourCardPlacement(target, cardWidth, cardHeight, isMobile) {
  const safe = isMobile ? 12 : 18;
  const gutter = isMobile ? 12 : 22;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(safe, viewportWidth - cardWidth - safe);
  const maxTop = Math.max(safe, viewportHeight - cardHeight - safe);
  if (isMobile) {
    const cardLeft = clamp(target.left + target.width / 2 - cardWidth / 2, safe, maxLeft);
    const centerTop = clamp(target.top + target.height / 2 - cardHeight / 2, safe, maxTop);
    const candidates = [
      { placement: "above", cardLeft, cardTop: target.top - cardHeight - gutter, rank: 1 },
      { placement: "below", cardLeft, cardTop: target.bottom + gutter, rank: 1.2 },
      { placement: "top", cardLeft: safe, cardTop: safe, rank: 2.2 },
      { placement: "center", cardLeft: safe, cardTop: centerTop, rank: 2.8 },
      { placement: "bottom", cardLeft: safe, cardTop: maxTop, rank: 3.2 }
    ];
    const targetArea = Math.max(1, target.width * target.height);
    return candidates
      .map((candidate) => {
        const resolvedLeft = clamp(candidate.cardLeft, safe, maxLeft);
        const resolvedTop = clamp(candidate.cardTop, safe, maxTop);
        const card = {
          left: resolvedLeft,
          top: resolvedTop,
          right: resolvedLeft + cardWidth,
          bottom: resolvedTop + cardHeight
        };
        const overlapRatio = rectOverlapArea(card, target) / targetArea;
        const overflow = Math.abs(resolvedTop - candidate.cardTop) + Math.abs(resolvedLeft - candidate.cardLeft);
        const unsafeBottom = Math.max(0, 82 - (viewportHeight - card.bottom));
        const unsafeTop = Math.max(0, safe - card.top);
        return {
          ...candidate,
          cardLeft: resolvedLeft,
          cardTop: resolvedTop,
          overlapRatio,
          score: overlapRatio * 18000 + overflow * 16 + unsafeBottom * 38 + unsafeTop * 20 + candidate.rank
        };
      })
      .sort((a, b) => a.score - b.score)[0];
  }
  const centerLeft = clamp(target.left + target.width / 2 - cardWidth / 2, safe, maxLeft);
  const topAligned = clamp(target.top, safe, maxTop);
  const centerTop = clamp(target.top + target.height / 2 - cardHeight / 2, safe, maxTop);
  const candidates = [
    { placement: "right", cardLeft: target.right + gutter, cardTop: topAligned, rank: 1 },
    { placement: "right", cardLeft: target.right + gutter, cardTop: centerTop, rank: 1.2 },
    { placement: "left", cardLeft: target.left - cardWidth - gutter, cardTop: topAligned, rank: 1.4 },
    { placement: "left", cardLeft: target.left - cardWidth - gutter, cardTop: centerTop, rank: 1.6 },
    { placement: "above", cardLeft: centerLeft, cardTop: target.top - cardHeight - gutter, rank: 1.8 },
    { placement: "below", cardLeft: centerLeft, cardTop: target.bottom + gutter, rank: 2 },
    { placement: "above", cardLeft: centerLeft, cardTop: safe, rank: 2.6 },
    { placement: "below", cardLeft: centerLeft, cardTop: maxTop, rank: 3 }
  ];
  const targetArea = Math.max(1, target.width * target.height);
  const scored = candidates
    .map((candidate) => {
      const cardLeft = clamp(candidate.cardLeft, safe, maxLeft);
      const cardTop = clamp(candidate.cardTop, safe, maxTop);
      const card = {
        left: cardLeft,
        top: cardTop,
        right: cardLeft + cardWidth,
        bottom: cardTop + cardHeight
      };
      const bottomClearance = viewportHeight - card.bottom;
      const topClearance = card.top;
      const edgePenalty = Math.max(0, 32 - bottomClearance) * 28 + Math.max(0, 12 - topClearance) * 12;
      const overlapRatio = rectOverlapArea(card, target) / targetArea;
      const rawOverflow = Math.abs(cardLeft - candidate.cardLeft) + Math.abs(cardTop - candidate.cardTop);
      const distance = Math.hypot((card.left + card.right) / 2 - (target.left + target.right) / 2, (card.top + card.bottom) / 2 - (target.top + target.bottom) / 2);
      return {
        ...candidate,
        cardLeft,
        cardTop,
        bottomClearance,
        topClearance,
        rawOverflow,
        overlapRatio,
        score: overlapRatio * 14000 + rawOverflow * 16 + edgePenalty + distance * 0.04 + candidate.rank
      };
    });
  return scored.find((candidate) => candidate.overlapRatio < 0.01 && candidate.rawOverflow < 1 && candidate.topClearance >= safe && candidate.bottomClearance >= 32)
    || scored.sort((a, b) => a.score - b.score)[0];
}

function GuidedTour({ open, step, setStep, onClose, onSwitchView, onOpenHelp, onOpenAssumptions }) {
  const active = TOUR_STEPS[step] || TOUR_STEPS[0];
  const isLast = step >= TOUR_STEPS.length - 1;
  const [spotlight, setSpotlight] = useState(null);
  useLayoutEffect(() => {
    if (!open || !active?.selector) {
      clearTourHighlights();
      setSpotlight(null);
      return undefined;
    }
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    let cancelled = false;
    const placeTour = () => {
      const initialTarget = tourTarget(active.selector);
      clearTourHighlights();
      if (!initialTarget) {
        setSpotlight(null);
        return;
      }
      const isMobile = window.innerWidth < 680;
      // Don't lock html overflow during the tour. Setting overflow:hidden
      // on documentElement snaps scrollTop back to 0 on Chromium Linux
      // (Ubuntu CI), undoing the scrollIntoView below and leaving the
      // spotlight stranded against the viewport edge. The spotlight and
      // tour card are both position:fixed so they don't move when the
      // user scrolls the underlying page — losing the scroll lock costs
      // a small UX nicety but no correctness.
      initialTarget.scrollIntoView({ behavior: "auto", block: isMobile ? "center" : active.scrollBlock || "center", inline: "nearest" });
      if (isMobile) {
        const firstRect = initialTarget.getBoundingClientRect();
        const desiredTop = Math.round(window.innerHeight * 0.44);
        window.scrollBy({ top: firstRect.top - desiredTop, left: 0, behavior: "auto" });
      }
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (cancelled) return;
        // Re-query the target inside the rAF chain. On views that re-
        // render after the initial mount (e.g. the planner view's
        // optimizer pass completing on the slow tier), React can swap
        // out the DOM node between this effect's setup and the rAF
        // measurement frame, leaving the captured initialTarget
        // detached and its getBoundingClientRect stale.
        const target = tourTarget(active.selector) || initialTarget;
        const rect = target.getBoundingClientRect();
        const margin = isMobile ? 8 : 14;
        const left = clamp(rect.left - margin, 10, window.innerWidth - 60);
        const top = clamp(rect.top - margin, 10, window.innerHeight - 60);
        const width = clamp(rect.width + margin * 2, 72, window.innerWidth - left - 10);
        const mobileHighlightMax = Math.min(260, window.innerHeight * 0.36);
        const highlightHeight = isMobile ? Math.min(rect.height + margin * 2, mobileHighlightMax) : rect.height + margin * 2;
        const height = clamp(highlightHeight, 64, window.innerHeight - top - 10);
        const cardWidth = isMobile
          ? window.innerWidth - 24
          : Math.min(window.innerWidth >= 1280 ? 660 : 600, window.innerWidth - 32);
        const measuredCardHeight = document.getElementsByClassName("tour-card")[0]?.getBoundingClientRect().height || 410;
        const cardHeight = isMobile
          ? Math.min(320, window.innerHeight - 24, Math.max(286, Math.ceil(measuredCardHeight)))
          : Math.min(450, window.innerHeight - 36, Math.max(360, Math.ceil(measuredCardHeight)));
        const targetRect = { left, top, right: left + width, bottom: top + height, width, height };
        const placement = chooseTourCardPlacement(targetRect, cardWidth, cardHeight, isMobile);
        target.classList.add("tour-highlight");
        setSpotlight({
          left,
          top,
          width,
          height,
          cardLeft: placement.cardLeft,
          cardTop: placement.cardTop,
          cardWidth,
          placement: placement.placement
        });
      }));
    };
    // Defer placeTour long enough for React to commit the new step's DOM
    // and the view-switch (if any) to settle. 90ms was tight on slow
    // hosts — Ubuntu CI saw intermittent step-2 spotlight drift because
    // placeTour fired before the optimizer pass that followed the
    // initial mount had finished shifting layout below the fold. 300ms
    // is still imperceptible to a user but covers the slow-host case.
    const timer = window.setTimeout(placeTour, 300);
    window.addEventListener("resize", placeTour);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("resize", placeTour);
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    };
  }, [open, active?.selector]);
  if (!open) return null;
  const go = (nextStep) => {
    const bounded = clamp(nextStep, 0, TOUR_STEPS.length - 1);
    setStep(bounded);
    const next = TOUR_STEPS[bounded];
    if (next?.view) onSwitchView(next.view);
  };
  return (
    <div className={`guided-tour ${spotlight ? "is-anchored" : "is-fallback"}`} role="dialog" aria-modal="true" aria-label="Guided product tour">
      <div className="tour-backdrop" onClick={onClose} />
      <div
        className="tour-spotlight"
        aria-hidden="true"
        style={spotlight ? {
          "--tour-left": `${spotlight.left}px`,
          "--tour-top": `${spotlight.top}px`,
          "--tour-width": `${spotlight.width}px`,
          "--tour-height": `${spotlight.height}px`
        } : undefined}
      />
      <section
        className="tour-card"
        data-placement={spotlight?.placement || "center"}
        style={spotlight ? {
          "--tour-card-left": `${spotlight.cardLeft}px`,
          "--tour-card-top": `${spotlight.cardTop}px`,
          "--tour-card-width": `${spotlight.cardWidth}px`
        } : undefined}
      >
        <div className="tour-orb" aria-hidden="true"><Sparkles /></div>
        <div className="tour-copy">
          <span className="decision-kicker">Guided product tour</span>
          <h2>Guided Tour: {active.title}</h2>
          <p>{active.body}</p>
        </div>
        <div className="tour-coach-strip">
          <small className="tour-target">Spotlighting: {active.target}</small>
          <span>The lit area is where to look now. Replay this walkthrough from Help anytime.</span>
        </div>
        <div className="tour-progress-meta">
          <span>Step {step + 1} of {TOUR_STEPS.length}</span>
          <strong>{active.target}</strong>
        </div>
        <div
          className="tour-step-row"
          aria-label="Tour steps"
          style={{ "--tour-progress": `${TOUR_STEPS.length > 1 ? (step / (TOUR_STEPS.length - 1)) * 100 : 0}%` }}
        >
          {TOUR_STEPS.map((item, index) => (
            <button
              key={item.title}
              type="button"
              className={`tour-step-pill ${index === step ? "active" : ""}`}
              onClick={() => go(index)}
              aria-label={`Tour step ${index + 1}: ${item.title}`}
            >
              <span>{index + 1}</span>
              <strong className="visually-hidden">{item.title}</strong>
            </button>
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" onClick={onClose}>Skip tour</button>
          <button type="button" onClick={() => onOpenHelp("tutorial")}><CircleHelp /> Open help</button>
          <button type="button" onClick={onOpenAssumptions}><Settings2 /> Assumption Studio</button>
          <button type="button" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
          <button type="button" className="primary-action" onClick={isLast ? () => { onSwitchView("planner"); onClose(); } : () => go(step + 1)}>
            {isLast ? "Start planning" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}

function EChart({ option, className = "chart" }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const pendingResize = useRef(0);
  const scheduleResize = () => {
    if (typeof requestAnimationFrame !== "function") {
      chartRef.current?.resize();
      return;
    }
    if (pendingResize.current) cancelAnimationFrame(pendingResize.current);
    pendingResize.current = requestAnimationFrame(() => {
      pendingResize.current = 0;
      chartRef.current?.resize();
    });
  };

  useEffect(() => {
    if (!ref.current) return undefined;
    let cancelled = false;
    let observer = null;
    loadECharts().then((echarts) => {
      if (cancelled || !ref.current) return;
      chartRef.current = echarts.init(ref.current, null, { renderer: "canvas" });
      if (option) chartRef.current.setOption(option, true);
      observer = new ResizeObserver(scheduleResize);
      observer.observe(ref.current);
      scheduleResize();
    });
    return () => {
      cancelled = true;
      if (pendingResize.current) cancelAnimationFrame(pendingResize.current);
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
      scheduleResize();
    }
  }, [option]);

  return <div className={className} ref={ref} />;
}

function baseChart(colors) {
  return {
    backgroundColor: "transparent",
    animationDuration: 520,
    textStyle: { fontFamily: "Manrope, system-ui, sans-serif", color: colors.muted, fontSize: 10, fontWeight: 700 },
    tooltip: {
      trigger: "axis",
      backgroundColor: colors.panel,
      borderColor: "rgba(255,255,255,.12)",
      textStyle: { color: colors.text, fontSize: 11 },
      padding: 8,
      extraCssText: "box-shadow:0 18px 48px rgba(0,0,0,.28);border-radius:8px;"
    },
    grid: { left: 48, right: 12, top: 28, bottom: 34 },
    xAxis: { type: "category", boundaryGap: false, axisLine: { lineStyle: { color: colors.grid } }, axisTick: { show: false }, axisLabel: { color: colors.muted, fontSize: 10 }, splitLine: { show: false } },
    yAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.muted, fontSize: 10, formatter: (v) => formatInr(v) }, splitLine: { lineStyle: { color: colors.grid } } }
  };
}

function area(color) {
  const safeColor = color || FALLBACK_COLORS.teal;
  // fin-boc / UI-UX.R15: under forced-colors, CSS custom properties resolve to system-color
  // keywords (e.g. "Highlight"). Canvas gradient addColorStop() does not accept CSS keyword
  // colors — only hex, rgb(), rgba(), hsl(), or named web colors. Appending "66" to a keyword
  // produces "Highlight66" which throws a DOMException and crashes chart rendering.
  // Fix: if the resolved color is not a parseable canvas color (no '#', 'rgb', 'hsl' prefix),
  // use the FALLBACK_COLORS value so ECharts can safely render gradients under forced-colors.
  const canvasColor = /^(?:#|rgb|hsl)/i.test(safeColor.trim()) ? safeColor : FALLBACK_COLORS.teal;
  return {
    type: "linear",
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: `${canvasColor}66` },
      { offset: 1, color: `${canvasColor}08` }
    ]
  };
}

function statusForRatio(ratio, kind = "default") {
  if (!Number.isFinite(ratio)) return { tone: "watch", label: "Check" };
  if (kind === "tax") {
    if (ratio <= 0.08) return { tone: "good", label: "Low drag" };
    if (ratio <= 0.18) return { tone: "watch", label: "Review" };
    return { tone: "risk", label: "High drag" };
  }
  if (ratio >= 1) return { tone: "good", label: "On track" };
  if (ratio >= 0.75) return { tone: "watch", label: "Watch" };
  return { tone: "risk", label: "Short" };
}

// R4.2.5b R6: React.memo on KPI leaf components to prevent re-renders
// when parent re-renders due to unrelated state changes.
const StatCard = React.memo(function StatCard({ title, value, sub, accent = "teal", icon: Icon, spark = true, status }) {
  return (
    <article className={`stat-card accent-${accent}`} title={`${title}: ${value}. ${sub}`}>
      <div className="stat-head">
        <span>{title}</span>
        {Icon ? <Icon aria-hidden="true" /> : null}
      </div>
      {status ? <span className={`status-badge status-${status.tone}`}>{status.label}</span> : null}
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
      {spark ? <svg className="mini-spark" viewBox="0 0 116 32" aria-hidden="true"><path d="M2 25 L14 18 L25 22 L37 13 L48 17 L59 9 L72 21 L84 5 L96 15 L114 8" /></svg> : null}
    </article>
  );
});

const GaugeCard = React.memo(function GaugeCard({ label, value, detail, ratio, accent = "teal", caption }) {
  const degrees = clamp(ratio, 0, 1) * 180;
  const status = statusForRatio(ratio);
  return (
    <article className={`gauge-card accent-${accent}`} style={{ "--gauge-deg": `${degrees}deg` }} title={`${label}: ${value}. ${detail}`}>
      <div>
        <span>{label}</span>
        <b className={`status-badge status-${status.tone}`}>{status.label}</b>
        <strong>{value}</strong>
        <small>{detail}</small>
        {caption ? <p className="gauge-card-caption">{caption}</p> : null}
      </div>
      <div className="semi-gauge" aria-hidden="true"><i /></div>
    </article>
  );
});

function NumberEntry({ value, onCommit, min, max, step, suffix, disabled = false, ariaLabel, hint }) {
  const [draft, setDraft] = useState(() => String(value ?? ""));
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);
  const latestRef = useRef(String(value ?? ""));

  useEffect(() => {
    if (!focused) {
      const next = String(value ?? "");
      latestRef.current = next;
      setDraft(next);
    }
  }, [value, focused]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const commit = (raw, immediate = false) => {
    latestRef.current = String(raw ?? "");
    window.clearTimeout(timerRef.current);
    const run = () => {
      const textValue = String(latestRef.current ?? "").trim();
      const numericValue = textValue === "" ? 0 : Number(textValue.replace(/[₹,\s]/g, ""));
      if (Number.isFinite(numericValue)) onCommit(numericValue);
    };
    if (immediate) run();
    else timerRef.current = window.setTimeout(run, 80);
  };

  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          commit(next);
        }}
        onBlur={() => {
          setFocused(false);
          commit(draft, true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      {suffix ? <em>{suffix}</em> : null}
      {hint ? <small className="input-hint">{hint}</small> : null}
    </>
  );
}

function Control({ label, help, value, onChange, type = "number", min, max, step, options, suffix, disabled = false, note }) {
  const moneyHint = !suffix && typeof value === "number" && Math.abs(value) >= 100000 ? formatFullInr(value) : "";
  return (
    <label className={`control ${disabled ? "is-disabled" : ""}`} data-label={label}>
      <span>
        {label}
        {help ? <button type="button" className="help-chip" onClick={help} aria-label={`Help for ${label}`}>?</button> : null}
      </span>
      {options ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      ) : (
        <div className="input-shell">
          {type === "number" ? (
            <NumberEntry value={value} min={min} max={max} step={step} suffix={suffix} disabled={disabled} onCommit={onChange} ariaLabel={label} hint={moneyHint} />
          ) : (
            <input type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={label} />
          )}
        </div>
      )}
      {typeof min === "number" && typeof max === "number" && !options ? (
        <input className="range" type="range" value={value} min={min} max={max} step={step || 1} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} aria-label={label} />
      ) : null}
      {note ? <small className="control-note">{note}</small> : null}
    </label>
  );
}

function TaxLawEditor({ state, setField, openHelp }) {
  const [draft, setDraft] = useState(state.taxLawJson || formatTaxLawJson(DEFAULT_TAX_LAW));
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const fileInputRef = useRef(null);
  useEffect(() => {
    setDraft(state.taxLawJson || formatTaxLawJson(DEFAULT_TAX_LAW));
    setReviewConfirmed(false);
  }, [state.taxLawJson]);

  let parsed = null;
  let rawParsed = null;
  let error = "";
  try {
    rawParsed = JSON.parse(draft);
    parsed = sanitizeTaxLaw(rawParsed);
  } catch (parseError) {
    error = parseError.message;
  }
  const active = taxLawFromState(state);
  const diffRows = parsed ? [
    ["Version", active.version, parsed.version],
    ["Updated", active.updatedOn, parsed.updatedOn],
    ["New regime slabs", active.newRegimeSlabs.map((band) => `${band.upto ?? "inf"}:${band.rate}`).join(" | "), parsed.newRegimeSlabs.map((band) => `${band.upto ?? "inf"}:${band.rate}`).join(" | ")],
    ["Rebate", `${active.rebates.new.threshold}/${active.rebates.new.max}`, `${parsed.rebates.new.threshold}/${parsed.rebates.new.max}`],
    ["Section 80TTB", formatInr(active.deductions.section80TTB.max), formatInr(parsed.deductions.section80TTB.max)],
    ["Special rates", `${formatPct(active.specialRates.equityLtcg)} / ${formatPct(active.specialRates.equityStcg)}`, `${formatPct(parsed.specialRates.equityLtcg)} / ${formatPct(parsed.specialRates.equityStcg)}`],
    ["LTCG exemption", formatInr(active.equityLtcgExemption), formatInr(parsed.equityLtcgExemption)],
    ["Surcharge bands", String(active.surchargeBands.length), String(parsed.surchargeBands.length)],
    ["TDS defaults", `${formatPct(active.tdsDefaults.interest)} / ${formatPct(active.tdsDefaults.distribution)}`, `${formatPct(parsed.tdsDefaults.interest)} / ${formatPct(parsed.tdsDefaults.distribution)}`],
    ["Holding months", `${active.equityLongTermMonths}/${active.listedBondLongTermMonths}`, `${parsed.equityLongTermMonths}/${parsed.listedBondLongTermMonths}`],
    ["Cess", formatPct(active.cess), formatPct(parsed.cess)]
  ].filter(([, before, after]) => String(before) !== String(after)) : [];
  const metadataWarnings = parsed ? [
    rawParsed?.version ? "" : "Missing version; fallback version will be used.",
    rawParsed?.source ? "" : "Missing source; fallback source will be used.",
    rawParsed?.sourceUrl ? "" : "Missing source URL; adviser/CA traceability is weak.",
    rawParsed?.updatedOn ? "" : "Missing updatedOn; review date is unclear.",
    parsed.sourceUrl && !/^https?:\/\//i.test(parsed.sourceUrl) ? "Source URL should be an official or CA-reviewed HTTP(S) reference." : ""
  ].filter(Boolean) : [];
  const needsReview = diffRows.length > 0 || metadataWarnings.length > 0;
  const activeLooksBaseline = active.version === DEFAULT_TAX_LAW.version && active.updatedOn === DEFAULT_TAX_LAW.updatedOn;
  // R4.3 fin-c96.7: flush taxLawJson to localStorage immediately on explicit apply/reset.
  // R4.2.5b's fast-tier analytics clears analyticsPending in ~142 ms — well before the
  // 250 ms debounced persistence effect fires.  If the user (or test) reads localStorage
  // between analyticsPending clearing and the debounce firing they see stale data.
  // Explicit tax-law commits are not typed input; they should be synchronous writes.
  // Strategy: read the current stored envelope (preserving preset/tableMode/activeView
  // that TaxLawEditor does not own), merge in the new taxLawJson, write back.
  const flushTaxLawToStorage = (newTaxLawJson) => {
    try {
      const envelope = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const nextState = normalizeState({ ...(envelope.state || {}), taxLawJson: newTaxLawJson });
      persistJson(STORAGE_KEY, { ...envelope, state: nextState });
    } catch (_) {
      // best-effort flush; the debounced effect in App is the canonical writer
    }
  };
  const apply = () => {
    try {
      sanitizeTaxLaw(JSON.parse(draft));
      if (needsReview && !reviewConfirmed) return;
      setField("taxLawJson", draft);
      flushTaxLawToStorage(draft);
      setReviewConfirmed(false);
    } catch (parseError) {
      error = parseError.message;
    }
  };
  const reset = () => {
    const baseline = formatTaxLawJson(DEFAULT_TAX_LAW);
    setDraft(baseline);
    setReviewConfirmed(false);
    setField("taxLawJson", baseline);
    flushTaxLawToStorage(baseline);
  };
  const downloadTaxLawText = (text, filename) => {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadActive = () => {
    downloadTaxLawText(formatTaxLawJson(active), "retirement-tax-law-active-ruleset.json");
  };
  const downloadDraft = () => {
    downloadTaxLawText(draft, "retirement-tax-law-draft-ruleset.json");
  };
  const loadFile = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const text = await file.text();
    setDraft(text);
    setReviewConfirmed(false);
    event.target.value = "";
  };

  return (
    <div className="tax-law-editor" data-label="Tax Law Studio">
      <div className="tax-law-head">
        <div>
          <span>Tax Law Studio</span>
          <strong>{active.version}</strong>
        </div>
        <button type="button" className="help-chip" onClick={() => openHelp("taxLawUpdates")} aria-label="Help for Tax Law Studio">?</button>
      </div>
      <div className={`tax-law-status ${parsed ? "ok" : "bad"}`}>
        <span>{parsed ? "JSON valid" : "JSON needs attention"}</span>
        <strong>{parsed ? `${formatPct(parsed.specialRates.equityLtcg)} equity LTCG · ${formatInr(parsed.equityLtcgExemption)} exemption · ${formatPct(parsed.cess)} cess · ${parsed.surchargeBands.length} surcharge bands` : error}</strong>
      </div>
      <div className={`tax-law-review-badge ${activeLooksBaseline ? "baseline" : "custom"}`}>
        <BadgeCheck />
        <div>
          <span>Review status</span>
          <strong>{activeLooksBaseline ? "Locked baseline ruleset" : "User-applied ruleset: keep CA review evidence"}</strong>
          <small>Reset baseline returns to the bundled FY 2025-26 / AY 2026-27 reference. Applying changed or weak-source rules requires explicit review confirmation.</small>
        </div>
      </div>
      <div className="tax-law-meta">
        <span>Source</span>
        <strong>{parsed?.source || active.source}</strong>
        <span>Updated</span>
        <strong>{parsed?.updatedOn || active.updatedOn}</strong>
      </div>
      {parsed ? (
        <div className={`tax-law-diff ${needsReview ? "changed" : ""}`}>
          <div>
            <span>Review diff</span>
            <strong>{needsReview ? `${diffRows.length} rule group${diffRows.length === 1 ? "" : "s"} changed · ${metadataWarnings.length} safeguard${metadataWarnings.length === 1 ? "" : "s"}` : "No differences from active rules"}</strong>
          </div>
          {needsReview ? (
            <ul>
              {diffRows.slice(0, 5).map(([label, before, after]) => (
                <li key={label}><span>{label}</span><b>{before}</b><i>{after}</i></li>
              ))}
              {metadataWarnings.map((warning) => (
                <li key={warning}><span>Safeguard</span><b>Review needed</b><i>{warning}</i></li>
              ))}
            </ul>
          ) : null}
          <label>
            <input type="checkbox" checked={!needsReview || reviewConfirmed} disabled={!needsReview} onChange={(event) => setReviewConfirmed(event.target.checked)} />
            <span>{needsReview ? "I reviewed the diff and source metadata" : "Active rules already match this draft"}</span>
          </label>
        </div>
      ) : null}
      <textarea value={draft} onChange={(event) => { setDraft(event.target.value); setReviewConfirmed(false); }} spellCheck="false" aria-label="Editable tax law ruleset JSON" />
      <div className="tax-law-actions">
        <button type="button" onClick={apply} disabled={!parsed || (needsReview && !reviewConfirmed)}>{needsReview ? "Apply reviewed rules" : "Apply rules"}</button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>Load JSON</button>
        <button type="button" onClick={reset}>Reset baseline</button>
        <button type="button" onClick={downloadActive}>Download active</button>
        <button type="button" onClick={downloadDraft}>Download draft</button>
      </div>
      <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={loadFile} hidden aria-label="Load tax law JSON file" />
      <small>Model uses the last applied valid ruleset. Keep source metadata inside the JSON for auditability; use official updates or CA-reviewed changes before applying.</small>
    </div>
  );
}

function QuickField({ label, value, onChange, min, max, step, suffix, disabled = false, note = "" }) {
  const moneyHint = !suffix && typeof value === "number" && Math.abs(value) >= 100000 ? formatFullInr(value) : "";
  return (
    <label className={`quick-field ${disabled ? "is-disabled" : ""}`} data-label={label}>
      <span>{label}</span>
      <div>
        <NumberEntry value={value} min={min} max={max} step={step} suffix={suffix} disabled={disabled} onCommit={onChange} ariaLabel={label} hint={moneyHint} />
      </div>
      {note ? <small className="quick-note">{note}</small> : null}
    </label>
  );
}

function QuickSelect({ label, value, onChange, options, disabled = false, note = "" }) {
  return (
    <label className={`quick-field ${disabled ? "is-disabled" : ""}`} data-label={label}>
      <span>{label}</span>
      <div>
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      {note ? <small className="quick-note">{note}</small> : null}
    </label>
  );
}

function AnalyticsPendingNotice({ modelPending = false }) {
  return (
    <div className="analytics-sync-notice" role="status" aria-live="polite">
      <Activity />
      <div>
        <strong>{modelPending ? "Projection changed; analytics are catching up." : "Analytics are syncing."}</strong>
        <span>Recommendation, safe-cash, risk, tax-order, print, and export actions are locked until the analytics snapshot matches the live projection.</span>
      </div>
    </div>
  );
}

function ChoiceGroup({ label, value, onChange, options, feedbackId = "" }) {
  return (
    <div className="choice-group" data-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${value === option.value ? "active" : ""} ${feedbackId === `${label}:${option.value}` ? "just-changed" : ""}`}
            onClick={() => onChange(option.value)}
            title={option.note || option.label}
            aria-pressed={value === option.value}
          >
            <strong>{option.label}</strong>
            {option.note ? <small>{option.note}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function PageNarrative({ narrative }) {
  const Icon = narrative.Icon || Sparkles;
  return (
    <article className={`panel page-narrative narrative-${narrative.tone || "teal"}`} aria-label={`${narrative.title} context`}>
      <i className="motion-orbit" aria-hidden="true" />
      <div className="page-narrative-copy">
        <div className="page-narrative-heading">
          <div className="page-narrative-symbol" aria-hidden="true"><Icon /></div>
          <span className="decision-kicker">{narrative.eyebrow}</span>
        </div>
        <h2>{narrative.title}</h2>
        <p>{narrative.body}</p>
        <div className="context-tip-row" aria-label="Context-sensitive help">
          {narrative.tips.map((tip) => (
            <button key={tip.label} type="button" className="context-tip" onClick={tip.onClick} title={tip.title}>
              <CircleHelp />
              <span>{tip.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="page-narrative-metrics" aria-label="Why this page matters">
        {narrative.metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
      <div className="page-narrative-actions" aria-label="Interactive actions for this workspace">
        {narrative.actions.map((action) => {
          const Icon = action.Icon || Sparkles;
          return (
            <button key={action.label} type="button" onClick={action.onClick} title={action.disabled ? action.disabledTitle || action.title : action.title} disabled={Boolean(action.disabled)} aria-disabled={Boolean(action.disabled)}>
              <Icon />
              <span>{action.label}</span>
              <small>{action.detail}</small>
            </button>
          );
        })}
      </div>
    </article>
  );
}

const TrustNotice = React.memo(function TrustNotice({ title, children, tone = "teal", icon: Icon = BadgeCheck, actions = [] }) {
  return (
    <aside className={`trust-notice trust-${tone}`} role="note" aria-label={title}>
      <div className="trust-notice-icon" aria-hidden="true"><Icon /></div>
      <div>
        <span>Trust guardrail</span>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      {actions.length ? (
        <div className="trust-notice-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={Boolean(action.disabled)}
              aria-disabled={Boolean(action.disabled)}
              title={action.disabled ? action.disabledTitle : action.title}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  );
});

function TrustCenterPanel({ state, effectiveYears, activeTaxLaw, taxLawStatus, mc, assumptionFingerprint, onHelp, onClearSavedData, onExportPack, exportDisabled = false }) {
  const trustItems = [
    {
      title: "Local Data",
      detail: "Assumptions, layout, tour state, and scenario history stay in this browser profile.",
      value: "Local-first",
      Icon: LockKeyhole,
      action: () => onHelp("privacy")
    },
    {
      title: "Model Limits",
      detail: "All results are planning estimates; returns, inflation, tax, and sequence paths are assumptions.",
      value: "Estimate",
      Icon: Gauge,
      action: () => onHelp("trustCenter")
    },
    {
      title: "Tax Rules",
      detail: `${activeTaxLaw.version}; ${taxLawStatus.ok ? "valid ruleset" : "fallback baseline active"}.`,
      value: taxLawStatus.ok ? "Reviewed" : "Check",
      Icon: Landmark,
      action: () => onHelp("taxLawUpdates")
    },
    {
      title: "Risk Engine",
      detail: `${mc.method}; ${mc.simulations} samples; seed ${mc.seed}.`,
      value: "Scenario",
      Icon: Activity,
      action: () => onHelp("risk")
    },
    {
      title: "Exports",
      detail: "PDF, CSV, and JSON files leave the browser and remain sensitive on disk.",
      value: "Sensitive",
      Icon: Download,
      action: onExportPack,
      disabled: exportDisabled
    },
    {
      title: "Review Path",
      detail: "Use the adviser/CA pack before relying on close decisions, tax outcomes, or product classification.",
      value: "Human review",
      Icon: ShieldCheck,
      action: () => onHelp("reviewPack")
    }
  ];
  return (
    <article className="panel wide trust-center-panel" aria-label="Trust Center">
      <PanelHead eyebrow="Trust Center" title="Can I Trust This Plan?" note="A plain-English audit layer for privacy, model limits, tax provenance, risk method, exports, and human review." help={() => onHelp("trustCenter")} />
      <div className="trust-center-hero">
        <div>
          <ShieldCheck />
          <span>Current fingerprint</span>
          <strong>{assumptionFingerprint}</strong>
          <small>{formatFullInr(state.principal)} corpus · {effectiveYears} years · {taxProfileLabel(state)}</small>
        </div>
        <p>This product is designed to make every sensitive assumption visible and reproducible. It is useful when a retiree, family member, adviser, and CA can challenge the same fingerprint, tax ruleset, and scenario library.</p>
      </div>
      <div className="trust-center-grid">
        {trustItems.map(({ title, detail, value, Icon, action, disabled }) => (
          <button key={title} type="button" onClick={action} disabled={Boolean(disabled)} aria-disabled={Boolean(disabled)}>
            <Icon />
            <span>{title}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </div>
      <div className="trust-center-actions">
        <button type="button" onClick={() => onHelp("trustCenter")}><CircleHelp /> Read trust guide</button>
        <button type="button" onClick={onExportPack} disabled={exportDisabled} aria-disabled={exportDisabled}><FileSpreadsheet /> Adviser / CA pack</button>
        <button type="button" className="danger" onClick={onClearSavedData}><RotateCcw /> Clear saved data</button>
      </div>
    </article>
  );
}

function ScenarioTimeline({ history, deltas, onSave, onRestore, onDelete, onExport, onImport, onAnnotate, disabled = false }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const importInputRef = useRef(null);
  const save = () => {
    onSave({ name, notes });
    setName("");
    setNotes("");
  };
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (file) await onImport(file);
    event.target.value = "";
  };
  return (
    <article className="panel scenario-timeline-panel" aria-label="Saved scenario timeline">
      <PanelHead eyebrow="Plan History" title="Saved Scenario Timeline" note="Name important versions before changing assumptions. Each snapshot stores assumptions, tax-law version, live outputs, and a fingerprint for adviser review." help={null} />
      <div className="scenario-save-grid">
        <label>
          <span>Snapshot name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Base with 24M cash bucket" maxLength="80" />
        </label>
        <label>
          <span>Decision notes</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Why this version matters, who reviewed it, or what changed." maxLength="600" />
        </label>
        <button type="button" onClick={save} disabled={disabled} aria-disabled={disabled}><Save /> Save current plan</button>
        <button type="button" onClick={() => importInputRef.current?.click()} disabled={disabled} aria-disabled={disabled}><Upload /> Import plan JSON</button>
        <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importFile} aria-label="Import saved plan JSON" disabled={disabled} />
      </div>
      {deltas.length ? (
        <div className="scenario-delta-grid" aria-label="Delta versus latest saved plan">
          {deltas.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="scenario-empty-state">
          <History />
          <span>No saved snapshots yet. Save one before testing a different corpus, cash target, tax posture, or allocation.</span>
        </div>
      )}
      <div className="scenario-timeline-list">
        {history.map((item) => (
          <section key={item.id} className="scenario-timeline-item">
            <div>
              <span>{new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              <strong>{item.name}</strong>
              <label className="scenario-note-editor">
                <small>Decision notes</small>
                <textarea value={item.notes || ""} onChange={(event) => onAnnotate(item.id, event.target.value)} placeholder="Add reviewer, decision, caveat, or why this version matters." maxLength="600" />
              </label>
              <em>{item.fingerprint} · {item.taxLawVersion}</em>
            </div>
            <div className="scenario-timeline-metrics">
              <b>{formatInr(item.outputs.finalCorpus)} final</b>
              <b>{formatPct(item.outputs.endTargetChance)} chance</b>
              <b>{formatInr(item.outputs.cumulativeTax)} tax</b>
            </div>
            <div className="scenario-timeline-actions">
              <button type="button" onClick={() => onRestore(item)} disabled={disabled} aria-disabled={disabled}>Restore</button>
              <button type="button" onClick={() => onExport(item)}>Export JSON</button>
              <button type="button" className="danger" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.name}`}><Trash2 /></button>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function RetireeGuidedIntake({ state, outputState = state, setField, guidedPlan, onOpenAssumptions, onHelp }) {
  const planRange = guidedPlan.safeMonthlyRange;
  return (
    <article className="panel wide retiree-guided-mode" aria-label="Retiree guided household mode">
      <PanelHead eyebrow="Retiree Guided Mode" title="From Household Reality To Action Plan" note="Start here when the user thinks in family expenses, pension, healthcare, dependants, and sleep-at-night risk rather than return percentages." help={() => onHelp("household")} />
      <div className="guided-mode-hero">
        <div>
          <Wallet />
          <span>Safe starting cash range</span>
          <strong>{formatInr(planRange.lower)} - {formatInr(planRange.upper)} / month</strong>
          <small>Based on essential floor, secure income, current corpus, and modelled sustainable cash.</small>
        </div>
        <p>{guidedPlan.bucketStrategy}</p>
      </div>
      <div className="guided-intake-grid">
        <QuickField label="Essential spend" value={state.essentialMonthlyExpense} min={0} max={3000000} step={10000} onChange={(value) => setField("essentialMonthlyExpense", value, { feedback: { type: "action", id: "guided-essential", message: "Essential spend updated" } })} />
        <QuickField label="Discretionary spend" value={state.discretionaryMonthlyExpense} min={0} max={2000000} step={10000} onChange={(value) => setField("discretionaryMonthlyExpense", value, { feedback: { type: "action", id: "guided-discretionary", message: "Discretionary spend updated" } })} />
        <QuickField label="Current corpus" value={state.principal} min={1000000} max={200000000} step={100000} onChange={(value) => setField("principal", value, { feedback: { type: "action", id: "guided-corpus", message: "Corpus updated" } })} />
        <QuickField label="Pension / rent income" value={state.pensionMonthlyIncome + state.rentMonthlyIncome} min={0} max={3000000} step={10000} onChange={(value) => { setField("pensionMonthlyIncome", value, { feedback: { type: "action", id: "guided-income", message: "Income offset updated" } }); setField("rentMonthlyIncome", 0); }} />
        <QuickField label="Retiree age" value={state.retireeAge} min={45} max={100} step={1} onChange={(value) => setField("retireeAge", value)} />
        <QuickField label="Spouse age" value={state.spouseAge} min={0} max={100} step={1} onChange={(value) => setField("spouseAge", value)} />
        <QuickField label="Dependants" value={state.dependantCount} min={0} max={10} step={1} onChange={(value) => setField("dependantCount", value)} />
        <QuickField label="Healthcare reserve" value={state.healthcareReserve} min={0} max={50000000} step={100000} onChange={(value) => setField("healthcareReserve", value)} />
        <QuickField label="Legacy goal" value={state.legacyCorpusGoal} min={0} max={500000000} step={1000000} onChange={(value) => setField("legacyCorpusGoal", value)} />
        <QuickSelect label="Risk comfort" value={state.riskComfort} onChange={(value) => setField("riskComfort", value, { feedback: { type: "choice", id: `Risk comfort:${value}`, message: "Risk comfort updated" } })} options={[
          { value: "conservative", label: "Sleep-well" },
          { value: "balanced", label: "Balanced" },
          { value: "growth", label: "Growth" }
        ]} />
        <QuickSelect label="Tax profile" value={state.taxProfileMode} onChange={(value) => setField("taxProfileMode", value)} options={[
          { value: "retiree", label: "Retiree profile" },
          { value: "flat", label: "Flat stress case" }
        ]} />
        <button type="button" className="guided-activate" onClick={() => { setField("useHouseholdPlan", 1, { feedback: { type: "action", id: "guided-household", message: "Household mode enabled" } }); onOpenAssumptions(); }}>
          <Sparkles />
          <span>Open full household interview</span>
          <small>Capture annuity, PMVVY, dependants, emergency reserve, lump sums, and tax details.</small>
        </button>
      </div>
      <div className="guided-output-grid">
        <div><span>Income floor</span><strong>{formatInr(guidedPlan.floorGap)} gap</strong><small>{guidedPlan.incomeFloorPlan}</small></div>
        <div><span>Tax caution</span><strong>{outputState.incomeMode.toUpperCase()}</strong><small>{guidedPlan.taxCaution}</small></div>
        <div><span>Crash response</span><strong>{outputState.cashFlex}</strong><small>{guidedPlan.crashResponse}</small></div>
      </div>
      <ul className="guided-checklist">
        {guidedPlan.annualReviewChecklist.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

function ScenarioLibrary({ scenarios, onApply, onSave, onExport, onHelp, disabled = false }) {
  return (
    <article className="panel wide scenario-library-panel" aria-label="Standard scenario library">
      <PanelHead eyebrow="Scenario Library" title="Retirement Stress Case Library" note="Standard cases for base, income-floor, higher-income, lower-return, tax-optimised, crash, healthcare, inflation, and spouse-longevity planning." help={() => onHelp("scenarioLibrary")} />
      <div className="scenario-library-grid">
        {scenarios.map((item) => (
          <section key={item.id} className={`scenario-library-card scenario-library-${item.tone}`}>
            <span>{item.role}</span>
            <strong>{item.name}</strong>
            <p>{item.notes}</p>
            <div className="scenario-library-metrics">
              <b><small>Final</small>{formatInr(item.model.final.closing)}</b>
              <b><small>Real</small>{formatInr(item.model.final.realClosing)}</b>
              <b><small>Tax</small>{formatInr(item.model.final.cumTax)}</b>
            </div>
            <div className="scenario-library-actions">
              <button type="button" onClick={() => onApply(item)} disabled={disabled} aria-disabled={disabled}>Apply</button>
              <button type="button" onClick={() => onSave(item)} disabled={disabled} aria-disabled={disabled}>Save</button>
              <button type="button" onClick={() => onExport(item)} disabled={disabled} aria-disabled={disabled}>Export</button>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function ReviewPackPanel({ assumptionFingerprint, activeTaxLaw, mc, scenarioCount, onExportPack, onExportPdf, onExportCsv, onHelp, disabled = false }) {
  return (
    <article className="panel wide review-pack-panel" aria-label="Adviser and CA review pack">
      <PanelHead eyebrow="Adviser / CA Pack" title="Review Pack For Professional Challenge" note="One handoff path for PDF narrative, CSV ledger, tax-law rules, assumptions, scenario comparison, risk method, and caveats." help={() => onHelp("reviewPack")} />
      <div className="review-pack-grid">
        {[
          ["PDF report", "Narrative report with charts and caveats"],
          ["CSV ledger", "Annual and monthly FIFO evidence"],
          ["Tax-law JSON", `${activeTaxLaw.version} with source metadata`],
          ["Assumptions JSON", `Fingerprint ${assumptionFingerprint}`],
          ["Scenario comparison", `${scenarioCount} standard cases plus saved snapshots`],
          ["Risk method", `${mc.method}; ${mc.simulations} samples; seed ${mc.seed}`]
        ].map(([title, detail]) => (
          <div key={title}><BadgeCheck /><span>{title}</span><strong>{detail}</strong></div>
        ))}
      </div>
      <div className="review-pack-actions">
        <button type="button" className="primary" onClick={onExportPack} disabled={disabled} aria-disabled={disabled}><FileSpreadsheet /> Download review pack</button>
        <button type="button" onClick={onExportPdf} disabled={disabled} aria-disabled={disabled}><Download /> PDF only</button>
        <button type="button" onClick={onExportCsv} disabled={disabled} aria-disabled={disabled}><Download /> CSV only</button>
        <button type="button" onClick={() => onHelp("reviewPack")}><CircleHelp /> What is included?</button>
      </div>
    </article>
  );
}

function MobileVerdictCard({ planMood, decisionHeadline, decisionCopy, cashRatio, corpusRatio, chance, finalMonthlyCash, realFinalCorpus, taxDrag, runway, nextAction, onOpenPlanner, onOpenInsights }) {
  return (
    <article className={`panel mobile-verdict-card mobile-verdict-${planMood}`} aria-label="Mobile retirement verdict">
      <div className="mobile-verdict-topline">
        <div className="mobile-verdict-icon" aria-hidden="true"><Smartphone /></div>
        <div>
          <span>Retirement verdict</span>
          <strong>{decisionHeadline}</strong>
          <small>{decisionCopy}</small>
        </div>
      </div>
      <div className="mobile-verdict-metrics">
        <b><span>Monthly cash</span>{finalMonthlyCash}</b>
        <b><span>Confidence</span>{formatPct(chance)}</b>
        <b><span>Real corpus</span>{realFinalCorpus}</b>
        <b><span>Tax drag</span>{taxDrag}</b>
        <b><span>Cash goal</span>{Math.round(clamp(cashRatio, 0, 9.99) * 100)}%</b>
        <b><span>Corpus goal</span>{Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%</b>
      </div>
      <p className="mobile-verdict-runway"><ShieldCheck /> {runway}</p>
      <div className="mobile-verdict-actions">
        <button type="button" onClick={onOpenPlanner}><Target /> Guided start</button>
        <button type="button" onClick={onOpenInsights}><Sparkles /> Why</button>
        <button type="button" onClick={nextAction.onClick} disabled={Boolean(nextAction.disabled)} aria-disabled={Boolean(nextAction.disabled)} title={nextAction.disabled ? nextAction.disabledTitle : nextAction.title}>{nextAction.label}</button>
      </div>
    </article>
  );
}

// fin-rrf — shared helper for final monthly withdrawal to avoid drift across sites.
// KPI strip, PDF/CSV export, and scenario snapshot all compute model.final.withdrawal / 12.
// Extracting to a single function eliminates the risk of one site using a different formula.
function effectiveMonthlyWithdrawal(model) {
  return model.final.withdrawal / 12;
}

function MobileTaxProductCards({ state, y1Tax, activeTaxLaw, taxLotSummary }) {
  const usesAssetReturns = Number(state.useAssetReturns) === 1;
  return (
    <div className="mobile-tax-product-cards" aria-label="Mobile tax product summaries">
      <section>
        <Landmark />
        <span>{usesAssetReturns ? "Equity bucket" : "Manual return mode"}</span>
        <strong>{usesAssetReturns ? instrumentLabel(state.equityInstrument) : "Equity allocation ignored"}</strong>
        <small>{usesAssetReturns ? `${productClassLabel(state.equityProductClass)} · ${formatPct(activeTaxLaw.specialRates.equityLtcg)} LTCG · year-1 tax ${formatInr(y1Tax.equityTax || 0)}` : `Portfolio uses manual annual return ${state.annualRate}%; product split is not active.`}</small>
      </section>
      <section>
        <Wallet />
        <span>{usesAssetReturns ? "Debt bucket" : "Tax bucket"}</span>
        <strong>{instrumentLabel(state.debtInstrument)}</strong>
        <small>{usesAssetReturns ? `${productClassLabel(state.debtProductClass)} · slab-sensitive · year-1 tax ${formatInr(y1Tax.debtTax || 0)}` : `Manual-return tax estimate · year-1 tax ${formatInr(y1Tax.tax || 0)}`}</small>
      </section>
      <section>
        <BadgeCheck />
        <span>SWP cost recovery</span>
        <strong>{formatInr(taxLotSummary.capitalRecovered)}</strong>
        <small>Recovered old-unit cost is cash flow, not a fresh taxable gain.</small>
      </section>
    </div>
  );
}

function MobileLedgerCards({ rows, columns, mode }) {
  return (
    <div className="mobile-ledger-cards" aria-label="Mobile ledger cards">
      {rows.slice(0, 12).map((row) => (
        <section key={mode === "monthly" ? `${row.year}-${row.month}` : row.year}>
          <span>{mode === "monthly" ? row.period : `Year ${row.year}`}</span>
          <div>
            {columns.slice(1, 7).map((column) => (
              <p key={column.key}><b>{column.label}</b><strong>{column.value(row)}</strong></p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LayoutConsole({ layout, setLayout, resetLayout, effectiveViewport, autoViewport, browserWidth, viewportBounds }) {
  const setField = (key, value) => setLayout((current) => ({
    ...current,
    [key]: value,
    ...(key === "viewport" ? { viewportMode: "manual" } : {})
  }));
  const setPreset = (viewport) => setLayout((current) => ({ ...current, viewport, viewportMode: "manual" }));
  const setAuto = () => setLayout((current) => ({ ...current, viewportMode: "auto" }));
  const isAuto = layout.viewportMode !== "manual";

  return (
    <section className="panel layout-console" aria-label="Dashboard layout controls">
      <div className="layout-header">
        <div className="layout-title">
          <SlidersHorizontal aria-hidden="true" />
          <div>
            <span>Canvas Control</span>
            <strong>{isAuto ? "Auto" : "Manual"} · {Math.round(effectiveViewport)}px workspace</strong>
          </div>
        </div>
        <button type="button" className="layout-icon-reset" onClick={resetLayout} title="Reset layout" aria-label="Reset layout">
          <RotateCcw />
        </button>
      </div>
      <label className="layout-range layout-range-primary">
        <span>Viewport <b>{isAuto ? `Auto ${Math.round(effectiveViewport)}px` : `${layout.viewport}px`}</b></span>
        <input type="range" min={viewportBounds.min} max={viewportBounds.max} step="20" value={clamp(isAuto ? effectiveViewport : layout.viewport, viewportBounds.min, viewportBounds.max)} onChange={(event) => setField("viewport", Number(event.target.value))} aria-label="Canvas viewport width in pixels" />
      </label>
      <div className="layout-presets" aria-label="Viewport presets">
        <button type="button" className={isAuto ? "active" : ""} onClick={setAuto} title={`Auto chooses ${Math.round(autoViewport)}px for this ${browserWidth}px window`}>Auto</button>
        <button type="button" className={!isAuto && layout.viewport === 1440 ? "active" : ""} onClick={() => setPreset(1440)} title="Focused report width">Focus</button>
        <button type="button" className={!isAuto && layout.viewport === 1680 ? "active" : ""} onClick={() => setPreset(1680)} title="Balanced default width">Comfort</button>
        <button type="button" className={!isAuto && layout.viewport === 1920 ? "active" : ""} onClick={() => setPreset(1920)} title="Wide report width">Wide</button>
      </div>
      <div className="layout-mini-grid">
        <label className="layout-range">
          <span>Left <b>{layout.rail}px</b></span>
          <input type="range" min="128" max="260" step="2" value={layout.rail} onChange={(event) => setField("rail", Number(event.target.value))} aria-label="Left rail width in pixels" />
        </label>
        <label className="layout-range">
          <span>Right <b>{layout.insights}px</b></span>
          <input type="range" min="230" max="420" step="2" value={layout.insights} onChange={(event) => setField("insights", Number(event.target.value))} aria-label="Right insights panel width in pixels" />
        </label>
        <label className="layout-range type-scale">
          <span>Text Scale <b>{Math.round(layout.fontScale * 100)}%</b></span>
          <input type="range" min="0.75" max="1.35" step="0.025" value={layout.fontScale} onChange={(event) => setField("fontScale", Number(event.target.value))} aria-label="Text scale percentage" />
        </label>
      </div>
      <div className="layout-note">
        <Columns3 aria-hidden="true" />
        <div>
          Auto keeps the dashboard centered and avoids edge-to-edge sprawl. Moving the viewport slider switches to Manual.
        </div>
      </div>
    </section>
  );
}

// R4.9.5f (fin-eia): factored out the topics object as a module-level factory so
// the help-drawer test suite can verify shape, counts, categories, and related-key
// cross-references without instantiating React. The factory takes the active tax
// law because the taxScenarios topic interpolates ruleset values into a section
// title; all other topics are static.
function buildHelpTopics(activeTaxLaw = DEFAULT_TAX_LAW) {
  return {
    tutorial: {
      title: "Guided Tutorial",
      summary: "Use the dashboard as a decision cockpit: configure assumptions, tune the canvas, read the KPI strip, pressure-test risk, then export or print the plan.",
      steps: ["Leave Canvas Control on Auto for a centered, device-aware workspace; use Focus, Comfort, Wide, or the slider only when you want a manual override.", "Choose a scenario in the left rail.", "Open Model and set corpus, allocation, instruments, retiree tax profile, inflation, and goals.", "Answer the Strategy Shortlist wizard so the app knows whether the retiree values cash stability, growth, tax efficiency, or legacy.", "Read the Withdrawal Policy & Trust Plan before deciding whether the plan is usable.", "For retirement income, compare Interest, SWP, and IDCW engines before reading the charts.", "Use Smart Insights for a plain-English diagnosis.", "Stress-test with Monte Carlo, Scenario Lens, and Sensitivity Map.", "Export PDF for a client-ready report or CSV for the full monthly FIFO trail when SWP is active."],
      category: "getting-started",
      related: ["coach", "canvasControl", "mobileGuide", "decisionWorkspace", "optimizer", "policy"]
    },
    coach: {
      title: "Context Coach",
      summary: "Use this as the product map when you feel lost. Pick the question that sounds like your situation, then follow the linked workspace and Help topic.",
      steps: [
        "If you are starting fresh, open Guided Planner and answer the household and risk questions before tuning returns.",
        "If a number changed unexpectedly, open Why Numbers Changed and compare the latest saved snapshot.",
        "If tax is the concern, open Tax Assumptions & Scenarios before reading export numbers.",
        "If the plan looks close, open Risk Engine and check downside paths, not only the median.",
        "If you need to share it, use Adviser / CA Review Pack instead of screenshots."
      ],
      sections: [
        {
          title: "Choose Your Path",
          items: [
            "New retiree: Guided Planner -> Assumption Studio household tab -> Trust Center.",
            "Tax review: Tax Studio -> Tax Assumptions & Scenarios -> Monthly FIFO Ledger -> Review Pack.",
            "Family conversation: Overview verdict -> Saved Scenario Timeline -> PDF report.",
            "Stress test: Simulations -> Scenario Library -> Risk Engine -> Sensitivity Heatmap.",
            "Mobile use: Verdict card -> Guided start -> Smart insights -> export later on desktop if needed."
          ]
        }
      ],
      category: "getting-started",
      related: ["tutorial", "whyChanged", "mobileGuide", "trustCenter", "decisionWorkspace"]
    },
    whyChanged: {
      title: "Why Numbers Changed",
      summary: "Every visible number is generated from the same normalized state. When numbers move, the cause is usually a cash target, tax profile, product classification, return source, risk assumption, or household input.",
      steps: [
        "Save a baseline in Saved Scenario Timeline before major edits.",
        "After changing an assumption, read the delta cards against the latest saved snapshot.",
        "Editing Monthly cash in the solver switches the live projection to Monthly target mode so KPI tiles, charts, rail, ledger, and exports recalculate against that cash need.",
        "If you manually choose % interest mode, Withdrawal % drives the cash path and Monthly cash becomes a comparison target only.",
        "Check whether household mode is overriding the manual monthly cash target.",
        "Check whether manual all-tax override is bypassing the retiree tax profile.",
        "Check Return source: manual return and equity/debt blend use different inputs.",
        "Check cash strategy: Interest, SWP, and IDCW have different tax and corpus behaviour.",
        "Regenerate exports after edits; old PDF/CSV files are historical artifacts."
      ],
      category: "getting-started",
      related: ["tutorial", "coach", "planFingerprint", "scenarioLibrary"]
    },
    privacy: {
      title: "Local Data & Privacy",
      summary: "The planner is local-first. It stores assumptions, named scenario history, layout preferences, theme, and tour state in this browser profile so the dashboard remembers your configuration without sending it to a server.",
      steps: [
        "Treat real client or family assumptions as private financial data.",
        "Use Reset for the current plan when you want to return to workbook defaults.",
        "Use Clear saved data in this Help topic when you want to remove remembered assumptions, layout, theme, tour, and consent state from this browser profile.",
        "Use your browser's site-data controls as a fallback if you are on a shared machine or the in-product clear action is blocked by browser policy.",
        "PDF, CSV, JSON, and HTML exports are local files under your control and carry the sensitivity of the assumptions inside them.",
        "Do not paste real client data into AI tools or external websites unless you have explicit permission and a privacy basis."
      ],
      sections: [
        {
          title: "Stored In Browser",
          items: [
            "fin-cockpit-state-v2: assumptions, scenario, active page, and ledger mode.",
            "fin-cockpit-layout-v2: viewport, column widths, density, and font scale.",
            "fin-cockpit-theme: light or dark preference.",
            "fin-cockpit-guided-tour-v1: whether the first-run tour has been completed.",
            "disclaimer_acknowledged_v1: whether the in-app disclaimer notice has been acknowledged (new key, R4.5b).",
            "fin-cockpit-privacy-consent-v1: legacy privacy-consent key; migrated to disclaimer_acknowledged_v1 on first load.",
            `${SCENARIO_HISTORY_KEY}: saved named plan snapshots, notes, tax-law versions, output summaries, and fingerprints.`
          ]
        },
        {
          title: "Not Sent By The App",
          items: [
            "There is no hosted account, backend sync, analytics beacon, or telemetry pipeline in this build.",
            "The editable tax-law derivation script runs outside the browser and requires review before rules are applied.",
            "Future hosted or collaborative features need a new privacy and security review before implementation."
          ]
        },
        {
          title: "Clear Saved Data",
          items: [
            "The in-product clear action removes the known dashboard localStorage keys from this browser profile and resets the live app to safe defaults.",
            "It does not delete PDF, CSV, JSON, or HTML files that you have already downloaded.",
            "After clearing, the privacy notice and guided tour return because consent and tour completion are also removed."
          ]
        }
      ],
      category: "trust",
      related: ["trustCenter", "planFingerprint", "reviewPack", "whenToConsult"]
    },
    trustCenter: {
      title: "Trust Center",
      summary: "Use this topic before acting on the plan. It explains privacy, model limits, tax provenance, risk-method limits, export sensitivity, and when to involve a SEBI-registered adviser or Chartered Accountant.",
      steps: [
        "Start with the assumptions fingerprint. If two reports have different fingerprints, they are not the same plan.",
        "Check Local Data to understand what is stored in this browser and what is not sent anywhere by the app.",
        "Check Tax Rules before relying on tax drag; editable rules need source metadata and human review.",
        "Read Risk Engine as scenario sensitivity, not a prediction or guarantee.",
        "Treat exports as sensitive private financial files because they leave the browser context.",
        "Use the adviser/CA review pack for close decisions, tax edge cases, product classification, and public/shareable handoff."
      ],
      sections: [
        {
          title: "Trust Surface Checklist",
          items: [
            "Privacy: assumptions, scenario history, layout, theme, tour state, and consent are localStorage data.",
            "Model: returns, volatility, inflation, taxes, product classification, and cash behaviour are assumptions.",
            "Tax: slab income, special-rate gains, SWP cost recovery, 87A, 80TTB, TDS, and surcharge are planning-grade only.",
            "Risk: Monte Carlo uses configured sample size, seed, shock model, and active cash engine; it does not predict markets.",
            "Exports: PDF, CSV, scenario JSON, review pack JSON, and copied HTML are private files on disk.",
            "Human review: close plans should be challenged by a qualified adviser and CA."
          ]
        },
        {
          title: "When Not To Trust The Output Yet",
          items: [
            "Manual all-tax override is non-zero and you want product-specific tax guidance.",
            "Tax Law Studio shows changed rules without CA-reviewed source evidence.",
            "End Target Chance is close to the decision threshold or sample size is low.",
            "The plan depends on old units, grandfathering, debt-fund acquisition dates, NRI status, surcharge, or mixed special-rate gains.",
            "The retiree has healthcare, dependant, spouse, or legacy needs that are not captured in household mode."
          ]
        }
      ],
      category: "trust",
      related: ["privacy", "planFingerprint", "reviewPack", "whenToConsult", "taxLawUpdates"]
    },
    core: {
      title: "Core Formula",
      summary: "Each year earns interest on opening corpus, subtracts modelled tax, withdraws the chosen share of after-tax interest, reinvests the balance, applies top-ups, and then applies any shock event.",
      steps: ["Principal is the starting investable corpus.", "Effective yield comes from annual return and compounding.", "Withdrawal is a share of after-tax interest.", "Real values are inflation-adjusted."],
      category: "concepts",
      related: ["retirement", "effectiveYield", "realVsNominal", "portfolioJourney"]
    },
    india: {
      title: "Indian Money View",
      summary: "All values use INR lakh/crore notation. Real corpus and real cash flow discount future money by your inflation setting so the plan reads in today's rupees.",
      steps: ["Set inflation to your planning assumption.", "Compare nominal corpus with real corpus.", "Use monthly cash target in today's rupees.", "Check final-year cash against the inflated target."],
      category: "concepts",
      related: ["realVsNominal", "inflationModel", "portfolioJourney", "sensitivity"]
    },
    household: {
      title: "Household Retirement Plan",
      summary: "Use household mode when the retiree is not a single number. It derives the cash need from essential spend, discretionary spend, spouse/survivor needs, dependants, pension, rent, annuity, healthcare reserve, emergency reserve, known goals, longevity, and legacy.",
      steps: [
        "Switch on Use household plan in the Assumption Studio.",
        "Enter essential expenses first; this is the income floor the plan must protect.",
        "Enter discretionary expenses separately so bad-market guidance can trim the right bucket instead of blindly cutting everything.",
        "Add spouse/survivor need and dependant support years so the cash target changes when dependant support ends.",
        "Add pension, rent, annuity, PMVVY-style pension cash, and other income as offsets to portfolio withdrawals.",
        "Add healthcare reserve, emergency months, known lump-sum goals, longevity horizon, contingency years, and legacy corpus.",
        "Review the planner again: the optimizer now scores buckets against the household-derived cash need, not only the manual monthly target."
      ],
      sections: [
        {
          title: "What Changes In The Model",
          items: [
            "Effective monthly cash becomes household expenses minus non-portfolio income.",
            "The corpus target includes healthcare and emergency reserves, plus the higher of the manual target corpus and legacy goal.",
            "Known lump sums are injected into the target cash in their selected year.",
            "Longevity and contingency can extend the projection horizon when household mode is active."
          ]
        },
        {
          title: "Retiree Lens",
          items: [
            "Essential expenses should be backed by the safest cash/floor bucket.",
            "Discretionary expenses are the first spending lever in weak markets.",
            "Non-portfolio income such as pension, rent, annuity, and PMVVY-style cash flow reduces the portfolio withdrawal burden but still needs tax review.",
            "Healthcare reserves are treated as planning capital, not as return-seeking money."
          ]
        }
      ],
      category: "metrics",
      related: ["goals", "monthlyCashSolver", "policy", "corpusFloor", "defensiveCover"]
    },
    scenarioLibrary: {
      title: "Scenario Library",
      summary: "The scenario library gives a retiree, adviser, and CA a shared set of standard stress cases: base, conservative income floor, higher income, lower returns, tax-optimised SWP, crash-first-decade, healthcare reserve, sticky inflation, and spouse longevity.",
      steps: [
        "Open Simulations and review the Scenario Library before changing major assumptions.",
        "Apply a scenario when you want to make it the live working model.",
        "Save a scenario when you want it to appear in the named timeline with notes and provenance.",
        "Export a scenario JSON when you want to send one exact case for review.",
        "Use annotations in the Saved Scenario Timeline to record why a scenario was accepted, rejected, or needs adviser review."
      ],
      sections: [
        {
          title: "What The Defaults Are For",
          items: [
            "Base Retirement Plan preserves the live assumptions as the neutral comparison.",
            "Conservative Income Floor asks whether lower volatility and more defensive cover still meet cash needs.",
            "Higher Income Need reveals whether lifestyle stretch breaks the plan.",
            "Lower Return Decade catches overconfidence in return assumptions.",
            "Tax-Optimised SWP tests old-unit cost recovery, LTCG harvesting, and FIFO review.",
            "Crash In First Decade tests sequence risk when a bad market appears early.",
            "Healthcare Shock Reserve adds medical and emergency buffers before judging income.",
            "Sticky Inflation Decade asks whether purchasing power survives higher inflation.",
            "Spouse Longevity Plan extends survivor-income and legacy needs."
          ]
        }
      ],
      category: "metrics",
      related: ["risk", "sequenceOfReturns", "scenarioDepletion", "sensitivity"]
    },
    tax: {
      title: "Indian Tax Engine",
      summary: "Equity LTCG, STCG, debt mutual fund slab taxation, FD-style interest, listed debt taxation, IDCW tax, SWP FIFO taxation, retiree profile slabs, rebate, cess, and manual override are modelled separately for planning. This is not tax advice.",
      steps: ["Growth/SWP mode redeems monthly lots using FIFO inside each bucket.", "Only the realised gain portion is taxed; recovered cost capital is not taxed again.", "Equity LTCG uses the annual exemption when LTCG harvesting is enabled.", "Debt-oriented specified mutual funds and IDCW are treated as slab-rate income inside the retiree tax profile.", "IDCW is modelled as taxable distribution income and can be less efficient when slab room is exhausted."],
      category: "tax",
      related: ["taxScenarios", "taxLawUpdates", "section87aRebate", "section115bacNewRegime", "surchargeMarginalRelief", "taxDrag", "taxPath"]
    },
    taxLawUpdates: {
      title: "Tax Law Studio",
      summary: "Tax law changes often, so the dashboard now uses an editable tax-law ruleset. You can paste, load, validate, apply, reset, and download the rules used by every tax calculation.",
      steps: [
        "Open Model, then Tax Law Studio.",
        "Edit the JSON ruleset or load a reviewed JSON file from your machine.",
        "Keep version, source, sourceUrl, and updatedOn current so the plan remains auditable.",
        "Press Apply rules only after the JSON is valid. The dashboard recalculates slabs, rebates, cess, special rates, exemptions, holding periods, heatmap, Monte Carlo, tables, and tax labels from the applied rules.",
        "Use Reset baseline if a draft goes wrong, then reapply your corrected rules."
      ],
      sections: [
        {
          title: "What The Rules Control",
          items: [
            "New-regime and old-regime slab bands by age category.",
            "Section 87A rebate threshold, maximum rebate, and marginal-relief behaviour.",
            "Equity LTCG, equity STCG, listed-bond LTCG rates, health and education cess, annual equity LTCG exemption, and long-term holding period months.",
            "Debt mutual fund treatment metadata, which supports the instrument labels and guidance."
          ]
        },
        {
          title: "Why Auto-Scraping Is Review-First",
          items: [
            "A static dashboard opened from a local file cannot reliably fetch official pages because browsers enforce cross-origin rules and government pages can change structure.",
            "Even when a page can be fetched, deriving tax law needs interpretation. The app should never silently rewrite tax rules without a human review step.",
            "The safe automation path is: fetch official sources outside the browser, parse candidate rules, show a diff, then let the user apply or reject the ruleset."
          ]
        },
        {
          title: "Suggested Update Workflow",
          items: [
            "Start from official Income Tax Department pages, Budget/Finance Act notes, or CA-reviewed sources.",
            "For this project, npm run tax:derive can generate a candidate JSON from official page markers; review the output before loading it into Tax Law Studio.",
            "Update the JSON values, check the validation summary, then apply the rules.",
            "Export the JSON alongside a PDF/CSV report so the projection can be reproduced later.",
            "For filing-grade decisions, use this as a planning model and verify with a qualified tax professional."
          ]
        }
      ],
      category: "tax",
      related: ["tax", "taxScenarios", "fa2025Scope", "section87aRebate", "section115bacNewRegime", "whenToConsult"]
    },
    taxScenarios: {
      title: "Tax Assumptions & Scenarios",
      summary: "Use this guide to read the tax engine like a retirement planner: slab-rate income now runs through a retiree tax profile, while special-rate capital gains remain separate and recovered cost capital is not taxed again.",
      steps: [
        "Start by deciding whether the retiree has other taxable income. If other income is zero, slab-rate retirement income can benefit from the new-regime Section 87A rebate when eligible.",
        "Classify each cash source: FD interest, IDCW, and slab-taxed debt gains are normal/slab income; equity LTCG/STCG and listed-bond special-rate gains are special-rate capital gains.",
        "Keep Manual all-tax override at 0 when you want the retiree profile. A non-zero override intentionally bypasses the profile and taxes all modelled investment income at one rate.",
        "For SWP, focus on realised gain, taxable gain, cost capital recovered, and LTCG exemption used. The return of cost capital is cash flow, not taxable income.",
        "Use tax-aware SWP order guidance to compare pro-rata, debt-first, and equity-first redemptions, then confirm the monthly FIFO schedule before exporting."
      ],
      sections: [
        {
          title: "Retiree Profile Inputs",
          items: [
            "Tax model chooses between the retiree profile engine and a legacy flat slab scenario.",
            "The retiree profile uses tax regime, age band, residential status, other taxable income, standard deduction, Section 87A setting, cess, and instrument classification.",
            "Standard deduction is only applied against pension/salary-like income entered in the dedicated pension field; it is not subtracted from pure interest or mutual-fund distribution income.",
            "Section 80TTB is modelled for resident senior and super-senior old-regime deposit-style interest streams, with the editable ruleset controlling the deduction cap.",
            "Non-resident mode disables resident-only rebate assumptions and can apply a separate NRI withholding timing rate to modelled taxable investment income and gains.",
            "The engine calculates tax attributable to the investment plan incrementally, so other income can consume slab room or rebate eligibility without being counted as portfolio tax drag.",
            "The 87A interpretation switch controls threshold testing: the default disables rebate when special-rate capital gains are present, while adviser-reviewed sensitivity modes remain available."
          ]
        },
        {
          title: `${formatInr(activeTaxLaw.rebates?.new?.threshold || 0)} Rebate / Retiree No-Other-Income Scenario`,
          items: [
            `For ${activeTaxLaw.version} planning, the new regime has a Section 87A rebate framework that can make eligible slab-rate income up to ${formatInr(activeTaxLaw.rebates?.new?.threshold || 0)} effectively nil-tax for resident individuals, subject to the active ruleset and interpretation setting.`,
            "That benefit is relevant when the retiree has no other taxable income and the income is chargeable at slab rates, such as FD interest, IDCW, or slab-taxed debt-fund gains.",
            "The dashboard applies this only to slab-rate income. It is not the same as making every investment withdrawal tax-free."
          ]
        },
        {
          title: "Special-Rate Capital Gains",
          items: [
            "Equity STCG under Section 111A, equity LTCG under Section 112A, and listed-bond LTCG style treatment are kept separate from slab income.",
            "Equity LTCG can still use its annual exemption when enabled, and resident individuals can use unused basic exemption room before special-rate tax is applied.",
            "Section 87A rebate is not used to erase these special-rate taxes in the model.",
            "Equity product class, acquisition year, and STT eligibility decide whether equity gains are treated as special-rate LTCG/STCG or conservatively as slab income."
          ]
        },
        {
          title: "Debt And Product Classification",
          items: [
            "Debt MF post-2023 specified treatment is conservatively modelled as slab-rate gain.",
            "Older debt-fund lots can be modelled separately for adviser-reviewed sensitivity instead of silently mixing them with post-2023 lots.",
            "Listed bonds/debt ETFs use their own product class and holding-period switch.",
            "FDs, G-secs, T-bills, and coupons are modelled as slab-rate income unless the editable ruleset says otherwise.",
            "Acquisition year is explicit because retirement portfolios often contain old units whose tax answer differs from new money."
          ]
        },
        {
          title: "Scenario Guidance",
          items: [
            "Interest mode is easiest to read when cash comes from normal taxable income. Use this for FD-like or coupon-like income scenarios.",
            "SWP mode is better for mutual fund retirement drawdown because it can show cost capital recovery, realised gain, exemption use, and lot-level tax drag.",
            "IDCW mode is included for comparison, but treat it cautiously: it is distribution income, reduces NAV, and should not be assumed as guaranteed income."
          ]
        },
        {
          title: "Manual Override And Flat Scenario",
          items: [
            "Manual all-tax override is a deliberate stress-test switch; it taxes all modelled investment income at one rate and ignores the retiree profile.",
            "Legacy flat slab mode keeps the older quick-scenario behaviour for users who want to force a single slab rate.",
            "For filing-grade tax advice, still consult a CA; this dashboard is a planning simulator, not an income-tax return utility."
          ]
        },
        {
          title: "Surcharge, TDS, And Form 15G/15H",
          items: [
            "The ruleset includes surcharge bands, a special-rate surcharge cap, and planning-grade marginal relief for high-income cases.",
            "TDS is shown as cash-timing drag, not extra final tax. If Form 15G/15H is enabled and the retiree profile appears eligible, the model suppresses interest TDS in the timing view.",
            "Use the editable tax-law ruleset and CA review for edge cases around surcharge, marginal relief, and mixed special-rate gains."
          ]
        }
      ],
      category: "tax",
      related: ["tax", "taxLawUpdates", "section87aRebate", "section74CarryForward", "section115bacNewRegime", "surchargeMarginalRelief", "fa2025Scope", "taxPath", "taxDrag", "fifo"]
    },
    retirement: {
      title: "Retirement Cash Engine",
      summary: "Choose how retirement cash is generated: spend after-tax interest, redeem growth units through SWP, or model IDCW payouts. Each behaves differently for tax, corpus depletion, and cash stability.",
      steps: ["Interest mode spends after-tax income and can optionally dip into principal if target cash is higher.", "SWP mode grows the portfolio monthly, redeems old lots first, and taxes only realised gains based on cost basis and holding age.", "Monthly target mode makes Monthly cash the live withdrawal target; direct edits to Monthly cash switch into this mode.", "% interest mode makes Withdrawal % the driver and keeps Monthly cash as a benchmark for Cash Goal, corpus-needed, return-needed, and max-cash solvers.", "Monthly target mode intentionally shows zero after the corpus is exhausted; use the stress banner, required corpus, return needed, and max monthly cash as guardrails.", "IDCW mode reduces NAV by the distribution and taxes payouts as distribution income.", "Use What-If Lab to solve required corpus, required return, and sustainable monthly cash."],
      category: "concepts",
      related: ["swpVsInterestVsIdcw", "withdrawalRate", "fifo", "monthlyCashSolver", "cashFlowTile"]
    },
    fifo: {
      title: "Monthly FIFO Ledger",
      summary: "The SWP ledger is a planning-grade monthly tax-lot simulation. It sells the oldest units first in each selected bucket, separates cost capital from gain, applies the annual equity LTCG exemption, and records net cash after tax.",
      steps: ["Choose SWP as the cash strategy.", "Set cost basis and existing holding age for old units.", "Pick pro-rata, debt-first, or equity-first redemption order.", "Open Monthly FIFO in the schedule to inspect sampled months.", "Download CSV for every month in the projection."],
      category: "metrics",
      related: ["swpVsInterestVsIdcw", "taxScenarios", "section74CarryForward", "csvExport", "retirement"]
    },
    risk: {
      title: "Risk Engine",
      summary: "Monte Carlo paths now generate year-by-year sequence-of-returns paths and rerun the active cash engine, so bad early returns can change depletion, P10/P50/P90, and end-target chance.",
      steps: ["End Target Chance is the share of sampled paths whose final nominal corpus clears the inflated corpus target.", "Set sample size and seed when you want repeatable risk runs; higher sample sizes are slower but smoother.", "Use equity/debt volatility and correlation when asset-blend mode is active; manual-return mode uses the single annual volatility field.", "SWP, IDCW, and interest modes keep their active cash semantics inside the risk surface.", "Read P10 as the downside case and P50 as the median path, not as guarantees."],
      category: "metrics",
      related: ["understandingMC", "planEndurance", "targetConfidence", "monteCarloUncertainty", "sequenceOfReturns", "riskGuardrail", "displayRule"]
    },
    sensitivity: {
      title: "Sensitivity Heatmap",
      summary: "The heatmap colours are based on real purchasing power. The big number is nominal final corpus, but the colour uses the inflation-adjusted value shown underneath.",
      steps: ["Red means the real final corpus is below today's starting corpus.", "Amber means starting capital is protected in real terms, but the real target corpus is still short.", "Blue means the target corpus is reached in today's rupees.", "Teal means the real target is reached with at least a 20% buffer."],
      category: "metrics",
      related: ["realVsNominal", "inflationModel", "india", "withdrawalRate", "risk"]
    },
    glossary: {
      title: "Retirement Glossary",
      summary: "Plain-English definitions for the terms that matter when reading the planner, tax studio, simulations, ledger, and exports.",
      steps: ["Search this topic whenever an acronym appears in a chart or tax panel.", "Use the glossary as orientation, not as filing advice.", "For legal tax treatment, confirm the rule in the active Tax Law Studio JSON and with a qualified adviser."],
      sections: [
        {
          title: "Withdrawal And Product Terms",
          items: [
            "SWP: Systematic Withdrawal Plan; planned redemptions from fund units, where only realised gain is taxable.",
            "IDCW: Income Distribution cum Capital Withdrawal; distribution cash that can reduce NAV and may be slab-taxed.",
            "FIFO: First-in-first-out lot sale order; oldest units are treated as redeemed first in the monthly SWP ledger.",
            "Cost capital: the invested cost portion recovered through a sale; it is cash flow but not fresh taxable gain."
          ]
        },
        {
          title: "Capital Gains Terms",
          items: [
            "LTCG: Long-term capital gain; equity LTCG can use the annual exemption when eligible.",
            "STCG: Short-term capital gain; equity STCG is usually special-rate taxed when Section 111A conditions are met.",
            "FMV 31-Jan-2018: grandfathering reference value for eligible old equity units; taxable LTCG uses the deemed-cost rule.",
            "Special-rate gains: capital gains taxed at their own rates instead of normal slab rates."
          ]
        },
        {
          title: "Retiree Tax Terms",
          items: [
            "Section 87A: rebate for eligible resident individuals on slab-rate income within the ruleset threshold; not a blanket exemption for special-rate gains.",
            "Section 80TTB: old-regime deduction for eligible resident senior/super-senior deposit-style interest, controlled by the editable ruleset.",
            "Surcharge: additional tax layer for high-income cases; this planner models planning-grade bands and marginal relief metadata.",
            "Cess: health and education cess applied where the active ruleset says it applies."
          ]
        }
      ],
      category: "concepts",
      related: ["hindiGlossary", "taxScenarios", "section87aRebate", "swpVsInterestVsIdcw"]
    },
    hindiGlossary: {
      title: "Hindi Retirement Glossary Pilot",
      summary: "A small Hindi/English glossary pilot for Indian retirees and family members who prefer familiar retirement-planning words before reading the detailed English model.",
      steps: [
        "Use this as orientation for family discussions; the model and tax rules remain in English for precision.",
        "Pair each Hindi term with the matching dashboard field before changing assumptions.",
        "For tax filing, still rely on the English tax-law ruleset and CA review."
      ],
      sections: [
        {
          title: "Core Planning Terms",
          items: [
            "Corpus / कोष: investable retirement capital available today.",
            "Monthly cash / मासिक नकद: monthly amount needed from the plan in today's rupees.",
            "Inflation / महंगाई: purchasing-power erosion used to convert future values into today's rupees.",
            "Cash bucket / नकद सुरक्षा खाता: defensive money used to fund spending in weak markets.",
            "SWP / व्यवस्थित निकासी: planned fund-unit redemptions where tax depends on realised gain, not the full cash received."
          ]
        },
        {
          title: "Tax Terms",
          items: [
            "LTCG / दीर्घकालीन पूंजीगत लाभ: long-term capital gains with special rules for eligible equity.",
            "STCG / अल्पकालीन पूंजीगत लाभ: short-term capital gains, often taxed differently from slab income.",
            "Rebate / छूट: tax relief such as Section 87A when eligibility conditions are met.",
            "TDS / स्रोत पर कर कटौती: tax withheld during the year; in this planner it is treated as cash-timing drag, not extra final tax."
          ]
        }
      ],
      category: "concepts",
      related: ["glossary", "taxScenarios", "section87aRebate"]
    },
    goals: {
      title: "Goals And Gap Solver",
      summary: "The dashboard treats target corpus as today's rupees, inflates it internally to the final year, and then estimates required annual top-up or required return if the plan is short.",
      steps: ["Set target corpus in today's rupees.", "Set monthly cash target.", "Read Corpus Goal and Cash Goal separately.", "Use Gap Solver for top-up or return requirement."],
      category: "metrics",
      related: ["incomeCover", "closingTheGap", "gapSolver", "gapFramings", "monthlyCashSolver"]
    },
    optimizer: {
      title: "Recommended Strategy Shortlist",
      summary: "The strategy builder behaves like a retirement planner: it converts goals, cash need, risk comfort, liquidity, tax profile, and legacy preference into a scored shortlist. It is guidance, not a mathematical optimum.",
      steps: ["Answer the wizard questions in plain language.", "Read the initial withdrawal-rate diagnosis before chasing returns.", "Review the top strategy and the alternatives ranked by income coverage, real corpus durability, tax drag, risk fit, and liquidity.", "Pin a candidate if you want to compare it against the current recommendation.", "Use Apply Strategy to push a recommendation into the live model.", "Treat the instrument lanes as planning guidance: cash bucket, income floor, growth engine, and tax moves."],
      category: "metrics",
      related: ["strategyShortlist", "withdrawalRate", "defensiveCover", "policy", "taxPath"]
    },
    policy: {
      title: "Withdrawal Policy & Trust Plan",
      summary: "This topic turns the projection into a retirement operating policy: how much to withdraw, where cash should come from, what to do in bad markets, and which assumptions need review.",
      steps: [
        "Start with the withdrawal-rate label. Comfortable means the model has room; Gap first means spending/corpus must be solved before asset allocation.",
        "Check Defensive Cover. The plan compares available debt/cash cover with the reserve preference chosen in the guided planner.",
        "Read Cash Bucket, Crash Response, Refill Rule, and Glide Path as operating rules, not predictions.",
        "Use Tax Optimization to decide what needs CA review before withdrawing.",
        "Export the PDF when the policy, assumptions, and tax-law ruleset look coherent."
      ],
      sections: [
        {
          title: "Common Mistakes To Avoid",
          items: [
            "Treating IDCW as guaranteed income.",
            "Selling equity after a drawdown when a cash/debt bucket could fund spending.",
            "Ignoring TDS or slab-income impact on cash timing.",
            "Optimising return before checking withdrawal rate and cash reserve.",
            "Using a stale tax ruleset after a Budget or Finance Act change."
          ]
        },
        {
          title: "Instrument Glossary",
          items: INSTRUMENT_CATALOG.map((item) => `${item.name}: ${item.role}; ${item.bestFor}; tax note: ${item.tax}.`)
        }
      ],
      category: "trust",
      related: ["withdrawalRate", "defensiveCover", "corpusFloor", "optimizer", "reviewPack", "whenToConsult"]
    },
    reviewPack: {
      title: "Adviser / CA Review Pack",
      summary: "The review pack is the professional handoff surface. It downloads a PDF report, full CSV evidence trail, and a structured JSON pack containing assumptions, tax-law rules, scenario comparison, risk method, caveats, and provenance.",
      steps: [
        "Open Ledger and press Download review pack.",
        "Keep the PDF, CSV, and JSON together because each file explains a different part of the evidence.",
        "Send the tax-law JSON and assumptions fingerprint to the CA/adviser whenever the tax answer is disputed.",
        "Use the scenario comparison to ask which case is actually being recommended.",
        "Regenerate the pack after any material assumption change; old packs remain sensitive files on disk."
      ],
      sections: [
        {
          title: "Included Evidence",
          items: [
            "PDF report: narrative summary, charts, policy, tax guidance, assumptions, and caveats.",
            "CSV ledger: annual schedule and monthly FIFO trail when SWP is active.",
            "Tax-law JSON: active ruleset version, source, source URL, updated date, slabs, rebates, special rates, and holding periods.",
            "Assumptions JSON: the normalized live state and fingerprint.",
            "Scenario comparison: standard library outputs plus saved scenario snapshot summaries.",
            "Risk method: sample size, seed, method, confidence band, P10/P50/P90 context, and caveat page."
          ]
        }
      ],
      category: "trust",
      related: ["planFingerprint", "pdfExport", "csvExport", "trustCenter", "whenToConsult"]
    },
    planEndurance: {
      title: "Plan Endurance",
      summary: "Plan Endurance shows the share of simulated futures in which your money lasts the full plan — the portfolio never reaches zero before the final year. It answers the lay question 'will I run out?' rather than 'will I hit a target corpus?'",
      steps: [
        "Read the Plan Endurance gauge in the Decision Workspace; the percentage is the share of simulated paths whose final corpus stays above zero.",
        "Out of 1000 simulated futures, an 80% endurance reading means roughly 800 finish with something left and 200 deplete before the horizon.",
        "Plan Endurance is almost always equal to or higher than Target Confidence because ending with any positive balance counts as endurance, even ₹1.",
        "Use the ± margin shown beside the value to gauge how stable the estimate is at the current sample size.",
        "Do not read Plan Endurance as a guarantee — it reflects the return, volatility, and shock assumptions you set, not the actual future."
      ],
      category: "metrics",
      related: ["targetConfidence", "monteCarloUncertainty", "displayRule", "planEnduranceVsTargetConfidence", "risk", "understandingMC"]
    },
    targetConfidence: {
      title: "Target Confidence",
      summary: "Target Confidence shows the share of simulated futures where your final corpus meets or exceeds your target corpus in nominal terms. It is a stricter test than Plan Endurance because it asks the portfolio to hit a specific terminal-wealth goal, not just survive.",
      steps: [
        "Set a target corpus in the Assumption Studio before reading this tile; if your target is zero, Target Confidence equals Plan Endurance.",
        "Out of 1000 simulated futures, a 40% reading means roughly 400 paths finished at or above your target.",
        "A value below 50% does not mean the plan fails — most paths may still finish with substantial money, just below your stated target.",
        "Compare Target Confidence with Plan Endurance: a wide gap means many paths survive but fall short of the target, which is a signal to revisit the target itself, not necessarily the corpus.",
        "Use the ± margin to judge how sensitive the displayed number is to the random seed and sample size."
      ],
      category: "metrics",
      related: ["planEndurance", "monteCarloUncertainty", "displayRule", "planEnduranceVsTargetConfidence", "marketMargin", "risk"]
    },
    incomeCover: {
      title: "Income Cover",
      summary: "Income Cover compares your model's final-year annual withdrawal to the inflation-adjusted annual income you said you need. A value at or above 100% means the model delivers your target cash in the final year of the projection.",
      steps: [
        "Income Cover = final-year withdrawal divided by inflation-adjusted annual income target, shown as a percentage.",
        "100% means the plan exactly matches your stated income need at the end of the projection; above 100% there is surplus.",
        "If Income Cover is below 100%, the tile detail shows the shortfall in today's rupees so you can see the size of the gap.",
        "Check whether household mode is active — it derives the effective monthly cash target from essential spend, discretionary spend, dependants, and offsets, which may differ from the manual monthly target.",
        "Income Cover is deterministic — it reflects the single-path projection, unlike Plan Endurance and Target Confidence which are Monte Carlo metrics."
      ],
      category: "metrics",
      related: ["closingTheGap", "cashFlowTile", "goals", "monthlyCashSolver", "retirement"]
    },
    closingTheGap: {
      title: "Closing The Gap",
      summary: "When the plan falls short, Closing the Gap shows the three levers that can fix it: add corpus, accept a lower monthly draw, or find a higher return. It presents the required amount for each lever so you can choose the trade-off that fits your situation.",
      steps: [
        "A gap appears when income or corpus is below your target; the panel summarises it in plain English first, then numbers.",
        "Three equivalent solutions are shown: how much additional starting corpus is needed, what lower monthly draw is sustainable, and what return rate would make the current plan work.",
        "All three numbers solve the same gap — you only need one of the three changes, not all of them.",
        "Combining smaller changes across all three levers (some extra corpus, slightly lower spend, modest return improvement) is often more realistic than fixing one lever entirely.",
        "Use the Monthly Cash Solver in the What-If Lab to explore the levers interactively."
      ],
      category: "metrics",
      related: ["incomeCover", "gapSolver", "gapFramings", "monthlyCashSolver", "goals"]
    },
    scenarioDepletion: {
      title: "Scenario Depletion",
      summary: "Scenario Depletion marks the year a simulated or scenario path reaches zero corpus. The annotation 'Plan depleted at year N' replaces a bare ₹0 so you can see when the shortfall happens, not just that it does.",
      steps: [
        "A depletion annotation appears on scenario cards and Monte Carlo paths when the corpus reaches zero before the projection ends.",
        "Early depletion (in the first decade) is the most damaging case because there is no time to recover — this is sequence-of-returns risk.",
        "Late depletion (in the final year or two) is far less severe — most income goals were met and the plan mostly worked.",
        "Use the Crash In First Decade and Sticky Inflation Decade scenarios in the Scenario Library to specifically surface early-depletion risk.",
        "If multiple scenarios deplete, revisit withdrawal rate and defensive cover before tuning returns."
      ],
      category: "metrics",
      related: ["sequenceOfReturns", "planEndurance", "scenarioLibrary", "risk", "withdrawalRate"]
    },
    monteCarloUncertainty: {
      title: "Monte Carlo Uncertainty",
      summary: "Monte Carlo results carry statistical uncertainty because they are estimates from a finite sample of simulated futures. The ± margin shown beside Plan Endurance and Target Confidence is the 95% confidence interval half-width — a frequency-based measure of how stable the estimate is.",
      steps: [
        "If you re-ran the simulation 100 times with different random seeds, about 95 of those runs would produce a result within the displayed ± margin of the displayed value.",
        "Higher sample size shrinks the margin: at the default 1000 paths, a 50% endurance probability has roughly ±3 percentage points of margin.",
        "The margin only appears when it exceeds 2 percentage points — smaller margins are suppressed to avoid visual clutter.",
        "The margin captures sampling variability only — it does not capture model risk, wrong return assumptions, wrong volatility, or a wrong shock model.",
        "When the margin is large (10 percentage points or more), treat the displayed number as an approximation and decide whether the plan question really requires more clarity before acting."
      ],
      sections: [
        {
          title: "How The ± Margin Is Computed",
          items: [
            "The margin is the Wald confidence interval half-width: 1.96 times the standard error of the proportion.",
            "Standard error = square root of (p × (1 − p) ÷ N), where p is the displayed probability and N is the sample size.",
            "For p near 0 or 1, the Wald form is less accurate than the Wilson form; the dashboard uses Wald to stay consistent with the underlying spec (Q-MC-ENDURANCE) and rounds the half-width to the nearest percentage point for display."
          ]
        }
      ],
      category: "concepts",
      related: ["planEndurance", "targetConfidence", "displayRule", "understandingMC", "risk"]
    },
    displayRule: {
      title: "Probability Display Rule",
      summary: "Probability percentages on the Plan Endurance and Target Confidence tiles are shown in 5-percentage-point steps (for example 30%, 35%, 40%) rather than raw decimal precision (for example 32.29%). This prevents false precision: a simulated 32.29% reading is not meaningfully different from 30% at typical sample sizes.",
      steps: [
        "Any probability between 5% and 95% is rounded to the nearest 5pp bucket using half-up rounding; 32% becomes 30% and 33% becomes 35%.",
        "Probabilities below 5% are shown as 'rare (under 5%)' because the underlying estimate cannot reliably distinguish small probabilities at the default sample size.",
        "Probabilities above 95% are shown as 'very likely (over 95%)' for the same reason.",
        "The ± margin, when shown, is rounded to the nearest 1 percentage point.",
        "The margin only appears when it exceeds 2 percentage points; below that, the value is shown without a margin label.",
        "The CSV and PDF report builders intentionally retain higher numeric precision so analysts can reconstruct the exact numbers; the 5pp rule applies only to the Decision Workspace probability tiles."
      ],
      category: "concepts",
      related: ["monteCarloUncertainty", "planEndurance", "targetConfidence"]
    },
    decisionWorkspace: {
      title: "Decision Workspace",
      summary: "The Decision Workspace is the top section of the Overview page. It groups the most important plan signals — income safety, endurance, target confidence, strategy, tax, and risk — into a single cockpit so you can see the plan's health at a glance.",
      steps: [
        "Start with the Income Cover gauge: if it is below 100%, the plan does not deliver your target monthly income in the final year.",
        "Read Plan Endurance next — this is the primary survival metric.",
        "Read Target Confidence after that — this is the stricter wealth-target metric.",
        "Review the three action cards: Strategy Shortlist (allocation), Tax Path (CA readiness), and Risk Guardrail (downside check).",
        "Use the Reality Check verdict as orientation: 'cushion' means the plan has room; 'gap visible' means at least one metric is under target."
      ],
      category: "metrics",
      related: ["incomeCover", "planEndurance", "targetConfidence", "strategyShortlist", "taxPath", "riskGuardrail", "realityCheck", "canThisPlanWork"]
    },
    canThisPlanWork: {
      title: "Can This Plan Work?",
      summary: "This is the headline verdict at the top of the Decision Workspace. It reads the plan's key signals and gives a single plain-English answer — 'strong', 'watch', or 'gap visible' — so the user can see whether the plan needs attention without inspecting every tile.",
      steps: [
        "'Strong' means income cover, endurance, and corpus target are all in acceptable ranges.",
        "'Watch' means one metric is near a threshold; the plan is viable but needs monitoring.",
        "'Gap visible' means a concrete shortfall exists and the plan as set cannot deliver the stated goals.",
        "The detail text under the verdict identifies which metric triggered the label.",
        "The verdict is deterministic and updates immediately when assumptions change."
      ],
      category: "metrics",
      related: ["decisionWorkspace", "realityCheck", "incomeCover", "planEndurance", "closingTheGap"]
    },
    cashFlowTile: {
      title: "Cash Flow Tile",
      summary: "The Cash Flow tile shows the model's annual withdrawal in the final projection year, compared to your inflation-adjusted income target. It is the income-delivery number: did the plan actually provide the cash you need at the end?",
      steps: [
        "The primary value is the final-year annual withdrawal from the model.",
        "Compare it to your monthly target inflated to the final year — the tile shows whether you are above or below.",
        "In SWP mode, this number includes cost capital recovery; only the realised-gain portion is taxable.",
        "In Interest mode, this is the after-tax interest the corpus generates in the final year.",
        "A value below target means the corpus is too small, the withdrawal rate is too high, or returns underperformed the assumed effective yield."
      ],
      category: "metrics",
      related: ["incomeCover", "retirement", "closingTheGap", "monthlyCashSolver", "swpVsInterestVsIdcw"]
    },
    corpusFloor: {
      title: "Corpus Floor",
      summary: "Corpus Floor is the minimum investable corpus the plan needs to fund a specified number of months of living expenses from safe assets, independent of market returns. It is the cash-bucket reserve the plan must maintain before deploying money into growth assets.",
      steps: [
        "Corpus Floor equals monthly income target multiplied by the defensive months chosen in the planner.",
        "If your current corpus is above the floor, the defensive sleeve is fully funded.",
        "If the corpus has fallen below the floor, you may need to suspend growth-asset withdrawals and draw from the defensive bucket.",
        "The floor is not static — it rises as the monthly income target rises with inflation each year.",
        "Read the Withdrawal Policy & Trust Plan for how the floor connects to the cash bucket, crash response, and refill rule."
      ],
      category: "metrics",
      related: ["defensiveCover", "policy", "incomeCover", "strategyShortlist", "sequenceOfReturns"]
    },
    marketMargin: {
      title: "Market Margin",
      summary: "Market Margin is the Decision Workspace card that surfaces Target Confidence — the fraction of simulated futures where the final corpus meets or exceeds your target corpus. A higher number means more simulated paths reached your terminal-wealth goal.",
      steps: [
        "Market Margin uses the same underlying value as the Target Confidence gauge tile, displayed using the 5pp bucket rule.",
        "Read it alongside Plan Endurance: a plan can have high endurance (money never runs out) but a low market margin (rarely hits the target).",
        "If Market Margin is below 50%, the plan may still be workable — use Plan Endurance as the primary survival signal and Market Margin as the stretch-goal signal.",
        "To improve Market Margin, increase starting corpus, reduce monthly spend, improve return assumptions, or extend the projection horizon.",
        "The card detail names whether the current reading is workable or whether it suggests revisiting corpus, spending, or return assumptions."
      ],
      category: "metrics",
      related: ["targetConfidence", "planEndurance", "decisionWorkspace", "displayRule"]
    },
    strategyShortlist: {
      title: "Strategy Shortlist Card",
      summary: "The Strategy Shortlist action card on the Decision Workspace shows your top-ranked retirement allocation strategy and its key characteristics. Clicking it opens the full Recommended Strategy Shortlist where you can compare strategies and apply one to the live model.",
      steps: [
        "The card shows the leading strategy name with its equity share and months of defensive cover.",
        "If no strategy has been built yet, the card prompts you to open the guided planner.",
        "A strategy is built from cash need, risk comfort, liquidity preference, tax profile, and legacy goals — not just return maximisation.",
        "Use 'Apply strategy' to push the recommended allocation into the live model.",
        "For the full strategy comparison and scoring explanation, open the Recommended Strategy Shortlist topic."
      ],
      category: "metrics",
      related: ["optimizer", "decisionWorkspace", "taxPath", "policy", "defensiveCover"]
    },
    taxPath: {
      title: "Tax Path Card",
      summary: "The Tax Path card in the Decision Workspace shows whether the retiree tax engine is active and how much year-1 relief it tracked — the sum of Section 87A rebate, basic exemption setoff, and Section 80TTB deductions in the first projection year.",
      steps: [
        "When the retiree profile engine is active, the card shows year-1 relief tracked from Section 87A, basic exemption, and Section 80TTB.",
        "When flat slab mode is active, the card prompts you to switch to the retiree profile for more accurate planning.",
        "Click 'Open tax studio' to review the full tax breakdown year by year.",
        "The card shows planning-grade estimates — it does not replace CA review for filing decisions.",
        "For regime choice, SWP cost recovery, and special-rate gain treatment, open Tax Assumptions & Scenarios."
      ],
      category: "tax",
      related: ["taxScenarios", "tax", "section87aRebate", "section115bacNewRegime", "taxDrag"]
    },
    riskGuardrail: {
      title: "Risk Guardrail Card",
      summary: "The Risk Guardrail card on the Decision Workspace shows the P10 and P50 corpus values from the Monte Carlo simulation — the pessimistic and median outcomes — so you can see the downside spread behind the plan.",
      steps: [
        "P10 is the value that 90% of simulated paths exceed — the pessimistic case.",
        "P50 is the median: half the paths finish above, half below.",
        "A large gap between P10 and P50 means the plan is sensitive to bad luck in market timing.",
        "If P10 is below your corpus floor or final-year income target, the plan has meaningful downside risk.",
        "Click 'Open simulations' to see the full risk cone chart and the sensitivity heatmap."
      ],
      category: "metrics",
      related: ["risk", "planEndurance", "targetConfidence", "decisionWorkspace", "sequenceOfReturns", "scenarioDepletion"]
    },
    realityCheck: {
      title: "Reality Check",
      summary: "The Reality Check is the first step in the retiree start sequence. It gives a one-line verdict — 'Plan has cushion' or 'Gap visible' — based on the current plan mood, so the user can orient quickly when opening the dashboard.",
      steps: [
        "'Plan has cushion' means income cover and corpus are both above threshold.",
        "'Gap visible' means at least one metric is below target — the plan needs adjustment.",
        "The detail text names the specific issue: low income coverage, corpus shortfall, or market margin below threshold.",
        "This is a deterministic verdict — it reflects the current assumption set, not a probabilistic simulation.",
        "If the verdict changes after an edit, open Why Numbers Changed to trace which assumption drove the move."
      ],
      category: "metrics",
      related: ["canThisPlanWork", "decisionWorkspace", "incomeCover", "whyChanged"]
    },
    watchCards: {
      title: "Watch Cards",
      summary: "A Watch badge appears on a GaugeCard when the underlying metric ratio is between 75% and 100% — close to healthy, but not confirmed. Watch cards are early-warning signals: the plan may be working but the metric is close enough to a boundary that a closer look is warranted.",
      steps: [
        "A 'Watch' badge appears when a metric ratio falls in the 75%–99% range; an 'On track' badge appears at 100% and above; a 'Short' badge appears below 75%.",
        "For Income Cover and Plan Endurance, Watch means the metric is not yet at target; a small assumption change might push it green or red.",
        "For Tax Drag, the equivalent label is 'Review' when cumulative tax is 8%–18% of withdrawals.",
        "After changing assumptions, re-read all Watch-labelled tiles to see whether they resolved to 'On track' or escalated to 'Short'.",
        "A plan with several Watch tiles simultaneously is more fragile than one with all-green tiles; consider stress-testing with the Scenario Library."
      ],
      category: "metrics",
      related: ["decisionWorkspace", "canThisPlanWork", "realityCheck", "planDiagnosis"]
    },
    planDiagnosis: {
      title: "Plan Diagnosis Rail",
      summary: "Plan Diagnosis is the left-rail sidebar panel for the Overview page. It shows the headline verdict, the key metrics (Income and Confidence), and quick actions to open the planner or get a goal explanation.",
      steps: [
        "The rail shows a summary title and the decision headline — the same text as the main verdict card.",
        "The two metrics (Income % and Confidence %) update live as assumptions change.",
        "Use 'Open planner' to jump to the Strategy Shortlist if the plan needs an allocation fix.",
        "Use 'Explain' to open the Goals and Gap Solver help topic for corpus and cash-goal math.",
        "The rail follows you when scrolling, so the verdict stays visible while you adjust assumptions."
      ],
      category: "metrics",
      related: ["decisionWorkspace", "canThisPlanWork", "goals", "realityCheck"]
    },
    projectionStatement: {
      title: "Projection Statement",
      summary: "The Projection Statement is a structured summary of the model's key outputs: corpus growth, income delivered, cumulative tax, real final corpus, and the gap solver. It is the financial-statement view of the full projection.",
      steps: [
        "Read the top rows first: opening corpus, final nominal corpus, and real (inflation-adjusted) final corpus.",
        "Tax Drag shows cumulative tax paid over the full projection — use this to compare cash strategies.",
        "The Gap Solver row shows whether the model delivered the target corpus and cash, and by how much.",
        "The statement is for the deterministic single-path projection; for probabilistic paths use the Monte Carlo section.",
        "Download the PDF or CSV for a durable copy of the statement with assumptions provenance."
      ],
      category: "metrics",
      related: ["taxDrag", "core", "closingTheGap", "reviewPack", "pdfExport"]
    },
    smartInsights: {
      title: "Smart Insights",
      summary: "Smart Insights is the plain-English diagnosis panel. It reads the plan mood, income cover, Monte Carlo results, and scenario delta, then writes a short paragraph naming what is working and what needs attention — without numbers tables.",
      steps: [
        "Smart Insights is generated automatically from the current assumption set; it updates when assumptions change.",
        "It names the primary concern first: income gap, corpus shortfall, sequence risk, or tax drag.",
        "Use it as a quick orientation before diving into charts or tables.",
        "It is not a recommendation — it is a plain-language description of what the model is currently showing.",
        "For a structured diagnosis, open the Withdrawal Policy & Trust Plan or download the Adviser / CA Review Pack."
      ],
      category: "metrics",
      related: ["canThisPlanWork", "planDiagnosis", "policy", "reviewPack"]
    },
    gapSolver: {
      title: "Gap Solver",
      summary: "The Gap Solver calculates the minimum corpus addition, the required return rate, or the maximum sustainable monthly cash that would make the plan whole. It turns a shortfall into a concrete set of numbers you can discuss with an adviser.",
      steps: [
        "The Gap Solver only appears when a shortfall exists — when the model falls short of either the corpus target or the cash target.",
        "It shows three numbers: required corpus top-up, required annual return (when solvable), and maximum sustainable monthly cash.",
        "You only need one of the three changes; combining smaller adjustments across all three can also close the gap.",
        "If the required return exceeds 40%, the solver reports 'not solvable' — the plan needs a fundamental redesign, not a return-rate tweak.",
        "Use the Monthly Cash Solver in the What-If Lab for interactive exploration with live feedback."
      ],
      category: "metrics",
      related: ["closingTheGap", "goals", "monthlyCashSolver", "incomeCover", "gapFramings"]
    },
    effectiveYield: {
      title: "Effective Yield Metric",
      summary: "Effective Yield is the blended annual yield the corpus earns in the model, accounting for asset allocation and income-yield settings. It is the productive return rate used in the projection after combining equity income yield, debt income yield, and growth assumptions.",
      steps: [
        "Effective Yield is shown in the Portfolio Journey panel under the corpus chart.",
        "In manual-return mode, it equals the annual rate you set directly.",
        "In equity/debt blend mode, it is computed from equity and debt income yield settings combined at the portfolio weights.",
        "A higher effective yield means more income is available for withdrawals, but also more sequence risk if the yield comes from volatile growth assets.",
        "Compare effective yield against your withdrawal rate — if you are withdrawing more than the yield, the corpus is being drawn down."
      ],
      category: "metrics",
      related: ["portfolioJourney", "core", "withdrawalRate", "taxDrag", "paybackRatio"]
    },
    taxDrag: {
      title: "Tax Drag Metric",
      summary: "Tax Drag is the cumulative tax paid over the full projection horizon, expressed in today's rupees. It measures how much of the portfolio's growth is consumed by tax, which directly reduces corpus and the income available to you.",
      steps: [
        "Tax Drag appears in the Portfolio Journey panel and in the Decision Workspace KPI strip.",
        "It includes income tax on withdrawals, capital gains tax on SWP redemptions, and any slab-rate tax on IDCW or interest income.",
        "A high tax drag relative to total withdrawals suggests the cash strategy or product mix could be improved.",
        "SWP mode typically has lower tax drag than Interest mode for equity-heavy portfolios because cost capital recovery is not taxed.",
        "LTCG harvesting and Section 87A rebate eligibility can reduce tax drag — see Tax Assumptions & Scenarios for how to model these."
      ],
      category: "metrics",
      related: ["taxScenarios", "tax", "effectiveYield", "portfolioJourney", "swpVsInterestVsIdcw", "section87aRebate"]
    },
    paybackRatio: {
      title: "Payback Ratio",
      summary: "Payback Ratio shows total cumulative withdrawals as a multiple of the starting principal. A ratio of 1× means you have drawn out your full starting investment in income; a ratio of 2× means you have taken out twice the original capital while the corpus continued working.",
      steps: [
        "Payback Ratio equals cumulative withdrawals divided by starting principal, displayed as N× in the Portfolio Journey panel.",
        "A ratio above 1× means total income drawn exceeds the starting corpus — growth and compounding funded the excess.",
        "A ratio below 1× means the plan has not yet returned the full starting corpus in income, which is normal in early years or low-withdrawal plans.",
        "A high payback ratio combined with a healthy final corpus indicates a strong plan — it has delivered income and preserved capital.",
        "Read this alongside Tax Drag and Effective Yield to gauge the overall income efficiency of the plan."
      ],
      category: "metrics",
      related: ["effectiveYield", "portfolioJourney", "taxDrag", "core"]
    },
    portfolioJourney: {
      title: "Portfolio Journey Chart",
      summary: "Portfolio Journey is the main chart panel on the Overview page. It shows three trajectories over the full projection: the nominal corpus balance, the cumulative withdrawals, and the inflation-adjusted (real) corpus — so you can see both the face-value story and the purchasing-power story.",
      steps: [
        "The nominal corpus line shows the portfolio value in future rupees — it may appear to grow even as purchasing power falls.",
        "The real corpus line shows the same value in today's rupees — compare it to your target corpus (also in today's rupees) to see whether the plan is ahead or behind.",
        "Cumulative withdrawals shows how much income has been taken out in total over the projection.",
        "Where the real corpus line crosses the nominal line, inflation has consumed the difference.",
        "The MiniMetric strip below the chart shows Effective Yield, Tax Drag, and Payback Ratio for the projection."
      ],
      category: "metrics",
      related: ["effectiveYield", "taxDrag", "paybackRatio", "realVsNominal", "india", "core"]
    },
    finalMix: {
      title: "Final Mix Composition",
      summary: "Final Mix shows the composition of the final corpus balance: how much is original principal, how much came from annual top-up contributions, and how much is reinvested growth. It reveals what actually drove the portfolio's end value.",
      steps: [
        "A corpus dominated by original principal means the portfolio barely grew — the return assumption or time horizon may be too conservative.",
        "A corpus dominated by reinvested growth means compounding has done most of the work — a sign of a long horizon or high returns.",
        "Top-up contributions appear when you have set an annual contribution in the Assumption Studio.",
        "Use Final Mix to explain to family or clients where the money actually came from.",
        "Compare Final Mix across scenarios to see how different return paths change the composition of the end balance."
      ],
      category: "metrics",
      related: ["portfolioJourney", "core", "india", "effectiveYield"]
    },
    monthlyCashSolver: {
      title: "Monthly Cash Solver",
      summary: "The Monthly Cash Solver in the What-If Lab lets you interactively ask 'what if?' by changing monthly cash, corpus, target, or return, and immediately see how the projection responds. Editing any field activates monthly-target mode and re-runs the full model.",
      steps: [
        "Open the What-If Lab from the Overview page.",
        "Change Monthly cash to see how the income target shifts the corpus requirement and required return.",
        "Change Starting corpus to see how much your current wealth changes the plan's durability.",
        "The solver shows the model-safe monthly cash — the maximum you can sustainably draw — alongside the required corpus and required return for your current target.",
        "Use this before the Gap Solver to find which lever is most sensitive."
      ],
      category: "metrics",
      related: ["closingTheGap", "gapSolver", "retirement", "goals", "gapFramings"]
    },
    planFingerprint: {
      title: "Plan Fingerprint",
      summary: "The Plan Fingerprint is a short hash of all current assumptions. Two reports with the same fingerprint were generated from identical inputs; different fingerprints mean the underlying assumptions differed.",
      steps: [
        "The fingerprint appears in the assumption panel header, in saved scenario snapshots, in exported PDFs, and in the review-pack JSON.",
        "If two reports or exports show the same fingerprint, they are directly comparable line by line.",
        "Any change to an assumption — even a small decimal — changes the fingerprint.",
        "Use the fingerprint when discussing a specific plan scenario with an adviser or CA so both sides are looking at the same version.",
        "The fingerprint is a planning provenance marker, not a security hash; it is not intended to prove authenticity, only consistency."
      ],
      category: "trust",
      related: ["reviewPack", "trustCenter", "privacy", "whenToConsult"]
    },
    canvasControl: {
      title: "Canvas Control",
      summary: "Canvas Control adjusts how the dashboard uses your screen width. Auto is the default and adapts to your device; the other modes (Focus, Comfort, Wide) let you override the layout when you want a narrower reading view or maximum panel width.",
      steps: [
        "Leave Canvas Control on Auto for most use — it chooses the appropriate width for your screen size.",
        "Focus mode narrows the main column to reduce distraction on large screens.",
        "Comfort mode gives slightly more breathing room than Auto on medium screens.",
        "Wide mode uses the full screen width — best for detailed ledger and chart work on large monitors.",
        "The slider lets you set a custom width between the preset stops."
      ],
      category: "getting-started",
      related: ["tutorial", "mobileGuide"]
    },
    mobileGuide: {
      title: "Mobile Guide",
      summary: "On small screens the dashboard collapses into a Mobile Verdict Card with the single headline verdict, a compact Smart Insights block, and condensed Projection Statement and FIFO ledger surfaces. The desktop layout reflows automatically — but a few interactions behave differently and benefit from explicit guidance.",
      steps: [
        "Open the Mobile Verdict Card first — it shows plan mood, decision headline, cash ratio, corpus ratio, confidence, final monthly cash, real final corpus, tax drag, runway, and a one-tap next action.",
        "The Projection Statement on mobile shows the same rows as desktop but stacked vertically; tap a row to expand its tooltip.",
        "Monthly FIFO ledger cards on mobile group lots into per-month tiles instead of the desktop table so you can scroll naturally.",
        "Tax Studio on mobile uses card stacks instead of the desktop two-pane layout — the editable JSON still applies in the same way, but you may want to switch to desktop for editing the ruleset.",
        "Help, Tutorials, and Trust Center buttons live in the Mobile Help Panel at the bottom of the screen.",
        "PDF export, full CSV export, and the Adviser / CA Review Pack are best generated on a desktop because mobile browsers can rate-limit large downloads — Smart Insights and a saved scenario are usually enough for on-the-go review."
      ],
      sections: [
        {
          title: "Mobile Surfaces Confirmed In Code",
          items: [
            "MobileVerdictCard — single-screen verdict with cash ratio, corpus ratio, confidence, final monthly cash, real final corpus, tax drag, runway, and primary next action.",
            "Mobile Projection Statement — same rows as desktop but stacked vertically.",
            "Mobile FIFO ledger cards — per-month tiles instead of a wide table.",
            "Mobile Tax Studio — card stacks; the editable JSON still applies but desktop is easier for ruleset editing.",
            "Mobile Help Panel — bottom-mounted Tutorials & Context Help and Trust Center buttons."
          ]
        }
      ],
      category: "getting-started",
      related: ["tutorial", "coach", "canvasControl", "decisionWorkspace", "pdfExport", "csvExport"]
    },
    understandingMC: {
      title: "Understanding Monte Carlo",
      summary: "Monte Carlo simulation generates many possible futures for your retirement plan by randomly varying investment returns year by year. Instead of predicting one outcome, it shows a range of what could happen across many simulated futures — from unlucky sequences to fortunate ones.",
      steps: [
        "Each simulated path applies a year-by-year return shock drawn from the configured volatility and shock model.",
        "The simulator runs 1000 paths by default; each path uses the same assumptions but a different sequence of returns.",
        "The results — Plan Endurance, Target Confidence, P10/P50/P90 — summarise how the plan behaves across all those paths.",
        "Out of 1000 simulated futures, an 80% endurance result means roughly 800 finish with money left and 200 deplete before the horizon.",
        "Higher sample size gives smoother, more stable results but takes longer to compute.",
        "The simulation is not a market forecast — it is a stress-test of your assumptions."
      ],
      category: "concepts",
      related: ["planEndurance", "targetConfidence", "monteCarloUncertainty", "sequenceOfReturns", "displayRule", "risk"]
    },
    realVsNominal: {
      title: "Real vs Nominal Values",
      summary: "Nominal values are in future rupees at face value. Real values are in today's rupees after adjusting for inflation. A corpus of ₹2 Cr in 20 years at 6% inflation is worth far less in today's rupees — the real value is the number that tells you what your purchasing power actually is.",
      steps: [
        "Set inflation in the Assumption Studio; this controls how future values are deflated to today's rupees.",
        "The Portfolio Journey chart shows both nominal corpus (future rupees) and real corpus (today's rupees) over the projection.",
        "Compare real final corpus to your target corpus — both are in today's rupees, so the comparison is direct.",
        "Income targets are entered in today's rupees; the model inflates them internally before each year's calculation.",
        "The Sensitivity Heatmap colours are based on real purchasing power, not nominal face value."
      ],
      category: "concepts",
      related: ["india", "inflationModel", "portfolioJourney", "sensitivity", "core"]
    },
    sequenceOfReturns: {
      title: "Sequence Of Returns",
      summary: "Sequence-of-returns risk is the danger that bad market years at the beginning of retirement cause permanent damage even when the average return over the full period is acceptable. Selling units to fund income during a downturn locks in losses before the portfolio can recover.",
      steps: [
        "A portfolio with the same long-run average return can produce very different outcomes depending on when the bad years occur.",
        "Bad returns in the first decade of retirement are the most damaging because withdrawals accelerate corpus depletion.",
        "A cash or debt bucket of 2 to 5 years of living expenses reduces sequence risk by allowing you to avoid selling growth assets during a downturn.",
        "The Monte Carlo simulation captures sequence risk by applying year-by-year shocks, including the fat-tail regime model for crisis events.",
        "Use the Crash In First Decade scenario in the Scenario Library to specifically test sequence risk."
      ],
      category: "concepts",
      related: ["understandingMC", "defensiveCover", "scenarioLibrary", "risk", "planEndurance", "scenarioDepletion"]
    },
    defensiveCover: {
      title: "Defensive Cover",
      summary: "Defensive cover is the number of months of living expenses held in safe, liquid assets — cash, short-duration debt, or liquid debt funds — that can fund spending without selling growth assets. It is the primary tool for managing sequence-of-returns risk.",
      steps: [
        "A defensive cover of 24 to 36 months is a common starting range for retirees; the right level depends on your risk comfort, the market cycle, and the share of fixed income in the plan.",
        "The Strategy Shortlist recommends a defensive cover level based on your risk profile and income targets.",
        "During a market downturn, draw from the defensive bucket first; refill it when growth assets recover.",
        "If defensive cover runs below 6 months, treat it as a signal to reduce discretionary spending or defer major purchases.",
        "Defensive cover is shown in months in the Strategy Decision panel of the left rail."
      ],
      category: "concepts",
      related: ["sequenceOfReturns", "strategyShortlist", "policy", "corpusFloor", "riskGuardrail"]
    },
    gapFramings: {
      title: "Gap Framings",
      summary: "A retirement income gap can be viewed in three equivalent ways: a corpus shortfall (you need more starting capital), a return shortfall (you need higher investment returns), or a spending excess (you are planning to draw more than is sustainable). Understanding all three helps you choose which lever to pull.",
      steps: [
        "Corpus framing: 'I need ₹X more in starting capital.' Most actionable when you have assets to deploy or can delay retirement.",
        "Return framing: 'I need Y% more return per year.' Most relevant when the required return is close to realistic; dangerous when it implies taking excessive risk.",
        "Spending framing: 'I can sustainably draw ₹Z per month, not my current target.' Most actionable when spending is flexible.",
        "The Gap Solver shows all three framings simultaneously so you can choose the most realistic path.",
        "Combining small adjustments across all three framings is often more practical than fixing one lever entirely."
      ],
      category: "concepts",
      related: ["closingTheGap", "gapSolver", "monthlyCashSolver", "incomeCover", "withdrawalRate"]
    },
    swpVsInterestVsIdcw: {
      title: "SWP vs Interest vs IDCW",
      summary: "SWP, Interest, and IDCW are three ways to generate retirement cash from a portfolio. They differ in how they affect the corpus, how they are taxed, and how stable the income is. Choosing the right engine for your portfolio type is a core planning decision.",
      steps: [
        "Interest mode earns after-tax income from the corpus and optionally dips into principal if the target is higher than the interest income.",
        "SWP mode grows the portfolio monthly and redeems old lots using FIFO, taxing only the realised gain portion — typically more tax-efficient for equity-heavy portfolios.",
        "IDCW mode models distribution payouts that reduce NAV; the income is taxed as slab-rate distribution income, not as capital gain.",
        "For mutual fund retirement portfolios, SWP is usually the preferred model because of FIFO cost capital recovery and LTCG exemption eligibility.",
        "IDCW distributions are not guaranteed and should not be treated as fixed income; they depend on the fund's distributable surplus."
      ],
      category: "concepts",
      related: ["tax", "taxScenarios", "fifo", "retirement", "taxDrag", "section74CarryForward"]
    },
    inflationModel: {
      title: "Inflation Model",
      summary: "The inflation model applies a constant annual inflation rate to grow income targets and deflate corpus values into today's rupees over the projection horizon. It is a planning assumption, not a forecast — use it to stress-test purchasing power, not to predict the future.",
      steps: [
        "Set inflation in the Assumption Studio; the default reflects Indian CPI experience but adjust to your planning judgment.",
        "The model inflates your monthly income target each year — if you need ₹1L today and inflation is 6%, you need about ₹1.79L in year 10 in nominal terms.",
        "Real corpus values are calculated by dividing nominal values by the compound inflation factor, showing purchasing power in today's rupees.",
        "Sensitivity: a 2 percentage-point change in inflation significantly changes both the required corpus and the real final corpus.",
        "Use the Sticky Inflation Decade scenario in the Scenario Library to stress-test the plan under higher-than-expected inflation."
      ],
      category: "concepts",
      related: ["india", "realVsNominal", "sensitivity", "scenarioLibrary", "portfolioJourney"]
    },
    withdrawalRate: {
      title: "Withdrawal Rate",
      summary: "The withdrawal rate is annual retirement income as a percentage of the starting corpus. A 4% withdrawal rate on ₹1 Cr means withdrawing ₹4L per year. Historical research suggests 4% as a starting reference for a 30-year horizon, but Indian conditions (inflation, taxation, product type) require a customised rate.",
      steps: [
        "Calculate your initial withdrawal rate: annual income need divided by starting corpus, multiplied by 100.",
        "The Strategy Shortlist shows a withdrawal-rate diagnosis before recommending an allocation — a low rate gives more room; a high rate constrains allocation choices.",
        "Above 5%–6%, plans are more sensitive to sequence-of-returns risk; the defensive cover recommendation will be higher.",
        "Withdrawal rates above the effective yield mean the corpus is being drawn down — model whether it lasts the full horizon.",
        "Consider using the Monthly Cash Solver to see the maximum sustainable monthly draw for your corpus and return assumptions."
      ],
      category: "concepts",
      related: ["swpVsInterestVsIdcw", "defensiveCover", "gapFramings", "monthlyCashSolver", "policy"]
    },
    section87aRebate: {
      title: "Section 87A Rebate",
      summary: "Section 87A of the Income Tax Act, 1961, gives eligible resident individuals a rebate of up to ₹60,000 under the new regime (AY 2026-27 per FA-2025) when total income taxed at slab rates does not exceed ₹12 lakh. The rebate eliminates slab-rate tax up to the threshold but does not offset special-rate capital gains tax.",
      steps: [
        "The rebate applies only to slab-rate income such as FD interest, IDCW, and slab-taxed debt gains. It does not apply to special-rate capital gains under ITA §111A (equity STCG) or ITA §112A (equity LTCG).",
        "For AY 2026-27 (FA-2025 §115BAC restructure), the new-regime threshold is ₹12 lakh of slab income and the maximum rebate is ₹60,000.",
        "The dashboard applies the rebate automatically when the retiree profile engine is active, resident status is set, and the 87A interpretation mode is the default.",
        "When the retiree has special-rate capital gains, the default model disables the rebate (CBDT October 2024 position — subject to ongoing litigation interpretation).",
        "For filing-grade decisions, consult a CA — the interaction between Section 87A and special-rate gains is under active dispute as of the knowledge cutoff."
      ],
      sections: [
        {
          title: "Authority",
          items: [
            "ITA-1961 §87A as amended by FA-2025: rebate framework, ₹12L slab-income threshold, ₹60K cap under the new regime.",
            "CBDT Circular October 2024: position that §87A is not available to offset special-rate tax; conservatively followed by the default model.",
            "Pre-FA-2025 thresholds (FA-2023, FA-2024) remain available via the editable tax-law ruleset for historical AY planning."
          ]
        }
      ],
      category: "tax",
      related: ["taxScenarios", "tax", "section115bacNewRegime", "surchargeMarginalRelief", "taxPath", "fa2025Scope"]
    },
    section74CarryForward: {
      title: "Section 74 Capital Loss Carry-Forward",
      summary: "Section 74 of the Income Tax Act, 1961, allows capital losses to be carried forward for up to eight assessment years and set off against capital gains of the same or subsequent years. This matters in retirement planning when an SWP redemption realises a loss that can reduce future capital-gains tax.",
      steps: [
        "Long-term capital losses under ITA §74 can only be set off against long-term capital gains, not short-term.",
        "Short-term capital losses can be set off against both short-term and long-term capital gains.",
        "Carry-forward requires filing a tax return in the loss year — even a nil-tax return is needed to preserve the loss.",
        "The dashboard models carry-forward in the SWP/FIFO ledger for planning purposes; verify with a CA before relying on this for filing decisions.",
        "A large carry-forward loss accumulated in one year can shelter gains in future years, reducing effective tax drag over the projection."
      ],
      sections: [
        {
          title: "Authority",
          items: [
            "ITA-1961 §74 — capital-loss carry-forward and set-off mechanism; eight-year carry-forward limit.",
            "ITA-1961 §80 — return-filing requirement to preserve carry-forward losses.",
            "ICAI Guidance Note on Taxation of Capital Gains — interpretation guidance for equity MF lots."
          ]
        }
      ],
      category: "tax",
      related: ["taxScenarios", "fifo", "tax", "swpVsInterestVsIdcw"]
    },
    section115bacNewRegime: {
      title: "Section 115BAC New Regime",
      summary: "Section 115BAC of the Income Tax Act, 1961, is the new tax regime restructured by Finance Act 2025. For AY 2026-27 it has seven slab bands: nil up to ₹4 lakh, then 5% / 10% / 15% / 20% / 25% in ₹4L steps, and 30% above ₹24 lakh. Senior citizens have the same slabs — the enhanced basic exemption applies only under the old regime.",
      steps: [
        "FA-2025 §115BAC slabs for AY 2026-27 (verify against the active Tax Law Studio ruleset): 0% up to ₹4L; 5% on ₹4L–₹8L; 10% on ₹8L–₹12L; 15% on ₹12L–₹16L; 20% on ₹16L–₹20L; 25% on ₹20L–₹24L; 30% above ₹24L.",
        "The new regime does not allow most deductions (80C, HRA, LTA) but does allow the standard deduction for salary and pension income.",
        "Senior citizens (≥60) and super-seniors (≥80) use the same new-regime slabs as below-60 individuals — the enhanced basic exemption applies only under the old regime.",
        "The §87A rebate (₹60,000 cap, ₹12L slab-income threshold under FA-2025) applies under the new regime for eligible resident individuals on slab-rate income.",
        "For retirement planning, the new regime is typically preferred when there are no major deductions and investment income falls within the ₹12L Section 87A threshold."
      ],
      sections: [
        {
          title: "Authority",
          items: [
            "ITA-1961 §115BAC as restructured by Finance Act 2025 — seven-band slab structure effective AY 2026-27.",
            "FA-2025 First Schedule — slab rates and surcharge bands.",
            "Default regime: the new regime is the default for individuals under FA-2025 unless they explicitly opt for the old regime."
          ]
        }
      ],
      category: "tax",
      related: ["section87aRebate", "taxScenarios", "tax", "surchargeMarginalRelief", "taxPath", "fa2025Scope"]
    },
    surchargeMarginalRelief: {
      title: "Surcharge & Marginal Relief",
      summary: "Surcharge is an additional tax on high income — 10% above ₹50 lakh, rising to 15%, 25%, and 37% (old regime) at higher bands. Marginal relief prevents a rupee of extra income from triggering more tax than that rupee is worth, avoiding a cliff at each threshold. The dashboard implements this per the R4.2 cliff fix (fin-b6d).",
      steps: [
        "Surcharge thresholds (both regimes): 10% on income ₹50L–₹1Cr; 15% on ₹1Cr–₹2Cr; 25% on ₹2Cr–₹5Cr; 37% above ₹5Cr (old regime only — the new regime does not extend to 37%).",
        "Marginal relief: if your income exceeds a surcharge threshold by ₹X, total incremental tax (including surcharge and cess) cannot exceed ₹X. Without relief, a single extra rupee of income could cost more than ₹1 in tax — marginal relief prevents this cliff.",
        "For retirement portfolios with projected income above ₹50L, surcharge is material; even a modest high-income scenario (FD interest + IDCW + pension) can breach the ₹50L band.",
        "Equity LTCG and STCG carry a separate surcharge cap of 15% under ITA §112A(8) / FA-2023, regardless of which regime applies.",
        "Use Tax Assumptions & Scenarios for the full surcharge and marginal-relief model; for edge cases near band boundaries, consult a CA."
      ],
      sections: [
        {
          title: "Authority",
          items: [
            "ITA-1961 §§2(39), 2(45) — surcharge definitions.",
            "FA-2025 First Schedule — surcharge thresholds and rates.",
            "ITA-1961 §112A(8) and FA-2023 — special-rate surcharge cap at 15%.",
            "Marginal-relief implementation per fin-b6d / R4.2 cliff fix — verified across JS and Python reference implementations."
          ]
        }
      ],
      category: "tax",
      related: ["taxScenarios", "section115bacNewRegime", "section87aRebate", "tax", "taxPath"]
    },
    fa2025Scope: {
      title: "Finance Act 2025 Scope",
      summary: "Finance Act 2025 (Union Budget 2025-26) introduced the restructured new-regime slab bands, raised the Section 87A rebate threshold to ₹12 lakh, and made other amendments effective from AY 2026-27. This dashboard's default ruleset is scoped to FA-2025 / AY 2026-27 and becomes outdated when the assessment year rolls over.",
      steps: [
        "The active tax-law ruleset in Tax Law Studio shows the version and AY coverage — verify it reads AY 2026-27 before relying on any tax output.",
        "Key FA-2025 changes modelled: §115BAC seven-band restructure, §87A ₹12L threshold and ₹60K cap, health and education cess unchanged.",
        "The ruleset becomes outdated when AY 2026-27 closes — update via Tax Law Studio before planning for the next assessment year.",
        "For earlier assessment years (AY 2025-26 under FA-2024, AY 2024-25 under FA-2023), load the appropriate historical ruleset JSON if you need historical computation.",
        "Tax law that is announced but not yet enacted (post-Budget ordinances, draft amendments) is not modelled until the enacted text is confirmed — review the ruleset's source URL and updatedOn fields before relying on it."
      ],
      sections: [
        {
          title: "Authority",
          items: [
            "Finance Act, 2025 (India), as enacted — AY 2026-27 applicable rates and §115BAC restructure.",
            "Union Budget 2025-26 (February 2025) — FA-2025 introductory authority.",
            "ITA-1961 as amended by FA-2025 — operative legislation referenced by the ruleset."
          ]
        }
      ],
      category: "tax",
      related: ["taxLawUpdates", "tax", "section87aRebate", "section115bacNewRegime", "taxScenarios"]
    },
    whenToConsult: {
      title: "When To Consult A Professional",
      summary: "This planning tool is not financial, investment, or tax advice. Use it to build intuition, test scenarios, and prepare for a professional conversation — but certain decisions always require a SEBI-registered Investment Adviser (RIA) or Chartered Accountant (CA).",
      steps: [
        "Consult a SEBI-registered RIA for significant portfolio decisions: switching funds, rebalancing large sums, buying annuities, or deciding on a drawdown sequence.",
        "Consult a CA when tax outcomes matter: SWP gain computation, Section 87A eligibility in a mixed-gains year, carry-forward losses, NRI status, surcharge thresholds, or Form 15G/15H decisions.",
        "This tool is appropriate for scenario exploration, retirement modelling, and preparing questions for the adviser meeting.",
        "Do not rely on this tool as the final word when the plan is close to a decision threshold — Plan Endurance near 50%, or Target Confidence near a material threshold for legacy planning.",
        "Download the Adviser / CA Review Pack before the professional meeting — it contains assumptions, tax-law JSON, scenario comparison, and risk-method documentation."
      ],
      category: "trust",
      related: ["trustCenter", "reviewPack", "planFingerprint", "privacy", "taxScenarios"]
    },
    planEnduranceVsTargetConfidence: {
      title: "Plan Endurance vs Target Confidence",
      summary: "Plan Endurance and Target Confidence answer different questions. Plan Endurance asks 'will my money last?' — does the corpus stay above zero through the horizon? Target Confidence asks 'will I hit a specific wealth target?' — does the final corpus reach the stated goal? A plan can score high on endurance but low on confidence if it survives but finishes far short of the target.",
      steps: [
        "Plan Endurance is the share of simulated paths whose final corpus is above zero — even ₹1 counts as endurance.",
        "Target Confidence is the share of simulated paths whose final corpus meets or exceeds your stated target corpus in nominal terms.",
        "Because every path that hits the target also survives, Plan Endurance is always at least as high as Target Confidence (when target corpus is above zero).",
        "A gap between the two tells you something important: many paths survive (money lasts) but fall short of the wealth target. The plan works for income but not for the corpus goal.",
        "For most retirees focused on income sustainability, Plan Endurance is the primary metric. Target Confidence is useful for those with a specific legacy, inheritance, or terminal-wealth goal."
      ],
      sections: [
        {
          title: "Primary vs Secondary",
          items: [
            "Plan Endurance is the primary display metric per the spec (Q-MC-ENDURANCE) and the dashboard design (R4.9.5b narrative reframing).",
            "Target Confidence is the secondary, more demanding metric — a wealth-target check, not a survival check.",
            "Both are displayed — neither replaces the other. Use them together to answer two different questions about the same plan."
          ]
        },
        {
          title: "Decision Threshold",
          items: [
            "Use Plan Endurance to answer 'will I run out?' — the lay retirement question.",
            "Use Target Confidence to answer 'will I hit my target wealth?' — the legacy or inheritance question.",
            "If Plan Endurance is high and Target Confidence is low, the plan delivers income safety but the target may be too ambitious for the corpus.",
            "If both are low, the plan needs structural change — corpus, spending, or return assumption.",
            "If both are high, the plan has cushion across both questions."
          ]
        }
      ],
      category: "concepts",
      related: ["planEndurance", "targetConfidence", "monteCarloUncertainty", "understandingMC", "displayRule"]
    },
    pdfExport: {
      title: "PDF Export",
      summary: "The PDF export generates a formatted report of the current retirement plan: narrative summary, charts, withdrawal policy, tax guidance, assumptions, and caveats. It is a local file on your device — nothing is sent to a server.",
      steps: [
        "Export the PDF from the Ledger section or via the Export actions menu.",
        "The PDF includes the current plan narrative, Portfolio Journey chart, Monte Carlo risk cone, tax drag, assumptions, and the active tax-law version.",
        "Regenerate the PDF after material assumption changes — an old PDF remains on disk and reflects the old assumptions.",
        "Use the Adviser / CA Review Pack (which bundles the PDF with CSV and JSON evidence) for professional handoff.",
        "PDFs are sensitive files — they contain financial assumptions and projection outputs that could identify the retiree."
      ],
      category: "concepts",
      related: ["reviewPack", "csvExport", "trustCenter", "privacy", "planFingerprint"]
    },
    csvExport: {
      title: "CSV Export",
      summary: "The CSV export downloads the full monthly FIFO ledger (when SWP is active) or the annual workbook schedule. It contains the complete projection data — opening and closing corpus, withdrawals, tax, gains, cost capital, and lot-level detail.",
      steps: [
        "Export the CSV from the Ledger section. In SWP mode, the CSV contains monthly rows with lot-level tax detail.",
        "In Interest or IDCW mode, the CSV contains annual rows.",
        "The CSV is the evidence trail for the plan — it contains the same numbers shown in the ledger table, fully expanded.",
        "Use the CSV to cross-check calculations in a spreadsheet before an adviser meeting.",
        "Regenerate the CSV after assumption changes — the CSV is a point-in-time snapshot and does not update automatically."
      ],
      category: "concepts",
      related: ["pdfExport", "fifo", "reviewPack", "trustCenter"]
    }
  };
}

function HelpDrawer({ open, topic, onClose, onStartTour, onClearSavedData, activeTaxLaw = DEFAULT_TAX_LAW }) {
  const [readerTopic, setReaderTopic] = useState(topic);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [query, setQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const drawerRef = useRef(null);
  const topics = buildHelpTopics(activeTaxLaw);
  const scrollHelpReaderIntoView = (behavior = "smooth") => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    if (typeof window === "undefined") {
      drawer.scrollTop = 0;
      return;
    }
    const resolvedBehavior = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : behavior;
    window.requestAnimationFrame(() => drawer.scrollTo({ top: 0, behavior: resolvedBehavior }));
  };
  const showReaderTopic = (nextTopic) => {
    setReaderTopic(nextTopic);
    setExpandedTopic(null);
    scrollHelpReaderIntoView();
  };
  const toggleLibraryTopic = (nextTopic) => {
    setExpandedTopic((currentTopic) => currentTopic === nextTopic ? null : nextTopic);
  };
  useLayoutEffect(() => {
    if (!open) return;
    setReaderTopic(topic);
    setExpandedTopic(null);
    scrollHelpReaderIntoView("auto");
  }, [open, topic]);
  const active = topics[readerTopic] || topics.core;
  const coachCards = [
    { title: "I am starting fresh", detail: "Use the guided retirement path first.", topic: "coach" },
    { title: "A number moved", detail: "Trace the assumption or scenario delta.", topic: "whyChanged" },
    { title: "Tax looks risky", detail: "Read slab, SWP, IDCW, rebate, and TDS rules.", topic: "taxScenarios" },
    { title: "Can I trust it?", detail: "Check privacy, model limits, exports, and review cues.", topic: "trustCenter" }
  ];
  const queryText = query.trim().toLowerCase();
  const topicEntries = Object.entries(topics).filter(([, item]) => {
    if (!queryText) return true;
    return `${item.title} ${item.summary} ${(item.steps || []).join(" ")}`.toLowerCase().includes(queryText);
  });
  // R4.9.5f (fin-eia): help topics now group by category in the sidebar.
  // Categories ordered for retiree-friendly discovery; any topic missing a category
  // defaults to "concepts" so the grouping is exhaustive over Object.keys(topics).
  const HELP_CATEGORY_ORDER = [
    { id: "getting-started", label: "Getting started" },
    { id: "metrics", label: "Metrics & tiles" },
    { id: "concepts", label: "Concepts" },
    { id: "tax", label: "Tax" },
    { id: "trust", label: "Trust & exports" }
  ];
  const groupedTopicEntries = HELP_CATEGORY_ORDER.map((group) => ({
    ...group,
    entries: topicEntries.filter(([, item]) => (item.category || "concepts") === group.id)
  })).filter((group) => group.entries.length > 0);
  const toggleCategory = (categoryId) => {
    setCollapsedCategories((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };
  const renderTopicContent = (topicKey, item, variant = "") => (
    <>
      {topicKey === "privacy" ? (
        <div className="privacy-action-card" role="region" aria-label="Local browser data controls">
          <div>
            <ShieldCheck />
            <span>Local Data Control</span>
            <strong>Clear remembered financial assumptions on this browser.</strong>
            <small>This removes the dashboard's known localStorage keys and resets the live app to defaults. Downloaded exports remain on disk.</small>
          </div>
          <button type="button" onClick={onClearSavedData}><RotateCcw /> Clear saved data</button>
        </div>
      ) : null}
      <div className={`tutorial-card${variant ? ` ${variant}` : ""}`}>
        <div><Sparkles /><strong>Tutorial</strong></div>
        <ol>{item.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      </div>
      {item.sections?.length ? (
        <div className={`help-sections${variant ? ` ${variant}` : ""}`}>
          {item.sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <ul>{section.items.map((sectionItem) => <li key={sectionItem}>{sectionItem}</li>)}</ul>
            </section>
          ))}
        </div>
      ) : null}
    </>
  );
  if (!open) return null;
  return (
    <div className="drawer-backdrop open" onClick={onClose}>
      <aside ref={drawerRef} className="help-drawer" role="dialog" aria-modal="true" aria-label="Dashboard help" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close help"><X /></button>
        <section className="help-reader" aria-label="Selected help topic" aria-live="polite">
          <div className="help-reader-head">
            <div className="eyebrow">Dashboard Help</div>
            <span>{active.title}</span>
          </div>
          <h2>{active.title}</h2>
          <p>{active.summary}</p>
          <div className="help-command-bar">
            <label className="help-search">
              <span>Search help</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tax, SWP, heatmap, tour..." aria-label="Search help topics" />
            </label>
            <button type="button" onClick={onStartTour}><Sparkles /> Restart guided tour</button>
          </div>
          <div className="help-coach-panel" aria-label="Context-sensitive help coach">
            {coachCards.map((card) => (
              <button key={card.title} type="button" className={readerTopic === card.topic ? "active" : ""} onClick={() => showReaderTopic(card.topic)}>
                <Sparkles />
                <span>{card.title}</span>
                <small>{card.detail}</small>
              </button>
            ))}
          </div>
          {renderTopicContent(readerTopic, active)}
        </section>
        <section className="help-topic-library" aria-label="Help topic library">
          <div className="help-library-head">
            <div>
              <span>Topic Library</span>
              <strong>Browse all guidance</strong>
              <small>Selecting a card opens that topic in place so your browsing position stays put.</small>
            </div>
            <b>{topicEntries.length}/{Object.keys(topics).length}</b>
          </div>
          <div className="help-grid">
            {groupedTopicEntries.map((group) => {
              const isCollapsed = Boolean(collapsedCategories[group.id]);
              return (
                <section key={group.id} className="help-category-group" aria-label={`${group.label} topics`}>
                  <button
                    type="button"
                    className="help-category-head"
                    aria-expanded={!isCollapsed}
                    aria-controls={`help-category-${group.id}`}
                    onClick={() => toggleCategory(group.id)}
                  >
                    <strong>{group.label}</strong>
                    <small>{group.entries.length}</small>
                  </button>
                  {!isCollapsed ? (
                    <div id={`help-category-${group.id}`} className="help-category-body">
                      {group.entries.map(([key, item]) => {
                        const isExpanded = key === expandedTopic;
                        const isReaderTopic = key === readerTopic && !expandedTopic;
                        return (
                          <article key={key} className={`help-topic-card${isExpanded ? " expanded" : ""}${isReaderTopic ? " reader-active" : ""}`}>
                            <button className="help-topic-trigger" type="button" aria-expanded={isExpanded} aria-controls={`help-topic-detail-${key}`} onClick={() => toggleLibraryTopic(key)}>
                              <strong>{item.title}</strong>
                              <span>{item.summary}</span>
                              <small>{isExpanded ? "Opened here" : "Open in place"}</small>
                            </button>
                            {isExpanded ? (
                              <div className="help-topic-detail" id={`help-topic-detail-${key}`}>
                                {renderTopicContent(key, item, "compact")}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}

function DisclaimerNotice({ open, onAccept, onClear, onHelp }) {
  if (!open) return null;
  return (
    <section className="disclaimer-notice-card" role="region" aria-label="Important notice">
      <div className="privacy-consent-icon" aria-hidden="true"><ShieldCheck /></div>
      <div className="privacy-consent-copy disclaimer-notice-copy">
        <span>Important Notice</span>
        <p>
          <strong>Retirement Corpus &amp; Income Planner</strong> is a planning and educational tool — not financial, investment, or tax advice.
        </p>
        <p>
          <strong>What it models:</strong> Corpus durability, monthly income, tax drag, inflation, sequence risk, and allocation across a retirement horizon. Tax rules are scoped to AY 2026-27 / Finance Act, 2025 (India). The bundled ruleset becomes outdated when the assessment year rolls over; verify current rules before relying on any tax output.
        </p>
        <p>
          <strong>Monte Carlo simulations</strong> run seeded pseudo-random paths under the return assumptions you supply. Simulated paths are statistical scenarios, not predictions. A high success probability is not a guarantee.
        </p>
        <p>
          <strong>Your data stays here.</strong> All inputs are stored in your browser&apos;s localStorage only. Nothing is uploaded. No telemetry. No cookies. For details, see <a href="https://github.com/stribog-cloud/retirement-corpus-planner/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">PRIVACY.md</a> in the repository.
        </p>
        <p>
          <strong>For investment decisions:</strong> consult a SEBI-registered Investment Adviser (RIA).<br />
          <strong>For tax decisions:</strong> consult a Chartered Accountant (CA).
        </p>
        <p>Provided under the MIT License, as-is, with no warranty of any kind.</p>
        <p className="disclaimer-notice-read-more">
          <a href="https://github.com/stribog-cloud/retirement-corpus-planner/blob/main/DISCLAIMER.md" target="_blank" rel="noopener noreferrer">Read full disclaimer</a>
        </p>
      </div>
      <div className="privacy-consent-actions">
        <button type="button" onClick={() => onHelp("privacy")}><CircleHelp /> Details</button>
        <button type="button" onClick={onClear}><RotateCcw /> Clear saved data</button>
        <button type="button" className="primary" onClick={onAccept}><Sparkles /> I understand</button>
      </div>
    </section>
  );
}

function AssumptionDrawer({ open, state, outputState = state, setField, onClose, openHelp, onClearSavedData }) {
  const [activeSection, setActiveSection] = useState("household");
  const [studioQuery, setStudioQuery] = useState("");
  const household = useMemo(() => householdPlanProfile(outputState), [outputState]);
  const effectiveProjectionYears = useMemo(() => {
    const params = projectionParamsFromState(outputState);
    return Math.max(1, Math.round(Number(params.years) || Number(outputState.years) || 1));
  }, [outputState]);
  const studioImpact = useMemo(() => {
    if (!open) {
      return {
        finalCorpus: 0,
        realCorpus: 0,
        monthlyCash: 0,
        taxDrag: 0,
        corpusRatio: 0,
        cashRatio: 0,
        withdrawalRate: withdrawalRateForState(outputState)
      };
    }
    const params = projectionParamsFromState(outputState);
    const projection = calculate(params);
    const finalRow = projection.final;
    const targetReal = Math.max(1, household.useHouseholdPlan ? household.targetCorpusToday : Number(outputState.targetCorpus) || 0);
    const finalMonthly = finalRow.withdrawal / 12;
    const horizon = Math.max(1, Math.round(Number(params.years) || 0));
    const inflationFactor = Math.pow(1 + (Number(params.inflation) || 0) / 100, horizon);
    const finalTargetMonthly = targetAnnualCashForYear(params, horizon, inflationFactor) / 12;
    return {
      finalCorpus: finalRow.closing,
      realCorpus: finalRow.realClosing,
      monthlyCash: finalMonthly,
      targetMonthlyCash: finalTargetMonthly,
      taxDrag: finalRow.cumTax,
      corpusRatio: finalRow.realClosing / targetReal,
      cashRatio: finalTargetMonthly > 0 ? finalMonthly / finalTargetMonthly : 1,
      withdrawalRate: withdrawalRateForState(outputState)
    };
  }, [household.monthlyCashNeed, household.targetCorpusToday, open, outputState]);
  useEffect(() => {
    if (open) setActiveSection(Number(state.useHouseholdPlan) === 1 ? "household" : "core");
  }, [open, state.useHouseholdPlan]);
  const studioTabs = [
    { id: "household", label: "Household", detail: "Family cash need", Icon: Wallet },
    { id: "core", label: "Cash Engine", detail: "Mode and horizon", Icon: Gauge },
    { id: "assets", label: "Assets", detail: "Return and products", Icon: PieChart },
    { id: "tax", label: "Retiree Tax", detail: "Slabs and rebate", Icon: Landmark },
    { id: "risk", label: "Risk & Goals", detail: "Inflation and shocks", Icon: Activity },
    { id: "law", label: "Tax Law", detail: "Editable ruleset", Icon: FileSpreadsheet },
    { id: "privacy", label: "Privacy", detail: "Saved data", Icon: LockKeyhole }
  ];
  const panelClass = (id) => `studio-panel ${activeSection === id ? "active" : ""}`;
  const studioResetFields = {
    household: ["useHouseholdPlan", "retireeAge", "spouseAge", "dependantCount", "essentialMonthlyExpense", "discretionaryMonthlyExpense", "spouseMonthlyNeed", "dependantMonthlySupport", "dependantSupportYears", "pensionMonthlyIncome", "rentMonthlyIncome", "annuityMonthlyIncome", "pmvvyMonthlyIncome", "otherMonthlyIncome", "healthcareReserve", "emergencyMonths", "plannedLumpSumAmount", "plannedLumpSumYear", "plannedLumpSumInflate", "longevityYears", "contingencyYears", "legacyCorpusGoal"],
    core: ["principal", "incomeMode", "cashMode", "annualRate", "portfolioIncomeYield", "withdrawRate", "compounding", "years"],
    assets: ["useAssetReturns", "equityShare", "equityReturn", "debtReturn", "equityIncomeYield", "equityIncomePolicy", "debtIncomeYield", "debtIncomePolicy", "expenseRatio", "equityInstrument", "equityProductClass", "equityAcquisitionYear", "equitySttPaid", "debtInstrument", "debtProductClass", "debtAcquisitionYear"],
    tax: ["taxProfileMode", "taxRegime", "ageBand", "residentStatus", "pensionIncome", "otherIncome", "standardDeductionMode", "standardDeduction", "section87A", "section87AInterpretation", "tdsEnabled", "interestTdsRate", "nriWithholdingRate", "form15Declaration", "taxSlab", "costBasisPct", "equityFmv2018Pct", "useFmvGrandfathering", "legacyHoldingYears", "withdrawalPriority"],
    risk: ["inflation", "taxRate", "harvestLtcg", "inflateWithdrawals", "allowPrincipalDrawdown", "idcwYield", "annualContribution", "contributionStepUp", "volatility", "equityVolatility", "debtVolatility", "equityDebtCorrelation", "shockModel", "monteCarloSamples", "monteCarloSeed", "glidePathEnabled", "glidePathEndEquity", "glidePathYears", "shockYear", "shockDrop", "monthlyTarget", "targetCorpus", "lockCashBucket", "cashBucketMonthsOverride", "lockEquityShare", "equityShareOverride", "preferSimpleProducts", "avoidCreditRisk", "allowAnnuity"],
    law: ["taxLawJson"],
    privacy: []
  };
  const searchHits = useMemo(() => {
    const query = studioQuery.trim().toLowerCase();
    if (!query) return [];
    return studioTabs.filter((tab) => `${tab.label} ${tab.detail} ${(studioResetFields[tab.id] || []).join(" ")}`.toLowerCase().includes(query));
  }, [studioQuery]);
  const studioWarnings = [
    withdrawalRateForState(state) > 0.075 ? "Starting withdrawal rate is above 7.5%; solve spending/corpus gap before relying on allocation." : "",
    Number(state.taxRate) > 0 ? "Manual all-tax override bypasses the retiree tax profile and instrument rules." : "",
    Number(state.monteCarloSamples) < 64 ? "Risk sample size is low for close decisions; use more samples before trusting probability." : "",
    state.incomeMode === "idcw" ? "IDCW is distribution cash, not guaranteed retirement income." : ""
  ].filter(Boolean);
  const resetActiveSection = () => {
    (studioResetFields[activeSection] || []).forEach((field) => setField(field, BASE[field]));
  };
  if (!open) return null;
  return (
    <div className="drawer-backdrop open" onClick={onClose}>
      <aside className="assumption-drawer" role="dialog" aria-modal="true" aria-label="Assumption Studio" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close assumptions"><X /></button>
        <div className="studio-hero">
          <div>
            <div className="eyebrow">Assumption Studio</div>
            <h2>Tune The Retirement Model</h2>
            <p>Adjust cash need, portfolio engine, tax profile, sequence risk, and law rules in one governed workspace. Changes update the dashboard, planner, simulations, ledger, and exports from the same source of truth.</p>
          </div>
          <div className="studio-hero-metrics">
            <span><b>{formatFullInr(outputState.principal)}</b> Corpus</span>
            <span><b>{formatFullInr(household.monthlyCashNeed)}</b> Effective monthly cash</span>
            <span><b>{taxProfileLabel(outputState)}</b> Tax profile</span>
          </div>
          <button className="studio-reset-tab" type="button" onClick={resetActiveSection}><RotateCcw /> Reset current tab</button>
        </div>
        <div className="studio-workspace">
          <nav className="studio-nav" aria-label="Assumption sections">
            <label className="studio-search">
              <Search />
              <input value={studioQuery} onChange={(event) => setStudioQuery(event.target.value)} placeholder="Find tax, cash, risk..." aria-label="Search assumption sections" />
            </label>
            {searchHits.length ? (
              <div className="studio-search-hits" aria-label="Assumption search results">
                {searchHits.map((hit) => <button key={hit.id} type="button" onClick={() => setActiveSection(hit.id)}>Open {hit.label}</button>)}
              </div>
            ) : null}
            {studioTabs.map(({ id, label, detail, Icon }) => (
              <button key={id} type="button" className={activeSection === id ? "active" : ""} onClick={() => setActiveSection(id)}>
                <Icon />
                <span>{label}</span>
                <small>{detail}</small>
              </button>
            ))}
            <div className="studio-impact-panel" aria-label="Live assumption impact">
              <span>Live Impact</span>
              <strong>{studioImpact.corpusRatio >= 1 ? "Corpus protected" : "Corpus gap visible"}</strong>
              <div>
                <b><small>Final</small>{formatInr(studioImpact.finalCorpus)}</b>
                <b><small>Real</small>{formatInr(studioImpact.realCorpus)}</b>
                <b><small>Cash</small>{formatInr(studioImpact.monthlyCash)} / mo</b>
                <b><small>Tax</small>{formatInr(studioImpact.taxDrag)}</b>
              </div>
              <em>Withdrawal rate {formatPct(studioImpact.withdrawalRate)} · final-year cash coverage {Math.round(clamp(studioImpact.cashRatio, 0, 9.99) * 100)}%.</em>
            </div>
          </nav>
          <div className="drawer-controls studio-panels">
          {studioWarnings.length ? (
            <div className="studio-warning-strip" role="status">
              <AlertTriangle />
              <div>
                <strong>Assumption warnings</strong>
                {studioWarnings.map((warning) => <span key={warning}>{warning}</span>)}
              </div>
            </div>
          ) : null}
          <section className={panelClass("household")}>
            <h3>Household Retirement Plan</h3>
            <div className="studio-summary-card">
              <Sparkles />
              <div>
                <strong>{Number(state.useHouseholdPlan) === 1 ? "Budget-linked mode is active" : "Single cash target mode is active"}</strong>
                <span>{formatFullInr(household.monthlyCashNeed)} effective monthly need · {formatFullInr(household.targetCorpusToday)} today’s corpus target with reserves.</span>
              </div>
            </div>
            <Control label="Use household plan" help={() => openHelp("household")} value={state.useHouseholdPlan} onChange={(value) => setField("useHouseholdPlan", Number(value))} options={[{ value: 1, label: "Yes, derive cash need" }, { value: 0, label: "No, use single target" }]} />
            <Control label="Retiree age" help={() => openHelp("household")} value={state.retireeAge} onChange={(value) => setField("retireeAge", value)} min={45} max={100} step={1} />
            <Control label="Spouse age" help={() => openHelp("household")} value={state.spouseAge} onChange={(value) => setField("spouseAge", value)} min={0} max={100} step={1} />
            <Control label="Dependant count" help={() => openHelp("household")} value={state.dependantCount} onChange={(value) => setField("dependantCount", value)} min={0} max={10} step={1} />
            <Control label="Essential monthly expense" help={() => openHelp("household")} value={state.essentialMonthlyExpense} onChange={(value) => setField("essentialMonthlyExpense", value)} min={0} max={3000000} step={10000} />
            <Control label="Discretionary monthly expense" help={() => openHelp("household")} value={state.discretionaryMonthlyExpense} onChange={(value) => setField("discretionaryMonthlyExpense", value)} min={0} max={2000000} step={10000} />
            <Control label="Spouse / survivor monthly need" help={() => openHelp("household")} value={state.spouseMonthlyNeed} onChange={(value) => setField("spouseMonthlyNeed", value)} min={0} max={2000000} step={10000} />
            <Control label="Dependant monthly support" help={() => openHelp("household")} value={state.dependantMonthlySupport} onChange={(value) => setField("dependantMonthlySupport", value)} min={0} max={1000000} step={10000} />
            <Control label="Dependant support years" value={state.dependantSupportYears} onChange={(value) => setField("dependantSupportYears", value)} min={0} max={30} step={1} suffix="yrs" />
            <Control label="Pension monthly income" help={() => openHelp("household")} value={state.pensionMonthlyIncome} onChange={(value) => setField("pensionMonthlyIncome", value)} min={0} max={2000000} step={10000} />
            <Control label="Rent monthly income" value={state.rentMonthlyIncome} onChange={(value) => setField("rentMonthlyIncome", value)} min={0} max={2000000} step={10000} />
            <Control label="Annuity monthly income" value={state.annuityMonthlyIncome} onChange={(value) => setField("annuityMonthlyIncome", value)} min={0} max={2000000} step={10000} />
            <Control label="PMVVY monthly income" help={() => openHelp("household")} value={state.pmvvyMonthlyIncome} onChange={(value) => setField("pmvvyMonthlyIncome", value)} min={0} max={2000000} step={10000} note="Planning offset for Pradhan Mantri Vaya Vandana Yojana-style pension cash flow." />
            <Control label="Other monthly income" value={state.otherMonthlyIncome} onChange={(value) => setField("otherMonthlyIncome", value)} min={0} max={2000000} step={10000} />
            <Control label="Healthcare reserve" help={() => openHelp("household")} value={state.healthcareReserve} onChange={(value) => setField("healthcareReserve", value)} min={0} max={50000000} step={100000} />
            <Control label="Emergency reserve months" value={state.emergencyMonths} onChange={(value) => setField("emergencyMonths", value)} min={0} max={60} step={1} />
            <Control label="Known lump-sum goal" value={state.plannedLumpSumAmount} onChange={(value) => setField("plannedLumpSumAmount", value)} min={0} max={100000000} step={100000} />
            <Control label="Lump-sum year" value={state.plannedLumpSumYear} onChange={(value) => setField("plannedLumpSumYear", value)} min={0} max={60} step={1} />
            <Control label="Inflate lump-sum" value={state.plannedLumpSumInflate} onChange={(value) => setField("plannedLumpSumInflate", Number(value))} options={[{ value: 1, label: "Yes, inflate goal" }, { value: 0, label: "No, fixed amount" }]} />
            <Control label="Longevity horizon" help={() => openHelp("household")} value={state.longevityYears} onChange={(value) => setField("longevityYears", value)} min={1} max={60} step={1} suffix="yrs" />
            <Control label="Contingency horizon" value={state.contingencyYears} onChange={(value) => setField("contingencyYears", value)} min={0} max={20} step={1} suffix="yrs" />
            <Control label="Legacy corpus goal" value={state.legacyCorpusGoal} onChange={(value) => setField("legacyCorpusGoal", value)} min={0} max={500000000} step={1000000} />
          </section>
          <section className={panelClass("core")}>
            <h3>Core Model</h3>
            <Control label="Starting principal" help={() => openHelp("core")} value={state.principal} onChange={(value) => setField("principal", value)} min={1000000} max={200000000} step={100000} />
            <Control label="Cash strategy" help={() => openHelp("retirement")} value={state.incomeMode} onChange={(value) => setField("incomeMode", value)} options={[{ value: "interest", label: "Interest / income payout" }, { value: "swp", label: "Growth + SWP / redeem units" }, { value: "idcw", label: "IDCW payout model" }]} />
            <Control label="Cash target mode" value={state.cashMode} onChange={(value) => setField("cashMode", value)} options={[{ value: "interestPercent", label: "% of interest / distributable income" }, { value: "monthlyTarget", label: "Target monthly cash" }]} />
            <Control label="Manual annual return" help={() => openHelp("core")} value={state.annualRate} onChange={(value) => setField("annualRate", value)} min={0} max={30} step={0.1} suffix="%" disabled={Number(state.useAssetReturns) === 1} note={Number(state.useAssetReturns) === 1 ? "Switch Return source to manual return to use this field." : ""} />
            <Control label="Manual income yield" help={() => openHelp("core")} value={state.portfolioIncomeYield} onChange={(value) => setField("portfolioIncomeYield", value)} min={0} max={20} step={0.1} suffix="%" disabled={Number(state.useAssetReturns) === 1} note={Number(state.useAssetReturns) === 1 ? "Use equity/debt income yields below." : "Taxable/cash income yield; growth above this is deferred until sale."} />
            <Control label="Interest withdrawn" help={() => openHelp("core")} value={state.withdrawRate} onChange={(value) => setField("withdrawRate", value)} min={0} max={150} step={1} suffix="%" />
            <Control label="Compounding" value={state.compounding} onChange={(value) => setField("compounding", Number(value))} options={[{ value: 1, label: "Annual" }, { value: 2, label: "Semi-Annual" }, { value: 4, label: "Quarterly" }, { value: 12, label: "Monthly" }]} />
            <Control label="Projection years" value={state.years} onChange={(value) => setField("years", value)} min={1} max={60} step={1} />
          </section>
          <section className={panelClass("assets")}>
            <h3>Asset & Tax Engine</h3>
            <Control label="Return source" help={() => openHelp("taxScenarios")} value={state.useAssetReturns} onChange={(value) => setField("useAssetReturns", Number(value))} options={[{ value: 1, label: "Use equity/debt blend" }, { value: 0, label: "Use manual return" }]} />
            <Control label="Equity allocation" value={state.equityShare} onChange={(value) => setField("equityShare", value)} min={0} max={100} step={1} suffix="%" disabled={Number(state.useAssetReturns) !== 1} note={Number(state.useAssetReturns) !== 1 ? "Ignored while manual return is active." : ""} />
            <Control label="Equity return" value={state.equityReturn} onChange={(value) => setField("equityReturn", value)} min={-20} max={35} step={0.5} suffix="%" disabled={Number(state.useAssetReturns) !== 1} note={Number(state.useAssetReturns) !== 1 ? "Ignored while manual return is active." : ""} />
            <Control label="Debt return" value={state.debtReturn} onChange={(value) => setField("debtReturn", value)} min={0} max={18} step={0.25} suffix="%" disabled={Number(state.useAssetReturns) !== 1} note={Number(state.useAssetReturns) !== 1 ? "Ignored while manual return is active." : ""} />
            <Control label="Equity income yield" help={() => openHelp("taxScenarios")} value={state.equityIncomeYield} onChange={(value) => setField("equityIncomeYield", value)} min={0} max={12} step={0.1} suffix="%" disabled={Number(state.useAssetReturns) !== 1} note="Cash/taxable income from equity sleeve; unrealised growth is deferred until sale." />
            <Control label="Equity income policy" help={() => openHelp("taxScenarios")} value={state.equityIncomePolicy} onChange={(value) => setField("equityIncomePolicy", value)} options={[{ value: "reinvest", label: "Reinvest equity income" }, { value: "available", label: "Available for spending" }]} disabled={Number(state.useAssetReturns) !== 1} />
            <Control label="Debt income yield" help={() => openHelp("taxScenarios")} value={state.debtIncomeYield} onChange={(value) => setField("debtIncomeYield", value)} min={0} max={18} step={0.1} suffix="%" disabled={Number(state.useAssetReturns) !== 1} note="Coupon/interest/distribution income from debt sleeve." />
            <Control label="Debt income policy" help={() => openHelp("taxScenarios")} value={state.debtIncomePolicy} onChange={(value) => setField("debtIncomePolicy", value)} options={[{ value: "available", label: "Available for spending" }, { value: "reinvest", label: "Reinvest debt income" }]} disabled={Number(state.useAssetReturns) !== 1} />
            <Control label="Expense / advisory drag" value={state.expenseRatio} onChange={(value) => setField("expenseRatio", value)} min={0} max={3} step={0.05} suffix="%" />
            <Control label="Equity instrument" value={state.equityInstrument} onChange={(value) => setField("equityInstrument", value)} options={[{ value: "equityLtcg", label: "Equity MF / ETF, LTCG" }, { value: "equityStcg", label: "Equity STCG / active" }, { value: "equityTaxFree", label: "Deferred placeholder" }]} />
            <Control label="Equity product class" help={() => openHelp("taxScenarios")} value={state.equityProductClass} onChange={(value) => setField("equityProductClass", value)} options={[{ value: "equityMfEtf", label: "Equity MF / ETF with STT" }, { value: "equityActive", label: "Equity active / STT eligible" }]} />
            <Control label="Equity acquisition year" value={state.equityAcquisitionYear} onChange={(value) => setField("equityAcquisitionYear", value)} min={1990} max={2026} step={1} />
            <Control label="STT paid / eligible" value={state.equitySttPaid} onChange={(value) => setField("equitySttPaid", Number(value))} options={[{ value: 1, label: "Yes" }, { value: 0, label: "No / unknown" }]} />
            <Control label="Debt instrument" value={state.debtInstrument} onChange={(value) => setField("debtInstrument", value)} options={[{ value: "debtMfSlab", label: "Debt mutual fund / debt sleeve" }, { value: "listedBondLtcg", label: "Listed bond / debt ETF LTCG" }, { value: "fdInterest", label: "FD / interest income, slab" }]} />
            <Control label="Debt product class" help={() => openHelp("taxScenarios")} value={state.debtProductClass} onChange={(value) => setField("debtProductClass", value)} options={[{ value: "debtMfPost2023", label: "Debt MF post-2023 specified" }, { value: "debtMfGrandfathered", label: "Older debt MF sensitivity" }, { value: "listedBondDebtEtf", label: "Listed bond / debt ETF" }, { value: "targetMaturityDebt", label: "Target maturity debt" }, { value: "gsecTbill", label: "G-sec / T-bill coupon" }, { value: "fdInterest", label: "FD / deposit interest" }]} />
            <Control label="Debt acquisition year" value={state.debtAcquisitionYear} onChange={(value) => setField("debtAcquisitionYear", value)} min={1990} max={2026} step={1} />
          </section>
          <section className={panelClass("tax")}>
            <h3>Retiree Tax Profile</h3>
            <Control label="Tax model" help={() => openHelp("taxScenarios")} value={state.taxProfileMode} onChange={(value) => setField("taxProfileMode", value)} options={[{ value: "retiree", label: "Retiree profile engine" }, { value: "flat", label: "Legacy flat slab" }]} />
            <Control label="Tax regime" help={() => openHelp("taxScenarios")} value={state.taxRegime} onChange={(value) => setField("taxRegime", value)} options={[{ value: "new", label: "New regime 115BAC" }, { value: "old", label: "Old regime slabs" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0} note={Number(state.taxRate) > 0 ? "Manual override is active." : state.taxProfileMode === "flat" ? "Switch Tax model to retiree profile." : ""} />
            <Control label="Age band" help={() => openHelp("taxScenarios")} value={state.ageBand} onChange={(value) => setField("ageBand", value)} options={[{ value: "below60", label: "Below 60" }, { value: "senior", label: "Senior 60-79" }, { value: "superSenior", label: "Super senior 80+" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0} />
            <Control label="Residential status" help={() => openHelp("taxScenarios")} value={state.residentStatus} onChange={(value) => setField("residentStatus", value)} options={[{ value: "resident", label: "Resident individual" }, { value: "nonResident", label: "Non-resident / no rebate" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0} />
            <Control label="Pension / salary income" help={() => openHelp("taxScenarios")} value={state.pensionIncome} onChange={(value) => setField("pensionIncome", value)} min={0} max={10000000} step={50000} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0} />
            <Control label="Other taxable income" help={() => openHelp("taxScenarios")} value={state.otherIncome} onChange={(value) => setField("otherIncome", value)} min={0} max={10000000} step={50000} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0} />
            <Control label="Standard deduction mode" help={() => openHelp("taxScenarios")} value={state.standardDeductionMode} onChange={(value) => setField("standardDeductionMode", value)} options={[{ value: "auto", label: `Auto (${formatInr(standardDeductionLimit(state))})` }, { value: "custom", label: "Custom override" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0} />
            <Control label="Standard deduction" help={() => openHelp("taxScenarios")} value={state.standardDeduction} onChange={(value) => setField("standardDeduction", value)} min={0} max={1000000} step={10000} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0 || state.standardDeductionMode !== "custom"} note={state.standardDeductionMode === "auto" ? `Auto uses ${formatInr(standardDeductionLimit(state))} where salary/pension eligibility exists.` : ""} />
            <Control label="Section 87A rebate" help={() => openHelp("taxScenarios")} value={state.section87A} onChange={(value) => setField("section87A", Number(value))} options={[{ value: 1, label: "Apply when eligible" }, { value: 0, label: "Ignore rebate" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0 || state.residentStatus !== "resident"} />
            <Control label="87A interpretation" help={() => openHelp("taxScenarios")} value={state.section87AInterpretation} onChange={(value) => setField("section87AInterpretation", value)} options={[{ value: "offForSpecialMix", label: "Disable when special gains exist" }, { value: "aggregateThreshold", label: "Aggregate threshold, slab tax only" }, { value: "normalOnly", label: "Slab-income only sensitivity" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0 || state.residentStatus !== "resident"} />
            <Control label="TDS timing model" help={() => openHelp("taxScenarios")} value={state.tdsEnabled} onChange={(value) => setField("tdsEnabled", Number(value))} options={[{ value: 1, label: "Show TDS timing" }, { value: 0, label: "Ignore TDS timing" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0} />
            <Control label="Interest TDS rate" value={state.interestTdsRate} onChange={(value) => setField("interestTdsRate", value)} min={0} max={30} step={0.5} suffix="%" disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0 || Number(state.tdsEnabled) !== 1} />
            <Control label="NRI withholding rate" help={() => openHelp("taxScenarios")} value={state.nriWithholdingRate} onChange={(value) => setField("nriWithholdingRate", value)} min={0} max={40} step={0.5} suffix="%" disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0 || Number(state.tdsEnabled) !== 1 || state.residentStatus !== "nonResident"} note={state.residentStatus === "nonResident" ? "Applied as cash-timing withholding on modelled taxable investment income and gains." : "Enable non-resident status to use this planning-rate override."} />
            <Control label="Form 15G/15H" help={() => openHelp("taxScenarios")} value={state.form15Declaration} onChange={(value) => setField("form15Declaration", Number(value))} options={[{ value: 1, label: "Use when eligible" }, { value: 0, label: "Do not assume" }]} disabled={state.taxProfileMode === "flat" || Number(state.taxRate) > 0 || Number(state.tdsEnabled) !== 1} />
            <Control label="Legacy flat slab incl. cess" value={state.taxSlab} onChange={(value) => setField("taxSlab", value)} min={0} max={42.7} step={0.1} suffix="%" disabled={state.taxProfileMode !== "flat" || Number(state.taxRate) > 0} note={state.taxProfileMode !== "flat" ? "Only used by Legacy flat slab mode." : ""} />
            <Control label="Cost basis in old units" help={() => openHelp("taxScenarios")} value={state.costBasisPct} onChange={(value) => setField("costBasisPct", value)} min={0} max={120} step={1} suffix="%" />
            <Control label="FMV 31-Jan-2018" help={() => openHelp("taxScenarios")} value={state.equityFmv2018Pct} onChange={(value) => setField("equityFmv2018Pct", value)} min={0} max={200} step={1} suffix="%" note="Optional deemed-cost ratio for pre-2018 equity units; 0 disables FMV effect." />
            <Control label="Use FMV grandfathering" help={() => openHelp("taxScenarios")} value={state.useFmvGrandfathering} onChange={(value) => setField("useFmvGrandfathering", Number(value))} options={[{ value: 1, label: "Apply if eligible" }, { value: 0, label: "Ignore FMV rule" }]} />
            <Control label="Existing holding age" value={state.legacyHoldingYears} onChange={(value) => setField("legacyHoldingYears", value)} min={0} max={20} step={0.5} suffix="yrs" />
            <Control label="SWP redemption order" value={state.withdrawalPriority} onChange={(value) => setField("withdrawalPriority", value)} options={[{ value: "proRata", label: "Pro-rata equity/debt" }, { value: "debtFirst", label: "Debt first" }, { value: "equityFirst", label: "Equity first" }]} />
            <button className="drawer-note" type="button" onClick={() => openHelp("fifo")}>
              Monthly FIFO lot engine is active for SWP. Tap for the ledger tutorial.
            </button>
          </section>
          <section className={panelClass("risk")}>
            <h3>India, Risk & Goals</h3>
            <Control label="Inflation" help={() => openHelp("india")} value={state.inflation} onChange={(value) => setField("inflation", value)} min={0} max={12} step={0.1} suffix="%" />
            <Control label="Manual all-tax override" help={() => openHelp("taxScenarios")} value={state.taxRate} onChange={(value) => setField("taxRate", value)} min={0} max={42} step={0.5} suffix="%" />
            <Control label="LTCG harvesting" help={() => openHelp("taxScenarios")} value={state.harvestLtcg} onChange={(value) => setField("harvestLtcg", Number(value))} options={[{ value: 1, label: "Use annual exemption" }, { value: 0, label: "Ignore exemption" }]} />
            <Control label="Inflate cash target" value={state.inflateWithdrawals} onChange={(value) => setField("inflateWithdrawals", Number(value))} options={[{ value: 1, label: "Yes, inflation-linked" }, { value: 0, label: "No, flat nominal cash" }]} />
            <Control label="Allow corpus drawdown" value={state.allowPrincipalDrawdown} onChange={(value) => setField("allowPrincipalDrawdown", Number(value))} options={[{ value: 1, label: "Yes" }, { value: 0, label: "No" }]} />
            <Control label="IDCW payout yield" help={() => openHelp("retirement")} value={state.idcwYield} onChange={(value) => setField("idcwYield", value)} min={0} max={18} step={0.25} suffix="%" />
            <Control label="Annual top-up" value={state.annualContribution} onChange={(value) => setField("annualContribution", value)} min={0} max={10000000} step={50000} />
            <Control label="Top-up step-up" value={state.contributionStepUp} onChange={(value) => setField("contributionStepUp", value)} min={0} max={25} step={0.5} suffix="%" />
            <Control label="Annual volatility" help={() => openHelp("risk")} value={state.volatility} onChange={(value) => setField("volatility", value)} min={0} max={35} step={0.5} suffix="%" />
            <Control label="Equity volatility" help={() => openHelp("risk")} value={state.equityVolatility} onChange={(value) => setField("equityVolatility", value)} min={0} max={45} step={0.5} suffix="%" disabled={Number(state.useAssetReturns) !== 1} />
            <Control label="Debt volatility" help={() => openHelp("risk")} value={state.debtVolatility} onChange={(value) => setField("debtVolatility", value)} min={0} max={20} step={0.25} suffix="%" disabled={Number(state.useAssetReturns) !== 1} />
            <Control label="Equity/debt correlation" help={() => openHelp("risk")} value={state.equityDebtCorrelation} onChange={(value) => setField("equityDebtCorrelation", value)} min={-95} max={95} step={5} suffix="%" disabled={Number(state.useAssetReturns) !== 1} />
            <Control label="Shock model" help={() => openHelp("risk")} value={state.shockModel} onChange={(value) => setField("shockModel", value)} options={[{ value: "regime", label: "Fat-tail regime" }, { value: "normal", label: "Normal IID" }]} />
            <Control label="Risk sample size" help={() => openHelp("risk")} value={state.monteCarloSamples} onChange={(value) => setField("monteCarloSamples", value)} min={16} max={192} step={16} />
            <Control label="Risk seed" help={() => openHelp("risk")} value={state.monteCarloSeed} onChange={(value) => setField("monteCarloSeed", value)} min={1} max={99999999} step={1} />
            <Control label="Glide path" help={() => openHelp("risk")} value={state.glidePathEnabled} onChange={(value) => setField("glidePathEnabled", Number(value))} options={[{ value: 0, label: "Fixed allocation" }, { value: 1, label: "Glide equity down" }]} />
            <Control label="Glide end equity" value={state.glidePathEndEquity} onChange={(value) => setField("glidePathEndEquity", value)} min={5} max={90} step={1} suffix="%" disabled={Number(state.glidePathEnabled) !== 1} />
            <Control label="Glide years" value={state.glidePathYears} onChange={(value) => setField("glidePathYears", value)} min={1} max={60} step={1} disabled={Number(state.glidePathEnabled) !== 1} />
            <Control label="Shock year" value={state.shockYear} onChange={(value) => setField("shockYear", value)} min={0} max={effectiveProjectionYears} step={1} note={household.useHouseholdPlan ? `Max follows household horizon: ${effectiveProjectionYears} years.` : ""} />
            <Control label="Shock drawdown" value={state.shockDrop} onChange={(value) => setField("shockDrop", value)} min={0} max={70} step={1} suffix="%" />
            <Control label="Monthly cash target" help={() => openHelp("goals")} value={state.monthlyTarget} onChange={(value) => setField("monthlyTarget", value)} min={0} max={3000000} step={10000} />
            <Control label="Target corpus today" help={() => openHelp("goals")} value={state.targetCorpus} onChange={(value) => setField("targetCorpus", value)} min={0} max={500000000} step={1000000} />
            <Control label="Lock cash bucket" help={() => openHelp("optimizer")} value={state.lockCashBucket} onChange={(value) => setField("lockCashBucket", Number(value))} options={[{ value: 0, label: "Let planner decide" }, { value: 1, label: "Lock override" }]} />
            <Control label="Cash bucket override" value={state.cashBucketMonthsOverride} onChange={(value) => setField("cashBucketMonthsOverride", value)} min={3} max={72} step={1} suffix="months" disabled={Number(state.lockCashBucket) !== 1} />
            <Control label="Lock equity share" value={state.lockEquityShare} onChange={(value) => setField("lockEquityShare", Number(value))} options={[{ value: 0, label: "Let planner decide" }, { value: 1, label: "Lock override" }]} />
            <Control label="Equity override" value={state.equityShareOverride} onChange={(value) => setField("equityShareOverride", value)} min={5} max={90} step={1} suffix="%" disabled={Number(state.lockEquityShare) !== 1} />
            <Control label="Prefer simple products" value={state.preferSimpleProducts} onChange={(value) => setField("preferSimpleProducts", Number(value))} options={[{ value: 0, label: "Optimise where useful" }, { value: 1, label: "Prefer simple instruments" }]} />
            <Control label="Avoid credit risk" value={state.avoidCreditRisk} onChange={(value) => setField("avoidCreditRisk", Number(value))} options={[{ value: 1, label: "Yes, avoid credit risk" }, { value: 0, label: "Allow reviewed credit risk" }]} />
            <Control label="Allow annuity" value={state.allowAnnuity} onChange={(value) => setField("allowAnnuity", Number(value))} options={[{ value: 0, label: "No annuity assumption" }, { value: 1, label: "Allow annuity ideas" }]} />
          </section>
          <section className={`${panelClass("law")} tax-law-section`}>
            <TaxLawEditor state={state} setField={setField} openHelp={openHelp} />
          </section>
          <section className={panelClass("privacy")}>
            <h3>Privacy & Reset</h3>
            <div className="studio-summary-card">
              <LockKeyhole />
              <div>
                <strong>Saved browser data is local but sensitive</strong>
                <span>Assumptions, scenario history, layout, theme, guided-tour state, and privacy acknowledgement are saved in this browser profile. Downloaded exports remain separate files.</span>
              </div>
            </div>
            <button className="drawer-note studio-danger-action" type="button" onClick={onClearSavedData}>
              <Trash2 /> Clear saved browser data
            </button>
            <button className="drawer-note" type="button" onClick={() => openHelp("privacy")}>
              <CircleHelp /> Open local data and privacy guide
            </button>
            <button className="drawer-note" type="button" onClick={() => openHelp("tutorial")}>
              <Sparkles /> Restart guided tour from Help
            </button>
          </section>
          </div>
        </div>
      </aside>
    </div>
  );
}

function useRetirementDashboard() {
  const [theme, setTheme] = useTheme();
  const colors = useCssColors(theme);
  const browserWidth = useBrowserWidth();
  const initialConsent = useMemo(loadDisclaimerAcknowledged, []);
  const initial = useMemo(() => (initialConsent
    ? loadSavedState(APP_VIEW_IDS)
    : { state: normalizeState(BASE), preset: "base", tableMode: "milestones", activeView: "overview", warning: "" }), [initialConsent]);
  const initialLayout = useMemo(() => (initialConsent ? loadSavedLayout() : { ...DEFAULT_LAYOUT, warning: "" }), [initialConsent]);
  const initialScenarioHistory = useMemo(() => (initialConsent ? loadScenarioHistory() : { history: [], warning: "" }), [initialConsent]);
  const [state, setState] = useState(initial.state);
  const [preset, setPreset] = useState(initial.preset);
  const [tableMode, setTableMode] = useState(initial.tableMode);
  const [activeView, setActiveView] = useState(initial.activeView);
  const [layout, setLayout] = useState(initialLayout);
  const [scenarioHistory, setScenarioHistory] = useState(initialScenarioHistory.history);
  const [helpTopic, setHelpTopic] = useState("core");
  const [helpOpen, setHelpOpen] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
	  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);
	  const [toast, setToast] = useState(null);
	  const [feedback, setFeedback] = useState({ type: "", id: "", message: "" });
	  const [analyticsDirty, setAnalyticsDirty] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerVisibleColumns, setLedgerVisibleColumns] = useState({});
  const [pinnedStrategyId, setPinnedStrategyId] = useState("");
  const [storageConsent, setStorageConsent] = useState(initialConsent);
  const [disclaimerOpen, setDisclaimerOpen] = useState(!initialConsent);
  const [tourOpen, setTourOpen] = useState(() => {
    if (!initialConsent) return false;
    try {
      return localStorage.getItem(TOUR_KEY) !== "done";
    } catch (error) {
      return true;
    }
  });
  const [tourStep, setTourStep] = useState(0);
  const feedbackTimer = useRef(null);
  const toastTimer = useRef(null);
  const whatIfRef = useRef(null);
	  const liveInputState = state;
	  const analyticsState = useDebouncedValue(liveInputState, 110);
	  const analyticsPreset = useDebouncedValue(preset, 220);
	  const modelPending = analyticsDirty || analyticsState !== liveInputState;
	  const modelState = analyticsState;

	  useEffect(() => {
	    if (analyticsState === liveInputState) setAnalyticsDirty(false);
	  }, [analyticsState, liveInputState]);

  useEffect(() => {
    const clearPointerFocus = (event) => {
      const active = document.activeElement;
      if (!active || !["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
      if (event.target.closest("input, textarea, select, button, .help-chip, .control, .quick-field, .tax-law-editor")) return;
      active.blur();
    };
    window.addEventListener("pointerdown", clearPointerFocus, true);
    return () => window.removeEventListener("pointerdown", clearPointerFocus, true);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", String(layout.fontScale || 1));
  }, [layout.fontScale]);

  const autoViewport = useMemo(() => autoViewportForWidth(browserWidth), [browserWidth]);
  const viewportBounds = useMemo(() => viewportBoundsForWidth(browserWidth), [browserWidth]);
  const effectiveViewport = layout.viewportMode === "manual" ? layout.viewport : autoViewport;

  const modelHousehold = useMemo(() => householdPlanProfile(modelState), [modelState]);
  const analyticsHousehold = useMemo(() => householdPlanProfile(analyticsState), [analyticsState]);
  const modelParams = useMemo(() => projectionParamsFromState(modelState), [modelState]);
  const analyticsParams = useMemo(() => projectionParamsFromState(analyticsState), [analyticsState]);
  const modelHorizonYears = Math.max(0, Math.round(Number(modelParams.years) || 0));
  const analyticsHorizonYears = Math.max(0, Math.round(Number(analyticsParams.years) || 0));
  const householdModeActive = Boolean(modelHousehold.useHouseholdPlan);
  const usesAssetReturns = Number(modelState.useAssetReturns) === 1;
  const rawHorizonYears = Math.max(0, Math.round(Number(modelState.years) || 0));
  const manualReturnNotice = usesAssetReturns
    ? ""
    : "Manual return mode is active: equity/debt allocation, per-bucket returns, split volatility, and glide path are ignored until Return source is switched to equity/debt blend.";
  const horizonLabel = householdModeActive && rawHorizonYears !== modelHorizonYears
    ? `Effective ${modelHorizonYears} years (raw ${rawHorizonYears})`
    : `${modelHorizonYears} years`;
  const shockYearNote = householdModeActive
    ? `Uses effective household horizon ${modelHorizonYears} years${rawHorizonYears !== modelHorizonYears ? `; raw input ${rawHorizonYears} years` : ""}.`
    : `Max ${modelHorizonYears} years.`;
  const effectiveMonthlyTarget = Math.max(0, Number(modelParams.monthlyTarget) || 0);
  const analyticsEffectiveMonthlyTarget = Math.max(0, Number(analyticsParams.monthlyTarget) || 0);
  const targetInflationFactor = useMemo(() => (
    Math.pow(1 + (Number(modelParams.inflation) || 0) / 100, modelHorizonYears)
  ), [modelParams.inflation, modelHorizonYears]);
  const analyticsTargetInflationFactor = useMemo(() => (
    Math.pow(1 + (Number(analyticsParams.inflation) || 0) / 100, analyticsHorizonYears)
  ), [analyticsParams.inflation, analyticsHorizonYears]);
  const targetCorpusReal = modelHousehold.useHouseholdPlan ? modelHousehold.targetCorpusToday : Number(modelState.targetCorpus) || 0;
  const targetCorpusNominal = targetCorpusReal * targetInflationFactor;
  const analyticsTargetCorpusReal = analyticsHousehold.useHouseholdPlan ? analyticsHousehold.targetCorpusToday : Number(analyticsState.targetCorpus) || 0;
  const analyticsTargetCorpusNominal = analyticsTargetCorpusReal * analyticsTargetInflationFactor;
	  const model = useMemo(() => calculate(modelParams), [modelParams]);
	  const analyticsBundle = useBackgroundAnalytics(analyticsState, analyticsParams, model);
	  const analyticsPending = modelPending || analyticsBundle.pending;
	  const analyticsError = analyticsBundle.error || "";
  // R4.9.5j fin-c96.4: useDeferredValue on the analytics value reduces the
  // React commit cost when the fast-tier worker responds. The immediate
  // analyticsBundle.pending clears first (cheap commit: toggles .analytics-pending
  // class and data-analytics-pending attr). Heavy analytics-derived DOM updates
  // (MC chart, strategy cards, scenario comparison) happen in the subsequent
  // deferred commit at transition priority. This decouples the pending-indicator
  // update (which the perf harness measures) from the heavy render.
  const deferredAnalyticsValue = useDeferredValue(analyticsBundle.value);
	  const {
	    mc,
	    topup,
	    requiredReturn,
	    requiredCorpusForCash,
	    requiredReturnForCash,
	    maxMonthlyCash,
	    interestShareForTarget,
	    optimum
	  } = deferredAnalyticsValue;
  // immediateMcSimulations: reads from the IMMEDIATE bundle so that
  // data-analytics-slow-pending correctly tracks when the slow tier (real MC)
  // has settled, even while the deferred analytics value still shows old MC.
  const immediateMcSimulations = analyticsBundle.value?.mc?.simulations ?? 0;
  // fin-f3n.22: optimumRef keeps the latest settled analytics values so that
  // recommendation action closures always read post-settle data rather than
  // the stale closure-captured values from the render frame that formed them.
  const optimumRef = useRef(optimum);
  const maxMonthlyCashRef = useRef(maxMonthlyCash);
  useEffect(() => {
    if (!analyticsPending) {
      optimumRef.current = optimum;
      maxMonthlyCashRef.current = maxMonthlyCash;
    }
  }, [analyticsPending, optimum, maxMonthlyCash]);

  // fin-f3n.23: displayedAnalyticsValue holds the last fully-settled analytics
  // bundle value. During any pending state (S-1 through S-3), all display
  // surfaces that read from analytics (mc, optimum, maxMonthlyCash, etc.) use
  // this frozen value so that every visible surface shares the same freshness
  // epoch. The live analyticsBundle.value is still consumed by action handlers
  // and internal computations once pending clears.
  const lastSettledAnalyticsRef = useRef(analyticsBundle.value);
  useEffect(() => {
    if (!analyticsPending) {
      lastSettledAnalyticsRef.current = analyticsBundle.value;
    }
  }, [analyticsPending, analyticsBundle.value]);
  // fin-1q6 (R4-Q18 Option A): track the last MC that actually settled with
  // samples>0, keyed by plan fingerprint. The fast tier clears `pending` with a
  // fallback MC (simulations:0); the real Monte Carlo arrives only when the slow
  // tier merges. This ref preserves that real MC so the export (and §2/§7) read
  // the settled slow-tier sample count instead of the fast-tier fallback. Keyed
  // by the same fingerprint useBackgroundAnalytics uses (compactHash of the
  // normalized analytics state) so a stale MC from a different plan can't leak.
  const analyticsFingerprint = useMemo(() => compactHash({ analytics: normalizeState(analyticsState) }), [analyticsState]);
  const lastSettledMcRef = useRef(null);
  useEffect(() => {
    const mc = analyticsBundle.value?.mc;
    if ((Number(mc?.simulations) || 0) > 0) {
      lastSettledMcRef.current = { fingerprint: analyticsFingerprint, mc };
      // fin-1q6: expose the settled slow-tier sample count for E2E harnesses so
      // they can wait for the REAL Monte Carlo (not the fast-tier fallback)
      // before exporting. Harmless single-number assignment in production.
      if (typeof window !== "undefined") window.__FIN_MC_SAMPLES_SETTLED__ = mc.simulations;
    }
  }, [analyticsBundle.value, analyticsFingerprint]);
  const displayedAnalyticsValue = analyticsPending
    ? lastSettledAnalyticsRef.current
    : analyticsBundle.value;
  // R4.9.5h Pass-2 D7.fin-c96.15 (R4-Q18 Option A, owner-resolved):
  // Production-side export gate. The PDF export reads the SETTLED slow-tier
  // Monte Carlo via lastSettledMcRef + selectExportMc — but if that ref has
  // never captured a samples>0 MC for the current fingerprint (cold load +
  // immediate export click), the PDF still leaks "Pending MC computation"
  // sentinels into §2 and §7. Block the export entirely until the slow tier
  // has settled at least once for the active plan; the disabled-state tooltip
  // explains the wait. analyticsPending already disables the button while the
  // bundle is in flight; this gate adds the additional "MC hasn't completed
  // yet for THIS plan" check that fin-1q6 introduced but didn't yet enforce.
  const liveBundleMc = analyticsBundle.value?.mc;
  const liveBundleSamples = Number(liveBundleMc?.simulations) || 0;
  const lastSettledMc = lastSettledMcRef.current;
  const lastSettledMatches = Boolean(lastSettledMc
    && lastSettledMc.fingerprint === analyticsFingerprint
    && (Number(lastSettledMc.mc?.simulations) || 0) > 0);
  const mcSettledForExport = liveBundleSamples > 0 || lastSettledMatches;
  const exportBlocked = analyticsPending || !mcSettledForExport;
  const exportBlockedTitle = analyticsPending
    ? "Wait for analytics sync before exporting"
    : "Risk analytics still computing — wait for Monte Carlo settle before exporting";
  // fin-fwt / fin-r6y / fin-f3n.24 / fin-f3n.6: compute y1Tax via full
  // projectionParamsFromState pipeline so glide-path normalization is applied.
  // Raw analyticsState bypassed this and could diverge from model.rows[1].tax
  // when glide path is active. analyticsParams (already memoized above) is the
  // normalized form; paramsForProjectionYear(params, 1) gives year-1 allocation.
  const y1Tax = useMemo(() => {
    const y1Params = paramsForProjectionYear(analyticsParams, 1);
    return yearlyTax(y1Params.principal, y1Params);
  }, [analyticsParams]);
	  const optimumGuidance = useMemo(() => instrumentGuidanceForStrategy(optimum.best, optimum.profile, analyticsState), [optimum, analyticsState]);
  const pinnedStrategy = useMemo(
    () => optimum.strategies.find((strategy) => strategy.id === pinnedStrategyId) || null,
    [optimum.strategies, pinnedStrategyId]
  );
  const activeTaxLaw = useMemo(() => taxLawFromState(modelState), [modelState.taxLawJson]);
  const taxLawStatus = useMemo(() => taxLawParseStatus(modelState), [modelState.taxLawJson]);
  const assumptionFingerprint = useMemo(() => planFingerprint(modelState, activeTaxLaw), [modelState, activeTaxLaw]);
  const taxRegimeComparison = useMemo(() => ["new", "old"].map((regime) => {
    const comparisonState = normalizeState({ ...analyticsState, taxProfileMode: "retiree", taxRate: 0, taxRegime: regime });
    const profile = yearlyTax(Number(comparisonState.principal) || 0, comparisonState).taxProfile || investmentTaxProfile(comparisonState, emptyTaxStreams());
    return {
      regime,
      label: regime === "new" ? "New Regime" : "Old Regime",
      tax: profile.totalTax || profile.tax || 0,
      normalTax: profile.normalTax || 0,
      specialTax: profile.specialTax || 0,
      relief: (profile.rebateUsed || 0) + (profile.basicExemptionUsed || 0) + (profile.section80TTBUsed || 0),
      caveat: profile.mixedIncomeCaveat || (regime === "old" ? "Old regime can unlock 80TTB for eligible resident seniors." : "New regime may use 87A for eligible slab income.")
    };
  }), [analyticsState]);
	  const activePreset = PRESETS[analyticsPreset] || { label: "Custom Plan", detail: "User configured assumptions" };

  const markFeedback = (type, id, message = "") => {
    setFeedback({ type, id, message });
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback({ type: "", id: "", message: "" }), 900);
  };
	  const commitState = (updater) => {
	    let committed = state;
	    setState((current) => {
	      const rawNext = typeof updater === "function" ? updater(current) : updater;
	      committed = normalizeState(rawNext);
	      return committed;
	    });
	    setAnalyticsDirty(true);
	    return committed;
	  };
  const switchView = (view) => {
    if (!APP_VIEW_IDS.has(view)) return;
    markFeedback("view", view, `${APP_VIEWS.find((item) => item.id === view)?.label || "View"} opened`);
    setActiveView(view);
    setMobileInsightsOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };
  const setField = (key, value, options = {}) => {
    if (options.feedback) markFeedback(options.feedback.type, options.feedback.id, options.feedback.message);
    setPreset("custom");
    commitState((current) => {
      const next = { ...current, [key]: normalizeFieldValue(key, value) };
      if (key === "monthlyTarget") next.cashMode = "monthlyTarget";
      return next;
    });
  };
  // R4.2.5b R6: useCallback so memoized children don't re-render when parent
  // re-renders due to unrelated state changes (e.g., analytics bundle update).
  const openHelp = React.useCallback((topic) => {
    setHelpTopic(topic);
    setHelpOpen(true);
  }, []);
  const acknowledgeDisclaimerConsent = () => {
    const result = persistDisclaimerAcknowledged();
    if (result.ok) {
      setStorageConsent(true);
      setDisclaimerOpen(false);
      setTourStep(0);
      setTourOpen(true);
    }
    showToast(result.ok ? "Notice acknowledged. Guided tour starting." : result.warning, result.ok ? "success" : "reset");
  };
  const clearAllSavedData = ({ confirm = true } = {}) => {
    if (confirm && typeof window !== "undefined" && !window.confirm("Clear saved dashboard assumptions, named scenario history, layout, theme, tour state, and privacy acknowledgement from this browser profile? Downloaded files will not be deleted.")) {
      return false;
    }
    const result = clearSavedBrowserData();
    setState(normalizeState(BASE));
    setPreset("base");
    setTableMode("milestones");
    setActiveView("overview");
    setLayout(DEFAULT_LAYOUT);
    setLedgerSearch("");
    setLedgerVisibleColumns({});
    setPinnedStrategyId("");
    setScenarioHistory([]);
    setMobileInsightsOpen(false);
    setAssumptionsOpen(false);
    setHelpTopic("privacy");
    setHelpOpen(false);
    setTheme("dark");
    setTourStep(0);
    setStorageConsent(false);
    setTourOpen(false);
    setDisclaimerOpen(true);
    showToast(result.ok ? "Saved browser data cleared" : result.warning, result.ok ? "reset" : "risk");
    return result.ok;
  };
  const closeTour = () => {
    if (storageConsent) {
      try {
        localStorage.setItem(TOUR_KEY, "done");
      } catch (error) {}
    }
    setTourOpen(false);
  };
  const startTour = () => {
    setHelpOpen(false);
    setTourStep(0);
    setTourOpen(true);
    switchView("overview");
  };
  const showToast = (message, intent) => {
    setToast(makeToast(message, intent));
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), toastDurationMs(message));
  };
  useEffect(() => {
    if (initial.warning) showToast(initial.warning, "reset");
    if (initialLayout.warning) showToast(initialLayout.warning, "reset");
    if (initialScenarioHistory.warning) showToast(initialScenarioHistory.warning, "reset");
  }, []);

  useEffect(() => {
    if (!storageConsent) return undefined;
    const timer = window.setTimeout(() => {
      const result = persistJson(THEME_KEY, theme);
      if (!result.ok) showToast(result.warning, "reset");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storageConsent, theme]);

  useEffect(() => {
    if (!storageConsent) return undefined;
    const timer = window.setTimeout(() => {
      const result = persistJson(STORAGE_KEY, { state, preset, tableMode, activeView });
      if (!result.ok) showToast(result.warning, "reset");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storageConsent, state, preset, tableMode, activeView]);

  useEffect(() => {
    if (!storageConsent) return undefined;
    const timer = window.setTimeout(() => {
      const result = persistJson(LAYOUT_KEY, layout);
      if (!result.ok) showToast(result.warning, "reset");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storageConsent, layout]);

  useEffect(() => {
    if (!storageConsent) return undefined;
    const timer = window.setTimeout(() => {
      const result = persistScenarioHistory(scenarioHistory);
      if (!result.ok) showToast(result.warning, "reset");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storageConsent, scenarioHistory]);

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT);
    showToast("Auto layout restored");
  };
  const startColumnResize = (kind, event) => {
    event.preventDefault();
    const startX = event.clientX;
    const start = { ...layout };
    document.body.classList.add("resizing-columns");

    const move = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setLayout((current) => {
        if (kind === "rail") {
          return { ...current, rail: clamp(start.rail + delta, 128, 260) };
        }
        return { ...current, insights: clamp(start.insights - delta, 230, 420) };
      });
    };
    const stop = () => {
      document.body.classList.remove("resizing-columns");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const resizeWithKeys = (kind, event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    setLayout((current) => {
      if (kind === "rail") return { ...current, rail: clamp(current.rail + direction * 8, 128, 260) };
      return { ...current, insights: clamp(current.insights - direction * 8, 230, 420) };
    });
  };
  const applyPreset = (key) => {
    setPreset(key);
    markFeedback("scenario", key, `${PRESETS[key].label} applied`);
    commitState((current) => ({ ...current, ...PRESETS[key].patch }));
    showToast(`${PRESETS[key].label} applied`);
  };
  const reset = () => {
    setPreset("base");
    commitState(BASE);
    setTableMode("milestones");
    showToast("Workbook base restored");
	  };
	  const requireFreshAnalytics = (label = "this action") => {
	    if (!analyticsPending) return true;
	    showToast(`Analytics are still syncing. Use ${label} after the update badge clears.`, "reset");
	    return false;
	  };
	  const requireExportReady = (label = "export") => {
	    if (!analyticsPending) return true;
	    showToast(`Analytics are still syncing. Run ${label} after the update badge clears.`, "reset");
	    return false;
	  };
  const applyOptimumStrategy = (strategy) => {
    if (!strategy) return;
    if (!requireFreshAnalytics("strategy actions")) return;
    markFeedback("strategy", strategy.id, `${strategy.name} applied`);
    setPreset("custom");
    commitState((current) => ({ ...current, ...strategy.patch }));
    showToast(`${strategy.name} applied`);
  };

  const final = model.final;
  const principal = Number(modelState.principal) || 0;
  const growth = Math.max(0, final.closing - principal - final.cumContributions);
  const targetYear = Math.max(1, modelHorizonYears);
  const targetAnnualFinal = targetAnnualCashForYear(modelParams, targetYear, targetInflationFactor);
  const corpusRatio = targetCorpusReal > 0 ? final.realClosing / targetCorpusReal : 1;
  const corpusGoalDetail = targetCorpusReal <= 0
    ? "No final real target set"
    : corpusRatio >= 1
      ? `${formatInr(final.realClosing - targetCorpusReal)} final real buffer`
      : `${formatInr(targetCorpusReal - final.realClosing)} final real short`;
  const cashRatio = targetAnnualFinal > 0 ? final.withdrawal / targetAnnualFinal : 1;
  const realCorpusGap = Math.max(0, targetCorpusReal - final.realClosing);
  const monthlyCashGap = Math.max(0, targetAnnualFinal - final.withdrawal) / 12;
  const p10 = quantile(mc.finals, 0.1);
  const p50 = quantile(mc.finals, 0.5);
  const p90 = quantile(mc.finals, 0.9);
  const successDetail = `${formatInr(p50)} P50 vs ${formatInr(analyticsTargetCorpusNominal)} target`;
  const successBand = `${formatPct(mc.successCi95?.[0] || 0)}-${formatPct(mc.successCi95?.[1] || 0)}`;
  const successMargin = `±${formatPct(mc.successMargin95 || 0)}`;
  // R4.9.5b-2 (fin-5g3): probability display rounding for Plan Endurance and Target Confidence tiles.
  const enduranceDisplay = formatProbabilityForDisplay(mc.enduranceProbability, mc.enduranceMargin95);
  const successDisplay = formatProbabilityForDisplay(mc.successProbability, mc.successMargin95);
  const effectiveTax = y1Tax.interest > 0 ? y1Tax.tax / y1Tax.interest : 0;
  const y1TaxProfile = y1Tax.taxProfile || investmentTaxProfile(analyticsState, emptyTaxStreams());
  const taxBurden = final.cumInterest > 0 ? final.cumTax / final.cumInterest : 0;
  const payback = principal > 0 ? final.cumWithdrawals / principal : 0;
  const returnNeeded = requiredReturn === null ? ">40%" : formatPct(requiredReturn);
  const shortfallRows = model.rows.slice(1).filter((row) => (row.withdrawalShortfall || 0) > 1 || (row.targetCash > 0 && (row.cashCoverage || 0) < 0.995));
  const firstShortfall = shortfallRows[0] || null;
  const depletionMonth = (model.monthlyRows || []).find((row) => row.opening > 1 && row.closing <= 1);
  const depletionRow = model.rows.slice(1).find((row) => row.opening > 1 && row.closing <= 1);
  const depletionPoint = depletionMonth ? `Y${depletionMonth.year} M${depletionMonth.month}` : depletionRow ? `Y${depletionRow.year}` : null;
  const cumulativeCashShortfall = model.rows.reduce((sum, row) => sum + (row.withdrawalShortfall || 0), 0);
  const hasCashShortfall = modelState.cashMode === "monthlyTarget" && (Boolean(firstShortfall) || cumulativeCashShortfall > 1);
  const missesCorpusGoal = targetCorpusReal > 0 && final.realClosing + 1 < targetCorpusReal;
  const hasCorpusDepletion = modelState.cashMode === "monthlyTarget" && !hasCashShortfall && Boolean(depletionPoint) && final.closing <= 1;
  const hasCorpusGoalStress = modelState.cashMode === "monthlyTarget" && !hasCashShortfall && !hasCorpusDepletion && missesCorpusGoal;
  const hasCashStress = hasCashShortfall || hasCorpusDepletion || hasCorpusGoalStress;
  const stressLabel = hasCashShortfall
    ? "Monthly target is not sustainable"
    : hasCorpusDepletion
      ? "Corpus is fully consumed"
      : "Final corpus target is short";
  const stressHeadline = hasCashShortfall
    ? (depletionPoint ? `Cash shortfall as corpus depletes around ${depletionPoint}` : `Cash shortfall starts in Y${firstShortfall?.year || 1}`)
    : hasCorpusDepletion
      ? `Target cash is funded, but corpus depletes around ${depletionPoint}`
      : `${formatInr(targetCorpusReal - final.realClosing)} real corpus short`;
  const stressDetail = hasCashShortfall
    ? `Exact ${model.taxLotMethod} cash path supports about ${formatInr(maxMonthlyCash)} per month; the target needs roughly ${formatInr(requiredCorpusForCash)} corpus or ${requiredReturnForCash === null ? "a return above the tested range" : `${formatPct(requiredReturnForCash)} return`}.`
    : hasCorpusDepletion
      ? `The monthly cash target is funded on this path, but it spends down the corpus and misses the ${formatInr(targetCorpusReal)} real corpus target.`
      : `Monthly cash may be funded, but the final real corpus goal is not protected under current assumptions.`;
  const monthlyAuditRows = (model.monthlyRows || []).filter((row) => row.year === 1 || row.year === modelHorizonYears || (row.month === 12 && row.year % 5 === 0));
  const activeTableMode = tableMode === "monthly" ? (monthlyAuditRows.length ? "monthly" : "milestones") : tableMode;
  const tableRows = activeTableMode === "monthly"
    ? monthlyAuditRows
    : activeTableMode === "full"
      ? model.rows
      : model.rows.filter((row) => row.year === 0 || row.year === 1 || row.year === modelHorizonYears || row.year % 5 === 0);
  const ledgerSearchText = ledgerSearch.trim().toLowerCase();
  const visibleTableRows = useMemo(() => {
    if (!ledgerSearchText) return tableRows;
    return tableRows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(ledgerSearchText)));
  }, [ledgerSearchText, tableRows]);
  const annualLedgerColumns = [
    { key: "year", label: "Year", value: (row) => row.year },
    { key: "opening", label: "Opening", value: (row) => formatInr(row.opening), raw: (row) => row.opening },
    { key: "interest", label: "Interest", value: (row) => formatInr(row.interest), raw: (row) => row.interest },
    { key: "tax", label: "Tax", value: (row) => formatInr(row.tax), raw: (row) => row.tax },
    { key: "withdrawal", label: "Withdrawal", value: (row) => formatInr(row.withdrawal), raw: (row) => row.withdrawal },
    { key: "reinvested", label: "Reinvested", value: (row) => formatInr(row.reinvested), raw: (row) => row.reinvested },
    { key: "contribution", label: "Top-up", value: (row) => formatInr(row.contribution), raw: (row) => row.contribution },
    { key: "shock", label: "Shock", value: (row) => formatInr(row.shock), raw: (row) => row.shock },
    { key: "closing", label: "Closing", value: (row) => formatInr(row.closing), raw: (row) => row.closing },
    { key: "realClosing", label: "Real Closing", value: (row) => formatInr(row.realClosing), raw: (row) => row.realClosing },
    { key: "cumWithdrawals", label: "Cum. Cash", value: (row) => formatInr(row.cumWithdrawals), raw: (row) => row.cumWithdrawals }
  ];
  const monthlyLedgerColumns = [
    { key: "period", label: "Period", value: (row) => row.period },
    { key: "opening", label: "Opening", value: (row) => formatInr(row.opening), raw: (row) => row.opening },
    { key: "interest", label: "Growth", value: (row) => formatInr(row.interest), raw: (row) => row.interest },
    { key: "grossRedemption", label: "Gross Redeemed", value: (row) => formatInr(row.grossRedemption), raw: (row) => row.grossRedemption },
    { key: "capitalRecovered", label: "Cost Capital", value: (row) => formatInr(row.capitalRecovered), raw: (row) => row.capitalRecovered },
    { key: "realizedGain", label: "Realised Gain", value: (row) => formatInr(row.realizedGain), raw: (row) => row.realizedGain },
    { key: "taxableGain", label: "Taxable Gain", value: (row) => formatInr(row.taxableGain), raw: (row) => row.taxableGain },
    { key: "ltcgExemptionUsed", label: "LTCG Exempt", value: (row) => formatInr(row.ltcgExemptionUsed), raw: (row) => row.ltcgExemptionUsed },
    { key: "tax", label: "Tax", value: (row) => formatInr(row.tax), raw: (row) => row.tax },
    { key: "withdrawal", label: "Net Cash", value: (row) => formatInr(row.withdrawal), raw: (row) => row.withdrawal },
    { key: "closing", label: "Closing", value: (row) => formatInr(row.closing), raw: (row) => row.closing }
  ];
  const ledgerColumnSpecs = activeTableMode === "monthly" ? monthlyLedgerColumns : annualLedgerColumns;
  const visibleLedgerColumns = ledgerColumnSpecs.filter((column) => ledgerVisibleColumns[column.key] !== false);
  const ledgerJumpOptions = useMemo(() => {
    const candidates = activeTableMode === "monthly"
      ? tableRows.map((row) => row.period).filter(Boolean)
      : tableRows.map((row) => String(row.year));
    return [...new Set(candidates)].slice(0, 72);
  }, [activeTableMode, tableRows]);
  const toggleLedgerColumn = (key) => {
    setLedgerVisibleColumns((current) => ({
      ...current,
      [key]: current[key] === false
    }));
  };
  const taxLotSummary = model.rows.reduce((sum, row) => ({
    realizedGain: sum.realizedGain + (row.realizedGain || 0),
    taxableGain: sum.taxableGain + (row.taxableGain || 0),
    capitalRecovered: sum.capitalRecovered + (row.capitalRecovered || 0),
    exemptionUsed: sum.exemptionUsed + (row.ltcgExemptionUsed || 0)
  }), { realizedGain: 0, taxableGain: 0, capitalRecovered: 0, exemptionUsed: 0 });
  const activeYearOneRow = model.rows[1] || {};
  const activeYearOneRelief = (activeYearOneRow.rebateUsed || 0) + (activeYearOneRow.basicExemptionUsed || 0) + (activeYearOneRow.section80TTBUsed || 0);
  const standaloneYearOneRelief = (y1TaxProfile.rebateUsed || 0) + (y1TaxProfile.basicExemptionUsed || 0) + (y1TaxProfile.section80TTBUsed || 0);
  const swpOrderModels = useMemo(() => analyticsState.incomeMode === "swp"
    ? ["proRata", "debtFirst", "equityFirst"].map((order) => {
      const orderModel = calculate({ ...analyticsParams, withdrawalPriority: order });
      return {
        order,
        label: { proRata: "Pro-rata", debtFirst: "Debt first", equityFirst: "Equity first" }[order],
        tax: orderModel.final.cumTax,
        final: orderModel.final.closing,
        coveredYears: orderModel.rows.slice(1).filter((row) => (row.cashCoverage || 0) >= 0.995).length
      };
    }).sort((a, b) => (b.coveredYears - a.coveredYears) || (a.tax - b.tax) || (b.final - a.final))
    : [], [analyticsState.incomeMode, analyticsParams]);
  const bestSwpOrder = swpOrderModels[0];
  const idcwComparison = useMemo(() => {
    if (activeView !== "tax") return null;
    const swp = calculate(projectionParamsFromState({ ...analyticsState, incomeMode: "swp" }));
    const idcw = calculate(projectionParamsFromState({ ...analyticsState, incomeMode: "idcw" }));
    return {
      swpCash: swp.final.cumWithdrawals,
      idcwCash: idcw.final.cumWithdrawals,
      swpTax: swp.final.cumTax,
      idcwTax: idcw.final.cumTax,
      idcwFinal: idcw.final.closing,
      navDrag: Math.max(0, (swp.final.closing || 0) - (idcw.final.closing || 0))
    };
  }, [activeView, analyticsState]);
  const actionPlan = useMemo(() => buildRetirementActionPlan(analyticsState, {
    best: optimum.best,
    profile: optimum.profile,
    household: analyticsHousehold,
    effectiveYears: analyticsHorizonYears,
    taxProfile: y1TaxProfile,
    taxLaw: activeTaxLaw,
    taxLawStatus,
    successProbability: mc.successProbability
  }), [analyticsState, optimum, analyticsHousehold, analyticsHorizonYears, y1TaxProfile, activeTaxLaw, taxLawStatus, mc.successProbability]);
  const guidedPlan = useMemo(() => buildRetireeGuidedPlan(analyticsState, {
    household: analyticsHousehold,
    best: optimum.best,
    profile: optimum.profile,
    policy: actionPlan.policy,
    maxMonthlyCash
  }), [analyticsState, analyticsHousehold, optimum.best, optimum.profile, actionPlan.policy, maxMonthlyCash]);
  const planMood = hasCashStress
    ? "attention"
    : cashRatio >= 1 && corpusRatio >= 1 && mc.successProbability >= 0.65
      ? "strong"
      : cashRatio >= 0.9 && corpusRatio >= 0.85
        ? "watch"
        : "gap";
  // R4.9.5b (fin-62w): verdict headline + body rewrites.
  // strong: celebratory, names actual monthly + corpus numbers. Not apologetic.
  // watch: confident near-pass, names a single concrete next step.
  // attention: dynamic stressHeadline already names depletion/shortfall point; body
  //   adds three concrete levers instead of generic "use the actions below."
  // gap: names the three levers (corpus / cash / return) rather than abstract bridge.
  const decisionHeadline = planMood === "strong"
    ? "Yes — the plan covers income, protects the corpus goal, and has room to spare."
    : planMood === "watch"
      ? "Mostly yes — income is close, but the corpus cushion is thin."
      : hasCashStress
        ? `${stressHeadline}.`
        : "Not yet — the plan needs more corpus, lower cash, or a higher return to close the gap.";
  const decisionCopy = planMood === "strong"
    ? `Covering ${formatInr(effectiveMonthlyTarget)}/month from a ${formatInr(targetCorpusReal)} corpus over the full horizon. Refine if you want to squeeze more out of allocation or tax.`
    : planMood === "watch"
      ? `The income path nearly reaches the target and the corpus is within range, but a long retirement or weak markets could expose the gap — one of the actions below closes it.`
      : `${stressDetail} Reduce monthly cash, add to corpus, or shift to a lower-drawdown strategy to extend the runway.`;
  const decisionPills = [
    { label: "Income", value: cashRatio >= 1 ? "Covered" : `${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%` },
    { label: "Corpus", value: corpusRatio >= 1 ? "Protected" : `${Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%` },
    { label: "Tax Drag", value: formatInr(final.cumTax) },
    { label: "Confidence", value: successDisplay.primary }
  ];
  const decisionMap = [
    {
      label: "Cash Flow",
      value: `${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`,
      detail: `${formatInr(final.withdrawal / 12)} vs ${formatInr(targetAnnualFinal / 12)} final-month need`,
      ratio: cashRatio,
      accent: "coral"
    },
    {
      label: "Corpus Floor",
      value: `${Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%`,
      detail: corpusGoalDetail,
      ratio: corpusRatio,
      accent: "teal"
    },
    {
      label: "Market Margin",
      value: successDisplay.primary,
      detail: successDetail,
      ratio: mc.successProbability,
      accent: "blue"
    }
  ];
  const overviewScenarioModels = useMemo(() => {
    if (activeView !== "overview") return [];
    return SCENARIOS.map((scenario) => {
      const scenarioState = scenario.source === "active"
        ? analyticsState
        : normalizeState({ ...analyticsState, ...scenario.patch, inflation: analyticsState.inflation });
      const params = scenario.source === "active" ? analyticsParams : projectionParamsFromState(scenarioState);
      const scenarioModel = calculate(params);
      const realRatio = analyticsTargetCorpusReal > 0 ? scenarioModel.final.realClosing / analyticsTargetCorpusReal : 1;
      const finalCashNeed = targetAnnualCashForYear(
        params,
        Math.max(1, Math.round(Number(params.years) || 0)),
        Math.pow(1 + (Number(params.inflation) || 0) / 100, Number(params.years) || 0)
      );
      const scenarioCashRatio = finalCashNeed > 0 ? scenarioModel.final.withdrawal / finalCashNeed : 1;
      const status = realRatio >= 1 && scenarioCashRatio >= 1 ? "strong" : realRatio >= 0.85 || scenarioCashRatio >= 0.9 ? "watch" : "gap";
      // R4.9.5b-1: depletion annotation — detect year of first depletion in rows
      const startingCorpus = Number(params.principal) || 0;
      const closing = scenarioModel.final.closing;
      let depletionYear = null;
      let isZeroStart = false;
      if (closing <= 0) {
        if (startingCorpus <= 0) {
          isZeroStart = true;
        } else {
          const rows = scenarioModel.rows || [];
          const deplRow = rows.slice(1).find((row) => row.closing <= 0);
          depletionYear = deplRow ? deplRow.year : null;
        }
      }
      return {
        ...scenario,
        status,
        final: closing,
        real: scenarioModel.final.realClosing,
        cashRatio: scenarioCashRatio,
        realRatio,
        depletionYear,
        isZeroStart
      };
    });
  }, [activeView, analyticsParams, analyticsState, analyticsTargetCorpusReal]);

  const labels = useMemo(() => model.rows.map((row) => row.year), [model.rows]);
  const chartBase = useMemo(() => baseChart(colors), [colors]);
  const chartLegend = useMemo(() => ({
    top: 0,
    right: 0,
    textStyle: { color: colors.muted, fontSize: 10, fontWeight: 700 },
    itemWidth: 10,
    itemHeight: 6,
    itemGap: 8
  }), [colors.muted]);

  const journeyOption = useMemo(() => ({
    ...chartBase,
    legend: chartLegend,
    series: [
      { name: "Closing balance", type: "line", smooth: true, symbol: "none", lineStyle: { color: colors.teal, width: 3 }, areaStyle: { color: area(colors.teal) }, data: model.rows.map((row) => row.closing) },
      { name: "Cumulative cash", type: "line", smooth: true, symbol: "none", lineStyle: { color: colors.blue, width: 2.5 }, data: model.rows.map((row) => row.cumWithdrawals) },
      { name: "Real closing", type: "line", smooth: true, symbol: "none", lineStyle: { color: colors.coral, width: 2, type: "dashed" }, data: model.rows.map((row) => row.realClosing) }
    ],
    xAxis: { ...chartBase.xAxis, type: "category", boundaryGap: false, data: labels },
    yAxis: { ...chartBase.yAxis, type: "value" }
  }), [chartBase, chartLegend, colors.blue, colors.coral, colors.teal, labels, model.rows]);

  const mixOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/>${formatInr(p.value)} (${p.percent}%)`, backgroundColor: colors.panel, borderColor: "rgba(255,255,255,.12)", textStyle: { color: colors.text } },
    series: [{
      type: "pie",
      radius: ["58%", "82%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: colors.panel, borderWidth: 2 },
      label: { show: false },
      data: [
        { value: principal, name: "Starting principal", itemStyle: { color: colors.teal } },
        { value: final.cumContributions, name: "Top-ups", itemStyle: { color: colors.blue } },
        { value: growth, name: "Reinvested growth", itemStyle: { color: colors.gold } }
      ]
    }]
  }), [colors.blue, colors.gold, colors.panel, colors.teal, colors.text, final.cumContributions, growth, principal]);

  const sampled = useMemo(() => (
    model.rows.filter((row) => row.year === 1 || row.year === modelHorizonYears || row.year % Math.max(1, Math.ceil(modelHorizonYears / 10)) === 0)
  ), [model.rows, modelHorizonYears]);
  const splitOption = useMemo(() => ({
    ...chartBase,
    legend: chartLegend,
    xAxis: { ...chartBase.xAxis, type: "category", boundaryGap: true, data: sampled.map((row) => `Y${row.year}`) },
    yAxis: { ...chartBase.yAxis, type: "value" },
    series: [
      { name: "Tax", type: "bar", stack: "interest", itemStyle: { color: colors.coral, borderRadius: [2, 2, 0, 0] }, data: sampled.map((row) => row.tax) },
      { name: "Withdrawal", type: "bar", stack: "interest", itemStyle: { color: colors.blue }, data: sampled.map((row) => row.withdrawal) },
      { name: "Reinvested", type: "bar", stack: "interest", itemStyle: { color: colors.gold }, data: sampled.map((row) => row.reinvested) }
    ]
  }), [chartBase, chartLegend, colors.blue, colors.coral, colors.gold, sampled]);

  const riskLabels = useMemo(() => (
    Array.from({ length: mc.p50.length || labels.length }, (_, index) => index)
  ), [labels.length, mc.p50.length]);
  const riskOption = useMemo(() => ({
    ...chartBase,
    legend: chartLegend,
    xAxis: { ...chartBase.xAxis, type: "category", boundaryGap: false, data: riskLabels },
    yAxis: { ...chartBase.yAxis, type: "value" },
    series: [
      { name: "P90", type: "line", smooth: true, symbol: "none", lineStyle: { color: colors.teal, width: 2 }, areaStyle: { color: area(colors.teal) }, data: mc.p90 },
      { name: "P50", type: "line", smooth: true, symbol: "none", lineStyle: { color: colors.blue, width: 3 }, data: mc.p50 },
      { name: "P10", type: "line", smooth: true, symbol: "none", lineStyle: { color: colors.coral, width: 2, type: "dashed" }, data: mc.p10 },
      { name: "Inflated target", type: "line", symbol: "none", lineStyle: { color: colors.gold, width: 1.5, type: "dotted" }, data: riskLabels.map(() => analyticsTargetCorpusNominal) }
    ]
  }), [chartBase, chartLegend, colors.blue, colors.coral, colors.gold, colors.teal, riskLabels, mc.p10, mc.p50, mc.p90, analyticsTargetCorpusNominal]);

  const scenarioModels = useMemo(() => {
    if (activeView !== "simulations") return [];
    return SCENARIOS.map((scenario) => {
      if (scenario.source === "active") return { ...scenario, params: analyticsParams, model: calculate(analyticsParams) };
      const scenarioState = normalizeState({ ...analyticsState, ...scenario.patch, inflation: analyticsState.inflation });
      const params = projectionParamsFromState(scenarioState);
      return { ...scenario, params, model: calculate(params) };
    });
  }, [activeView, analyticsParams, analyticsState]);
  const scenarioLibraryModels = useMemo(() => {
    if (activeView !== "simulations") return [];
    return STANDARD_SCENARIO_LIBRARY.map((item) => {
      const scenarioState = stateForScenarioLibraryItem(item, analyticsState);
      const params = projectionParamsFromState(scenarioState);
      const scenarioModel = calculate(params);
      return {
        ...item,
        state: scenarioState,
        params,
        model: scenarioModel,
        fingerprint: planFingerprint(scenarioState, taxLawFromState(scenarioState))
      };
    });
  }, [activeView, analyticsState]);
  const scenarioLabels = scenarioModels[0]?.model.rows.map((row) => row.year) || labels;
  const scenarioOption = useMemo(() => ({
    ...chartBase,
    legend: chartLegend,
    xAxis: { ...chartBase.xAxis, type: "category", boundaryGap: false, data: scenarioLabels },
    yAxis: { ...chartBase.yAxis, type: "value" },
    series: scenarioModels.map((item) => ({ name: item.name, type: "line", smooth: true, symbol: "none", lineStyle: { color: colors[item.colorKey], width: item.name === "Active" ? 3 : 2 }, data: item.model.rows.map((row) => row.closing) }))
  }), [chartBase, chartLegend, colors, scenarioLabels, scenarioModels]);

  const heatReturns = useMemo(() => [6, 8, 10, 12, 14, 16], []);
  const heatWithdrawals = useMemo(() => [0, 25, 50, 75, 100], []);
  const heatRows = useMemo(() => {
    if (activeView !== "simulations") return [];
    return heatWithdrawals.map((withdrawRate) => ({
      withdrawRate,
      cells: heatReturns.map((annualRate) => {
        const heatParams = {
          ...analyticsParams,
          useAssetReturns: 0,
          annualRate,
          withdrawRate,
          cashMode: "interestPercent"
        };
        const projection = calculate(heatParams).final;
        const years = Number(heatParams.years) || analyticsHorizonYears;
        const realValue = projection.closing / Math.pow(1 + analyticsState.inflation / 100, years);
        const principal = Number(analyticsState.principal) || 0;
        const target = analyticsTargetCorpusReal;
        const realProtected = principal <= 0 || realValue >= principal;
        const targetHitReal = target <= 0 || realValue >= target;
        const strongRealBuffer = target <= 0 ? realValue >= principal * 1.2 : realValue >= target * 1.2;
        let status = "risk";
        let label = "Below start";
        if (targetHitReal && strongRealBuffer) {
          status = "excellent";
          label = "20%+ buffer";
        } else if (targetHitReal) {
          status = "protected";
          label = "Real target hit";
        } else if (realProtected) {
          status = "watch";
          label = "Real target short";
        }
        const targetGap = target > 0 ? realValue - target : realValue - principal;
        return { annualRate, value: projection.closing, realValue, status, label, targetGap };
      })
    }));
  }, [activeView, heatWithdrawals, heatReturns, analyticsParams, analyticsState.inflation, analyticsState.principal, analyticsHorizonYears, analyticsTargetCorpusReal]);

  const smartInsights = [
    manualReturnNotice || null,
    hasCashStress
      ? `${stressLabel}: ${stressHeadline}. ${stressDetail}`
      : null,
    mc.successProbability >= 0.75
      ? `End-target chance is healthy: P50 final corpus is ${formatInr(p50)} against the ${formatInr(analyticsTargetCorpusNominal)} nominal target.`
      : `End-target chance is only ${successDisplay.primary}: P50 is ${formatInr(p50)} against the ${formatInr(analyticsTargetCorpusNominal)} nominal target, so the plan depends on stronger return paths.`,
    cashRatio >= 1
      ? `Cash-flow target is covered at ${Math.round(cashRatio * 100)}% of the inflation-adjusted final-year need.`
      : `Cash-flow target is short by ${formatInr(Math.max(0, targetAnnualFinal - final.withdrawal) / 12)} per month in final-year rupees.`,
    optimum.best
      ? `Strategy shortlist favours ${optimum.best.name}: ${Math.round(optimum.best.equityShare)}% equity, ${Math.round(100 - optimum.best.equityShare)}% defensive assets, and ${optimum.best.cashCoveredYears}/${analyticsHorizonYears} years of target cash covered.`
      : null,
    actionPlan.policy.summary,
    actionPlan.audit.flags[0] ? `Audit flag: ${actionPlan.audit.flags[0].text}` : `Assumption audit: ${actionPlan.audit.confidence}.`,
    modelState.incomeMode === "swp"
      ? `SWP tax ledger uses ${model.monthlyRows.length} monthly FIFO steps; ${formatInr(taxLotSummary.capitalRecovered)} is recovered cost capital and ${formatInr(taxLotSummary.realizedGain)} is realised gain.`
      : modelState.taxRate > 0
      ? `Tax uses your manual ${modelState.taxRate}% override instead of instrument-specific treatment.`
      : `Retiree tax profile estimates ${formatInr(final.cumTax)} total tax drag; standalone year-1 slab relief estimate is ${formatInr(standaloneYearOneRelief)}.`,
    topup <= 1
      ? "No extra annual top-up is required for the current corpus target."
      : `Gap solver points to an additional ${formatInr(topup)} annual top-up to reach the target.`
  ].filter(Boolean);

  const latestSnapshot = scenarioHistory[0] || null;
  const scenarioDeltaRows = latestSnapshot ? [
    { label: "Final Corpus", value: formatInr(final.closing - latestSnapshot.outputs.finalCorpus), detail: "vs latest saved snapshot" },
    { label: "Real Corpus", value: formatInr(final.realClosing - latestSnapshot.outputs.realFinalCorpus), detail: "today's-rupee delta" },
    { label: "End Chance", value: formatPct(mc.successProbability - latestSnapshot.outputs.endTargetChance), detail: "Monte Carlo chance delta" },
    { label: "Tax Drag", value: formatInr(final.cumTax - latestSnapshot.outputs.cumulativeTax), detail: "cumulative tax delta" }
  ] : [];
  const effectiveProjectionEvidence = (evidenceState, evidenceParams, evidenceHousehold) => {
    const effectiveTargetToday = evidenceHousehold.useHouseholdPlan ? evidenceHousehold.targetCorpusToday : Number(evidenceState.targetCorpus) || 0;
    return {
      rawMonthlyCashTarget: Number(evidenceState.monthlyTarget) || 0,
      effectiveMonthlyCashNeed: Number(evidenceParams.monthlyTarget) || 0,
      rawTargetCorpusToday: Number(evidenceState.targetCorpus) || 0,
      effectiveTargetCorpusToday: effectiveTargetToday,
      effectiveTargetCorpusNominal: Number(evidenceParams.targetCorpus) || 0,
      rawYears: Number(evidenceState.years) || 0,
      effectiveYears: Number(evidenceParams.years) || 0,
      cashMode: evidenceState.cashMode,
      cashEngine: evidenceState.incomeMode,
      householdMode: Boolean(evidenceHousehold.useHouseholdPlan),
      householdOffsets: {
        expenses: evidenceHousehold.expenses,
        incomes: evidenceHousehold.incomes,
        emergencyReserve: evidenceHousehold.emergencyReserve,
        healthcareReserve: evidenceHousehold.healthcareReserve,
        plannedLumpSum: evidenceHousehold.plannedLumpSum,
        plannedLumpSumYear: evidenceHousehold.plannedLumpSumYear,
        legacyGoal: evidenceHousehold.legacyGoal
      }
    };
  };
  const buildScenarioSnapshot = (snapshotState, { name, notes, source = "manual", libraryId = "" } = {}) => {
    const normalizedSnapshotState = normalizeState(snapshotState);
    const snapshotTaxLaw = taxLawFromState(normalizedSnapshotState);
    const snapshotParams = projectionParamsFromState(normalizedSnapshotState);
    const snapshotHousehold = householdPlanProfile(normalizedSnapshotState);
    const snapshotModel = calculate(snapshotParams);
    const snapshotMc = calculateMonteCarlo(snapshotParams, Math.min(Number(normalizedSnapshotState.monteCarloSamples) || 64, 64));
    const snapshotFingerprint = planFingerprint(normalizedSnapshotState, snapshotTaxLaw);
    const snapshotName = String(name || "").trim() || `${activePreset.label} ${new Date().toLocaleDateString("en-IN")}`;
    const createdAt = new Date().toISOString();
    return {
      id: `plan-${Date.now()}-${Math.round(Math.random() * 100000)}`,
      name: snapshotName,
      notes: String(notes || "").trim(),
      source,
      libraryId,
      createdAt,
      taxLawVersion: snapshotTaxLaw.version,
      fingerprint: snapshotFingerprint,
      exportProvenance: {
        product: "Retirement Corpus & Income Planner",
        exportType: "Saved scenario snapshot",
        generatedAt: createdAt,
        taxLawVersion: snapshotTaxLaw.version,
        fingerprint: snapshotFingerprint,
        riskMethod: snapshotMc.method,
        riskSeed: String(snapshotMc.seed)
      },
      state: normalizedSnapshotState,
      effectiveProjection: effectiveProjectionEvidence(normalizedSnapshotState, snapshotParams, snapshotHousehold),
      outputs: {
        finalCorpus: snapshotModel.final.closing,
        realFinalCorpus: snapshotModel.final.realClosing,
        cumulativeCash: snapshotModel.final.cumWithdrawals,
        finalMonthlyCash: effectiveMonthlyWithdrawal(snapshotModel), // fin-rrf: shared helper
        endTargetChance: snapshotMc.successProbability,
        cumulativeTax: snapshotModel.final.cumTax
      }
    };
  };
  const saveScenarioSnapshot = ({ name, notes, state: snapshotState, source = "manual", libraryId = "" } = {}) => {
    if (!snapshotState && !requireFreshAnalytics("saving scenario snapshots")) return null;
    const snapshot = buildScenarioSnapshot(snapshotState || modelState, { name, notes, source, libraryId });
    setScenarioHistory((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)].slice(0, 12));
    showToast(`${snapshot.name} snapshot saved`);
    return snapshot;
  };
  const annotateScenarioSnapshot = (id, notes) => {
    setScenarioHistory((current) => current.map((item) => (
      item.id === id ? { ...item, notes: String(notes || "").slice(0, 600) } : item
    )));
  };
	  const applyScenarioLibraryItem = (item) => {
	    if (!item?.state) return;
	    if (!requireFreshAnalytics("scenario library actions")) return;
	    setPreset("custom");
	    commitState(item.state);
    switchView("simulations");
    showToast(`${item.name} applied`);
  };
	  const saveScenarioLibraryItem = (item) => {
	    if (!item?.state) return;
	    if (!requireFreshAnalytics("scenario library actions")) return;
	    const snapshot = {
      name: item.name,
      notes: item.notes,
      state: item.state,
      source: "library",
      libraryId: item.id
    };
    saveScenarioSnapshot(snapshot);
  };
  const restoreScenarioSnapshot = (snapshot) => {
    if (!snapshot?.state) return;
    if (!requireFreshAnalytics("restoring saved scenarios")) return;
    setPreset("custom");
    commitState(snapshot.state);
    showToast(`${snapshot.name} restored`);
  };
  const deleteScenarioSnapshot = (id) => {
    setScenarioHistory((current) => current.filter((item) => item.id !== id));
    showToast("Saved scenario deleted");
  };
  const exportJsonFile = (payload, filename) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportScenarioSnapshot = (snapshot) => {
    if (!snapshot) return;
    exportJsonFile({
      product: "Retirement Corpus & Income Planner",
      exportType: "Saved scenario snapshot",
      planningEstimate: true,
      sensitivityWarning: "Contains private financial assumptions. Use as a planning estimate, not tax/investment advice.",
      snapshot
    }, `${snapshot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "retirement-scenario"}.json`);
    showToast("Scenario snapshot exported");
  };
  const importScenarioSnapshot = async (file) => {
    if (!requireFreshAnalytics("importing saved scenarios")) return;
    try {
      const payload = JSON.parse(await file.text());
      const rawSnapshot = payload.snapshot || payload;
      if (!rawSnapshot?.state) throw new Error("No saved plan state found in the JSON file.");
      const importedState = normalizeState(rawSnapshot.state);
      const importedName = rawSnapshot.name || payload.name || file.name.replace(/\.json$/i, "") || "Imported plan";
      const importedNotes = [
        rawSnapshot.notes,
        `Imported from ${file.name} on ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`
      ].filter(Boolean).join("\n\n");
      const snapshot = buildScenarioSnapshot(importedState, {
        name: importedName,
        notes: importedNotes,
        source: "import",
        libraryId: rawSnapshot.libraryId || ""
      });
      setScenarioHistory((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)].slice(0, 12));
      showToast(`${snapshot.name} imported`);
    } catch (error) {
      showToast(error?.message || "Scenario import failed", "risk");
    }
  };
	  const exportScenarioLibraryItem = (item) => {
	    if (!item?.state) return;
	    if (!requireFreshAnalytics("scenario library actions")) return;
	    exportScenarioSnapshot(buildScenarioSnapshot(item.state, {
      name: item.name,
      notes: item.notes,
      source: "library",
      libraryId: item.id
    }));
  };

  const buildLedgerCsvText = (reportState, reportModel, reportTaxLaw, reportMc, reportFingerprint) => {
    const csv = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
    const number = (value) => Number(value || 0).toFixed(2);
    const lines = [
      "Review Pack Ledger",
      ["Generated", new Date().toISOString()].map(csv).join(","),
      ["Assumptions fingerprint", reportFingerprint].map(csv).join(","),
      ["Tax ruleset", reportTaxLaw.version].map(csv).join(","),
      ["Risk method", `${reportMc.method}; ${reportMc.simulations} samples; seed ${reportMc.seed}`].map(csv).join(","),
      ["Sensitive data warning", "This CSV is embedded in a private adviser/CA review pack."].map(csv).join(","),
      "",
      ["Year", "Opening", "Growth", "Tax", "Withdrawal", "Reinvested", "Top-up", "Shock", "Closing", "Real Closing", "Cumulative Cash", "Realized Gain", "Taxable Gain", "Capital Recovered"].map(csv).join(",")
    ];
    reportModel.rows.forEach((row) => {
      lines.push([row.year, row.opening, row.interest, row.tax, row.withdrawal, row.reinvested, row.contribution, row.shock, row.closing, row.realClosing, row.cumWithdrawals, row.realizedGain || 0, row.taxableGain || 0, row.capitalRecovered || 0].map(number).join(","));
    });
    if (reportModel.monthlyRows?.length) {
      lines.push("", "Monthly FIFO");
      lines.push(["Period", "Opening", "Growth", "Target Cash", "Gross Redemption", "Cost Capital", "Realized Gain", "Taxable Gain", "Tax", "Net Cash", "Closing"].map(csv).join(","));
      reportModel.monthlyRows.forEach((row) => {
        lines.push([csv(row.period), number(row.opening), number(row.interest), number(row.targetCash), number(row.grossRedemption), number(row.capitalRecovered), number(row.realizedGain), number(row.taxableGain), number(row.tax), number(row.withdrawal), number(row.closing)].join(","));
      });
    }
    return lines.join("\n");
  };

  const buildScenarioComparisonPack = (reportState) => STANDARD_SCENARIO_LIBRARY.map((item) => {
    const scenarioState = stateForScenarioLibraryItem(item, reportState);
    const scenarioTaxLaw = taxLawFromState(scenarioState);
    const scenarioParams = projectionParamsFromState(scenarioState);
    const scenarioHousehold = householdPlanProfile(scenarioState);
    const scenarioModel = calculate(scenarioParams);
    return {
      id: item.id,
      name: item.name,
      role: item.role,
      notes: item.notes,
      fingerprint: planFingerprint(scenarioState, scenarioTaxLaw),
      taxLawVersion: scenarioTaxLaw.version,
      effectiveProjection: effectiveProjectionEvidence(scenarioState, scenarioParams, scenarioHousehold),
      outputs: {
        finalCorpus: scenarioModel.final.closing,
        realFinalCorpus: scenarioModel.final.realClosing,
        cumulativeCash: scenarioModel.final.cumWithdrawals,
        cumulativeTax: scenarioModel.final.cumTax,
        finalMonthlyCash: effectiveMonthlyWithdrawal(scenarioModel) // fin-rrf: shared helper
      },
      assumptions: scenarioState
    };
  });

  const buildExportContext = () => {
    // fin-f3n.13: read analyticsState (debounced, post-settle) instead of liveInputState
    // (state). This ensures the export context uses the same epoch as the displayed
    // analytics bundle — export numbers and displayed numbers always match.
    // fin-jyv.2: read mc, optimum, and all solver outputs from the settled
    // analyticsBundle.value instead of re-running them synchronously. The bundle is
    // computed by the background worker from the same analyticsState epoch, so the
    // numbers are identical to what is displayed and no solver re-run is needed.
    const reportState = normalizeState(analyticsState);
    const reportParams = projectionParamsFromState(reportState);
    const reportModel = calculate(reportParams);
    const reportTaxLaw = taxLawFromState(reportState);
    const reportFingerprint = planFingerprint(reportState, reportTaxLaw);
    const reportHousehold = householdPlanProfile(reportState);
    // Read settled bundle results — avoids re-running MC and four solvers synchronously.
    const {
      mc: settledBundleMc,
      requiredCorpusForCash: reportRequiredCorpusForCash,
      requiredReturnForCash: reportRequiredReturnForCash,
      maxMonthlyCash: reportMaxMonthlyCash,
      interestShareForTarget: reportInterestShareForTarget,
      optimum: reportOptimum,
    } = lastSettledAnalyticsRef.current;
    // fin-1q6 (R4-Q18 Option A): the settled bundle's MC may still be the
    // fast-tier fallback (simulations:0) if the slow tier merged after the ref
    // last captured. Prefer the last MC that genuinely settled with samples>0
    // for THIS plan fingerprint so §2/§7 show the real sample count; the §7
    // sentinel still fires for a genuine samples=0 (slow tier never ran).
    const { mc: reportMc } = selectExportMc(settledBundleMc, analyticsFingerprint, lastSettledMcRef.current);
    return {
      reportState,
      reportParams,
      reportModel,
      reportMc,
      reportTaxLaw,
      reportFingerprint,
      reportHousehold,
      reportRequiredCorpusForCash,
      reportRequiredReturnForCash,
      reportMaxMonthlyCash,
      reportInterestShareForTarget,
      reportOptimum,
      // R4.9.5g §7: archival full disclaimer for the PDF methodology page.
      // Pulled at build time via `?raw` import from DISCLAIMER.md so the
      // PDF text matches the canonical file byte-for-byte (modulo PDF
      // text-flow wrapping). The §1 cover continues to carry the abridged
      // DisclaimerNotice modal copy; §7 carries this full archival text.
      disclaimerFullText: typeof DISCLAIMER_FULL_TEXT === "string" ? DISCLAIMER_FULL_TEXT : "",
    };
  };

  const isExportContext = (context) => Boolean(context?.reportState && context?.reportParams && context?.reportModel && context?.reportTaxLaw);
  const exportContext = (context) => (isExportContext(context) ? context : buildExportContext());

  const buildReviewPack = (context) => {
    context = exportContext(context);
    const { reportState, reportParams, reportModel, reportMc, reportTaxLaw, reportFingerprint, reportHousehold } = context;
    return {
      product: "Retirement Corpus & Income Planner",
      exportType: "Adviser and CA review pack",
      planningEstimate: true,
      generatedAt: new Date().toISOString(),
      caveatPage: [
        "Private financial assumptions are included. Treat this pack, PDF, CSV, and scenario JSON as sensitive data.",
        "Planning-grade model only; not tax, legal, or investment advice.",
        "PDF output is not claimed as PDF/UA accessible; CSV and JSON are the machine-readable evidence paths.",
        "Tax results require CA review for residential status, acquisition dates, product classification, special-rate gains, surcharge, TDS, and interpretation.",
        "Risk results are scenario sensitivity, not predictions or guarantees."
      ],
      provenance: {
        assumptionsFingerprint: reportFingerprint,
        taxLawVersion: reportTaxLaw.version,
        taxLawSource: reportTaxLaw.source,
        taxLawSourceUrl: reportTaxLaw.sourceUrl,
        taxLawUpdatedOn: reportTaxLaw.updatedOn,
        riskMethod: reportMc.method,
        riskSamples: reportMc.simulations,
        riskSeed: reportMc.seed,
        riskBand95: reportMc.successCi95 || []
      },
      artifacts: {
        pdfReport: {
          filename: "retirement_corpus_income_planner.pdf",
          note: "Generated by the same Review Pack action for narrative/charts."
        },
        csvLedger: buildLedgerCsvText(reportState, reportModel, reportTaxLaw, reportMc, reportFingerprint),
        taxLawJson: reportTaxLaw,
        assumptionsJson: normalizeState(reportState),
        effectiveProjection: effectiveProjectionEvidence(reportState, reportParams, reportHousehold),
        householdProfile: reportHousehold,
        scenarioComparison: buildScenarioComparisonPack(reportState),
        savedScenarioHistory: scenarioHistory.map((item) => ({
          id: item.id,
          name: item.name,
          notes: item.notes,
          createdAt: item.createdAt,
          taxLawVersion: item.taxLawVersion,
          fingerprint: item.fingerprint,
          effectiveProjection: item.effectiveProjection,
          outputs: item.outputs
        })),
        riskSummary: {
          successProbability: reportMc.successProbability,
          successMargin95: reportMc.successMargin95,
          p10Final: quantile(reportMc.finals, 0.1),
          p50Final: quantile(reportMc.finals, 0.5),
          p90Final: quantile(reportMc.finals, 0.9)
        }
      }
    };
  };

	  function exportReviewPack() {
	    if (!requireExportReady("review-pack export")) return;
	    const context = buildExportContext();
    const pack = buildReviewPack(context);
    exportJsonFile(pack, "retirement_adviser_ca_review_pack.json");
    window.setTimeout(() => {
      exportCsv(context);
    }, 120);
    window.setTimeout(() => {
      void exportPdf(context);
    }, 260);
    showToast("Adviser / CA review pack downloaded");
  }

	  async function printReport() {
	    if (analyticsPending) {
	      showToast("Analytics are still syncing. Print after the update badge clears.", "reset");
	      return;
	    }
	    // fin-f3n.13 Path 1: double-guard with a RAF to ensure the DOM has been
	    // repainted with the fully-settled epoch values before window.print() fires.
	    // The React commit that clears analyticsPending (S-4→S-0) may complete before
	    // the paint; a single requestAnimationFrame confirms the DOM is at idle epoch.
	    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
	    if (analyticsPending) {
	      showToast("Analytics are still syncing. Print after the update badge clears.", "reset");
	      return;
	    }
	    window.print();
	  }

	  async function exportCsv(context) {
	    if (!isExportContext(context) && !requireExportReady("CSV export")) return;
	    context = exportContext(context);
    // R4.9.5i: replaced single-file CSV body with multi-sheet ZIP export.
    // exportCsvZip() builds 6 sheets (overview, monthly, yearly, tax, scenarios,
    // metadata) packaged as a ZIP archive. The function name exportCsv is
    // preserved at all call sites for backward compatibility.
    // The legacy single-file export path has been superseded by the structured
    // ZIP; exportVisibleLedgerCsv() remains as a separate visible-rows feature.
    try {
      const { exportCsvZip, downloadZip } = await import("./exports/csv.js");
      const { blob, filename } = await exportCsvZip(context, {
        analyticsState,
        analyticsTargetCorpusReal,
        planFingerprintFn: planFingerprint
      });
      downloadZip(blob, filename);
      showToast("Projection CSV ZIP downloaded");
    } catch (err) {
      // Graceful degradation: if the ZIP exporter fails for any reason, show error.
      // Never silently swallow — this surfaces a genuine implementation failure.
      showToast(`CSV export failed: ${String(err?.message || err)}`);
      // Re-throw so the error is visible in devtools for debugging.
      throw err;
    }
  }

  function exportVisibleLedgerCsv() {
    if (!requireExportReady("visible-ledger export")) return;
    const context = buildExportContext();
    const { reportState, reportParams, reportModel, reportMc, reportTaxLaw, reportFingerprint } = context;
    const reportHorizonYears = Math.max(0, Math.round(Number(reportParams.years) || 0));
    const reportMonthlyAuditRows = (reportModel.monthlyRows || []).filter((row) => row.year === 1 || row.year === reportHorizonYears || (row.month === 12 && row.year % 5 === 0));
    const reportActiveTableMode = tableMode === "monthly" ? (reportMonthlyAuditRows.length ? "monthly" : "milestones") : tableMode;
    const reportTableRows = reportActiveTableMode === "monthly"
      ? reportMonthlyAuditRows
      : reportActiveTableMode === "full"
        ? reportModel.rows
        : reportModel.rows.filter((row) => row.year === 0 || row.year === 1 || row.year === reportHorizonYears || row.year % 5 === 0);
    const reportLedgerSearchText = ledgerSearch.trim().toLowerCase();
    const reportVisibleTableRows = reportLedgerSearchText
      ? reportTableRows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(reportLedgerSearchText)))
      : reportTableRows;
    const reportLedgerColumnSpecs = reportActiveTableMode === "monthly" ? monthlyLedgerColumns : annualLedgerColumns;
    const reportVisibleLedgerColumns = reportLedgerColumnSpecs.filter((column) => ledgerVisibleColumns[column.key] !== false);
    const csv = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
    const raw = (column, row) => {
      if (column.raw) return column.raw(row);
      return row[column.key] ?? column.value(row);
    };
    const lines = [
      ["Report type", "Visible ledger rows - planning estimate, not advice"].map(csv).join(","),
      ["Generated", new Date().toISOString()].map(csv).join(","),
      ["Assumptions fingerprint", reportFingerprint].map(csv).join(","),
      ["Tax ruleset", reportTaxLaw.version].map(csv).join(","),
      ["Risk method", `${reportMc.method}; ${reportMc.simulations} samples; seed ${reportMc.seed}`].map(csv).join(","),
      ["Sensitive data warning", "This CSV contains private financial assumptions and remains on disk after browser data is cleared."].map(csv).join(","),
      ["Ledger mode", reportActiveTableMode].map(csv).join(","),
      ["Effective horizon", reportParams.years, reportParams.years !== reportState.years ? `Raw input ${reportState.years}` : "Matches raw input"].map(csv).join(","),
      ["Search", ledgerSearch || "All rows"].map(csv).join(","),
      "",
      reportVisibleLedgerColumns.map((column) => csv(column.label)).join(","),
      ...reportVisibleTableRows.map((row) => reportVisibleLedgerColumns.map((column) => csv(raw(column, row))).join(","))
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `retirement_ledger_${activeTableMode}_visible_rows.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Visible ledger rows downloaded");
  }

	  async function exportPdf(context, callOptions) {
	    if (!isExportContext(context) && !requireExportReady("PDF export")) return;
	    context = exportContext(context);
    // R4.9.5g (fin-ahy under fin-c96) — fin-4ml: the structured 7-section PDF
    // is the sole production export. The §7 dispatch retained a regression
    // escape hatch (USE_R4_9_5G_REPORT flag + `?r4.9.5g=false` URL toggle +
    // the old dark-theme code path) that has now been removed under owner
    // Option-4 (R4-Q13, 2026-05-21) to recover bundle budget headroom and
    // close out v1.0.0 with a single export path.
    const { buildPdfReport } = await import("./exports/pdf-report.js");
    // R4.9.5g fin-c96.11: precompute the verdict-mood booleans here so
    // the PDF reads from the same source of truth as the live UI
    // (src/main.jsx:3925-3935). Inlining the logic again inside
    // pdf-report.js would drift on future changes; passing the resolved
    // signals keeps the export downstream of the live render.
    const verdictState = context.reportState;
    const verdictFinal = context.reportModel.final || {};
    const verdictHorizon = Math.max(1, Math.round(Number(context.reportParams.years) || 0));
    const verdictInflation = Math.pow(1 + (Number(verdictState.inflation) || 0) / 100, verdictHorizon);
    const verdictTargetAnnual = targetAnnualCashForYear(context.reportParams, verdictHorizon, verdictInflation) || 0;
    const verdictTargetCorpusReal = context.reportHousehold?.useHouseholdPlan
      ? context.reportHousehold.targetCorpusToday
      : Number(verdictState.targetCorpus) || 0;
    const verdictMonthlyCashGap = Math.max(0, verdictTargetAnnual - (verdictFinal.withdrawal || 0)) / 12;
    const verdictRows = context.reportModel.rows || [];
    const verdictShortfallRows = verdictRows.slice(1).filter((row) => (row.withdrawalShortfall || 0) > 1 || (row.targetCash > 0 && (row.cashCoverage || 0) < 0.995));
    const verdictFirstShortfall = verdictShortfallRows[0] || null;
    const verdictCumShortfall = verdictRows.reduce((sum, row) => sum + (row.withdrawalShortfall || 0), 0);
    const verdictDepletionMonth = (context.reportModel.monthlyRows || []).find((row) => row.opening > 1 && row.closing <= 1);
    const verdictDepletionRow = verdictRows.slice(1).find((row) => row.opening > 1 && row.closing <= 1);
    const verdictDepletionPoint = verdictDepletionMonth
      ? `Y${verdictDepletionMonth.year} M${verdictDepletionMonth.month}`
      : verdictDepletionRow ? `Y${verdictDepletionRow.year}` : null;
    const verdictHasCashShortfall = verdictState.cashMode === "monthlyTarget"
      && (Boolean(verdictFirstShortfall) || verdictCumShortfall > 1);
    const verdictMissesCorpusGoal = verdictTargetCorpusReal > 0 && (verdictFinal.realClosing || 0) + 1 < verdictTargetCorpusReal;
    const verdictHasCorpusDepletion = verdictState.cashMode === "monthlyTarget"
      && !verdictHasCashShortfall && Boolean(verdictDepletionPoint) && (verdictFinal.closing || 0) <= 1;
    const verdictHasCorpusGoalStress = verdictState.cashMode === "monthlyTarget"
      && !verdictHasCashShortfall && !verdictHasCorpusDepletion && verdictMissesCorpusGoal;
    const verdictHasCashStress = verdictHasCashShortfall || verdictHasCorpusDepletion || verdictHasCorpusGoalStress;
    // Augment the export context with the additional fields §3-§5 consume.
    const augmented = {
      ...context,
      reportVerdict: {
        hasCashShortfall: verdictHasCashShortfall,
        hasCorpusDepletion: verdictHasCorpusDepletion,
        hasCorpusGoalStress: verdictHasCorpusGoalStress,
        hasCashStress: verdictHasCashStress,
        missesCorpusGoal: verdictMissesCorpusGoal,
        depletionPoint: verdictDepletionPoint,
        monthlyCashGap: verdictMonthlyCashGap,
      },
      reportY1Tax: yearlyTax(Number(context.reportState.principal) || 0, context.reportState).taxProfile
        || investmentTaxProfile(context.reportState, emptyTaxStreams()),
      reportTaxLotSummary: context.reportModel.rows.reduce((sum, row) => ({
        realizedGain: sum.realizedGain + (row.realizedGain || 0),
        taxableGain: sum.taxableGain + (row.taxableGain || 0),
        capitalRecovered: sum.capitalRecovered + (row.capitalRecovered || 0),
        exemptionUsed: sum.exemptionUsed + (row.ltcgExemptionUsed || 0),
      }), { realizedGain: 0, taxableGain: 0, capitalRecovered: 0, exemptionUsed: 0 }),
      // §5 scenarios — same logic as src/main.jsx:4109-4150 overviewScenarioModels.
      reportScenarios: SCENARIOS.map((scenario) => {
        const scenarioState = scenario.source === "active"
          ? context.reportState
          : normalizeState({ ...context.reportState, ...scenario.patch, inflation: context.reportState.inflation });
        const params = scenario.source === "active"
          ? context.reportParams
          : projectionParamsFromState(scenarioState);
        const scenarioModel = calculate(params);
        const horizonYearsScenario = Math.max(1, Math.round(Number(params.years) || 0));
        const inflationFactor = Math.pow(1 + (Number(params.inflation) || 0) / 100, horizonYearsScenario);
        const finalCashNeed = targetAnnualCashForYear(params, horizonYearsScenario, inflationFactor);
        const scenarioCashRatio = finalCashNeed > 0 ? scenarioModel.final.withdrawal / finalCashNeed : 1;
        const closing = scenarioModel.final.closing;
        const startingCorpus = Number(params.principal) || 0;
        let depletionYear = null;
        let isZeroStart = false;
        if (closing <= 0) {
          if (startingCorpus <= 0) {
            isZeroStart = true;
          } else {
            const rows = scenarioModel.rows || [];
            const deplRow = rows.slice(1).find((row) => row.closing <= 0);
            depletionYear = deplRow ? deplRow.year : null;
          }
        }
        return {
          name: scenario.name,
          final: closing,
          real: scenarioModel.final.realClosing,
          cashRatio: scenarioCashRatio,
          depletionYear,
          isZeroStart,
        };
      }),
    };
    const { doc: pdfDoc, filename } = await buildPdfReport(augmented, callOptions || {});
    pdfDoc.save(filename);
    showToast("PDF report downloaded (R4.9.5g)");
  }

  const safeMonthlyCashTarget = Number.isFinite(maxMonthlyCash) && maxMonthlyCash > 0
    ? Math.max(0, roundToStep(maxMonthlyCash, 10000))
    : 0;
	  const pendingActionTitle = analyticsPending ? "Wait for the analytics update badge before applying model-derived actions." : "";
  const overviewActions = [
    {
      id: "cash",
      Icon: Wallet,
      label: hasCashStress || realCorpusGap > 0 || monthlyCashGap > 0 ? "Fix The Gap" : "Stress Test Income",
      title: householdModeActive
        ? "Edit household cash bridge"
        : hasCashStress ? `Use ${formatInr(safeMonthlyCashTarget)} monthly cash` : "Check a higher cash need",
      detail: householdModeActive
        ? "Household mode derives cash from expenses, income offsets, reserves, and longevity. Tune those fields instead of a raw monthly target."
        : analyticsPending
        ? "Safe-cash solver is syncing; this action re-enables when analytics match the live projection."
        : hasCashStress
        // R4.9.5b (fin-62w): sharpened — names the action concretely (reduce to model-safe level).
        ? "Align spending to the maximum monthly cash this corpus and return path can sustain. Reduces the monthly target to the model-safe level so the plan stops showing a shortfall."
        : "Open the solver with the current plan as the base case before increasing lifestyle withdrawals.",
      cta: householdModeActive ? "Edit household plan" : hasCashStress ? "Use safe cash" : "Open solver",
	      disabled: analyticsPending && !householdModeActive,
      disabledTitle: pendingActionTitle,
      onClick: () => {
        if (householdModeActive) {
          setAssumptionsOpen(true);
          showToast("Household mode: edit expenses and income offsets");
          return;
        }
        if (!requireFreshAnalytics("safe cash")) return;
        // fin-f3n.22: read from maxMonthlyCashRef.current (always post-settle) to avoid
        // applying a stale safeMonthlyCashTarget captured in a prior render closure.
        const settledMaxMonthlyCash = maxMonthlyCashRef.current;
        const settledSafeCashTarget = Number.isFinite(settledMaxMonthlyCash) && settledMaxMonthlyCash > 0
          ? Math.max(0, roundToStep(settledMaxMonthlyCash, 10000))
          : 0;
        if (hasCashStress && settledSafeCashTarget > 0) {
          setField("monthlyTarget", settledSafeCashTarget, { feedback: { type: "action", id: "cash", message: "Safe monthly cash applied" } });
          setField("cashMode", "monthlyTarget");
          showToast("Safe monthly cash applied");
          return;
        }
        whatIfRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    {
      id: "strategy",
      Icon: Target,
      label: "Strategy Shortlist",
      title: optimum.best?.name || "Build strategy",
      // R4.9.5b (fin-62w): no-strategy branch sharpened — names what the planner produces.
      detail: optimum.best
        ? usesAssetReturns
          ? `${Math.round(optimum.best.equityShare)}% equity with ${Math.round(optimum.best.debtMonths || 0)} months of defensive cover.`
          : `${Math.round(optimum.best.debtMonths || 0)} months defensive cover; allocation is ignored in manual-return mode.`
        : "Open the guided planner to create an allocation, cash bucket, and tax-posture recommendation — then see why it wins or loses against alternatives.",
      cta: optimum.best ? "Apply strategy" : "Open planner",
	      disabled: analyticsPending && Boolean(optimum.best),
      disabledTitle: pendingActionTitle,
      // fin-f3n.22: use optimumRef.current.best (always post-settle) rather than the
      // closure-captured optimum.best from the render frame that formed this action.
      onClick: () => optimumRef.current.best ? applyOptimumStrategy(optimumRef.current.best) : switchView("planner")
    },
    {
      id: "tax",
      Icon: Landmark,
      label: "Tax Path",
      title: modelState.taxProfileMode === "retiree" ? "Retiree tax engine active" : "Switch to retiree profile",
      detail: modelState.taxProfileMode === "retiree"
        ? `${formatInr((y1TaxProfile.rebateUsed || 0) + (y1TaxProfile.basicExemptionUsed || 0) + (y1TaxProfile.section80TTBUsed || 0))} year-1 relief tracked with SWP cost recovery.`
        : "Flat tax mode is blunt for retirement; use regime, age, other income, rebate, and special-rate gain treatment.",
      cta: "Open tax studio",
      onClick: () => switchView("tax")
    },
    {
      id: "risk",
      Icon: ShieldCheck,
      label: "Risk Guardrail",
      title: mc.successProbability >= 0.65 ? "Run downside check" : "Improve end-target odds",
      detail: `${formatInr(p10)} P10 vs ${formatInr(p50)} P50 shows the downside spread behind this plan.`,
      cta: "Open simulations",
      onClick: () => switchView("simulations")
    }
  ];
  const retireeStartSteps = [
    { label: "1. Reality Check", value: planMood === "strong" ? "Plan has cushion" : "Gap visible", detail: decisionHeadline },
    { label: "2. Income Safety", value: cashRatio >= 1 ? "Cash covered" : `${formatInr(Math.max(0, targetAnnualFinal - final.withdrawal) / 12)} gap`, detail: `${formatInr(maxMonthlyCash)} model-safe monthly cash` },
    { label: "3. Next Move", value: optimum.best?.name || "Build plan", detail: actionPlan.policy.summary }
  ];
  const plannerImpact = [
    usesAssetReturns
      ? { label: "Recommended Equity", value: `${Math.round(optimum.best?.equityShare || modelState.equityShare)}%`, detail: `${Math.round(100 - (optimum.best?.equityShare || modelState.equityShare))}% defensive sleeve` }
      : { label: "Allocation Status", value: "Inactive", detail: "Manual return mode ignores allocation and glide path." },
    { label: "Cash Cover", value: `${Math.round(optimum.best?.debtMonths || actionPlan.policy.defensiveMonths)}M`, detail: `${optimum.best?.cashCoveredYears || 0}/${analyticsHorizonYears} years target cash covered` },
    { label: "Tax Drag", value: formatInr(optimum.best?.taxDrag || final.cumTax), detail: "Lower drag improves usable income" },
    { label: "Why It Wins", value: `Score ${Math.round(optimum.best?.score || 0)}`, detail: optimum.gapMessage }
  ];
  const taxScenarioCards = [
    { label: "SWP Lot Evidence", value: formatInr(taxLotSummary.capitalRecovered), detail: "Active projection evidence: recovered cost capital is cash flow; only realised gain enters tax." },
    { label: "Active Row-1 Tax", value: formatInr(activeYearOneRow.tax || 0), detail: "Directly from the active projection row using the selected cash engine." },
    { label: "Active Row-1 Relief", value: formatInr(activeYearOneRelief), detail: "Projection-row basic exemption, eligible rebate, and 80TTB evidence." },
    { label: "Standalone Special Tax", value: formatInr(y1TaxProfile.specialTax || 0), detail: "Standalone profile estimate: equity/listed special-rate gains stay outside slab income." },
    { label: "Standalone IDCW Profile", value: `${modelState.idcwYield}% yield`, detail: "Standalone distribution-yield assumption; IDCW may be taxable and reduce NAV." }
  ];
  const riskMitigations = [
    { label: "Downside Path", value: formatInr(p10), detail: `P10 final corpus vs ${formatInr(analyticsTargetCorpusNominal)} nominal target.` },
    { label: "Market Margin", value: successDisplay.primary, detail: mc.successProbability >= 0.65 ? "Target confidence is workable; still review yearly." : "Improve corpus, spending, or return assumptions before relying on this path." },
    { label: "Inflation Shock", value: `${modelState.inflation}%`, detail: "Heatmap uses today's-rupee target logic so real purchasing power is visible." },
    { label: "Action Bias", value: hasCashStress ? "De-risk cash" : "Rebalance", detail: hasCashStress ? "Solve income/corpus gap first." : "Keep equity funded after drawdowns unless the cash bucket is breached." }
  ];
  const ledgerSummary = [
    { label: "Opening Corpus", value: formatInr(model.rows[0]?.opening || principal), detail: "Starting point for reconciliation." },
    { label: "Total Growth", value: formatInr(final.cumInterest), detail: "Gross modelled growth before tax and cash allocation." },
    { label: "Tax Paid", value: formatInr(final.cumTax), detail: `${model.taxLotMethod} treatment applied.` },
    { label: "Net Cash", value: formatInr(final.cumWithdrawals), detail: `${model.monthlyRows.length || model.rows.length} ledger steps available.` },
    { label: "Recovered Capital", value: formatInr(taxLotSummary.capitalRecovered), detail: "Cost basis returned through SWP lots." },
    { label: "Closing Corpus", value: formatInr(final.closing), detail: `${formatInr(final.realClosing)} in today's rupees.` }
  ];
  const pageNarratives = {
    overview: {
      tone: planMood === "strong" ? "teal" : "coral",
      Icon: Gauge,
      eyebrow: "Decision workspace",
      title: "Start with the retirement question, then act.",
      body: `This page is not meant to be a passive report. It answers whether the current corpus can fund ${formatInr(effectiveMonthlyTarget)} per month, protect a ${formatInr(targetCorpusReal)} today's-rupee end target, and survive weak market paths. Use the actions here to test the income level, move into the planner, review tax leakage, or inspect risk before changing dozens of assumptions.`,
      metrics: [
        { label: "Income Cover", value: `${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`, detail: `${formatInr(final.withdrawal / 12)} final monthly cash` },
        { label: "Plan Endurance", value: enduranceDisplay.primary, detail: "Chance your money lasts the full plan." }
      ],
      tips: [
        { label: "How to read this", title: "Open the overview tutorial", onClick: () => openHelp("tutorial") },
        { label: "Goal math", title: "Open corpus and cash-goal help", onClick: () => openHelp("goals") }
      ],
      actions: [
        { label: hasCashStress ? "Use safe cash" : "Stress income", detail: analyticsPending ? "Safe-cash solver syncing" : hasCashStress ? `${formatInr(safeMonthlyCashTarget)} monthly model-safe cash` : "Open the solver and test a higher lifestyle cash need", Icon: Wallet, disabled: overviewActions[0].disabled, title: pendingActionTitle, onClick: overviewActions[0].onClick },
        // R4.9.5b (fin-62w): sharpened — names what the planner produces (allocation + cash bucket + tax posture).
        { label: "Build strategy", detail: "Open the guided planner to get an allocation, cash bucket, and tax-posture recommendation.", Icon: Target, onClick: () => switchView("planner") }
      ]
    },
    planner: {
      tone: "blue",
      Icon: Target,
      eyebrow: "Guided decision flow",
      title: "Make the model negotiate with your goals.",
      body: `The planner converts plain-language retiree choices into a portfolio strategy instead of asking you to guess an equity percentage. It weighs monthly cash, defensive cover, tax posture, bad-market behaviour, and legacy preference, then shows why the recommended strategy wins or loses against alternatives. Tap the choices and strategy cards; every selection updates the live model.`,
      metrics: [
        usesAssetReturns
          ? { label: "Recommended mix", value: `${Math.round(optimum.best?.equityShare || modelState.equityShare)}% equity`, detail: `${Math.round(100 - (optimum.best?.equityShare || modelState.equityShare))}% debt/cash sleeve` }
          : { label: "Return source", value: "Manual", detail: "Allocation and glide path are ignored." },
        { label: "Cash cover", value: `${Math.round(optimum.best?.debtMonths || 0)}M`, detail: `${optimum.best?.cashCoveredYears || 0}/${analyticsHorizonYears} years target cash covered` }
      ],
      tips: [
        { label: "Planner tutorial", title: "Open strategy shortlist help", onClick: () => openHelp("optimizer") },
        { label: "Policy guide", title: "Open withdrawal policy help", onClick: () => openHelp("policy") }
      ],
      actions: [
	        { label: "Apply best", detail: optimum.best?.name || "Apply the top ranked strategy", Icon: Sparkles, disabled: analyticsPending, title: pendingActionTitle, onClick: () => applyOptimumStrategy(optimum.best) },
        { label: "Sleep-well test", detail: "Lower equity bias and prioritise cash stability", Icon: ShieldCheck, onClick: () => setField("riskComfort", "conservative", { feedback: { type: "choice", id: "Risk comfort:conservative", message: "Sleep-well path tested" } }) }
      ]
    },
    tax: {
      tone: "coral",
      Icon: Landmark,
      eyebrow: "CA-grade review path",
      title: "Separate tax buckets before trusting the drag.",
      body: `Retirement tax planning is mode-specific. Slab-taxed income can use regime, age, other income, deductions, Section 87A where eligible, and cess. SWP needs cost-capital recovery and realised-gain treatment. Equity and listed security gains may stay in special-rate buckets. Use this page to test retiree profile assumptions, editable law rules, and withdrawal order before reading the tax number as advice.`,
      metrics: [
        { label: "Active row tax", value: formatInr(activeYearOneRow.tax || 0), detail: "From the active projection row" },
        { label: "Lot evidence", value: formatInr(taxLotSummary.capitalRecovered), detail: "SWP cost capital recovered" }
      ],
      tips: [
        { label: "Tax assumptions", title: "Open tax assumptions guide", onClick: () => openHelp("taxScenarios") },
        { label: "FIFO tutorial", title: "Open monthly FIFO ledger help", onClick: () => openHelp("fifo") }
      ],
      actions: [
        { label: "Use retiree profile", detail: "Switch away from blunt flat-tax modelling", Icon: Landmark, onClick: () => setField("taxProfileMode", "retiree", { feedback: { type: "action", id: "tax", message: "Retiree tax profile enabled" } }) },
        { label: "Open rules editor", detail: "Review tax-law JSON, slabs, rebate and special rates", Icon: Settings2, onClick: () => setAssumptionsOpen(true) }
      ]
    },
    simulations: {
      tone: "gold",
      Icon: ShieldCheck,
      eyebrow: "Risk laboratory",
      title: "Make the plan prove it can survive bad paths.",
      body: `This workspace is where optimism is challenged. The risk cone, scenario comparison, and heatmap should help you answer what fails first: market return, withdrawal rate, inflation, tax drag, or corpus target. Adjust the shock and volatility controls, then watch the downside path and heatmap colours change instead of accepting a single deterministic projection.`,
      metrics: [
        { label: "Downside P10", value: formatInr(p10), detail: `Against ${formatInr(analyticsTargetCorpusNominal)} nominal target` },
        { label: "Worst sample", value: formatInr(mc.worst), detail: "Modelled weak-path final corpus" }
      ],
      tips: [
        { label: "Risk tutorial", title: "Open risk engine guide", onClick: () => openHelp("risk") },
        { label: "Heatmap colours", title: "Open heatmap interpretation guide", onClick: () => openHelp("sensitivity") }
      ],
      actions: [
        { label: "Apply -25% shock", detail: "Stress the portfolio in year one", Icon: Activity, onClick: () => { setField("shockYear", 1); setField("shockDrop", 25, { feedback: { type: "action", id: "risk", message: "Shock applied" } }); showToast("Year-1 shock applied"); } },
        { label: "Clear shock", detail: "Return to the base market path", Icon: RotateCcw, onClick: () => { setField("shockYear", 0); setField("shockDrop", 0, { feedback: { type: "action", id: "risk", message: "Shock cleared" } }); showToast("Shock cleared"); } }
      ]
    },
    schedule: {
      tone: "teal",
      Icon: FileSpreadsheet,
      eyebrow: "Audit trail",
      title: "Trace every number back to the workbook logic.",
      body: `The ledger is the trust layer. It reconciles opening corpus, growth, tax, withdrawals, top-ups, shocks, closing corpus, and real value. In SWP mode, the monthly FIFO view exposes redemptions, recovered capital, realised gains, taxable gains, exemptions, and tax. Use search and mode switches to investigate the number that looks suspicious before exporting.`,
      metrics: [
        { label: "Rows shown", value: `${visibleTableRows.length}`, detail: `${activeTableMode} evidence view` },
        { label: "Tax total", value: formatInr(final.cumTax), detail: `${model.taxLotMethod} model treatment` }
      ],
      tips: [
        { label: "Ledger help", title: "Open ledger help", onClick: () => openHelp(activeTableMode === "monthly" ? "fifo" : "core") },
        { label: "Export guide", title: "Open withdrawal policy report help", onClick: () => openHelp("policy") }
      ],
      actions: [
        { label: activeTableMode === "monthly" ? "Annual view" : "Monthly FIFO", detail: activeTableMode === "monthly" ? "Return to milestone audit" : "Inspect sampled monthly tax-lot rows", Icon: FileSpreadsheet, onClick: () => setTableMode(activeTableMode === "monthly" ? "milestones" : "monthly") },
	        { label: "Export CSV", detail: "Download the full ledger evidence trail", Icon: Download, onClick: exportCsv, disabled: analyticsPending, disabledTitle: pendingActionTitle }
      ]
    }
  };
  const activeNarrative = pageNarratives[activeView] || pageNarratives.overview;
  const railContexts = {
    overview: {
      title: "Plan Diagnosis",
      detail: decisionHeadline,
      metrics: [
        { label: "Income", value: `${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%` },
        { label: "Confidence", value: successDisplay.primary }
      ],
      actions: [
        { label: "Open planner", onClick: () => switchView("planner") },
        { label: "Explain", onClick: () => openHelp("goals") }
      ]
    },
    planner: {
      title: "Strategy Decision",
      detail: optimum.best ? `${optimum.best.name} is currently favoured; compare the proof before applying.` : "Complete the goal and risk choices to build a strategy.",
      metrics: [
        { label: "Best score", value: `${Math.round(optimum.best?.score || 0)}` },
        { label: "Defence", value: `${Math.round(optimum.best?.debtMonths || 0)}M` }
      ],
      actions: [
	        { label: "Apply best", onClick: () => applyOptimumStrategy(optimum.best), disabled: analyticsPending, title: pendingActionTitle },
        { label: "Policy help", onClick: () => openHelp("policy") }
      ]
    },
    tax: {
      title: "CA Review Path",
      detail: "Review slab income, special-rate gains, SWP cost recovery, editable law, and IDCW caution before trusting tax drag.",
      metrics: [
        { label: "Active row", value: formatInr(activeYearOneRow.tax || 0) },
        { label: "Standalone special", value: formatInr(y1TaxProfile.specialTax || 0) }
      ],
      actions: [
        { label: "Tax help", onClick: () => openHelp("taxScenarios") },
        { label: "Edit rules", onClick: () => setAssumptionsOpen(true) }
      ]
    },
    simulations: {
      title: "Risk Lab Lens",
      detail: `P10 is ${formatInr(p10)} and P50 is ${formatInr(p50)}. Use the heatmap to decide whether the plan survives bad markets.`,
      metrics: [
        { label: "P10", value: formatInr(p10) },
        { label: "Worst", value: formatInr(mc.worst) }
      ],
      actions: [
        { label: "Risk help", onClick: () => openHelp("risk") },
        { label: "Heatmap", onClick: () => openHelp("sensitivity") }
      ]
    },
    schedule: {
      title: "Audit Trail",
      detail: activeTableMode === "monthly" ? "Monthly FIFO mode exposes each redemption, cost recovery, gain, tax, and net cash step." : "Milestone mode shows the annual workbook logic; export CSV for the full evidence trail.",
      metrics: [
        { label: "Rows", value: `${visibleTableRows.length}` },
        { label: "Mode", value: activeTableMode }
      ],
      actions: [
	        { label: "Download CSV", onClick: exportCsv, disabled: analyticsPending, title: pendingActionTitle },
        { label: "Ledger help", onClick: () => openHelp(activeTableMode === "monthly" ? "fifo" : "core") }
      ]
    }
  };
  const railContext = railContexts[activeView] || railContexts.overview;

  const appShellStyle = {
    "--rail-w": `${layout.rail}px`,
    "--insights-w": `${layout.insights}px`,
    "--viewport-w": `${effectiveViewport}px`
  };

  return {
    theme,
    setTheme,
    browserWidth,
    state,
    setState,
    preset,
    setPreset,
    tableMode,
    setTableMode,
    activeView,
    setActiveView,
    layout,
    setLayout,
    helpTopic,
    setHelpTopic,
    helpOpen,
    setHelpOpen,
    assumptionsOpen,
    setAssumptionsOpen,
    mobileInsightsOpen,
    setMobileInsightsOpen,
    toast,
    setToast,
    feedback,
    ledgerSearch,
    setLedgerSearch,
    ledgerVisibleColumns,
    setLedgerVisibleColumns,
    pinnedStrategyId,
    setPinnedStrategyId,
    disclaimerOpen,
    setDisclaimerOpen,
    tourOpen,
    setTourOpen,
    tourStep,
    setTourStep,
    whatIfRef,
	    modelState,
	    analyticsState,
	    analyticsPending,
	    analyticsError,
    modelPending,
    modelHorizonYears,
    analyticsHorizonYears,
    rawHorizonYears,
    horizonLabel,
    shockYearNote,
    householdModeActive,
    usesAssetReturns,
    manualReturnNotice,
    effectiveMonthlyTarget,
    analyticsEffectiveMonthlyTarget,
    autoViewport,
    viewportBounds,
    effectiveViewport,
    targetInflationFactor,
    analyticsTargetInflationFactor,
    modelHousehold,
    analyticsHousehold,
    targetCorpusReal,
    targetCorpusNominal,
    analyticsTargetCorpusReal,
    analyticsTargetCorpusNominal,
    modelParams,
    analyticsParams,
    model,
    mc,
    topup,
    requiredReturn,
    requiredCorpusForCash,
    requiredReturnForCash,
    maxMonthlyCash,
    interestShareForTarget,
    y1Tax,
    optimum,
    optimumGuidance,
    pinnedStrategy,
	    activeTaxLaw,
	    taxLawStatus,
	    taxRegimeComparison,
	    analyticsPreset,
	    activePreset,
    markFeedback,
    commitState,
    switchView,
    setField,
    openHelp,
    acknowledgeDisclaimerConsent,
    clearAllSavedData,
    closeTour,
    startTour,
    showToast,
    resetLayout,
    requireFreshAnalytics,
    startColumnResize,
    resizeWithKeys,
    applyPreset,
    reset,
    applyOptimumStrategy,
    final,
    principal,
    growth,
    targetAnnualFinal,
    corpusRatio,
    corpusGoalDetail,
    cashRatio,
    realCorpusGap,
    monthlyCashGap,
    p10,
    p50,
    p90,
    successDetail,
    successBand,
    successMargin,
    enduranceDisplay,
    successDisplay,
    effectiveTax,
    y1TaxProfile,
    activeYearOneRow,
    activeYearOneRelief,
    taxBurden,
    payback,
    returnNeeded,
    shortfallRows,
    firstShortfall,
    depletionMonth,
    depletionRow,
    depletionPoint,
    cumulativeCashShortfall,
    hasCashShortfall,
    missesCorpusGoal,
    hasCorpusDepletion,
    hasCorpusGoalStress,
    hasCashStress,
    stressLabel,
    stressHeadline,
    stressDetail,
    monthlyAuditRows,
    activeTableMode,
    tableRows,
    ledgerSearchText,
    visibleTableRows,
    annualLedgerColumns,
    monthlyLedgerColumns,
    ledgerColumnSpecs,
    visibleLedgerColumns,
    ledgerJumpOptions,
    toggleLedgerColumn,
    taxLotSummary,
    swpOrderModels,
    bestSwpOrder,
    idcwComparison,
    actionPlan,
    guidedPlan,
    planMood,
    decisionHeadline,
    decisionCopy,
    decisionPills,
    decisionMap,
    overviewScenarioModels,
    labels,
    chartBase,
    chartLegend,
    journeyOption,
    mixOption,
    sampled,
    splitOption,
    riskLabels,
    riskOption,
    scenarioModels,
    scenarioLibraryModels,
    scenarioLabels,
    scenarioOption,
    heatReturns,
    heatWithdrawals,
    heatRows,
    smartInsights,
    scenarioHistory,
    scenarioDeltaRows,
    assumptionFingerprint,
    saveScenarioSnapshot,
    annotateScenarioSnapshot,
    restoreScenarioSnapshot,
    deleteScenarioSnapshot,
    exportScenarioSnapshot,
    importScenarioSnapshot,
    applyScenarioLibraryItem,
    saveScenarioLibraryItem,
    exportScenarioLibraryItem,
    exportCsv,
    exportVisibleLedgerCsv,
    exportPdf,
    exportReviewPack,
    printReport,
    safeMonthlyCashTarget,
    overviewActions,
    retireeStartSteps,
    plannerImpact,
    taxScenarioCards,
    riskMitigations,
    ledgerSummary,
    pageNarratives,
    activeNarrative,
    railContexts,
    railContext,
    appShellStyle,
    exportBlocked,
    exportBlockedTitle,
    immediateMcSimulations,
  };
}

function useDashboardContext() {
  const dashboard = React.useContext(DashboardContext);
  if (!dashboard) throw new Error("Dashboard context is not available");
  return dashboard;
}

function DashboardPages() {
  const dashboard = useDashboardContext();
  const {
    theme,
    setTheme,
    browserWidth,
    state,
    setState,
    preset,
    setPreset,
    tableMode,
    setTableMode,
    activeView,
    setActiveView,
    layout,
    setLayout,
    helpTopic,
    setHelpTopic,
    helpOpen,
    setHelpOpen,
    assumptionsOpen,
    setAssumptionsOpen,
    mobileInsightsOpen,
    setMobileInsightsOpen,
    toast,
    setToast,
    feedback,
    ledgerSearch,
    setLedgerSearch,
    ledgerVisibleColumns,
    setLedgerVisibleColumns,
    pinnedStrategyId,
    setPinnedStrategyId,
    disclaimerOpen,
    setDisclaimerOpen,
    tourOpen,
    setTourOpen,
    tourStep,
    setTourStep,
    whatIfRef,
	    modelState,
	    analyticsState,
	    analyticsPending,
	    analyticsError,
	    exportBlocked,
	    exportBlockedTitle,
    modelPending,
    modelHorizonYears,
    analyticsHorizonYears,
    rawHorizonYears,
    horizonLabel,
    shockYearNote,
    householdModeActive,
    usesAssetReturns,
    manualReturnNotice,
    effectiveMonthlyTarget,
    analyticsEffectiveMonthlyTarget,
    autoViewport,
    viewportBounds,
    effectiveViewport,
    targetInflationFactor,
    analyticsTargetInflationFactor,
    modelHousehold,
    analyticsHousehold,
    targetCorpusReal,
    targetCorpusNominal,
    analyticsTargetCorpusReal,
    analyticsTargetCorpusNominal,
    modelParams,
    analyticsParams,
    model,
    mc,
    topup,
    requiredReturn,
    requiredCorpusForCash,
    requiredReturnForCash,
    maxMonthlyCash,
    interestShareForTarget,
    y1Tax,
    optimum,
    optimumGuidance,
    pinnedStrategy,
	    activeTaxLaw,
	    taxLawStatus,
	    taxRegimeComparison,
	    analyticsPreset,
	    activePreset,
    markFeedback,
    commitState,
    switchView,
    setField,
    openHelp,
    acknowledgeDisclaimerConsent,
    clearAllSavedData,
    closeTour,
    startTour,
    showToast,
    resetLayout,
    startColumnResize,
    resizeWithKeys,
    applyPreset,
    reset,
    applyOptimumStrategy,
    final,
    principal,
    growth,
    targetAnnualFinal,
    corpusRatio,
    corpusGoalDetail,
    cashRatio,
    realCorpusGap,
    monthlyCashGap,
    p10,
    p50,
    p90,
    successDetail,
    successBand,
    successMargin,
    enduranceDisplay,
    successDisplay,
    effectiveTax,
    y1TaxProfile,
    activeYearOneRow,
    activeYearOneRelief,
    taxBurden,
    payback,
    returnNeeded,
    shortfallRows,
    firstShortfall,
    depletionMonth,
    depletionRow,
    depletionPoint,
    cumulativeCashShortfall,
    hasCashShortfall,
    missesCorpusGoal,
    hasCorpusDepletion,
    hasCorpusGoalStress,
    hasCashStress,
    stressLabel,
    stressHeadline,
    stressDetail,
    monthlyAuditRows,
    activeTableMode,
    tableRows,
    ledgerSearchText,
    visibleTableRows,
    annualLedgerColumns,
    monthlyLedgerColumns,
    ledgerColumnSpecs,
    visibleLedgerColumns,
    ledgerJumpOptions,
    toggleLedgerColumn,
    taxLotSummary,
    swpOrderModels,
    bestSwpOrder,
    idcwComparison,
    actionPlan,
    guidedPlan,
    planMood,
    decisionHeadline,
    decisionCopy,
    decisionPills,
    decisionMap,
    overviewScenarioModels,
    labels,
    chartBase,
    chartLegend,
    journeyOption,
    mixOption,
    sampled,
    splitOption,
    riskLabels,
    riskOption,
    scenarioModels,
    scenarioLibraryModels,
    scenarioLabels,
    scenarioOption,
    heatReturns,
    heatWithdrawals,
    heatRows,
    smartInsights,
    scenarioHistory,
    scenarioDeltaRows,
    assumptionFingerprint,
    saveScenarioSnapshot,
    annotateScenarioSnapshot,
    restoreScenarioSnapshot,
    deleteScenarioSnapshot,
    exportScenarioSnapshot,
    importScenarioSnapshot,
    applyScenarioLibraryItem,
    saveScenarioLibraryItem,
    exportScenarioLibraryItem,
    exportCsv,
    exportVisibleLedgerCsv,
    exportPdf,
    exportReviewPack,
    printReport,
    requireFreshAnalytics,
    safeMonthlyCashTarget,
    overviewActions,
    retireeStartSteps,
    plannerImpact,
    taxScenarioCards,
    riskMitigations,
    ledgerSummary,
    pageNarratives,
    activeNarrative,
    railContexts,
    railContext,
    appShellStyle
  } = dashboard;
  const mobileNextAction = overviewActions[0] || { label: "Review plan", onClick: () => switchView("overview") };
  return (
    <>
              <PageNarrative narrative={activeNarrative} />
              {activeView === "overview" ? (
                <MobileVerdictCard
                  planMood={planMood}
                  decisionHeadline={decisionHeadline}
                  decisionCopy={decisionCopy}
                  cashRatio={cashRatio}
                  corpusRatio={corpusRatio}
                  chance={mc.successProbability}
                  finalMonthlyCash={formatInr(final.withdrawal / 12)}
                  realFinalCorpus={formatInr(final.realClosing)}
                  taxDrag={formatInr(final.cumTax)}
                  runway={hasCashStress ? stressHeadline : actionPlan.policy.summary}
                  nextAction={mobileNextAction}
                  onOpenPlanner={() => switchView("planner")}
                  onOpenInsights={() => setMobileInsightsOpen(true)}
                />
              ) : null}
              {activeView === "overview" ? (
                <>
              <article className={`panel decision-cockpit decision-${planMood}`} aria-label="Retirement overview decision cockpit">
                <div className="decision-hero">
                  <span className="decision-kicker">Can this plan work?</span>
                  <h2 className="decision-verdict">{decisionHeadline}</h2>
                  <p>{decisionCopy}</p>
                  <div className="decision-pills" aria-label="Plan summary badges">
                    {decisionPills.map((pill) => (
                      <span key={pill.label}><b>{pill.label}</b>{pill.value}</span>
                    ))}
                  </div>
                  <div className="decision-gap-tile" aria-label="Closing the gap">
                    <span className="decision-gap-eyebrow">Closing the gap</span>
                    {realCorpusGap > 1 || monthlyCashGap > 1 || topup > 1 ? (
                      <div className="decision-gap-actions">
                        {topup > 1 ? <div className="decision-gap-action">(a) Add {formatInr(topup)} per year</div> : null}
                        {safeMonthlyCashTarget > 0 ? <div className="decision-gap-action">(b) Reduce monthly cash to {formatInr(safeMonthlyCashTarget)}</div> : null}
                        <div className="decision-gap-action">(c) Accept finishing at {Math.round(clamp(corpusRatio, 0, 9.99) * 100)}% of target</div>
                      </div>
                    ) : (
                      <div className="decision-gap-action decision-gap-ok">No funding gap — plan covers income and corpus targets.</div>
                    )}
                    <details className="decision-gap-detail">
                      <summary>Detail</summary>
                      <div className="decision-gap-detail-grid">
                        {realCorpusGap > 1 ? <span>Corpus short: <strong>{formatInr(realCorpusGap)}</strong> in today's rupees</span> : null}
                        {monthlyCashGap > 1 ? <span>Monthly cash gap: <strong>{formatInr(monthlyCashGap)}</strong> final-year shortfall</span> : null}
                        <span>Return needed: <strong>{returnNeeded}</strong></span>
                        {topup > 1 ? <span>Annual top-up: <strong>{formatInr(topup)}</strong></span> : null}
                      </div>
                    </details>
                  </div>
                </div>
                <div className="decision-map" aria-label="Plan health map">
                  {decisionMap.map((item) => (
                    <div key={item.label} className={`decision-map-card accent-${item.accent}`}>
                      <div>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                      <p>{item.detail}</p>
                      <i style={{ width: `${clamp(item.ratio, 0, 1) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="next-action-grid" aria-label="Recommended next actions">
                  {overviewActions.map(({ id, Icon, label, title, detail, cta, onClick, disabled, disabledTitle }) => (
                    <button
                      key={id}
                      type="button"
                      className={`next-action-card ${feedback.type === "action" && feedback.id === id ? "just-changed" : ""}`}
                      onClick={onClick}
                      disabled={Boolean(disabled)}
                      aria-disabled={Boolean(disabled)}
                      title={disabled ? disabledTitle : title}
                    >
                      <Icon />
                      <span>{label}</span>
                      <strong>{title}</strong>
                      <small>{detail}</small>
                      <b>{feedback.type === "action" && feedback.id === id ? "Applied" : cta}</b>
                    </button>
                  ))}
                </div>
                <div className="scenario-strip" aria-label="Overview scenario comparison">
                  {overviewScenarioModels.map((scenario) => {
                    // R4.9.5b (fin-62w): per-scenario tooltip explains return regime / withdrawal pattern.
                    const scenarioTooltip = scenario.name === "Active"
                      ? "Your current assumptions: return, allocation, cash, inflation, and cash engine as set."
                      : scenario.name === "Income"
                        ? "Lower equity, higher cash payout — tests whether an income-first portfolio can meet the plan."
                        : scenario.name === "Growth"
                          ? "Equity-led compounding — tests how a growth-tilted portfolio performs over the full horizon."
                          : scenario.name === "Stress"
                            ? "Lower return, higher inflation, early drawdown shock — the plan's worst-case stress test."
                            : scenario.name;
                    return (
                    <div key={scenario.name} className={`scenario-chip scenario-${scenario.status}`} title={scenarioTooltip}>
                      <span>{scenario.name}</span>
                      {scenario.final <= 0 ? (
                        scenario.isZeroStart
                          ? <strong>₹0</strong>
                          : <strong className="scenario-depleted">{scenario.depletionYear ? `Plan depleted at year ${scenario.depletionYear}` : "Plan depleted"}</strong>
                      ) : (
                        <strong>{formatInr(scenario.final)}</strong>
                      )}
                      {scenario.final <= 0 && scenario.isZeroStart
                        ? <small>scenario starts at zero corpus</small>
                        : <small>{formatInr(scenario.real)} real · {Math.round(clamp(scenario.cashRatio, 0, 9.99) * 100)}% cash</small>
                      }
                    </div>
                    );
                  })}
                </div>
              </article>

              <article className="panel retiree-start-card" aria-label="Retiree start here summary">
                <div>
                  <span className="decision-kicker">Start Here</span>
                  <h2>Three reads before touching assumptions.</h2>
                  <p>Use this as the retiree-first entry point: first understand whether cash works, then protect the corpus, then choose the next action.</p>
                </div>
                <div className="retiree-start-grid">
                  {retireeStartSteps.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
                <div className="retiree-start-actions">
                  <button type="button" onClick={() => switchView("planner")}><Target /> Build guided plan</button>
                  <button type="button" onClick={() => setAssumptionsOpen(true)}><SlidersHorizontal /> Edit assumptions</button>
                </div>
              </article>

              <TrustCenterPanel
                state={modelState}
                effectiveYears={modelHorizonYears}
                activeTaxLaw={activeTaxLaw}
                taxLawStatus={taxLawStatus}
                mc={mc}
                assumptionFingerprint={assumptionFingerprint}
                onHelp={openHelp}
                onClearSavedData={() => clearAllSavedData()}
                onExportPack={exportReviewPack}
	                exportDisabled={exportBlocked}
              />

              <ScenarioTimeline
                history={scenarioHistory}
                deltas={scenarioDeltaRows}
                onSave={saveScenarioSnapshot}
                onAnnotate={annotateScenarioSnapshot}
                onRestore={restoreScenarioSnapshot}
                onDelete={deleteScenarioSnapshot}
                onExport={exportScenarioSnapshot}
                onImport={importScenarioSnapshot}
                disabled={analyticsPending}
              />

              <div className="kpi-strip">
                <StatCard title="Final Corpus" value={formatInr(final.closing)} sub={`${formatInr(growth)} reinvested growth`} icon={TrendingUp} accent="teal" status={statusForRatio(corpusRatio)} />
                <StatCard title="Cash Withdrawn" value={formatInr(final.cumWithdrawals)} sub={`${formatInr(model.avgAnnualCash)} avg per year`} icon={Wallet} accent="blue" status={{ tone: "good", label: "Tracked" }} />
                <StatCard title="Real Final Value" value={formatInr(final.realClosing)} sub={`At ${modelState.inflation}% inflation`} icon={Activity} accent="gold" status={statusForRatio(final.realClosing / Math.max(1, targetCorpusReal))} />
                <StatCard title="Final Monthly Cash" value={formatInr(effectiveMonthlyWithdrawal(model))} sub={`${formatInr(final.realWithdrawal / 12)} in today's rupees`} icon={IndianRupee} accent="coral" status={statusForRatio(cashRatio)} /> {/* fin-rrf: shared helper */}
              </div>

              {/* R4.9.5b-1: tile order Income Cover → Plan Endurance → Target Confidence */}
              <div className="ratio-strip">
                <GaugeCard label="Income Cover" value={`${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`} detail={`${formatInr(final.withdrawal / 12)} vs ${formatInr(targetAnnualFinal / 12)} final-month need`} ratio={cashRatio} accent="coral" caption="How close your final-year withdrawal comes to your inflation-adjusted monthly target." />
                <GaugeCard label="Plan Endurance" value={enduranceDisplay.primary} detail={enduranceDisplay.marginText ? `${enduranceDisplay.marginText} · ${mc.simulations} samples · seed ${mc.seed}` : `${mc.simulations} samples · seed ${mc.seed}`} ratio={mc.enduranceProbability} accent="teal" caption="Chance your money lasts the full plan." />
                <GaugeCard label="Target Confidence" value={successDisplay.primary} detail={successDisplay.marginText ? `${successDisplay.marginText} · ${successDetail} · ${mc.simulations} samples` : `${successDetail} · ${mc.simulations} samples`} ratio={mc.successProbability} accent="blue" caption="Chance you exit at or above your target corpus. Below 50% doesn't mean failure — it means you may finish below target but still with substantial money." />
              </div>
              <TrustNotice
                title="Planning estimate, not a guarantee"
                tone={mc.enduranceProbability >= 0.65 ? "teal" : "gold"}
                icon={LockKeyhole}
                actions={[
                  { label: "Risk method", onClick: () => openHelp("risk") },
                  { label: "Privacy", onClick: () => openHelp("privacy") },
                  { label: "Trust Center", onClick: () => openHelp("trustCenter") }
                ]}
              >
                Plan Endurance and Target Confidence use {mc.simulations} sampled paths, seed {mc.seed}, and {mc.method}. Treat them as decision sensitivity; review tax, product classification, and final investment actions with a CA/adviser.
              </TrustNotice>
                </>
              ) : null}

              {activeView === "overview" || activeView === "planner" ? (
              <article className="panel whatif-card" ref={whatIfRef}>
                <PanelHead eyebrow="Retirement What-If" title="Monthly Cash Solver" note="Solve the corpus, return, and safe cash levels for the retirement income target." help={() => openHelp("retirement")} />
                <div className="whatif-controls">
                  <QuickField
                    label={householdModeActive ? "Effective monthly cash" : "Monthly cash"}
                    value={householdModeActive ? effectiveMonthlyTarget : state.monthlyTarget}
                    min={0}
                    max={3000000}
                    step={10000}
                    disabled={householdModeActive}
                    note={householdModeActive ? "Derived from household expenses and income offsets." : ""}
                    onChange={(value) => setField("monthlyTarget", value)}
                  />
                  <QuickField label="Corpus today" value={state.principal} min={1000000} max={200000000} step={100000} onChange={(value) => setField("principal", value)} />
                  <QuickField
                    label={householdModeActive ? "Effective target today" : "Target today"}
                    value={householdModeActive ? targetCorpusReal : state.targetCorpus}
                    min={0}
                    max={500000000}
                    step={1000000}
                    disabled={householdModeActive}
                    note={householdModeActive ? "Includes reserves, goals, and legacy floor." : ""}
                    onChange={(value) => setField("targetCorpus", value)}
                  />
                  <QuickField
                    label={householdModeActive ? "Effective years" : "Years"}
                    value={householdModeActive ? modelHorizonYears : state.years}
                    min={1}
                    max={60}
                    step={1}
                    disabled={householdModeActive}
                    note={householdModeActive ? "Longevity plus contingency sets this horizon." : ""}
                    onChange={(value) => setField("years", value)}
                  />
                  <QuickField label="Inflation" value={state.inflation} min={0} max={12} step={0.1} suffix="%" onChange={(value) => setField("inflation", value)} />
                  <QuickField label="Withdrawal" value={state.withdrawRate} min={0} max={150} step={1} suffix="%" onChange={(value) => setField("withdrawRate", value)} />
                  <QuickSelect label="Cash engine" value={state.incomeMode} onChange={(value) => setField("incomeMode", value)} options={[{ value: "interest", label: "Interest" }, { value: "swp", label: "SWP" }, { value: "idcw", label: "IDCW" }]} />
                  <QuickSelect label="Mode" value={state.cashMode} onChange={(value) => setField("cashMode", value)} options={[{ value: "interestPercent", label: "% interest" }, { value: "monthlyTarget", label: "Monthly target" }]} />
                </div>
                <div className={`cash-mode-note ${modelState.cashMode === "monthlyTarget" ? "target" : "percent"}`} role="status">
                  <strong>{householdModeActive ? "Household mode is driving the cash target." : modelState.cashMode === "monthlyTarget" ? "Monthly cash is the live withdrawal target." : "% interest mode is driven by Withdrawal %."}</strong>
                  <span>{householdModeActive ? "Edit household expenses, income offsets, reserves, and longevity in Assumption Studio; every projection surface uses those effective values." : modelState.cashMode === "monthlyTarget" ? "Changing monthly cash now recalculates the projection path, KPI strip, charts, rail, ledger, and exports." : "Monthly cash is only a comparison goal in this mode; edit Monthly cash again to switch back to Monthly target."}</span>
                </div>
                <div className="metric-row four">
                  <MiniMetric label="Corpus Needed" value={formatInr(requiredCorpusForCash)} />
                  <MiniMetric label="Return Needed" value={requiredReturnForCash === null ? "N/A" : formatPct(requiredReturnForCash)} />
                  <MiniMetric label="Max Monthly Cash" value={formatInr(maxMonthlyCash)} />
                  <MiniMetric label="% Of Net Interest" value={Number.isFinite(interestShareForTarget) ? `${Math.round(interestShareForTarget * 100)}%` : "N/A"} />
                </div>
                {hasCashStress ? (
                  <div className="cash-stress-banner" role="status">
                    <div>
                      <span>{stressLabel}</span>
                      <strong>{stressHeadline}</strong>
                    </div>
                    <p>{stressDetail}</p>
                  </div>
                ) : null}
              </article>
              ) : null}

              {activeView === "planner" ? (
                <>
	              <RetireeGuidedIntake
	                state={state}
	                outputState={modelState}
	                setField={setField}
                guidedPlan={guidedPlan}
                onOpenAssumptions={() => setAssumptionsOpen(true)}
                onHelp={openHelp}
              />

              <article className="panel planner-journey" aria-label="Guided planner journey">
                <PanelHead eyebrow="Planner Journey" title="From Goal To Strategy" note="A retiree-friendly path that turns simple choices into allocation, cash bucket, tax posture, and trade-off evidence." help={() => openHelp("optimizer")} />
                <div className="planner-stepper">
                  {["Goal", "Risk", "Cash Reserve", "Tax Posture", "Legacy", "Apply"].map((step, index) => (
                    <div key={step} className={index < 5 ? "complete" : ""}>
                      <span>{index + 1}</span>
                      <strong>{step}</strong>
                    </div>
                  ))}
                </div>
                <div className="planner-impact-grid">
                  {plannerImpact.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
                <TrustNotice title="Guided mode is the starting point" tone="blue" icon={Target}>
                  The shortlist is intentionally opinionated for retirees: income safety, defensive cover, and tax posture are scored before chasing return. Advanced settings remain available in Assumption Studio after the guided path makes sense.
                </TrustNotice>
              </article>

              <article className="panel optimizer-card" id="optimizer">
                <PanelHead eyebrow="Guided Planner" title="Recommended Strategy Shortlist" note="A retirement-first recommendation engine based on cash need, corpus durability, tax profile, risk comfort, liquidity, and legacy goals. It ranks explainable strategies; it does not claim mathematical optimality." help={() => openHelp("optimizer")} />
                <div className="advisor-summary">
                  <div className="strategy-score">
                    <span>Recommended</span>
                    <strong>{optimum.best?.name || "Build a plan"}</strong>
                    <small>{optimum.best?.status || "Answer the planner"} · Score {Math.round(optimum.best?.score || 0)}</small>
                  </div>
                  <div className="advisor-diagnosis">
                    <strong>{optimum.gapMessage}</strong>
                    <span>Suggested mix: {Math.round(optimum.best?.equityShare || optimum.profile.idealEquity)}% equity, {Math.round(100 - (optimum.best?.equityShare || optimum.profile.idealEquity))}% debt/cash, with roughly {Math.round(optimum.best?.debtMonths || 0)} months of defensive cash-cover.</span>
                  </div>
                  <div className="strategy-apply-preview" aria-label="What applying the recommended strategy will change">
                    <span>Before you apply</span>
                    <strong>{optimum.best?.name || "No strategy selected"}</strong>
	                    <small>Will set about {Math.round(optimum.best?.equityShare || modelState.equityShare)}% equity, {Math.round(optimum.best?.debtMonths || modelState.liquidityMonths)}M defensive cover, {optimum.best?.incomeMode?.toUpperCase?.() || modelState.incomeMode.toUpperCase()} cash engine, and {optimum.best?.taxPreference || modelState.taxPreference} tax posture.</small>
                  </div>
                  <button type="button" className={`optimizer-apply ${feedback.type === "strategy" && feedback.id === optimum.best?.id ? "is-applying" : ""}`} onClick={() => applyOptimumStrategy(optimum.best)} disabled={analyticsPending || !optimum.best} title={analyticsPending ? "Wait for the analytics update badge before applying the recommendation." : "Apply recommended strategy"}>
                    <span>Apply Strategy</span>
                    <small>{analyticsPending ? "Syncing" : feedback.type === "strategy" && feedback.id === optimum.best?.id ? "Applied" : "Update plan"}</small>
                  </button>
                </div>
                {optimum.best?.allocationPlan ? (
                  <div className="allocation-board" aria-label="Recommended rupee bucket plan">
                    <div className="allocation-board-head">
                      <span>Explainable Allocation</span>
                      <strong>{optimum.best.allocationPlan.suitability.posture}</strong>
                      <small>{optimum.best.allocationPlan.refillSchedule[0]}</small>
                    </div>
                    <div className="allocation-buckets">
                      {optimum.best.allocationPlan.buckets.map((bucket) => (
                        <div key={bucket.id}>
                          <span>{bucket.label}</span>
                          <strong>{formatInr(bucket.amount)}</strong>
                          <small>{bucket.description}</small>
                        </div>
                      ))}
                    </div>
                    <div className="allocation-refill">
                      {optimum.best.allocationPlan.refillSchedule.map((item) => <p key={item}>{item}</p>)}
                    </div>
                  </div>
                ) : null}
                <div className="wizard-grid" aria-label="Guided retirement planner questions">
                  <ChoiceGroup label="Primary goal" value={state.retirementObjective} feedbackId={feedback.type === "choice" ? feedback.id : ""} onChange={(value) => setField("retirementObjective", value, { feedback: { type: "choice", id: `Primary goal:${value}`, message: "Goal updated" } })} options={[
                    { value: "income", label: "Income", note: "Monthly cash first" },
                    { value: "balance", label: "Balanced", note: "Income + growth" },
                    { value: "legacy", label: "Legacy", note: "Leave more behind" }
                  ]} />
                  <ChoiceGroup label="Risk comfort" value={state.riskComfort} feedbackId={feedback.type === "choice" ? feedback.id : ""} onChange={(value) => setField("riskComfort", value, { feedback: { type: "choice", id: `Risk comfort:${value}`, message: "Risk preference updated" } })} options={[
                    { value: "conservative", label: "Sleep-well", note: "Lower equity" },
                    { value: "balanced", label: "Balanced", note: "Middle path" },
                    { value: "growth", label: "Growth", note: "Higher volatility" }
                  ]} />
                  <ChoiceGroup label="Bad-market response" value={state.cashFlex} feedbackId={feedback.type === "choice" ? feedback.id : ""} onChange={(value) => setField("cashFlex", value, { feedback: { type: "choice", id: `Bad-market response:${value}`, message: "Drawdown response updated" } })} options={[
                    { value: "fixed", label: "Hold cash", note: "Do not cut spend" },
                    { value: "guarded", label: "Use buffer", note: "Bucket first" },
                    { value: "flexible", label: "Trim spend", note: "Protect corpus" }
                  ]} />
                  <ChoiceGroup label="Tax posture" value={state.taxPreference} feedbackId={feedback.type === "choice" ? feedback.id : ""} onChange={(value) => setField("taxPreference", value, { feedback: { type: "choice", id: `Tax posture:${value}`, message: "Tax posture updated" } })} options={[
                    { value: "optimize", label: "Optimise", note: "SWP + relief" },
                    { value: "simple", label: "Simple", note: "Income clarity" },
                    { value: "defer", label: "Defer", note: "Low churn" }
                  ]} />
                  <ChoiceGroup label="Legacy priority" value={state.legacyPriority} feedbackId={feedback.type === "choice" ? feedback.id : ""} onChange={(value) => setField("legacyPriority", value, { feedback: { type: "choice", id: `Legacy priority:${value}`, message: "Legacy setting updated" } })} options={[
                    { value: "low", label: "Spend down", note: "Use corpus" },
                    { value: "medium", label: "Preserve", note: "Hold value" },
                    { value: "high", label: "Strong", note: "Build estate" }
                  ]} />
                  <ChoiceGroup label="Cash reserve" value={String(state.liquidityMonths)} feedbackId={feedback.type === "choice" ? feedback.id : ""} onChange={(value) => setField("liquidityMonths", Number(value), { feedback: { type: "choice", id: `Cash reserve:${value}`, message: "Cash reserve updated" } })} options={[
                    { value: "12", label: "12M", note: "Lean" },
                    { value: "24", label: "24M", note: "Balanced" },
                    { value: "36", label: "36M", note: "Defensive" }
                  ]} />
                </div>
                <div className="strategy-grid">
                  {optimum.strategies.map((strategy) => (
                    <div
                      key={strategy.id}
                      className={`strategy-card ${strategy.id === optimum.best?.id ? "best" : ""} ${strategy.id === pinnedStrategyId ? "pinned" : ""} ${feedback.type === "strategy" && feedback.id === strategy.id ? "selected-now" : ""}`}
                      aria-label={`${strategy.name} strategy card`}
                    >
                      <span>{strategy.role}</span>
                      <strong>{strategy.name}</strong>
                      <small>{strategy.thesis}</small>
                      <div className="strategy-meter" aria-hidden="true"><i style={{ width: `${clamp(strategy.score / 100, 0, 1) * 100}%` }} /></div>
                      <div className="strategy-meta">
                        <i>Score {Math.round(strategy.score)}</i>
                        <i>{strategy.cashCoveredYears}/{analyticsHorizonYears} yrs cash</i>
                        <i>{formatInr(strategy.taxDrag)} tax</i>
                      </div>
                      {strategy.lostReasons?.length ? (
                        <ul className="strategy-reasons">
                          {strategy.lostReasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      ) : null}
                      <div className="strategy-actions">
                        <button type="button" onClick={() => setPinnedStrategyId(strategy.id)} aria-pressed={strategy.id === pinnedStrategyId}>
                          {strategy.id === pinnedStrategyId ? "Pinned" : "Pin"}
                        </button>
                        <button type="button" onClick={() => applyOptimumStrategy(strategy)} disabled={analyticsPending}>
                          {feedback.type === "strategy" && feedback.id === strategy.id ? "Applied" : "Apply"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="strategy-comparison" aria-label="Strategy comparison table">
                  <div className="strategy-comparison-head">
                    <div>
                      <span>Compare Before Applying</span>
                      <strong>{pinnedStrategy ? `${pinnedStrategy.name} pinned against ${optimum.best?.name || "top strategy"}` : "Pin any strategy to compare it with the current recommendation."}</strong>
                    </div>
                    <button type="button" onClick={() => setPinnedStrategyId("")} disabled={!pinnedStrategy}>Clear pin</button>
                  </div>
                  <div className="table-wrap compact">
                    <table>
                      <thead><tr><th>Strategy</th><th>Role</th><th>Score</th><th>Equity</th><th>Defence</th><th>Cash Years</th><th>Tax Drag</th><th>Action</th></tr></thead>
                      <tbody>
                        {optimum.strategies.map((strategy) => (
                          <tr key={strategy.id} className={strategy.id === pinnedStrategyId ? "pinned-row" : ""}>
                            <td>{strategy.name}{strategy.id === optimum.best?.id ? " (recommended)" : ""}</td>
                            <td>{strategy.role}</td>
                            <td>{Math.round(strategy.score)}</td>
                            <td>{Math.round(strategy.equityShare)}%</td>
                            <td>{Math.round(strategy.debtMonths || 0)}M</td>
                            <td>{strategy.cashCoveredYears}/{analyticsHorizonYears}</td>
                            <td>{formatInr(strategy.taxDrag)}</td>
                            <td><button type="button" onClick={() => applyOptimumStrategy(strategy)} disabled={analyticsPending}>Apply</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="instrument-lanes">
                  {optimumGuidance.map((item) => (
                    <div key={item.title}>
                      <span>{item.title}</span>
                      <strong>{item.allocation}</strong>
                      <p>{item.instruments}</p>
                      <small>{item.guidance}</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel wide action-plan-panel" id="action-plan">
                <PanelHead eyebrow="Advisor Layer" title="Withdrawal Policy & Trust Plan" note="A plain-English operating plan for cash buckets, tax moves, instruments, and assumption risk." help={() => openHelp("policy")} />
                <div className="policy-hero">
                  <div>
                    <span>Starting Withdrawal Rate</span>
                    <strong>{formatPct(actionPlan.policy.withdrawalRate)}</strong>
                    <small>{actionPlan.policy.band.guide}</small>
                  </div>
                  <div>
                    <span>Defensive Cover</span>
                    <strong>{Math.round(actionPlan.policy.defensiveMonths)}M / {Math.round(actionPlan.policy.requestedMonths)}M</strong>
                    <small>{actionPlan.policy.summary}</small>
                  </div>
                  <div>
                    <span>Model Confidence</span>
                    <strong>{actionPlan.audit.confidence}</strong>
                    <small>{actionPlan.audit.flags[0]?.text || "No major assumption flag in the current model."}</small>
                  </div>
                </div>
                <div className="policy-grid">
                  {actionPlan.policy.rules.map((rule) => (
                    <div key={rule.title}>
                      <span>{rule.title}</span>
                      <p>{rule.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="advisor-columns">
                  <section>
                    <span>Tax Optimization</span>
                    {actionPlan.tax.actions.map((item) => (
                      <p key={item.title}><strong>{item.title}</strong>{item.detail}</p>
                    ))}
                  </section>
                  <section>
                    <span>Instrument Catalog</span>
                    {INSTRUMENT_CATALOG.slice(0, 6).map((item) => (
                      <p key={item.id}><strong>{item.name}</strong>{item.role} · {item.tax}</p>
                    ))}
                  </section>
                  <section>
                    <span>Action Checklist</span>
                    {actionPlan.checklist.slice(0, 5).map((item) => <p key={item}>{item}</p>)}
                  </section>
                </div>
              </article>
                </>
              ) : null}

              {activeView === "overview" ? (
              <div className="chart-pair" id="cash">
                <article className="panel large-chart">
                  <PanelHead eyebrow="Portfolio Journey" title="Corpus, Cash & Real Value" note="Nominal balance, cumulative withdrawals, and inflation-adjusted corpus." help={() => openHelp("core")} />
                  <EChart option={journeyOption} />
                  <div className="metric-row">
                    <MiniMetric label="Effective Yield" value={formatPct(model.effYield)} />
                    <MiniMetric label="Tax Drag" value={formatInr(final.cumTax)} />
                    <MiniMetric label="Payback Ratio" value={`${payback.toFixed(2)}x`} />
                  </div>
                </article>
                <article className="panel">
                  <PanelHead eyebrow="Final Mix" title="Balance Composition" note="Principal, fresh top-ups, and reinvested growth." />
                  <EChart option={mixOption} className="chart donut-chart" />
                  <LegendRows rows={[["Starting principal", formatInr(principal), "teal"], ["Top-ups", formatInr(final.cumContributions), "blue"], ["Reinvested growth", formatInr(growth), "gold"]]} />
                </article>
              </div>
              ) : null}

              {activeView === "simulations" ? (
                <>
              <article className="panel wide risk-lab" aria-label="Risk lab summary">
                <PanelHead eyebrow="Risk Lab" title="What Can Break The Plan?" note="A downside-first read of sequence risk, target confidence, inflation pressure, and mitigation priorities." help={() => openHelp("risk")} />
                <div className="risk-assumption-grid">
	                  <MiniMetric label="Volatility" value={`${modelState.volatility}%`} />
	                  <MiniMetric label="Risk Runs" value={`${mc.simulations || modelState.monteCarloSamples}`} />
                  <MiniMetric label="95% End Chance Band" value={successBand} />
                  <MiniMetric label="Sampling Margin" value={successMargin} />
                  {/* R4.9.5b (fin-62w): plain-English percentile notes (shown as native title tooltip). */}
                  {/* R4.9.5b-2 (fin-5g3): PercentileSparkline inline next to each tile. */}
                  <MiniMetric label="P10" value={formatInr(p10)} note="Unlucky case: 10% of sampled paths land here or worse. Use this as your downside planning number."><PercentileSparkline values={[p10, p50, p90]} /></MiniMetric>
                  <MiniMetric label="P50" value={formatInr(p50)} note="Median outcome: half the sampled paths end better than this, half end worse."><PercentileSparkline values={[p10, p50, p90]} /></MiniMetric>
                  <MiniMetric label="P90" value={formatInr(p90)} note="Lucky case: 10% of sampled paths land here or better. Good markets, but don't count on it."><PercentileSparkline values={[p10, p50, p90]} /></MiniMetric>
                  <MiniMetric label="Worst" value={formatInr(mc.worst)} />
                  <MiniMetric label="Shock Model" value={mc.shockModel === "normal" ? "Normal" : "Fat-tail regime"} />
	                  <MiniMetric label="Glide Path" value={Number(modelState.glidePathEnabled) === 1 ? `${modelState.equityShare}% to ${modelState.glidePathEndEquity}%` : "Fixed allocation"} />
	                  <MiniMetric label="Eq/Debt Link" value={`${modelState.equityDebtCorrelation}%`} />
	                  <MiniMetric label="Shock Year" value={modelState.shockYear > 0 ? `Y${modelState.shockYear}` : "None"} />
	                  <MiniMetric label="Shock Drawdown" value={`${modelState.shockDrop}%`} />
                  <MiniMetric label="Target Basis" value="Today's rupees" />
                </div>
                <div className="risk-control-grid" aria-label="Interactive risk controls">
                  <QuickField label="Volatility" value={state.volatility} min={0} max={35} step={0.5} suffix="%" onChange={(value) => setField("volatility", value, { feedback: { type: "action", id: "risk", message: "Volatility updated" } })} />
                  <QuickField label="Equity vol" value={state.equityVolatility} min={0} max={45} step={0.5} suffix="%" onChange={(value) => setField("equityVolatility", value, { feedback: { type: "action", id: "risk", message: "Equity volatility updated" } })} />
                  <QuickField label="Debt vol" value={state.debtVolatility} min={0} max={20} step={0.25} suffix="%" onChange={(value) => setField("debtVolatility", value, { feedback: { type: "action", id: "risk", message: "Debt volatility updated" } })} />
                  <QuickField label="Correlation" value={state.equityDebtCorrelation} min={-95} max={95} step={5} suffix="%" onChange={(value) => setField("equityDebtCorrelation", value, { feedback: { type: "action", id: "risk", message: "Correlation updated" } })} />
                  <QuickField label="Risk runs" value={state.monteCarloSamples} min={16} max={192} step={16} onChange={(value) => setField("monteCarloSamples", value, { feedback: { type: "action", id: "risk", message: "Risk sample size updated" } })} />
                  <QuickSelect label="Shock model" value={state.shockModel} onChange={(value) => setField("shockModel", value, { feedback: { type: "action", id: "risk", message: "Shock model updated" } })} options={[{ value: "regime", label: "Fat-tail regime" }, { value: "normal", label: "Normal IID" }]} />
                  <QuickSelect label="Glide path" value={state.glidePathEnabled} onChange={(value) => setField("glidePathEnabled", Number(value), { feedback: { type: "action", id: "risk", message: "Glide path updated" } })} options={[{ value: 0, label: "Fixed allocation" }, { value: 1, label: "Glide equity down" }]} />
                  <QuickField label="End equity" value={state.glidePathEndEquity} min={5} max={90} step={1} suffix="%" onChange={(value) => setField("glidePathEndEquity", value, { feedback: { type: "action", id: "risk", message: "Glide end equity updated" } })} />
                  <QuickField label="Shock year" value={state.shockYear} min={0} max={modelHorizonYears} step={1} note={householdModeActive ? "Max follows household effective horizon." : ""} onChange={(value) => setField("shockYear", value, { feedback: { type: "action", id: "risk", message: "Shock year updated" } })} />
                  <QuickField label="Shock drawdown" value={state.shockDrop} min={0} max={70} step={1} suffix="%" onChange={(value) => setField("shockDrop", value, { feedback: { type: "action", id: "risk", message: "Shock drawdown updated" } })} />
                  <QuickField label="Inflation" value={state.inflation} min={0} max={12} step={0.1} suffix="%" onChange={(value) => setField("inflation", value, { feedback: { type: "action", id: "risk", message: "Inflation updated" } })} />
                  <button type="button" className="risk-rerun-button" onClick={() => setField("monteCarloSamples", Math.min(192, Math.max(96, state.monteCarloSamples * 2)), { feedback: { type: "action", id: "risk", message: "Higher sample run queued" } })}>
                    <Activity /> Run more samples
                  </button>
                </div>
                <div className="risk-disclosure" role="note">
                  <strong>Risk model disclosure</strong>
                  <span>{mc.method}. The displayed end-target chance is {successDisplay.primary} from {mc.simulations} samples using seed {mc.seed}, with a 95% sampling band of {successBand}. It is a planning sensitivity, not a prediction; rerun with more samples when the decision is close.</span>
                </div>
                <div className="risk-mitigation-grid">
                  {riskMitigations.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
              </article>

              <div className="chart-pair" id="risk">
                <article className="panel">
                  <PanelHead eyebrow="Annual Split" title="Tax, Cash & Reinvestment" note="How every year's interest is allocated." />
                  <EChart option={splitOption} />
                </article>
                <article className="panel">
                  <PanelHead eyebrow="Monte Carlo" title="Risk Cone" note="P10, P50, and P90 final corpus paths against target." help={() => openHelp("risk")} />
                  <EChart option={riskOption} />
                  {/* R4.9.5b-2 (fin-5g3): PercentileSparkline inline next to each percentile tile. */}
                  <div className="metric-row four">
                    <MiniMetric label="P10" value={formatInr(p10)}><PercentileSparkline values={[p10, p50, p90]} /></MiniMetric>
                    <MiniMetric label="P50" value={formatInr(p50)}><PercentileSparkline values={[p10, p50, p90]} /></MiniMetric>
                    <MiniMetric label="P90" value={formatInr(p90)}><PercentileSparkline values={[p10, p50, p90]} /></MiniMetric>
                    <MiniMetric label="Worst" value={formatInr(mc.worst)} />
                  </div>
                </article>
              </div>
                </>
              ) : null}

              {activeView === "tax" ? (
              <article className="panel wide" id="tax">
                <PanelHead eyebrow="Allocation & Tax" title="Indian Instrument Engine" note="Equity/debt blend with instrument-level Indian planning tax treatment." help={() => openHelp("taxScenarios")} />
                <TrustNotice title="Tax is planning-grade until reviewed" tone="coral" icon={AlertTriangle} actions={[{ label: "Tax help", onClick: () => openHelp("taxScenarios") }, { label: "Rules", onClick: () => setAssumptionsOpen(true) }, { label: "Trust Center", onClick: () => openHelp("trustCenter") }]}>
                  The engine separates slab income, special-rate gains, SWP cost recovery, rebate, 80TTB, TDS timing, and editable rules. It still depends on law, product facts, residence, acquisition dates, and CA-reviewed interpretation.
                </TrustNotice>
                <div className="tax-command-center">
                  <div>
                    <span className="decision-kicker">CA Workflow</span>
                    <h3>Separate normal income, special-rate gains, and cost recovery before reading tax drag.</h3>
                    <p>For retirement planning, the tax answer is mode-specific. Slab income can use regime, age, other income, deduction and rebate logic; SWP redemptions need FIFO lots and cost basis; equity gains keep special-rate treatment.</p>
                  </div>
                  <div className="tax-command-actions">
                    <button type="button" onClick={() => setAssumptionsOpen(true)}><Settings2 /> Edit tax profile</button>
                    <button type="button" onClick={() => openHelp("taxScenarios")}><CircleHelp /> Tax assumptions guide</button>
                  </div>
                </div>
                <div className="tax-scenario-grid">
                  {taxScenarioCards.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
                <div className="tax-action-strip" aria-label="Tax planning interactions">
                  <button type="button" onClick={() => setField("incomeMode", "swp", { feedback: { type: "action", id: "tax", message: "SWP tax path selected" } })}>
                    <strong>Model SWP lots</strong>
                    <span>Use FIFO cost recovery and realised-gain taxation instead of treating every rupee as income.</span>
                  </button>
                  <button type="button" onClick={() => setField("section87A", 1, { feedback: { type: "action", id: "tax", message: "87A enabled where eligible" } })}>
                    <strong>Test rebate eligibility</strong>
                    <span>Apply Section 87A only where the active retiree profile and income source allow it.</span>
                  </button>
                  <button type="button" disabled={analyticsPending} onClick={() => {
                    if (!requireFreshAnalytics("lowest-drag tax order")) return;
                    setField("withdrawalPriority", bestSwpOrder?.order || "proRata", { feedback: { type: "action", id: "tax", message: "Best SWP order tested" } });
                  }}>
                    <strong>Try lowest-drag order</strong>
                    <span>Rank withdrawal order by cash coverage, tax drag, and final corpus resilience.</span>
                  </button>
                </div>
                <div className="regime-comparison" aria-label="New versus old tax regime comparison">
                  <div className="regime-provenance">
                    <span>Tax ruleset provenance</span>
                    <strong>{activeTaxLaw.version}</strong>
                    <small>{activeTaxLaw.source} · Updated {activeTaxLaw.updatedOn}</small>
	                    <p>{modelState.section87AInterpretation === "offForSpecialMix" ? "87A is conservatively disabled when special-rate gains are present." : "87A is running in adviser-review sensitivity mode; confirm before relying on it."}</p>
                  </div>
                  {taxRegimeComparison.map((item) => (
	                    <div key={item.regime} className={`regime-card ${modelState.taxRegime === item.regime ? "active" : ""}`}>
                      <span>{item.label}</span>
                      <strong>{formatInr(item.tax)}</strong>
                      <small>Year-1 tax: {formatInr(item.normalTax)} slab + {formatInr(item.specialTax)} special</small>
                      <b>Relief tracked: {formatInr(item.relief)}</b>
                      <p>{item.caveat}</p>
                    </div>
                  ))}
                </div>
                <div className="tax-grid">
                  <MiniMetric label="Equity / Debt" value={usesAssetReturns ? `${Math.round(modelState.equityShare)}% / ${Math.round(100 - modelState.equityShare)}%` : "Manual return mode"} />
                  <MiniMetric label="Blended Yield" value={formatPct(model.effYield)} />
                  <MiniMetric label="Active Row-1 Tax" value={formatInr(activeYearOneRow.tax || 0)} />
	                  <MiniMetric label="Year-1 Tax Rate" value={modelState.taxRate > 0 ? `${modelState.taxRate}%` : formatPct(effectiveTax)} />
                  <MiniMetric label="Tax Profile" value={taxProfileLabel(modelState)} />
                  <MiniMetric label="Other Income" value={formatInr(modelState.otherIncome)} />
                  <MiniMetric label="87A / Basic / 80TTB" value={formatInr(activeYearOneRelief || (y1TaxProfile.rebateUsed || 0) + (y1TaxProfile.basicExemptionUsed || 0) + (y1TaxProfile.section80TTBUsed || 0))} />
                  <MiniMetric label="80TTB Used" value={formatInr(y1TaxProfile.section80TTBUsed || 0)} />
                  <MiniMetric label="Slab Income Tax" value={formatInr(y1TaxProfile.normalTax || 0)} />
                  <MiniMetric label="Special-Rate Tax" value={formatInr(y1TaxProfile.specialTax || 0)} />
                  <MiniMetric label="Surcharge / Relief" value={`${formatInr(y1TaxProfile.surcharge || 0)} / ${formatInr(y1TaxProfile.marginalRelief || 0)}`} />
                  <MiniMetric label="TDS Timing Drag" value={formatInr(y1TaxProfile.tdsCashTimingDrag || 0)} />
                  <MiniMetric label="Tax-Lot Method" value={model.taxLotMethod} />
                  <MiniMetric label="87A Interpretation" value={modelState.section87AInterpretation === "aggregateThreshold" ? "Aggregate threshold" : modelState.section87AInterpretation === "offForSpecialMix" ? "Off when mixed" : "Slab-only sensitivity"} />
                  <MiniMetric label="Equity Product" value={usesAssetReturns ? productClassLabel(modelState.equityProductClass) : "Allocation ignored"} />
                  <MiniMetric label="Debt Product" value={usesAssetReturns ? productClassLabel(modelState.debtProductClass) : "Manual tax bucket"} />
                  <MiniMetric label="Recovered Capital" value={formatInr(taxLotSummary.capitalRecovered)} />
                  <MiniMetric label="Realised Gain" value={formatInr(taxLotSummary.realizedGain)} />
                  <MiniMetric label="LTCG Exempt Used" value={formatInr(taxLotSummary.exemptionUsed)} />
                  <MiniMetric label="Tax Law" value={activeTaxLaw.version} />
                  <MiniMetric label="Rules Status" value={taxLawStatus.ok ? "Applied JSON" : "Fallback baseline"} />
                  <MiniMetric label="Special Rates" value={`${formatPct(activeTaxLaw.specialRates.equityLtcg)} LTCG / ${formatPct(activeTaxLaw.specialRates.equityStcg)} STCG`} />
                  <MiniMetric label="87A New Regime" value={`${formatInr(activeTaxLaw.rebates.new.threshold)} cap`} />
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Bucket</th><th>Instrument</th><th>Product Facts</th><th>Return</th><th>Tax Rule</th><th>Year-1 Tax</th></tr></thead>
                    <tbody>
	                      {usesAssetReturns ? (
	                        <>
		                          <tr><td>Equity</td><td>{instrumentLabel(modelState.equityInstrument)}</td><td>{productClassLabel(modelState.equityProductClass)} · acquired {modelState.equityAcquisitionYear} · STT {Number(modelState.equitySttPaid) === 1 ? "yes" : "unknown"}</td><td>{modelState.equityReturn}%</td><td>{taxRuleLabel(modelState.equityInstrument, modelState)}</td><td>{formatInr(y1Tax.equityTax || 0)}</td></tr>
		                          <tr><td>Debt</td><td>{instrumentLabel(modelState.debtInstrument)}</td><td>{productClassLabel(modelState.debtProductClass)} · acquired {modelState.debtAcquisitionYear}</td><td>{modelState.debtReturn}%</td><td>{taxRuleLabel(modelState.debtInstrument, modelState)}</td><td>{formatInr(y1Tax.debtTax || (modelState.taxRate > 0 ? y1Tax.tax : 0))}</td></tr>
	                        </>
	                      ) : (
		                        <tr><td>Portfolio</td><td>Manual return model</td><td>Equity/debt allocation and per-bucket returns are ignored while Return source is manual.</td><td>{modelState.annualRate}%</td><td>{taxRuleLabel(modelState.debtInstrument, modelState)}</td><td>{formatInr(y1Tax.tax || 0)}</td></tr>
	                      )}
                    </tbody>
                  </table>
                </div>
                <MobileTaxProductCards
	                  state={modelState}
                  y1Tax={y1Tax}
                  activeTaxLaw={activeTaxLaw}
                  taxLotSummary={taxLotSummary}
                />
                <div className="tax-guidance">
                  <div><strong>Retiree profile</strong><span>Slab income is taxed through regime, age, other income, standard deduction, 87A rebate, and cess.</span></div>
                  <div><strong>Special-rate wall</strong><span>Equity LTCG/STCG and listed-bond LTCG stay outside the 87A rebate calculation and retain their special rates.</span></div>
                  <div><strong>Monthly FIFO SWP</strong><span>SWP redemptions are simulated month by month; oldest lots are sold first inside each bucket.</span></div>
                  <div><strong>Cost capital recovery</strong><span>Only realised gain is taxed. The recovered cost portion of old units is shown separately.</span></div>
                  <div><strong>LTCG harvesting</strong><span>Equity LTCG exemption is applied annually when enabled, reducing taxable gain in the SWP lot model.</span></div>
                  <div><strong>IDCW caution</strong><span>IDCW is treated as taxable distribution income and may reduce NAV; it is not assumed to be guaranteed.</span></div>
                  <div><strong>Debt funds</strong><span>Specified/debt mutual fund gains are modelled at slab rates, reflecting post-2023/2025 treatment.</span></div>
                  <div><strong>Editable law</strong><span>Tax Law Studio controls active slabs, rebate, cess, special rates, exemptions, and long-term holding periods.</span></div>
                </div>
                {idcwComparison ? (
                  <div className="idcw-comparison" aria-label="IDCW versus SWP comparison">
                    <div>
                      <span>IDCW reality check</span>
                      <strong>Distribution cash is not guaranteed income.</strong>
                      <p>IDCW is modelled as slab-taxed distribution cash with NAV drag. Compare it with SWP before choosing it as a retirement income engine.</p>
                    </div>
                    <MiniMetric label="IDCW net cash" value={formatInr(idcwComparison.idcwCash)} />
                    <MiniMetric label="SWP net cash" value={formatInr(idcwComparison.swpCash)} />
                    <MiniMetric label="IDCW tax" value={formatInr(idcwComparison.idcwTax)} />
                    <MiniMetric label="NAV drag vs SWP" value={formatInr(idcwComparison.navDrag)} />
                  </div>
                ) : null}
                {swpOrderModels.length ? (
                  <div className="order-comparison" aria-label="Tax aware SWP redemption order comparison">
                    <div className="order-copy">
                      <span>Tax-Aware Order</span>
                      <strong>{bestSwpOrder?.label || "Pro-rata"} {bestSwpOrder?.coveredYears >= modelHorizonYears ? "looks best" : "covers cash longest"}</strong>
                      <p>Ranked by years fully covered, then lower tax, then final corpus.</p>
                    </div>
                    {swpOrderModels.map((item) => (
                      <div className={`order-pill ${item.order === modelState.withdrawalPriority ? "active" : ""}`} key={item.order}>
                        <span>{item.label}</span>
                        <strong>{formatInr(item.tax)}</strong>
                        <small>{item.coveredYears}/{modelHorizonYears} years covered · final {formatInr(item.final)}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
              ) : null}

              {activeView === "simulations" ? (
                <>
	              <ScenarioLibrary
	                scenarios={scenarioLibraryModels}
	                onApply={applyScenarioLibraryItem}
	                onSave={saveScenarioLibraryItem}
	                onExport={exportScenarioLibraryItem}
	                onHelp={openHelp}
	                disabled={analyticsPending}
	              />

              <article className="panel wide">
                <PanelHead eyebrow="Scenario Lens" title="Active Plan vs Alternatives" note="Compare income, growth, and stress paths over the same Indian inflation assumption." />
                <div className="scenario-layout">
                  <EChart option={scenarioOption} />
                  <div className="table-wrap compact">
                    <table>
                      <thead><tr><th>Scenario</th><th>Final</th><th>Real</th><th>Cash</th></tr></thead>
                      <tbody>
                        {scenarioModels.map((item) => (
                          <tr key={item.name}><td>{item.name}</td><td>{formatInr(item.model.final.closing)}</td><td>{formatInr(item.model.final.realClosing)}</td><td>{formatInr(item.model.final.cumWithdrawals)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>

              <article className="panel wide">
                <PanelHead eyebrow="Sensitivity Map" title="Return x Withdrawal Heatmap" note="Colour is scored on the real value underneath each cell, using today's-rupee target logic." help={() => openHelp("sensitivity")} />
                <div className="heat-legend" aria-label="Heatmap colour legend">
                  <span><i className="heat-dot heat-risk-dot" />Below start</span>
                  <span><i className="heat-dot heat-watch-dot" />Target short</span>
                  <span><i className="heat-dot heat-protected-dot" />Real target hit</span>
                  <span><i className="heat-dot heat-excellent-dot" />20%+ buffer</span>
                </div>
                <div className="heat-context">
                  Colour basis: target corpus {formatInr(analyticsTargetCorpusReal)} in today's rupees, roughly {formatInr(analyticsTargetCorpusNominal)} nominal at {analyticsParams.inflation}% inflation over {analyticsHorizonYears} years. Heatmap rows always run the shown withdrawal percentage so the grid remains comparable.
                </div>
                <div className="heatmap">
                  <div className="heat-head">Withdraw</div>
                  {heatReturns.map((rate) => <div key={rate} className="heat-head">{rate}%</div>)}
                  {heatRows.map((row) => (
                    <React.Fragment key={row.withdrawRate}>
                      <div className="heat-head">{row.withdrawRate}%</div>
                      {row.cells.map((cell) => (
                        <div
	                          key={`${row.withdrawRate}-${cell.annualRate}`}
	                          className={`heat-cell heat-${cell.status}`}
	                          aria-label={`${row.withdrawRate}% withdrawal and ${cell.annualRate}% return: ${cell.label}; final ${formatInr(cell.value)}, real ${formatInr(cell.realValue)}, real target gap ${formatInr(cell.targetGap)}`}
	                          title={`${cell.label}: ${formatInr(cell.value)} final, ${formatInr(cell.realValue)} real, ${formatInr(cell.targetGap)} real target gap`}
	                        >
	                          <strong>{formatInr(cell.value)}</strong>
	                          <span>{formatInr(cell.realValue)} real</span>
	                          <small>{cell.label}</small>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </article>
                </>
              ) : null}

              {activeView === "schedule" ? (
                <>
              <ReviewPackPanel
                assumptionFingerprint={assumptionFingerprint}
                activeTaxLaw={activeTaxLaw}
                mc={mc}
                scenarioCount={STANDARD_SCENARIO_LIBRARY.length + scenarioHistory.length}
                onExportPack={exportReviewPack}
                onExportPdf={exportPdf}
                onExportCsv={exportCsv}
                onHelp={openHelp}
                disabled={exportBlocked}
              />

              <article className="panel wide ledger-audit-cockpit" aria-label="Ledger audit cockpit">
                <PanelHead eyebrow="Audit Explorer" title="Reconcile The Retirement Math" note="Summary-first ledger controls for annual statements, monthly FIFO evidence, tax-lot proof, and export actions." help={() => openHelp(activeTableMode === "monthly" ? "fifo" : "core")} />
                <div className="ledger-summary-grid">
                  {ledgerSummary.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
                <div className="ledger-toolbelt">
                  <button type="button" onClick={() => setTableMode("milestones")}>Milestones</button>
                  <button type="button" onClick={() => setTableMode("full")}>Full annual</button>
                  <button type="button" disabled={!monthlyAuditRows.length} onClick={() => setTableMode("monthly")}>Monthly FIFO</button>
                  <button type="button" onClick={exportVisibleLedgerCsv} disabled={analyticsPending} aria-disabled={analyticsPending}><Download /> Export visible rows</button>
                  <button type="button" onClick={exportCsv} disabled={analyticsPending} aria-disabled={analyticsPending}><Download /> Full report CSV</button>
                </div>
                <TrustNotice title="Exports leave the protected browser context" tone="gold" icon={Download} actions={[{ label: "Review pack", onClick: exportReviewPack, disabled: analyticsPending, disabledTitle: "Wait for the analytics update badge before exporting." }, { label: "Trust Center", onClick: () => openHelp("trustCenter") }]}>
                  PDF, CSV, and scenario JSON files include live assumptions, tax-law version, risk method, and fingerprint {assumptionFingerprint}. They remain on disk even after browser saved data is cleared.
                </TrustNotice>
                <div className="ledger-find-row">
                  <label className="ledger-filter">
                    <span>Find a number</span>
                    <input
                      type="search"
                      value={ledgerSearch}
                      onChange={(event) => setLedgerSearch(event.target.value)}
                      placeholder={activeTableMode === "monthly" ? "Search period, tax, gain, cash..." : "Search year, tax, closing, cash..."}
                      aria-label="Search ledger rows"
                    />
                  </label>
                  <label className="ledger-jump">
                    <span>Jump to</span>
                    <select value="" onChange={(event) => setLedgerSearch(event.target.value)} aria-label="Jump to ledger period">
                      <option value="">Select period</option>
                      {ledgerJumpOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                </div>
                <div className="ledger-column-controls" aria-label="Ledger column controls">
                  {ledgerColumnSpecs.map((column) => (
                    <button
                      type="button"
                      key={column.key}
                      className={`ledger-column-toggle ${ledgerVisibleColumns[column.key] === false ? "" : "active"}`}
                      onClick={() => toggleLedgerColumn(column.key)}
                      aria-pressed={ledgerVisibleColumns[column.key] !== false}
                    >
                      {column.label}
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel wide" id="schedule">
                <PanelHead eyebrow="Projection Schedule" title={activeTableMode === "monthly" ? "Monthly FIFO Tax-Lot Trail" : "Annual Workbook Logic"} note={activeTableMode === "monthly" ? "Sampled monthly SWP ledger; CSV exports the full monthly trail." : "Milestone or full annual table with tax, top-up, shock, and real corpus."} help={() => openHelp(activeTableMode === "monthly" ? "fifo" : "core")} />
                <div className="segmented">
                  <button type="button" className={activeTableMode === "milestones" ? "active" : ""} onClick={() => setTableMode("milestones")}>Milestones</button>
                  <button type="button" className={activeTableMode === "full" ? "active" : ""} onClick={() => setTableMode("full")}>Full</button>
                  <button type="button" className={activeTableMode === "monthly" ? "active" : ""} disabled={!monthlyAuditRows.length} onClick={() => setTableMode("monthly")}>Monthly FIFO</button>
                </div>
                <div className="table-wrap schedule">
                  <table>
                    <thead><tr>{visibleLedgerColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                    <tbody>
                      {visibleTableRows.map((row) => (
                        <tr key={activeTableMode === "monthly" ? `${row.year}-${row.month}` : row.year}>
                          {visibleLedgerColumns.map((column) => <td key={column.key}>{column.value(row)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <MobileLedgerCards rows={visibleTableRows} columns={visibleLedgerColumns} mode={activeTableMode} />
                <div className="ledger-glossary" aria-label="Ledger column glossary">
                  <div><strong>Opening</strong><span>Corpus before growth, cash draw, top-up, and shock for the period.</span></div>
                  <div><strong>Cost Capital</strong><span>Original cost recovered through SWP; cash flow, not a fresh taxable gain.</span></div>
                  <div><strong>Realised Gain</strong><span>Gain created by the redeemed units before exemptions and set-off.</span></div>
                  <div><strong>Taxable Gain</strong><span>Gain left after capital-loss netting, exemptions, and basic-exemption set-off.</span></div>
                  <div><strong>Net Cash</strong><span>Spendable withdrawal after tax in that month or year.</span></div>
                </div>
                <div className="ledger-recon-grid">
                  <div><span>Tax Reconcile</span><strong>{formatInr(final.cumTax)}</strong><small>Matches annual tax total after instrument rules and FIFO rollups.</small></div>
                  <div><span>Cash Reconcile</span><strong>{formatInr(final.cumWithdrawals)}</strong><small>Cumulative net cash across the displayed projection horizon.</small></div>
                  <div><span>Real Bridge</span><strong>{formatInr(final.realClosing)}</strong><small>Closing corpus translated back into today's purchasing power.</small></div>
                  <div><span>Evidence Path</span><strong>{activeTableMode === "monthly" ? "FIFO trail" : "Annual trail"}</strong><small>Switch modes or export CSV for the full audit trail.</small></div>
                </div>
              </article>
                </>
              ) : null}

    </>
  );
}

function DashboardShell() {
  const dashboard = useDashboardContext();
  const {
    theme,
    setTheme,
    browserWidth,
    state,
    setState,
    preset,
    setPreset,
    tableMode,
    setTableMode,
    activeView,
    setActiveView,
    layout,
    setLayout,
    helpTopic,
    setHelpTopic,
    helpOpen,
    setHelpOpen,
    assumptionsOpen,
    setAssumptionsOpen,
    mobileInsightsOpen,
    setMobileInsightsOpen,
    toast,
    setToast,
    feedback,
    ledgerSearch,
    setLedgerSearch,
    ledgerVisibleColumns,
    setLedgerVisibleColumns,
    pinnedStrategyId,
    setPinnedStrategyId,
    disclaimerOpen,
    tourOpen,
    setTourOpen,
    tourStep,
    setTourStep,
    whatIfRef,
	    modelState,
	    analyticsState,
	    analyticsPending,
	    analyticsError,
	    exportBlocked,
	    exportBlockedTitle,
	    modelPending,
    modelHorizonYears,
    analyticsHorizonYears,
    effectiveMonthlyTarget,
    analyticsEffectiveMonthlyTarget,
    autoViewport,
    viewportBounds,
    effectiveViewport,
    targetInflationFactor,
    analyticsTargetInflationFactor,
    modelHousehold,
    analyticsHousehold,
    targetCorpusReal,
    targetCorpusNominal,
    analyticsTargetCorpusReal,
    analyticsTargetCorpusNominal,
    modelParams,
    analyticsParams,
    model,
    mc,
    topup,
    requiredReturn,
    requiredCorpusForCash,
    requiredReturnForCash,
    maxMonthlyCash,
    interestShareForTarget,
    y1Tax,
    optimum,
    optimumGuidance,
    pinnedStrategy,
	    activeTaxLaw,
	    taxLawStatus,
	    taxRegimeComparison,
	    analyticsPreset,
	    activePreset,
    markFeedback,
    commitState,
    switchView,
    setField,
    openHelp,
    acknowledgeDisclaimerConsent,
    clearAllSavedData,
    closeTour,
    startTour,
    showToast,
    resetLayout,
    startColumnResize,
    resizeWithKeys,
    applyPreset,
    reset,
    applyOptimumStrategy,
    final,
    principal,
    growth,
    targetAnnualFinal,
    corpusRatio,
    corpusGoalDetail,
    cashRatio,
    realCorpusGap,
    monthlyCashGap,
    p10,
    p50,
    p90,
    successDetail,
    successBand,
    successMargin,
    enduranceDisplay,
    successDisplay,
    effectiveTax,
    y1TaxProfile,
    taxBurden,
    payback,
    returnNeeded,
    shortfallRows,
    firstShortfall,
    depletionMonth,
    depletionRow,
    depletionPoint,
    cumulativeCashShortfall,
    hasCashShortfall,
    missesCorpusGoal,
    hasCorpusDepletion,
    hasCorpusGoalStress,
    hasCashStress,
    stressLabel,
    stressHeadline,
    stressDetail,
    monthlyAuditRows,
    activeTableMode,
    tableRows,
    ledgerSearchText,
    visibleTableRows,
    annualLedgerColumns,
    monthlyLedgerColumns,
    ledgerColumnSpecs,
    visibleLedgerColumns,
    ledgerJumpOptions,
    toggleLedgerColumn,
    taxLotSummary,
    swpOrderModels,
    bestSwpOrder,
    idcwComparison,
    actionPlan,
    planMood,
    decisionHeadline,
    decisionCopy,
    decisionPills,
    decisionMap,
    overviewScenarioModels,
    labels,
    chartBase,
    chartLegend,
    journeyOption,
    mixOption,
    sampled,
    splitOption,
    riskLabels,
    riskOption,
    scenarioModels,
    scenarioLabels,
    scenarioOption,
    heatReturns,
    heatWithdrawals,
    heatRows,
    smartInsights,
    exportCsv,
    exportVisibleLedgerCsv,
    exportPdf,
    exportReviewPack,
    printReport,
    safeMonthlyCashTarget,
    overviewActions,
    retireeStartSteps,
    plannerImpact,
    taxScenarioCards,
    riskMitigations,
    ledgerSummary,
    pageNarratives,
    activeNarrative,
    railContexts,
    railContext,
    appShellStyle,
    immediateMcSimulations
  } = dashboard;
  return (
    <>
      <div className="app-shell" style={appShellStyle}>
        <aside className="side-rail">
          <div className="brand">
            <div className="brand-icon"><IndianRupee /></div>
            <div><span>Retirement</span><strong>Planner</strong></div>
          </div>
          <nav className="nav-list" aria-label="Dashboard sections">
            {APP_VIEWS.map(({ id, label, detail, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={activeView === id ? "active" : ""}
                onClick={() => switchView(id)}
                aria-current={activeView === id ? "page" : undefined}
                data-view={id}
              >
                <Icon />
                <span><strong>{label}</strong><small>{detail}</small></span>
              </button>
            ))}
          </nav>
          <div className="side-rule" />
          <section className="side-section">
            <span className="side-title">Scenario</span>
            <div className="scenario-grid">
              {Object.entries(PRESETS).map(([key, item]) => (
                <button key={key} className={analyticsPreset === key ? "active" : ""} type="button" onClick={() => applyPreset(key)}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="side-section quick-controls">
            <span className="side-title">Quick Assumptions</span>
            <Control label="Principal" value={state.principal} onChange={(value) => setField("principal", value)} min={1000000} max={200000000} step={100000} />
            <Control label="Withdrawal" value={state.withdrawRate} onChange={(value) => setField("withdrawRate", value)} min={0} max={100} step={1} suffix="%" />
            <Control label="Years" value={state.years} onChange={(value) => setField("years", value)} min={1} max={60} step={1} />
            <button className="studio-button" type="button" onClick={() => setAssumptionsOpen(true)}><SlidersHorizontal /> Open Assumption Studio</button>
          </section>
        </aside>
        <div
          className="column-resizer rail-resizer"
          role="separator"
          aria-label="Resize left navigation column"
          aria-orientation="vertical"
          aria-valuemin="128"
          aria-valuemax="260"
          aria-valuenow={layout.rail}
          tabIndex="0"
          onPointerDown={(event) => startColumnResize("rail", event)}
          onKeyDown={(event) => resizeWithKeys("rail", event)}
        />

        <main className="workspace">
          <header className="topbar compact-topbar">
            <div className="product-lockup" aria-label="Product identity">
              <div className="eyebrow">Indian Retirement Planning</div>
              <h1>Retirement Corpus & Income Planner</h1>
	              <div className={`model-state ${modelPending || analyticsPending ? "updating" : ""}`} role="status">
	                <i />
	                <span>{modelPending ? "Updating model" : analyticsPending ? "Analytics syncing" : "Live model"}</span>
	              </div>
            </div>
            <div className="actions">
              <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">{theme === "dark" ? <Sun /> : <Moon />}<span>{theme === "dark" ? "Light" : "Dark"}</span></button>
              <button type="button" onClick={() => openHelp("tutorial")} aria-label="Open dashboard help" title="Open help"><CircleHelp /><span>Help</span></button>
              <button type="button" onClick={() => openHelp("trustCenter")} title="Open Trust Center"><ShieldCheck /><span>Trust</span></button>
              <button type="button" onClick={() => setAssumptionsOpen(true)} title="Open assumptions"><Settings2 /><span>Model</span></button>
              <button type="button" className="mobile-secondary" onClick={reset} title="Reset"><RotateCcw /><span>Reset</span></button>
	              <button type="button" className="mobile-secondary" onClick={exportCsv} disabled={analyticsPending} aria-disabled={analyticsPending} title={analyticsPending ? "Wait for analytics sync before exporting CSV" : "Export CSV"}><Download /><span>CSV</span></button>
	              <button type="button" className="mobile-secondary" onClick={exportPdf} disabled={exportBlocked} aria-disabled={exportBlocked} title={exportBlocked ? exportBlockedTitle : "Export PDF"}><FileSpreadsheet /><span>PDF</span></button>
	              <button type="button" className="mobile-secondary" onClick={exportReviewPack} disabled={exportBlocked} aria-disabled={exportBlocked} title={exportBlocked ? exportBlockedTitle : "Download adviser and CA review pack"}><FileSpreadsheet /><span>Pack</span></button>
	              <button type="button" className="primary-action mobile-secondary" onClick={printReport} disabled={analyticsPending} title={analyticsPending ? "Wait for analytics sync before printing" : "Print"}><Printer /><span>Print</span></button>
              <details className="mobile-action-menu">
                <summary aria-label="Open more actions"><Settings2 /><span>More</span></summary>
                <div>
                  <button type="button" onClick={reset}><RotateCcw /> Reset</button>
	                  <button type="button" onClick={exportCsv} disabled={analyticsPending} aria-disabled={analyticsPending}><Download /> CSV</button>
	                  <button type="button" onClick={exportPdf} disabled={exportBlocked} aria-disabled={exportBlocked} title={exportBlocked ? exportBlockedTitle : "Export PDF"}><FileSpreadsheet /> PDF</button>
	                  <button type="button" onClick={exportReviewPack} disabled={exportBlocked} aria-disabled={exportBlocked} title={exportBlocked ? exportBlockedTitle : "Download review pack"}><FileSpreadsheet /> Review pack</button>
	                  <button type="button" onClick={printReport} disabled={analyticsPending}><Printer /> Print</button>
                </div>
              </details>
            </div>
          </header>
          <section className="trust-ribbon" aria-label="Planning estimate caveat">
            <ShieldCheck />
            <span>Planning estimate, not financial/tax advice.</span>
            <strong>Review tax treatment, product classification, and final actions with a qualified CA/adviser.</strong>
            <button type="button" onClick={() => openHelp("trustCenter")}>Trust Center</button>
          </section>

          <section className="report-grid" id="overview">
	            <section className={`main-stack page-surface view-${activeView} ${modelPending ? "model-pending" : ""} ${analyticsPending ? "analytics-pending" : ""}`} data-active-view={activeView} data-analytics-pending={analyticsPending ? "true" : "false"} data-analytics-slow-pending={immediateMcSimulations === 0 ? "true" : "false"} data-analytics-error={analyticsError}>
              <DashboardPages />
              <footer className="app-footer app-disclaimer-footer" aria-label="Application footer">
                <span>Retirement Corpus & Income Planner · Planning tool · not financial/tax advice · v1.0.0 · MIT · </span>
                <a href="https://github.com/stribog-cloud/retirement-corpus-planner" target="_blank" rel="noopener noreferrer">
                  github.com/stribog-cloud/retirement-corpus-planner
                </a>
              </footer>
            </section>
            <div
              className="column-resizer insights-resizer"
              role="separator"
              aria-label="Resize right insights column"
              aria-orientation="vertical"
              aria-valuemin="230"
              aria-valuemax="420"
              aria-valuenow={layout.insights}
              tabIndex="0"
              onPointerDown={(event) => startColumnResize("insights", event)}
              onKeyDown={(event) => resizeWithKeys("insights", event)}
            />

            <aside className="insights-column">
              <div className="insights-scroll">
                <section className="panel filter-card">
                  <div className="card-top"><span>Showing data for</span><ChevronDown /></div>
                  <div className="filter-grid">
                    <div><small>Scenario</small><strong>{activePreset.label}</strong></div>
                    <div><small>Horizon</small><strong>{modelHorizonYears} Years</strong></div>
                  </div>
                  <p>{formatFullInr(modelState.principal)} starting corpus, {modelState.equityShare}% equity allocation.</p>
                </section>
                <section className="panel rail-context-card">
                  <div className="smart-head"><div><span>{APP_VIEWS.find((item) => item.id === activeView)?.label || "Workspace"}</span><h2>{railContext.title}</h2></div><Sparkles /></div>
                  <p>{railContext.detail}</p>
                  <div className="rail-context-metrics">
                    {railContext.metrics.map((metric) => (
                      <div key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="rail-context-actions">
	                    {railContext.actions.map((action) => (
	                      <button key={action.label} type="button" onClick={action.onClick} disabled={Boolean(action.disabled)} aria-disabled={Boolean(action.disabled)} title={action.disabled ? action.title : undefined}>{action.label}</button>
	                    ))}
                  </div>
                </section>
                <section className="panel statement-card">
                  <h2>Projection Statement</h2>
                  <StatementRow label="Corpus Goal" value={`${Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%`} ratio={corpusRatio} />
                  <StatementRow label="Cash Goal" value={`${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`} ratio={cashRatio} accent="coral" />
                  <StatementRow label="End Chance" value={successDisplay.primary} ratio={mc.successProbability} />
                  <StatementRow label="Tax Drag" value={formatInr(final.cumTax)} ratio={taxBurden} accent="coral" />
                </section>
                <section className="panel smart-card">
                  <div className="smart-head"><div><span>Smart Insights</span><h2>What Changed</h2></div><Sparkles /></div>
                  {smartInsights.map((line) => <p key={line}>{line}</p>)}
                </section>
                <section className="panel solver-card">
                  <span>Gap Solver</span>
                  <strong>{topup <= 1 ? "₹0" : formatInr(topup)}</strong>
                  <small>{topup <= 1 ? "Target already covered" : "Extra annual top-up required"}</small>
                  <div className="solver-grid">
                    <MiniMetric label="Return Needed" value={returnNeeded} />
                    <MiniMetric label="Required Corpus" value={Number.isFinite(model.requiredCorpus) ? formatInr(model.requiredCorpus) : "N/A"} />
                  </div>
                </section>
                <button className="help-panel-button" type="button" onClick={() => openHelp("tutorial")}><CircleHelp /> Tutorials & Context Help</button>
              </div>
              <LayoutConsole layout={layout} setLayout={setLayout} resetLayout={resetLayout} effectiveViewport={effectiveViewport} autoViewport={autoViewport} browserWidth={browserWidth} viewportBounds={viewportBounds} />
            </aside>
          </section>
        </main>
      </div>

      <nav className="mobile-tabbar" aria-label="Mobile dashboard sections">
        {APP_VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={activeView === id ? "active" : ""}
            onClick={() => switchView(id)}
            aria-current={activeView === id ? "page" : undefined}
            data-view={id}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="mobile-quick-actions" aria-label="Mobile quick actions">
        <button type="button" onClick={() => setMobileInsightsOpen(true)}><Sparkles /> Insights</button>
        <button type="button" onClick={startTour}><CircleHelp /> Tour</button>
      </div>
      <div className={`mobile-insights-sheet ${mobileInsightsOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Mobile insights">
        <button type="button" className="mobile-sheet-backdrop" onClick={() => setMobileInsightsOpen(false)} aria-label="Close mobile insights" />
        <section className="mobile-sheet-panel">
          <div className="mobile-sheet-head">
            <div><span>{APP_VIEWS.find((item) => item.id === activeView)?.label || "Workspace"}</span><strong>{railContext.title}</strong></div>
            <button type="button" onClick={() => setMobileInsightsOpen(false)} aria-label="Close insights"><X /></button>
          </div>
          <p>{railContext.detail}</p>
          <div className="statement-card mobile-statement">
            <h3>Projection Statement</h3>
            <StatementRow label="Corpus Goal" value={`${Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%`} ratio={corpusRatio} />
            <StatementRow label="Cash Goal" value={`${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`} ratio={cashRatio} accent="coral" />
            <StatementRow label="End Chance" value={successDisplay.primary} ratio={mc.successProbability} />
          </div>
          <div className="mobile-smart-list">
            {smartInsights.slice(0, 4).map((line) => <p key={line}>{line}</p>)}
          </div>
          <button className="help-panel-button" type="button" onClick={() => openHelp("tutorial")}><CircleHelp /> Tutorials & Context Help</button>
        </section>
      </div>

      <AssumptionDrawer open={assumptionsOpen} state={state} outputState={modelState} setField={setField} onClose={() => setAssumptionsOpen(false)} openHelp={openHelp} onClearSavedData={() => clearAllSavedData()} />
      <HelpDrawer open={helpOpen} topic={helpTopic} onClose={() => setHelpOpen(false)} onStartTour={startTour} onClearSavedData={() => clearAllSavedData()} activeTaxLaw={activeTaxLaw} />
      <GuidedTour
        open={tourOpen}
        step={tourStep}
        setStep={setTourStep}
        onClose={closeTour}
        onSwitchView={switchView}
        onOpenHelp={(nextTopic) => {
          openHelp(nextTopic);
          setTourOpen(false);
        }}
        onOpenAssumptions={() => {
          setAssumptionsOpen(true);
          setTourOpen(false);
        }}
      />
      <DisclaimerNotice
        open={disclaimerOpen && !tourOpen}
        onAccept={acknowledgeDisclaimerConsent}
        onClear={() => clearAllSavedData()}
        onHelp={openHelp}
      />
      <BrandedToast toast={toast} />
    </>
  );
}

function App() {
  const dashboard = useRetirementDashboard();
  return (
    <DashboardContext.Provider value={dashboard}>
      <DashboardShell />
    </DashboardContext.Provider>
  );
}

const PanelHead = React.memo(function PanelHead({ eyebrow, title, note, help }) {
  return (
    <div className="panel-head">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      {help ? <button type="button" onClick={help} aria-label={`Help for ${title}`}><CircleHelp /></button> : null}
    </div>
  );
});

const MiniMetric = React.memo(function MiniMetric({ label, value, note = "", pending = false, children }) {
  const title = `${label}: ${value}${note ? `. ${note}` : ""}`;
  return (
    <div className={`mini-metric ${pending ? "analytics-derived is-syncing" : ""}`} title={title}>
      <span>{label}</span>
      <strong>{value}{children ? <> {children}</> : null}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
});

const LegendRows = React.memo(function LegendRows({ rows }) {
  return <div className="legend-rows">{rows.map(([label, value, color]) => <div key={label}><i className={`dot-${color}`} /><span>{label}</span><strong>{value}</strong></div>)}</div>;
});

const StatementRow = React.memo(function StatementRow({ label, value, ratio, accent }) {
  return (
    <div className={`statement-row ${accent || ""}`}>
      <span>{label}</span>
      <div><i style={{ width: `${clamp(ratio, 0, 1) * 100}%` }} /></div>
      <strong>{value}</strong>
    </div>
  );
});

/* v8 ignore stop */
/* v8 ignore start -- browser debug bridge is exercised by e2e, not node coverage. */
const MODEL_DEBUG_API = {
  BASE,
  PRESETS,
  calculate,
  calculateGuidancePlan,
  calculateTaxProfile,
  investmentTaxProfile,
  standardDeductionLimit,
  yearlyTax,
  taxableRate,
  effectiveYield,
  annualPortfolioIncomeRate,
  calculateSequencePath,
  calculateMonteCarlo,
  quantile,
  annualSequenceShock,
  grandfatheredEquityGain,
  saleStreamsForPrincipalDrawdown,
  solveTopup,
  solveReturn,
  solveCorpusForMonthlyCash,
  solveReturnForMonthlyCash,
  solveMaxMonthlyCash,
  withdrawalShareNeeded,
  generateOptimumStrategies,
  retirementPlanningProfile,
  householdPlanProfile,
  projectionParamsFromState,
  normalizeState,
  planFingerprint,
  formatInr,
  formatFullInr,
  formatPct,
  targetAnnualCashForYear,
  DEFAULT_TAX_LAW,
  formatTaxLawJson,
  sanitizeTaxLaw,
  taxLawFromState,
  taxLawParseStatus,
  specialRate,
  PLANNING_VERSION,
  STANDARD_SCENARIO_LIBRARY,
  INSTRUMENT_CATALOG,
  scenarioPatchFor,
  stateForScenarioLibraryItem,
  withdrawalRateForState,
  withdrawalRateBand,
  catalogByBucket,
  buildWithdrawalPolicy,
  buildTaxOptimizationPlan,
  buildAssumptionAudit,
  buildRetireeGuidedPlan,
  buildRetirementActionPlan
};

if (typeof window !== "undefined") {
  const testApiRequested = new URLSearchParams(window.location.search).has("finTestApi");
  const isLocalTestHost = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
  if (import.meta.env.DEV) window.__FIN_DASHBOARD_MODEL__ = MODEL_DEBUG_API;
  if (import.meta.env.DEV || (testApiRequested && isLocalTestHost)) window.__FIN_DASHBOARD_TEST_API__ = MODEL_DEBUG_API;
}
/* v8 ignore stop */

/* v8 ignore start -- browser render bootstrap is covered by e2e smoke tests. */
const rootElement = typeof document !== "undefined" ? document.getElementById("root") : null;
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
/* v8 ignore stop */

export {
  BASE,
  PRESETS,
  SCENARIOS,
  STANDARD_SCENARIO_LIBRARY,
  DEFAULT_TAX_LAW,
  PLANNING_VERSION,
  INSTRUMENT_CATALOG,
  DEFAULT_LAYOUT,
  STORAGE_KEY,
  LAYOUT_KEY,
  THEME_KEY,
  TOUR_KEY,
  DISCLAIMER_KEY,
  PRIVACY_CONSENT_KEY,
  NUMERIC_FIELDS,
  persistJson,
  loadDisclaimerAcknowledged,
  persistDisclaimerAcknowledged,
  loadPrivacyConsent,
  persistPrivacyConsent,
  clearSavedBrowserData,
  loadSavedState,
  loadSavedLayout,
  clamp,
  normalizeFieldValue,
  normalizeState,
  stableStringify,
  compactHash,
  planFingerprint,
  selectExportMc,
  buildHelpTopics,
  householdPlanProfile,
  projectionParamsFromState,
  roundToStep,
  viewportBoundsForWidth,
  autoViewportForWidth,
  formatInr,
  formatFullInr,
  formatPct,
  formatTaxLawJson,
  annualPortfolioRate,
  equityShareForYear,
  paramsForProjectionYear,
  annualPortfolioIncomeRate,
  scenarioPatchFor,
  stateForScenarioLibraryItem,
  withdrawalRateForState,
  withdrawalRateBand,
  catalogByBucket,
  buildWithdrawalPolicy,
  buildTaxOptimizationPlan,
  buildAssumptionAudit,
  buildRetireeGuidedPlan,
  buildRetirementActionPlan,
  compoundRate,
  effectiveYield,
  sanitizeTaxLaw,
  taxLawFromState,
  taxLawParseStatus,
  specialRate,
  cessMultiplier,
  slabBands,
  basicExemptionLimit,
  slabTaxBeforeCess,
  applySection87A,
  emptyTaxStreams,
  addTaxStreams,
  calculateTaxProfile,
  investmentTaxProfile,
  standardDeductionLimit,
  acquisitionYearForKind,
  productClassForInstrument,
  productRuleForInstrument,
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
  taxRuleLabel,
  effectiveMonthlyWithdrawal,
  toastDurationMs,
  calcSparklineTicks
};
