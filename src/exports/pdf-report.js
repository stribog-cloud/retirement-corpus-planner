/**
 * src/exports/pdf-report.js
 *
 * R4.9.5g — PDF report multi-section structured report (Hilbert / fin-ahy under fin-c96).
 *
 * DISPATCH STATE (2026-05-21 — fin-4ml cleanup):
 *   ALL SEVEN SECTIONS FILLED. The structured 7-section PDF is now the SOLE
 *   production PDF export. The §7 dispatch retained an escape hatch
 *   (USE_R4_9_5G_REPORT flag + `?r4.9.5g=false` URL toggle + the old
 *   dark-theme code path in src/main.jsx); all three were removed under
 *   owner Option-4 (R4-Q13, 2026-05-21) to recover bundle headroom and
 *   close out v1.0.0 with a single export path.
 *
 * Library: jspdf + jspdf-autotable. See audit/round-4/r4.9.5g-pdf-library-decision.md.
 *
 * Sections:
 *   §1 Cover                            — renderCover
 *   §2 Decision workspace summary       — renderDecisionSummary
 *   §3 Plan diagnosis                   — renderPlanDiagnosis
 *   §4 Tax path                         — renderTaxPath
 *   §5 Scenarios                        — renderScenarios
 *   §6 Month-by-month cash flow ledger  — renderMonthlyLedger
 *   §7 Methodology + Disclaimer          — renderMethodology
 *
 * Theme: LIGHT ONLY. No dark variant. No toggle. Palette mirrors the
 * `:root` block in `src/styles.css:1-45`. No new design tokens introduced.
 *
 * Accessibility note (fin-c96.6):
 *   jspdf cannot emit a PDF/UA structure tree. This implementation uses the
 *   accessibility-adjacent jspdf APIs that ARE available:
 *     - doc.setProperties({ title, subject, author, keywords, creator })
 *     - catalog /Lang entry = en-IN (written via putCatalog subscription
 *       since jspdf's setLanguage whitelist omits en-IN)
 *     - doc.outline.add(...) for navigable bookmarks
 *   Sibling DATA TABLES (jspdf-autotable) are also emitted alongside every
 *   rasterized chart so screen-reader users get text-extractable equivalents.
 *
 * Persona: Hilbert  |  Phase: R4.9.5g  |  Parent: fin-ahy under fin-c96
 */

/* eslint-disable no-unused-vars -- some helpers reserved for §6/§7 follow-up. */

import {
  formatInr,
  formatPct,
  clamp,
  solveTopup,
  roundToStep,
  productClassLabel,
  taxProfileLabel,
  projectionParamsFromState,
  targetAnnualCashForYear,
  quantile,
  buildMonthlyLedger,
} from "../model.js";
import { formatProbabilityForDisplay } from "../probability-display.js";
import { PLANNING_VERSION } from "../planning.js";

/**
 * App build version injected at compile time by Vite's `define` plugin (fin-i65).
 * Mirrors the guard pattern in src/exports/csv.js so the footer, PDF export, and
 * CSV export never disagree on the shipped version string (fin-8fb.2 P1).
 * At build time: resolves to package.json's `version` field (e.g. "1.0.0").
 * In Vitest (no Vite define pass): falls back to PLANNING_VERSION.
 */
// eslint-disable-next-line no-undef
const _appVersion = (typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__)
  ? __APP_VERSION__   // eslint-disable-line no-undef
  : PLANNING_VERSION;

/**
 * Light-theme palette mapped from `src/styles.css:1-45` `:root` block.
 *
 * Rgba values are flattened to opaque hex for PDF rendering — PDFs do not
 * carry through CSS alpha cleanly across viewers. No new design tokens.
 */
export const LIGHT_PALETTE = Object.freeze({
  // Backgrounds
  bg: "#d8e0eb",          // --bg
  bg2: "#edf2f8",         // --bg-2
  panel: "#ffffff",       // --panel (rgba(255,255,255,0.74) flattened to opaque)
  panel2: "#ebf1f8",      // --panel-2 (rgba(235,241,248,0.72) flattened)
  panel3: "#dee6f1",      // --panel-3 (rgba(222,230,241,0.82) flattened)
  // Text
  text: "#1f2a3f",        // --text
  muted: "#536074",       // --muted
  soft: "#97a1b2",        // --soft
  // Lines
  line: "#b1bbca",        // --line (rgba(113,127,148,0.26) flattened)
  lineStrong: "#717f94",  // --line-strong (rgba(113,127,148,0.42) flattened)
  // Accents (semantic colours)
  teal: "#2f9ca8",        // --teal
  coral: "#cc3f5a",       // --coral
  gold: "#d09f38",        // --gold
  blue: "#5d72f6",        // --blue
  success: "#1f9f89",     // --success
  warning: "#d09f38",     // --warning
  danger: "#c93452",      // --danger
  // Semantic role colours
  income: "#4f72e8",      // --income
  tax: "#cc3f5a",         // --tax
  growth: "#2f9ca8",      // --growth
  risk: "#6c7af4",        // --risk
});

/**
 * Page geometry for A4 portrait (points).
 *   A4 width  = 595 pt
 *   A4 height = 842 pt
 */
export const PAGE = Object.freeze({
  width: 595,
  height: 842,
  marginTop: 60,
  marginBottom: 60,
  marginLeft: 40,
  marginRight: 40,
  footerBaseline: 818,   // page.height - 24 pt
  headingY: 80,
});

// Inner content width — hoisted constant dedups the repeated
// `IW` expression (515pt) across
// every section builder (bundle compression; was 10 inline computations).
const IW = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

/** Section numbering used in headings and outline bookmarks. */
export const SECTIONS = Object.freeze([
  { num: 1, key: "cover", title: "Cover" },
  { num: 2, key: "decision", title: "Decision workspace summary" },
  { num: 3, key: "diagnosis", title: "Plan diagnosis" },
  { num: 4, key: "tax", title: "Tax path" },
  { num: 5, key: "scenarios", title: "Scenarios" },
  { num: 6, key: "ledger", title: "Month-by-month cash flow ledger" },
  { num: 7, key: "methodology", title: "Methodology" },
]);

/** Verbatim scenario chip tooltips — src/main.jsx:6115-6122 (R4.9.5g fin-c96.12). */
const SCENARIO_TOOLTIPS = {
  Active: "Your current assumptions: return, allocation, cash, inflation, and cash engine as set.",
  Income: "Lower equity, higher cash payout — tests whether an income-first portfolio can meet the plan.",
  Growth: "Equity-led compounding — tests how a growth-tilted portfolio performs over the full horizon.",
  Stress: "Lower return, higher inflation, early drawdown shock — the plan's worst-case stress test.",
};

/** Verbatim DisclaimerNotice blocks — src/main.jsx:3210-3226 (R4.9.5g fin-c96.12). */
const DISCLAIMER_BLOCKS = [
  [null,
    "Retirement Corpus & Income Planner is a planning and educational tool — not financial, investment, or tax advice."],
  ["What it models:",
    "Corpus durability, monthly income, tax drag, inflation, sequence risk, and allocation across a retirement horizon. Tax rules are scoped to AY 2026-27 / Finance Act, 2025 (India). The bundled ruleset becomes outdated when the assessment year rolls over; verify current rules before relying on any tax output."],
  ["Monte Carlo simulations",
    "run seeded pseudo-random paths under the return assumptions you supply. Simulated paths are statistical scenarios, not predictions. A high success probability is not a guarantee."],
  ["Your data stays here.",
    "All inputs are stored in your browser's localStorage only. Nothing is uploaded. No telemetry. No cookies. For details, see PRIVACY.md in the repository."],
  ["For investment decisions:",
    "consult a SEBI-registered Investment Adviser (RIA). For tax decisions: consult a Chartered Accountant (CA)."],
  [null, "Provided under the MIT License, as-is, with no warranty of any kind."],
];

/**
 * Convert a hex colour to the [r, g, b] triple that jsPDF's
 * setFillColor / setTextColor / setDrawColor APIs accept. Accepts
 * 3- or 6-digit hex with optional leading "#". Throws on malformed input.
 */
export function hexToRgb(hex) {
  if (typeof hex !== "string") throw new TypeError("hex must be a string");
  let clean = hex.trim().toLowerCase();
  if (clean.startsWith("#")) clean = clean.slice(1);
  if (clean.length === 3) clean = clean.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/.test(clean)) throw new Error(`invalid hex colour: ${hex}`);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/* Bundle-compression helpers (R4.9.5h Pass-2 Dispatch 4b).
 * jsPDF API method names cannot be mangled by esbuild (external surface).
 * Wrapping in single-letter aliases (esbuild WILL mangle) cuts ~15-25 B
 * per call site. See dispatch report for headroom math. */
const _HELV = "helvetica";
const _NRM = "normal";
const _BLD = "bold";
const _sF = (d, s) => d.setFont(_HELV, s);
const _sS = (d, n) => d.setFontSize(n);
const _sT = (d, r, g, b) => d.setTextColor(r, g, b);
const _sD = (d, r, g, b) => d.setDrawColor(r, g, b);
const _sI = (d, r, g, b) => d.setFillColor(r, g, b);
const _sB = (d, w, sz, r, g, b) => { d.setFont(_HELV, w); d.setFontSize(sz); d.setTextColor(r, g, b); };
const _sLW = (d, n) => d.setLineWidth(n);
const _sDLW = (d, r, g, b, n) => { d.setDrawColor(r, g, b); d.setLineWidth(n); };
const _AT_HEAD = () => ({ fontStyle: _BLD, textColor: hexToRgb(LIGHT_PALETTE.muted), fillColor: hexToRgb(LIGHT_PALETTE.bg2) });
const _AT_ALT = () => ({ fillColor: hexToRgb(LIGHT_PALETTE.panel2) });
const _AT_MARG = () => ({ left: PAGE.marginLeft, right: PAGE.marginRight });
const _AT_STY = (fs, lb) => {
  const s = { fontSize: fs, textColor: hexToRgb(LIGHT_PALETTE.text), font: _HELV };
  if (lb) s.overflow = "linebreak";
  return s;
};
const _atDef = (doc, opts) => {
  if (typeof doc.autoTable !== "function") return;
  doc.autoTable({ theme: "plain", headStyles: _AT_HEAD(), alternateRowStyles: _AT_ALT(), margin: _AT_MARG(), ...opts });
};

/* Pure helpers (exported for honest unit testing per R4-Q14). All are
 * pure data transforms; no DOM, jsPDF, or browser globals. */

/** Resolve plan-mood verdict bucket — mirrors src/main.jsx:3925-3935. */
function buildVerdictMood({ hasCashStress, cashRatio, corpusRatio, successProbability }) {
  if (hasCashStress) return "attention";
  if (cashRatio >= 1 && corpusRatio >= 1 && successProbability >= 0.65) return "strong";
  if (cashRatio >= 0.9 && corpusRatio >= 0.85) return "watch";
  return "gap";
}

/** Canonical headline per verdict mood — verbatim src/main.jsx:3939-3950. */
function buildVerdictHeadline(mood) {
  if (mood === "strong") return "Yes — the plan covers income, protects the corpus goal, and has room to spare.";
  if (mood === "watch") return "Mostly yes — income is close, but the corpus cushion is thin.";
  if (mood === "attention") return "The plan is under stress — income, corpus, or both need attention.";
  return "Not yet — the plan needs more corpus, lower cash, or a higher return to close the gap.";
}

/** Plan Endurance tile detail — src/main.jsx:6199.
 *  fin-c96.15 (Pass-2 D2): when mcSamples===0 (MC not yet settled),
 *  suppress the "0 samples · seed n/a" leak and emit a pending sentinel. */
function buildEnduranceDetail({ marginText, mcSamples, mcSeed }) {
  const samples = Number.isFinite(Number(mcSamples)) ? mcSamples : 0;
  if (samples === 0) return "Pending MC computation";
  const seed = mcSeed != null ? mcSeed : "n/a";
  const base = `${samples} samples · seed ${seed}`;
  return marginText ? `${marginText} · ${base}` : base;
}

/** Target Confidence tile detail — src/main.jsx:6201.
 *  fin-c96.15 (Pass-2 D2): when mcSamples===0 (MC not yet settled),
 *  suppress the "0 samples" leak; show only the deterministic P50 vs target. */
function buildSuccessDetail({ marginText, mcP50, targetCorpusNominal, mcSamples }) {
  const base = `${formatMoneyForPdf(mcP50 || 0)} P50 vs ${formatMoneyForPdf(targetCorpusNominal || 0)} target`;
  const samples = Number.isFinite(Number(mcSamples)) ? mcSamples : 0;
  if (samples === 0) return marginText ? `${marginText} · ${base} · pending MC` : `${base} · pending MC`;
  return marginText ? `${marginText} · ${base} · ${samples} samples` : `${base} · ${samples} samples`;
}

/** Income Cover tile detail — src/main.jsx:6200. */
function buildIncomeDetail({ withdrawal, targetAnnualFinal }) {
  return `${formatMoneyForPdf((Number(withdrawal) || 0) / 12)} vs ${formatMoneyForPdf((Number(targetAnnualFinal) || 0) / 12)} final-month need`;
}

/**
 * R4.9.5h Pass-2 D7 — confidence mood bucket for Plan Endurance / Target
 * Confidence tiles. Pure — Vitest-testable.
 *
 * Returns one of:
 *   "pending" — mcSamples === 0 (slow-tier MC has not settled)
 *   "high"    — probability >= 0.70
 *   "med"     — 0.30 <= probability < 0.70
 *   "low"     — probability < 0.30
 *
 * The hex colour map for each bucket is shared between the top stripe, the
 * body tint, and the chip badge so all three visual surfaces stay in lockstep.
 */
function confidenceMoodBucket(probability, mcSamples) {
  if ((Number(mcSamples) || 0) === 0) return "pending";
  const p = Number(probability) || 0;
  if (p >= 0.70) return "high";
  if (p >= 0.30) return "med";
  return "low";
}

const TILE_MOOD_COLOURS = Object.freeze({
  high:    { stripe: "#16a34a", body: "#ecfdf5", chip: "#16a34a", label: "HIGH" },
  med:     { stripe: "#f59e0b", body: "#fffbeb", chip: "#f59e0b", label: "MED"  },
  low:     { stripe: "#dc2626", body: "#fef2f2", chip: "#dc2626", label: "LOW"  },
  pending: { stripe: "#94a3b8", body: "#f1f5f9", chip: "#64748b", label: "PEND" },
  income:  { stripe: "#2563eb", body: "#eff6ff", chip: "#2563eb", label: null   },
  tax:     { stripe: "#ea580c", body: "#fff7ed", chip: "#ea580c", label: null   },
});

/** Closing-the-gap action list (a/b/c) — R4.9.5b spec. */
function buildGapActions({ topup, safeMonthlyCashTarget, finalCorpusPct }) {
  const actions = [];
  if (topup > 1) actions.push(`(a) Add ${formatMoneyForPdf(topup)} per year`);
  if (safeMonthlyCashTarget > 0) actions.push(`(b) Reduce monthly cash to ${formatMoneyForPdf(safeMonthlyCashTarget)}`);
  actions.push(`(c) Accept finishing at ${finalCorpusPct} of target`);
  return actions;
}

/** Gap-tile detail-row parts — src/main.jsx:4090-4099. */
function buildGapDetailParts({ realCorpusGap, monthlyCashGap, requiredReturnForCash }) {
  const parts = [];
  if (realCorpusGap > 1) parts.push(`Corpus short ${formatMoneyForPdf(realCorpusGap)} today's rupees`);
  if (monthlyCashGap > 1) parts.push(`Monthly cash gap ${formatMoneyForPdf(monthlyCashGap)}`);
  parts.push(`Return needed ${requiredReturnForCash == null ? ">40%" : formatPct(requiredReturnForCash)}`);
  return parts;
}

/** Single scenario row (6-col) — depletion precedence: isZeroStart > depletionYear > generic. */
function buildScenarioRow(scenario) {
  const final = scenario.final ?? 0;
  const isDepleted = final <= 0;
  const dep = isDepleted
    ? (scenario.isZeroStart ? "Scenario starts at zero corpus"
      : scenario.depletionYear ? `Plan depleted at year ${scenario.depletionYear}` : "Plan depleted")
    : "—";
  return [
    scenario.name || "Scenario",
    isDepleted ? "INR 0" : formatMoneyForPdf(final),
    isDepleted ? "—" : formatMoneyForPdf(scenario.real ?? 0),
    `${Math.round(clamp(scenario.cashRatio ?? 0, 0, 9.99) * 100)}%`,
    dep,
    SCENARIO_TOOLTIPS[scenario.name] || "",
  ];
}

/** §5 scenarios autotable body. */
function buildScenarioRows(scenarios) {
  return Array.isArray(scenarios) && scenarios.length > 0
    ? scenarios.map(buildScenarioRow)
    : [["(no scenarios in export context)", "—", "—", "—", "—", "Pass reportScenarios in exportContext to populate this section."]];
}

/** §1 cover "Plan inputs at a glance" 8-row fact set. */
function buildPlanFactRows({ state: s = {}, params: p = {}, taxLaw: t = {} } = {}) {
  const eq = Number(s.equityShare) || 0;
  return [
    ["Monthly cash target", formatMoneyForPdf(Number(p.monthlyTarget) || (Number(s.monthlyTarget) || 0)) + " / month"],
    ["Starting corpus", formatMoneyForPdf(Number(s.principal) || 0)],
    ["Horizon", `${Math.max(0, Math.round(Number(p.years) || Number(s.years) || 0))} years`],
    ["Income mode", `${String(s.incomeMode || "swp").toUpperCase()} (${String(s.cashMode || "monthlyTarget")})`],
    ["Expected return", Number(s.useAssetReturns) === 1
      ? `${eq}% equity / ${Math.max(0, 100 - eq)}% debt`
      : `${Number(s.annualRate) || 0}% manual`],
    ["Inflation assumption", `${Number(s.inflation) || 0}%`],
    ["Target corpus (today's rupees)", formatMoneyForPdf(Number(s.targetCorpus) || 0)],
    ["Tax ruleset", String(t.version || "FY 2025-26 / AY 2026-27 baseline")],
  ];
}

/** §3 projection-summary autotable body (8 metric rows). */
function buildProjectionSummaryRows({ model: m = {}, principal } = {}) {
  const final = m.final || {};
  const grossGrowth = final.cumInterest || 0;
  const taxBurden = grossGrowth > 0 ? (final.cumTax || 0) / grossGrowth : 0;
  const p = Number(principal) || 0;
  const payback = p > 0 ? (final.cumWithdrawals || 0) / p : 0;
  return [
    ["Opening corpus", formatMoneyForPdf(p)],
    ["Total withdrawn (cumulative)", formatMoneyForPdf(final.cumWithdrawals || 0)],
    ["Real final balance (today's rupees)", formatMoneyForPdf(final.realClosing || 0)],
    ["Nominal final balance", formatMoneyForPdf(final.closing || 0)],
    ["Effective yield", typeof m.effYield === "number" ? formatPct(m.effYield) : "N/A"],
    ["Tax drag (cumulative)", formatMoneyForPdf(final.cumTax || 0)],
    ["Tax burden (tax / gross growth)", formatPct(taxBurden)],
    ["Payback ratio (cash / starting corpus)", formatPct(payback)],
  ];
}

/** §3 corpus-journey sample-year list — decile checkpoints when T>10. */
function buildJourneySampleYears(horizonYears) {
  const h = Math.max(0, Math.round(Number(horizonYears) || 0));
  if (h > 10) return [0, Math.floor(h / 4), Math.floor(h / 2), Math.floor((3 * h) / 4), h];
  return Array.from({ length: h + 1 }, (_, i) => i);
}

/**
 * D11 — first year a percentile path depletes (balance ≤ threshold), scanning
 * from year 1 so a zero starting balance does not register. The series is the
 * year-indexed corpus path (index 0 = today). Returns null when the path never
 * depletes within the horizon. Pure — Vitest-testable (R4-Q14).
 */
function findDepletionYear(series, threshold = 1) {
  if (!Array.isArray(series) || series.length < 2) return null;
  for (let i = 1; i < series.length; i += 1) {
    if ((Number(series[i]) || 0) <= threshold) return i;
  }
  return null;
}

/**
 * D11 — depletion-year callouts for the P10/P50/P90 fan. Returns one short
 * label per band that actually depletes (downside first, matching reading
 * order). Empty array when no band depletes. Pure — Vitest-testable.
 */
function buildDepletionCallouts(p10, p50, p90, threshold = 1) {
  const out = [];
  for (const [band, series] of [["P10", p10], ["P50", p50], ["P90", p90]]) {
    const year = findDepletionYear(series, threshold);
    if (year != null) out.push({ band, year, label: `${band} depleted yr ${year}` });
  }
  return out;
}

/** FNV-1a fingerprint of the ordered scenario name list. */
function computeScenarioFingerprint(scenarioNames) {
  const text = (Array.isArray(scenarioNames) ? scenarioNames : []).join("|");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sl-${(hash >>> 0).toString(36).toUpperCase()}`;
}

/** Strip YAML frontmatter from a markdown source; normalises CRLF→LF. */
function stripDisclaimerFrontmatter(text) {
  if (typeof text !== "string") return "";
  let body = text;
  const fmMatch = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fmMatch) body = body.slice(fmMatch[0].length);
  return body.replace(/\r\n/g, "\n");
}

// R4.9.5h — glyph + markdown pure helpers (D3/D5/D18/D2/D13/D14/D16/D17/D19)
// Pure functions: no jsPDF calls — Vitest-testable per R4-Q14/M08-coda.

/** Replace jsPDF Helvetica AFM-missing chars before any doc.text() call. */
const PDF_GLYPHS = { "₹": "INR ", "⇒": "=>", "→": "->", "–": "-", "—": "--", "¹": "(1)" };
function sanitizeForPdf(text) {
  return String(text??"").replace(/[₹⇒→–—¹]/g, (c) => PDF_GLYPHS[c]);
}

/**
 * Return true when url is an absolute HTTP/HTTPS URL suitable for a PDF link
 * annotation. Relative paths (e.g. "PRIVACY.md", "./docs/foo") return false
 * — they are meaningless in a standalone PDF and are rendered text-only.
 * Pure — no jsPDF. Exported via __test__ for Vitest (R4.9.5j fin-vkv).
 */
function isAbsoluteUrl(url) {
  if (typeof url !== "string" || url.length === 0) return false;
  return /^https?:\/\//i.test(url);
}

/**
 * Strip inline markdown syntax from a paragraph string. Pure — no jsPDF.
 * Removes **bold**, *italic*, `code` markers; collapses [text](url)→text
 * and <https://url>→url. Also applies sanitizeForPdf glyph substitution.
 * Exported via __test__ for Vitest (R4-Q14/M08-coda).
 */
function stripInlineMd(text) {
  // Single pass: drop ALL * runs (covers **bold**, *italic*, and orphan
  // markers from multi-line bold spans), backticks, <url>, [text](url).
  return sanitizeForPdf(String(text??""))
    .replace(/[*`]+/g,"")
    .replace(/<(https?:\/\/[^>]+)>/g,"$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g,"$1");
}

/**
 * Parse a paragraph string into styled inline runs. Pure — no jsPDF.
 *
 * Each run is `{text, bold?, italic?, code?}`. Markdown inline tokens
 * (`**bold**`, `*italic*`, `` `code` ``, `[text](url)`, `<url>`) are converted
 * into runs that carry the relevant style flags. Asterisks/backticks/angle
 * brackets are consumed (the e2e regression suite forbids raw markdown syntax
 * in the rendered §7 text layer — see tests/e2e/pdf-export-regression.mjs
 * e1.1–e1.6). Glyph sanitisation runs first so ₹/⇒ etc. are still PDF-safe.
 *
 * Link / autolink handling matches owner R4-Q19 (text-only, no clickable
 * annotations). For `[text](url)`: when text === url the URL is rendered
 * once; otherwise we emit "text (url)" so the destination remains visible
 * to the reader without an annotation. For `<https://…>`: render the URL.
 *
 * Exported via __test__ for Vitest (R4.9.5h Pass-2 Dispatch 4 — D2 fix).
 */
function parseInlineRuns(text) {
  const src = sanitizeForPdf(String(text ?? ""));
  if (src === "") return [];
  const runs = [];
  const push = (chunk, s) => {
    /* c8 ignore next */
    if (!chunk) return;
    const l = runs[runs.length - 1];
    if (l && !!l.bold === !!s.bold && !!l.italic === !!s.italic && !!l.code === !!s.code
        && (l.link || null) === (s.link || null)) {
      l.text += chunk; return;
    }
    runs.push({ text: chunk, ...s });
  };
  // Priority: code, bold, italic, [text](url), <autolink>. Code first so
  // `**x**` inside backticks stays literal. Asterisks/backticks/angle brackets
  // are consumed (e2e e1.1–e1.6 forbid raw markdown in §7 text layer).
  const re = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|\*([^*\n]+?)\*|\[([^\]]+)\]\(([^)]+)\)|<(https?:\/\/[^>\s]+)>/g;
  let cur = 0, m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > cur) push(src.slice(cur, m.index), {});
    if (m[2] != null) push(m[2], { code: true });
    else if (m[3] != null) push(m[3], { bold: true });
    else if (m[4] != null) push(m[4], { italic: true });
    else if (m[5] != null) {
      // fin-vkv R4.9.5j: absolute URLs get a clickable link annotation via
      // doc.textWithLink. Relative links (PRIVACY.md etc.) stay text-only —
      // they are not meaningful in a standalone PDF.
      const linkUrl = m[6] || "";
      if (isAbsoluteUrl(linkUrl)) {
        // Emit the link text with a `link` property; emitRuns uses textWithLink.
        push(m[5], { link: linkUrl });
      } else {
        // R4-Q19 (relative links): render link text + " (url)" when url ≠ text.
        push(m[5], {}); if (linkUrl && linkUrl !== m[5]) push(` (${linkUrl})`, {});
      }
    } else {
      // m[7] – <https://...> autolink — always absolute by the regex constraint.
      push(m[7], { link: m[7] });
    }
    cur = re.lastIndex;
  }
  if (cur < src.length) push(src.slice(cur), {});
  return runs;
}


/**
 * Parse DISCLAIMER.md markdown subset into render tokens. Pure — no jsPDF.
 * Exported via __test__ for Vitest (R4-Q14/M08-coda).
 *
 * Each token is {k, v?, cells?, level?, ordered?, index?} where k is:
 *   "H" heading  "R" rule  "B" blank  "TS" table-start  "TR" table-row
 *   "TE" table-end  "Q" blockquote  "L" list-item  "P" paragraph
 *
 * For backward compat the legacy "type" alias is NOT included — callers
 * use the short k codes. Tests must use k codes.
 */
function parseDisclaimerTokens(markdownBody) {
  const src=String(markdownBody??"");
  if(!src)return[];
  const lines=src.split("\n"),tokens=[];
  let inT=false;
  const endT=()=>{tokens.push({k:"TE"});inT=false;};
  for(const raw of lines){
    const t=raw.trim();
    if(t===""){if(inT)endT();tokens.push({k:"B"});continue;}
    const hd=t.match(/^(#{1,3})\s+(.*)/);
    if(hd){if(inT)endT();tokens.push({k:"H",level:hd[1].length,v:sanitizeForPdf(hd[2])});continue;}
    if(/^-{3,}$/.test(t)){if(inT)endT();tokens.push({k:"R"});continue;}
    if(t.startsWith("|")){
      if(!inT){tokens.push({k:"TS"});inT=true;}
      const cols=t.split("|").map(c=>c.trim()).filter((_,i,a)=>i>0&&i<a.length-1);
      if(!cols.every(c=>/^[-:]+$/.test(c)))tokens.push({k:"TR",cells:cols.map(sanitizeForPdf)});
      continue;
    }
    if(inT)endT();
    if(t.startsWith("> ")){tokens.push({k:"Q",v:stripInlineMd(t.slice(2))});continue;}
    if(/^- /.test(t)){tokens.push({k:"L",ordered:false,index:null,v:stripInlineMd(t.slice(2))});continue;}
    const ol=t.match(/^(\d+)\. (.*)/);
    if(ol){tokens.push({k:"L",ordered:true,index:Number(ol[1]),v:stripInlineMd(ol[2])});continue;}
    tokens.push({k:"P",v:stripInlineMd(raw)});
  }
  if(inT)tokens.push({k:"TE"});
  return tokens;
}

/**
 * §7 methodology facts table body (4 canonical rows).
 * D4 (fin-c96.15): mc.simulations===0 sentinel guard.
 * D3/D5/D18 (fin-c96.16): sanitizeForPdf on all cells (₹/⇒ glyph fix).
 */
function buildMethodologyFactsRows({ mc: m = {}, taxLaw: t = {}, scenarioNames: sn } = {}) {
  const names = Array.isArray(sn) && sn.length > 0 ? sn : METHODOLOGY_SCENARIO_NAMES;
  const mcSeed = m.seed != null ? String(m.seed) : "n/a";
  const mcSims = (m.simulations || 0);
  // D4: sentinel when MC not yet computed (fin-c96.15)
  const mcValueCell = mcSims === 0
    ? "Monte Carlo not yet computed — open Risk view before exporting"
    : sanitizeForPdf(`${mcSims} samples · seed ${mcSeed} · method ${m.method || "stochastic-regime"}`);
  return [
    ["Monte Carlo", mcValueCell, "Q-MC+Q-MC-ENDURANCE. Seeded paths; same seed => same paths."],
    ["Regime model", "Lognormal + regime-switching (fat-tail vs normal)", "Two return regimes per year with calibrated regime-switch probability."],
    // fin-87n R4.9.5j: expand §7 abbreviated token to match §4 phrasing (D26 §4-only sweep missed §7)
    ["Tax law", sanitizeForPdf(String(t.version || "FY 2025-26 / AY 2026-27 baseline")), "FA-2025/CBDT Oct-2024/ITA-1961. §87A, §115BAC new-regime, §74 8-year FIFO carry-forward pool."],
    ["Scenario library", sanitizeForPdf(`${names.length} scenarios · ${names.join(" / ")} · ${computeScenarioFingerprint(names)}`), "SCENARIOS array. Active=current inputs; Income/Growth/Stress=bounded patches."],
  ];
}

/** Canonical scenario names — mirror of src/model.js:228-233 SCENARIOS array. */
const METHODOLOGY_SCENARIO_NAMES = ["Active", "Income", "Growth", "Stress"];

/** formatInr with ₹→"INR " swap so the PDF stays ASCII-safe (jspdf Helvetica AFM lacks ₹). */
function formatMoneyForPdf(value) {
  return formatInr(value).replace("₹", "INR ");
}
const money = formatMoneyForPdf;

/**
 * R4.9.5h Pass-2 Dispatch 3 — D24 fix.
 *
 * Collect a chart/tile a11y sibling table for the dedicated Appendix A
 * accessibility section at the end of the document, instead of rendering it
 * inline beneath the visual it mirrors (which sighted owners flagged as
 * "dense, repetitive, unprofessional" duplication).
 *
 * jspdf cannot emit tagged-PDF structure (no StructTreeRoot / MCID / mark-content
 * APIs — confirmed against jspdf v4.2.1 type definitions and source); a truly
 * non-visible structural surrogate is therefore not technically achievable.
 * Option B (per the dispatch mandate) — relocate the surrogate tables to a
 * dedicated "Appendix A — Accessibility Data Tables" at the document tail —
 * keeps the screen-reader/text-extraction surrogate posture intact (sibling
 * tables remain present in the PDF text stream and indexable by AT) while
 * removing the visual duplication for sighted readers.
 *
 * Page 3 corpus-journey P10/P50/P90 table is intentionally NOT collected here:
 * the corpus-journey chart does not embed numeric values in-band, so that
 * table IS the data, not a duplicate. It stays in §3 untouched.
 *
 * @param {object} exportContext - the in-flight export context
 * @param {object} table - { title, head, body, sourceLabel, columnStyles? }
 */
function collectA11yAppendixTable(exportContext, table) {
  if (!exportContext || typeof exportContext !== "object") return;
  if (!Array.isArray(exportContext.__a11yAppendixTables)) {
    // Non-enumerable private scratchpad: shorthand defineProperty form.
    Object.defineProperty(exportContext, "__a11yAppendixTables",
      { value: [], writable: true, configurable: true });
  }
  exportContext.__a11yAppendixTables.push(table);
}

/**
 * R4.9.5h Pass-2 Dispatch 5 — D25 fix. Bordered light-grey placeholder card
 * that occupies the (IW × h) footprint of a Monte-Carlo-dependent
 * visualisation when slow-tier MC has not yet settled (`mc.simulations`
 * 0/null). Prevents §3 corpus-journey from collapsing to identical
 * P10/P50/P90 values. Layout-preserving + text-bearing for AT readers.
 */
const MC_PENDING_MSG = "Open the Risk view in the app and let the simulation settle, then re-export to see the percentile distribution.";
function renderMcPendingPlaceholder(doc, y, h) {
  _sI(doc, ...hexToRgb(LIGHT_PALETTE.panel));
  _sDLW(doc, ...hexToRgb(LIGHT_PALETTE.line), 0.5);
  doc.roundedRect(PAGE.marginLeft, y, IW, h, 6, 6, "FD");
  const m = hexToRgb(LIGHT_PALETTE.muted), x = PAGE.marginLeft + 14;
  _sB(doc, _BLD, 10, m[0], m[1], m[2]);
  doc.text("MONTE CARLO PENDING", x, y + 22);
  _sB(doc, _NRM, 9, m[0], m[1], m[2]);
  doc.splitTextToSize(MC_PENDING_MSG, IW - 28).forEach((ln, i) => doc.text(ln, x, y + 40 + i * 12));
}

/** Paint the standard light-theme page background wash. */
function paintPageBg(doc) {
  const [r, g, b] = hexToRgb(LIGHT_PALETTE.bg2);
  _sI(doc, r, g, b);
  doc.rect(0, 0, PAGE.width, PAGE.height, "F");
}
/** addPage + paintPageBg — common 2-line pair across all section renderers. */
const _newPage = (doc) => { doc.addPage(); paintPageBg(doc); };

function drawSectionHeading(doc, section) {
  const [tr, tg, tb] = hexToRgb(LIGHT_PALETTE.teal);
  const [mr, mg, mb] = hexToRgb(LIGHT_PALETTE.text);
  _sB(doc, _BLD, 10, tr, tg, tb);
  doc.text(`SECTION ${section.num}`, PAGE.marginLeft, PAGE.headingY - 18);
  _sS(doc, 20);
  _sT(doc, mr, mg, mb);
  doc.text(section.title.toUpperCase(), PAGE.marginLeft, PAGE.headingY);
  // Hairline under the heading
  const [lr, lg, lb] = hexToRgb(LIGHT_PALETTE.line);
  _sDLW(doc, lr, lg, lb, 0.5);
  doc.line(PAGE.marginLeft, PAGE.headingY + 8, PAGE.width - PAGE.marginRight, PAGE.headingY + 8);
}

/** H2 sub-section eyebrow — 12pt bold + 1pt rule underline (D9/§15.3). */
/* c8 ignore next */
function drawH2Heading(doc,t,x,y){_sB(doc, _BLD, 12, 31,42,63);doc.text(t.toUpperCase(),x,y);_sD(doc, 177,187,202);_sLW(doc, 1);doc.line(x,y+2,x+515,y+2);}

/**
 * Write a labelled value pair as a two-column "fact line" at (x, y).
 * Used in §2 / §4 inputs strips and headline panels.
 */
function drawFactLine(doc, label, value, x, y, opts = {}) {
  const labelWidth = opts.labelWidth ?? 145;
  const [mr, mg, mb] = hexToRgb(LIGHT_PALETTE.muted);
  const [tr, tg, tb] = hexToRgb(LIGHT_PALETTE.text);
  _sB(doc, _BLD, opts.fontSize ?? 9, mr, mg, mb);
  doc.text(String(label), x, y);
  _sF(doc, _NRM);
  _sT(doc, tr, tg, tb);
  doc.text(String(value), x + labelWidth, y);
}

/**
 * R4.9.5h Pass-2 D7 — Decision Workspace tile in jsPDF primitives.
 *
 * Each tile is a rounded rectangle composed of three zones:
 *   - Top stripe       — 6pt mood-keyed fill band
 *   - Body fill        — very-light mood tint covering the rest of the tile
 *   - Label / value /  — bold primary value (20pt) with single-line detail
 *     detail / badge     (8pt, ellipsis-truncated to fit interior width)
 *
 * Replaces the pass-1 html2canvas DOM-capture path that produced text-y
 * output and the overflow / detail-collision bugs the owner flagged.
 *
 * @param {object} tile - { label, value, detail, mood, badge }
 *   label  — uppercase tracked-out tile header (e.g. "INCOME COVER")
 *   value  — primary string (20pt bold)
 *   detail — secondary string (8pt, single-line, ellipsis if too wide)
 *   mood   — key into TILE_MOOD_COLOURS (high/med/low/pending/income/tax)
 *   badge  — optional { label, fillHex } for the bottom-right chip badge
 */
function drawDecisionTile(doc, x, y, w, h, tile) {
  const mood = TILE_MOOD_COLOURS[tile.mood] || TILE_MOOD_COLOURS.income;
  const [sR, sG, sB] = hexToRgb(mood.stripe);
  const [bR, bG, bB] = hexToRgb(mood.body);
  const [lR, lG, lB] = hexToRgb("#cbd5e1");
  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  // Body fill first (so it sits beneath the top stripe and the border)
  _sI(doc, bR, bG, bB);
  _sDLW(doc, lR, lG, lB, 0.5);
  doc.roundedRect(x, y, w, h, 6, 6, "FD");
  // Top stripe — clipped to the rounded top by drawing on top, 6pt tall.
  _sI(doc, sR, sG, sB);
  doc.rect(x, y, w, 6, "F");
  // Interior layout: pad 10pt all round.
  const padX = 10;
  const labelY = y + 22;
  const valueY = y + 46;
  const detailY = y + h - 14;
  // Label (uppercase, 9pt bold, muted)
  _sB(doc, _BLD, 9, mR, mG, mB);
  doc.text(String(tile.label).toUpperCase(), x + padX, labelY);
  // Primary value (20pt bold) — splitTextToSize to clamp; first line only.
  _sB(doc, _BLD, 20, tR, tG, tB);
  const innerW = w - padX * 2;
  const valueLines = doc.splitTextToSize(String(tile.value), innerW);
  doc.text(valueLines[0], x + padX, valueY);
  // Detail line — 8pt, single line, ellipsis if too wide.
  _sB(doc, _NRM, 8, mR, mG, mB);
  // Reserve space for the badge on the right if present.
  const badgeW = tile.badge ? 40 : 0;
  const detailMaxW = innerW - badgeW - 4;
  let detailText = String(tile.detail || "");
  const detailLines = doc.splitTextToSize(detailText, detailMaxW);
  let detailFirst = detailLines[0] || "";
  if (detailLines.length > 1 && detailFirst.length > 3) {
    // Replace trailing chars with "…" so the truncation is visible.
    detailFirst = detailFirst.slice(0, -1).trimEnd() + "…";
  }
  doc.text(detailFirst, x + padX, detailY);
  // Optional chip badge in bottom-right corner.
  if (tile.badge) {
    const [bcR, bcG, bcB] = hexToRgb(tile.badge.fillHex);
    const bW = 36;
    const bH = 14;
    const bX = x + w - padX - bW;
    const bY = y + h - bH - 8;
    _sI(doc, bcR, bcG, bcB);
    _sD(doc, bcR, bcG, bcB);
    doc.roundedRect(bX, bY, bW, bH, 3, 3, "F");
    _sB(doc, _BLD, 7, 255, 255, 255);
    doc.text(String(tile.badge.label), bX + bW / 2, bY + bH / 2 + 2.5, { align: "center" });
  }
}

/**
 * Headline metric "card" — eyebrow label on top, big value, detail beneath.
 * Mirrors the Decision Workspace tile shape in light theme.
 */
function drawMetricCard(doc, x, y, w, h, eyebrow, value, detail, accentHex) {
  const [pr, pg, pb] = hexToRgb(LIGHT_PALETTE.panel);
  const [lr, lg, lb] = hexToRgb(LIGHT_PALETTE.line);
  const [mr, mg, mb] = hexToRgb(LIGHT_PALETTE.muted);
  const [tr, tg, tb] = hexToRgb(LIGHT_PALETTE.text);
  const [ar, ag, ab] = hexToRgb(accentHex || LIGHT_PALETTE.teal);
  _sI(doc, pr, pg, pb);
  _sDLW(doc, lr, lg, lb, 0.5);
  doc.roundedRect(x, y, w, h, 6, 6, "FD");
  // accent band
  _sI(doc, ar, ag, ab);
  doc.rect(x, y, w, 3, "F");
  _sB(doc, _BLD, 7, mr, mg, mb);
  doc.text(String(eyebrow).toUpperCase(), x + 12, y + 18);
  _sS(doc, 18);
  _sT(doc, tr, tg, tb);
  doc.text(String(value), x + 12, y + 42, { maxWidth: w - 20 });
  _sB(doc, _NRM, 8, mr, mg, mb);
  doc.text(String(detail), x + 12, y + h - 12, { maxWidth: w - 20 });
}

/* === Canvas chart helpers (adapted for light theme from src/main.jsx ~4885) ===
 * Produces 1400x700 PNG dataURLs that jspdf inlines via doc.addImage().
 * Backgrounds are panel-white instead of dark; text uses --text / --muted.
 * The chart helpers run in browser context (require document.createElement);
 * the smoke-build environment (Node) does not call them — they are only
 * invoked from buildPdfReport() under the new flag, which is dormant. In
 * test environments without `document`, the chart calls are skipped and
 * the data-table siblings still render.
 * ============================================================================= */

const CHART_TEAL = LIGHT_PALETTE.teal;
const CHART_BLUE = LIGHT_PALETTE.blue;
const CHART_CORAL = LIGHT_PALETTE.coral;
const CHART_GOLD = LIGHT_PALETTE.gold;
const CHART_GRID = "#cbd3e0";    // soft light-theme grid
const CHART_TEXT = LIGHT_PALETTE.text;
const CHART_MUTED = LIGHT_PALETTE.muted;
const CHART_PANEL = LIGHT_PALETTE.panel;
const CHART_PANEL2 = LIGHT_PALETTE.panel2;
// Canvas font shorthand — dedups the long "Helvetica, Arial, sans-serif" stack
// across every chart-draw helper (bundle compression; was 10 distinct literals).
const cf = (weight, size) => `${weight} ${size}px Helvetica, Arial, sans-serif`;

function hasDocument() {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

function createChartCanvas(title, subtitle, draw) {
  if (!hasDocument()) return null;
  // c8: browser-context canvas chart rendering — jsdom's HTMLCanvasElement
  // returns null from getContext("2d") so the early-return path on line
  // immediately following is the ONLY path exercised under Vitest. Real
  // canvas rendering is covered by Puppeteer E2E in
  // tests/e2e/r4.9.5g-pdf-autotable-verify.mjs + dashboard-regression.mjs.
  /* c8 ignore start */
  const canvas = document.createElement("canvas");
  const width = 1400;
  const height = 700;
  canvas.width = width;
  canvas.height = height;
  let ctx;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }
  // jsdom returns null from getContext("2d") — chart rendering is a real-browser
  // facility; tests skip charts and the data-table siblings still render.
  if (!ctx || typeof ctx.createLinearGradient !== "function") return null;
  // Light panel background with subtle gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, CHART_PANEL);
  bg.addColorStop(1, CHART_PANEL2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  // Hairline frame
  ctx.strokeStyle = LIGHT_PALETTE.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, width - 4, height - 4);
  // Title & subtitle
  ctx.fillStyle = CHART_TEAL;
  ctx.font = cf(700, 22);
  ctx.fillText("RETIREMENT PLANNING EVIDENCE", 64, 60);
  ctx.fillStyle = CHART_TEXT;
  ctx.font = cf(800, 42);
  ctx.fillText(title, 64, 112);
  ctx.fillStyle = CHART_MUTED;
  ctx.font = cf(600, 22);
  ctx.fillText(subtitle, 64, 148);
  draw(ctx, { width, height, left: 110, top: 200, plotWidth: 1180, plotHeight: 400 });
  return canvas.toDataURL("image/png");
  /* c8 ignore stop */
}

// c8: browser-context canvas grid renderer — only invoked by chart-draw
// callbacks inside createChartCanvas, which itself returns null in jsdom
// (see rationale on createChartCanvas above). Real-canvas execution covered
// by Puppeteer E2E pdf-export-regression.mjs.
/* c8 ignore start */
function drawChartGrid(ctx, box, maxValue, opts = {}) {
  ctx.strokeStyle = CHART_GRID;
  ctx.lineWidth = 1;
  ctx.fillStyle = CHART_MUTED;
  ctx.font = cf(600, 16);
  for (let i = 0; i <= 5; i++) {
    const yLine = box.top + box.plotHeight - (box.plotHeight * i) / 5;
    ctx.beginPath();
    ctx.moveTo(box.left, yLine);
    ctx.lineTo(box.left + box.plotWidth, yLine);
    ctx.stroke();
    ctx.fillText(formatInr((maxValue * i) / 5), 18, yLine + 6);
  }
  // D11: X-axis year ticks + axis title. horizonYears drives the year labels at
  // 0/¼/½/¾/full so the time axis is legible. Y-axis ticks already carry INR
  // amounts on the left, so a separate rotated Y title would be redundant.
  const horizon = Math.max(1, Math.round(Number(opts.horizonYears) || 0));
  const baseY = box.top + box.plotHeight;
  ctx.textAlign = "center";
  for (let i = 0; i <= 4; i++) {
    ctx.fillText(`Yr ${Math.round((horizon * i) / 4)}`, box.left + (box.plotWidth * i) / 4, baseY + 26);
  }
  ctx.textAlign = "left";
  ctx.font = cf(700, 16);
  ctx.fillText("Projection year", box.left, baseY + 50);
}

function drawChartLineSeries(ctx, box, values, color, opts = {}) {
  if (!values || !values.length) return;
  const maxValue = Math.max(1, opts.maxValue || Math.max(...values));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.lineWidth || 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (opts.dashed) ctx.setLineDash([14, 14]);
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = box.left + (box.plotWidth * index) / Math.max(1, values.length - 1);
    const y = box.top + box.plotHeight - (box.plotHeight * (value || 0)) / maxValue;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  if (opts.fill) {
    ctx.lineTo(box.left + box.plotWidth, box.top + box.plotHeight);
    ctx.lineTo(box.left, box.top + box.plotHeight);
    ctx.closePath();
    ctx.fillStyle = color + "33";
    ctx.fill();
  }
  ctx.restore();
}

function drawChartLegend(ctx, items, x, y) {
  ctx.font = cf(700, 18);
  let cursor = x;
  items.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.fillRect(cursor, y - 14, 22, 7);
    ctx.fillStyle = CHART_MUTED;
    ctx.fillText(item.label, cursor + 32, y - 6);
    cursor += ctx.measureText(item.label).width + 70;
  });
}

// D11: vertical depletion markers + callouts on the corpus-journey fan. Each
// callout draws a dashed vertical line at the year a band hits zero plus a
// short "PNN depleted yr N" label, stacked so multiple bands don't overlap.
function drawDepletionMarkers(ctx, box, callouts, horizonYears, colors) {
  if (!callouts || !callouts.length) return;
  const horizon = Math.max(1, Math.round(Number(horizonYears) || 0));
  callouts.forEach((c, idx) => {
    const x = box.left + (box.plotWidth * c.year) / horizon;
    const color = colors[c.band] || CHART_MUTED;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.top + box.plotHeight);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = cf(700, 16);
    ctx.fillText(c.label, Math.min(x + 8, box.left + box.plotWidth - 200), box.top + 24 + idx * 24);
  });
}
/* c8 ignore stop */

/* === Section builders ====================================================== */

/**
 * §1 Cover — R4.9.5h Pass-2 redesign (D1 + D6 owner-rejected pass-1).
 *
 * Layout (top → bottom, centred title block + left-aligned data below):
 *   A.1 Title block          — title (26pt bold) / subtitle (12pt) / version (10pt)
 *   A.2 Brand identity bar   — 2pt teal rule with gold accent segment
 *   A.3 Metadata block       — generated timestamp + fingerprint (9pt muted)
 *   A.4 Plan inputs grid     — fixed 2-column tabular layout, 8 rows
 *   A.5 Signal chips         — 4 mood-keyed FILLED pills (not band+label legend)
 *   A.6 Pointer + footer     — "See §7 for full disclaimer" + page footer
 *
 * The pass-1 IMPORTANT NOTICE block (which consumed ~45% of the cover) is
 * removed entirely; the full disclaimer body lives only in §7.
 */
export async function renderCover(doc, exportContext) {
  const state = exportContext?.reportState || {};
  const params = exportContext?.reportParams || {};
  const taxLaw = exportContext?.reportTaxLaw || {};
  const fingerprint = exportContext?.reportFingerprint || "no-fingerprint";

  paintPageBg(doc);
  const iW = IW;
  const cx = PAGE.width / 2;
  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  const [pR, pG, pB] = hexToRgb(LIGHT_PALETTE.panel);
  const [lnR, lnG, lnB] = hexToRgb(LIGHT_PALETTE.line);
  const [accR, accG, accB] = hexToRgb(LIGHT_PALETTE.teal);
  const [goldR, goldG, goldB] = hexToRgb(LIGHT_PALETTE.gold);

  // A.1 Title block (centred, top third)
  _sB(doc, _BLD, 26, tR, tG, tB);
  doc.text("Retirement Corpus & Income Planner", cx, 110, { align: "center" });
  _sB(doc, _NRM, 12, mR, mG, mB);
  doc.text("Indian retirement corpus and income planning", cx, 134, { align: "center" });
  _sS(doc, 10);
  doc.text(`v${_appVersion}`, cx, 152, { align: "center" });

  // A.2 Brand identity bar — 2pt teal rule with a 60pt gold accent segment.
  // Centred 240pt wide. Stribog brand kit Phase 4 palette (teal #2f9ca8 + gold).
  const barY = 174;
  const barW = 240;
  const barX = cx - barW / 2;
  _sI(doc, accR, accG, accB);
  doc.rect(barX, barY, barW, 2, "F");
  _sI(doc, goldR, goldG, goldB);
  doc.rect(cx - 30, barY, 60, 2, "F");

  // A.3 Metadata block (small, subtle, centred)
  _sB(doc, _NRM, 9, mR, mG, mB);
  doc.text(`Generated: ${new Date().toISOString()}`, cx, 196, { align: "center" });
  doc.text(`Fingerprint: ${fingerprint}`, cx, 210, { align: "center" });

  // A.4 Plan inputs at a glance — clean 2-column key/value block.
  const factRows = buildPlanFactRows({ state, params, taxLaw });
  const factPanelY = 234;
  const factRowsPerCol = Math.ceil(factRows.length / 2);
  const factRowH = 22;
  const factPanelH = 30 + factRowsPerCol * factRowH + 14;
  _sI(doc, pR, pG, pB);
  _sDLW(doc, lnR, lnG, lnB, 0.5);
  doc.roundedRect(PAGE.marginLeft, factPanelY, iW, factPanelH, 8, 8, "FD");
  _sB(doc, _BLD, 9, mR, mG, mB);
  doc.text("PLAN INPUTS AT A GLANCE", PAGE.marginLeft + 14, factPanelY + 20);
  // Two equal columns; within each, fixed label-column width for tabular alignment.
  const colW = (iW - 28) / 2;
  const labelW = Math.round(colW * 0.55);
  factRows.forEach((pair, idx) => {
    const col = idx < factRowsPerCol ? 0 : 1;
    const rowInCol = col === 0 ? idx : idx - factRowsPerCol;
    const colX = PAGE.marginLeft + 14 + col * colW;
    const rowY = factPanelY + 40 + rowInCol * factRowH;
    _sB(doc, _NRM, 9, mR, mG, mB);
    doc.text(String(pair[0]), colX, rowY);
    _sF(doc, _BLD);
    _sT(doc, tR, tG, tB);
    doc.text(String(pair[1]), colX + labelW, rowY, { maxWidth: colW - labelW - 8 });
  });

  // A.5 Plan health signal CHIPS — filled rounded pills with mood-keyed BACKGROUND.
  // Mood colours mirror src/styles.css :root tokens (growth=teal, tax=coral,
  // warning=gold, income=blue). Each chip is its own rectangle with white bold
  // label inside; not the pass-1 band+label legend.
  const chipsY = factPanelY + factPanelH + 28;
  _sB(doc, _NRM, 8, mR, mG, mB);
  doc.text("Plan health signal channels (mirror of live decision-cockpit indicators):",
    PAGE.marginLeft, chipsY);
  const chipDefs = [
    [LIGHT_PALETTE.growth,  "GROWTH"],
    [LIGHT_PALETTE.tax,     "TAX"],
    [LIGHT_PALETTE.warning, "WARN"],
    [LIGHT_PALETTE.income,  "INCOME"],
  ];
  const chipGap = 10;
  const chipW = (iW - chipGap * 3) / 4;
  const chipH = 22;
  const chipTopY = chipsY + 10;
  chipDefs.forEach(([hex, label], i) => {
    const [r, g, b] = hexToRgb(hex);
    const x = PAGE.marginLeft + i * (chipW + chipGap);
    _sI(doc, r, g, b);
    _sD(doc, r, g, b);
    doc.roundedRect(x, chipTopY, chipW, chipH, 6, 6, "F");
    _sB(doc, _BLD, 9, 255, 255, 255);
    doc.text(label, x + chipW / 2, chipTopY + chipH / 2 + 3, { align: "center" });
  });

  // A.7 Pointer line at the bottom — disclaimer body lives in §7.
  _sB(doc, "italic", 9, mR, mG, mB);
  doc.text("See §7 for the full disclaimer and Important Notice.",
    cx, PAGE.height - PAGE.marginBottom - 24, { align: "center" });
}

/** §2 Decision Workspace summary — Income Cover, Plan Endurance, Target Confidence, Gap tile. */
export async function renderDecisionSummary(doc, exportContext) {
  _newPage(doc);

  const section = SECTIONS[1];
  drawSectionHeading(doc, section);

  const state = exportContext?.reportState || {};
  const params = exportContext?.reportParams || {};
  const model = exportContext?.reportModel || { final: {}, rows: [] };
  const mc = exportContext?.reportMc || {};
  const household = exportContext?.reportHousehold || {};
  const requiredReturnForCash = exportContext?.reportRequiredReturnForCash;
  const maxMonthlyCash = Number(exportContext?.reportMaxMonthlyCash) || 0;
  const final = model.final || {};
  const horizonYears = Math.max(1, Math.round(Number(params.years) || 0));
  const inflationFactor = Math.pow(1 + (Number(state.inflation) || 0) / 100, horizonYears);
  const targetAnnualFinal = targetAnnualCashForYear(params, horizonYears, inflationFactor) || 0;
  const cashRatio = targetAnnualFinal > 0 ? (final.withdrawal || 0) / targetAnnualFinal : 1;
  const targetCorpusReal = household.useHouseholdPlan ? household.targetCorpusToday : (Number(state.targetCorpus) || 0);
  const realCorpusGap = Math.max(0, targetCorpusReal - (final.realClosing || 0));
  const monthlyCashGap = Math.max(0, targetAnnualFinal - (final.withdrawal || 0)) / 12;
  const corpusRatio = targetCorpusReal > 0 ? (final.realClosing || 0) / targetCorpusReal : 1;

  // R4.9.5b verdict variant resolution — mirrors src/main.jsx:3925-3935 + 4055-4079.
  // R4.9.5g fin-c96.11: prefer the precomputed verdict booleans passed in
  // through exportContext (built at src/main.jsx exportPdf() with the
  // identical signal set the live UI uses). Fallback covers test contexts
  // that don't carry the precomputed flags.
  const successProbability = Number(mc.successProbability) || 0;
  const verdict = exportContext?.reportVerdict || null;
  const hasCashShortfall = verdict
    ? Boolean(verdict.hasCashShortfall)
    : (String(state.cashMode) === "monthlyTarget" && monthlyCashGap > 1);
  const hasCashStress = verdict
    ? Boolean(verdict.hasCashStress)
    : hasCashShortfall || (state.cashMode === "monthlyTarget" && final.closing <= 1);
  // Verdict mood + headline delegated to pure helpers (R4.9.5g R4-Q14
  // refactor — hoisted out for honest unit testing).
  const planMood = buildVerdictMood({ hasCashStress, cashRatio, corpusRatio, successProbability });
  const verdictHeadline = buildVerdictHeadline(planMood);

  // Verdict band
  const verdictY = PAGE.headingY + 30;
  const verdictAccent = planMood === "strong" ? LIGHT_PALETTE.success
    : planMood === "watch" ? LIGHT_PALETTE.warning
      : LIGHT_PALETTE.coral;
  const [vR, vG, vB] = hexToRgb(verdictAccent);
  const [pR, pG, pB] = hexToRgb(LIGHT_PALETTE.panel);
  const [lR, lG, lB] = hexToRgb(LIGHT_PALETTE.line);
  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  const verdictW = IW;
  const verdictH = 60;
  _sI(doc, pR, pG, pB);
  _sD(doc, lR, lG, lB);
  doc.roundedRect(PAGE.marginLeft, verdictY, verdictW, verdictH, 6, 6, "FD");
  _sI(doc, vR, vG, vB);
  doc.rect(PAGE.marginLeft, verdictY, 4, verdictH, "F");
  // D9 H2 heading
  drawH2Heading(doc, "CAN THIS PLAN WORK?", PAGE.marginLeft + 14, verdictY + 18);
  _sB(doc, _NRM, 12, tR, tG, tB);
  doc.text(verdictHeadline, PAGE.marginLeft + 14, verdictY + 40, {
    maxWidth: verdictW - 24,
  });

  // Tile display values
  const enduranceDisplay = formatProbabilityForDisplay(mc.enduranceProbability, mc.enduranceMargin95);
  const successDisplay = formatProbabilityForDisplay(mc.successProbability, mc.successMargin95);
  const incomeCoverPct = `${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`;
  const incomeDetail = buildIncomeDetail({ withdrawal: final.withdrawal || 0, targetAnnualFinal });
  const mcSamples = mc.simulations || 0;
  const mcSeed = mc.seed != null ? mc.seed : "n/a";
  const enduranceDetail = buildEnduranceDetail({ marginText: enduranceDisplay.marginText, mcSamples, mcSeed });
  const targetCorpusNominal = targetCorpusReal * inflationFactor;
  const mcFinals = Array.isArray(mc.finals) ? mc.finals : [];
  const mcP50 = mcFinals.length > 0 ? quantile(mcFinals, 0.5) : 0;
  const successDetail = buildSuccessDetail({ marginText: successDisplay.marginText, mcP50, targetCorpusNominal, mcSamples });

  // R4.9.5h Pass-2 D7 — switch to 2×2 tile grid (was 1×4 strip). The wider
  // tile gives the primary value room to breathe at 20pt without colliding
  // with the detail line, and lets us add a chip badge in the bottom-right.
  const cardsY = verdictY + verdictH + 16;
  const cardGap = 10;
  const cardW = (verdictW - cardGap) / 2;
  const cardH = 90;

  const enduranceMood = confidenceMoodBucket(mc.enduranceProbability, mcSamples);
  const successMood = confidenceMoodBucket(mc.successProbability, mcSamples);
  const enduranceMoodColours = TILE_MOOD_COLOURS[enduranceMood];
  const successMoodColours = TILE_MOOD_COLOURS[successMood];

  // Four tile definitions. INCOME COVER uses the fixed blue mood; TAX DRAG uses
  // the fixed orange mood; PLAN ENDURANCE / TARGET CONFIDENCE flex with the MC.
  const tiles = [
    { label: "INCOME COVER",     value: incomeCoverPct,            detail: incomeDetail,    mood: "income" },
    { label: "PLAN ENDURANCE",   value: enduranceDisplay.primary,  detail: enduranceDetail, mood: enduranceMood,
      badge: { label: enduranceMoodColours.label, fillHex: enduranceMoodColours.chip } },
    { label: "TARGET CONFIDENCE", value: successDisplay.primary,    detail: successDetail,   mood: successMood,
      badge: { label: successMoodColours.label, fillHex: successMoodColours.chip } },
    { label: "TAX DRAG",         value: money(final.cumTax || 0),  detail: `${money(final.cumInterest || 0)} gross growth`, mood: "tax" },
  ];

  // Draw the 2×2 grid using jsPDF primitives (no html2canvas — pass-1 attempt
  // produced text-y output and overflow defects per owner reality-check).
  tiles.forEach((tile, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const tX = PAGE.marginLeft + col * (cardW + cardGap);
    const tY = cardsY + row * (cardH + cardGap);
    drawDecisionTile(doc, tX, tY, cardW, cardH, tile);
  });

  // §15.2.5 a11y sibling table — D24 Pass-2 Dispatch 3 fix: relocated to
  // Appendix A at the document tail instead of rendering inline below the
  // tile boxes (owner reality-check flagged the inline placement as visible
  // duplication). The collected table carries the original full-fidelity
  // detail strings so screen-reader users still see the complete sentence
  // even when the visual tile body truncates.
  const tileRowsForTable = tiles.map((t) => [t.label, t.value, t.detail]);
  collectA11yAppendixTable(exportContext, {
    title: "Table A.1 — §2 Decision Workspace tile mirror",
    sourceLabel: "Mirrors the four decision tiles on the §2 page (Income Cover / Plan Endurance / Target Confidence / Tax Drag).",
    head: [["Metric", "Value", "Detail"]],
    body: tileRowsForTable,
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 80 } },
  });

  let topup = 0;
  try {
    topup = solveTopup(params) || 0;
  } catch {
    topup = 0;
  }
  const safeMonthlyCashTarget = Number.isFinite(maxMonthlyCash) && maxMonthlyCash > 0
    ? Math.max(0, roundToStep(maxMonthlyCash, 10000))
    : 0;
  const finalCorpusPct = `${Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%`;

  // 2×2 tile grid bottom = cardsY + 2*cardH + cardGap; gap-panel sits directly
  // below the tile grid. The former §15.2.5 sibling autotable was relocated to
  // Appendix A under D24 (Pass-2 Dispatch 3), so the lastAutoTable fallback
  // no longer fires on this page — `tilesBottom + 18` is the canonical y.
  const tilesBottom = cardsY + 2 * cardH + cardGap;
  const gapY = doc.lastAutoTable?.finalY > tilesBottom ? doc.lastAutoTable.finalY + 12 : tilesBottom + 18;
  const gapH = 110;
  _sI(doc, pR, pG, pB);
  _sD(doc, lR, lG, lB);
  doc.roundedRect(PAGE.marginLeft, gapY, verdictW, gapH, 6, 6, "FD");
  // D9 H2 heading
  drawH2Heading(doc, "CLOSING THE GAP", PAGE.marginLeft + 14, gapY + 18);
  _sB(doc, _NRM, 10, tR, tG, tB);

  if (realCorpusGap > 1 || monthlyCashGap > 1 || topup > 1) {
    const actions = buildGapActions({ topup, safeMonthlyCashTarget, finalCorpusPct });
    actions.forEach((line, idx) => {
      doc.text(line, PAGE.marginLeft + 14, gapY + 40 + idx * 18);
    });
  } else {
    _sT(doc, 0x1f, 0x9f, 0x89); // success
    doc.text("No funding gap — plan covers income and corpus targets.", PAGE.marginLeft + 14, gapY + 40);
  }
  const detailY = gapY + gapH - 22;
  _sB(doc, _NRM, 8, mR, mG, mB);
  const detailParts = buildGapDetailParts({ realCorpusGap, monthlyCashGap, requiredReturnForCash });
  doc.text(detailParts.join("   ·   "), PAGE.marginLeft + 14, detailY, {
    maxWidth: verdictW - 24,
  });
}

/**
 * §3 Plan Diagnosis — three charts (corpus journey, balance composition,
 * projection-statement bars) + a projection summary autotable. Charts are
 * rendered as PNGs via canvas with light theme and accompanied by sibling
 * data tables so screen-reader users get text-extractable equivalents.
 */
export async function renderPlanDiagnosis(doc, exportContext) {
  _newPage(doc);

  const section = SECTIONS[2];
  drawSectionHeading(doc, section);

  const state = exportContext?.reportState || {};
  const params = exportContext?.reportParams || {};
  const model = exportContext?.reportModel || { final: {}, rows: [] };
  const mc = exportContext?.reportMc || {};
  const household = exportContext?.reportHousehold || {};
  const final = model.final || {};
  const principal = Number(state.principal) || 0;
  const horizonYears = Math.max(1, Math.round(Number(params.years) || 0));
  const inflationFactor = Math.pow(1 + (Number(state.inflation) || 0) / 100, horizonYears);
  const targetAnnualFinal = targetAnnualCashForYear(params, horizonYears, inflationFactor) || 0;
  const cashRatio = targetAnnualFinal > 0 ? (final.withdrawal || 0) / targetAnnualFinal : 1;
  const targetCorpusReal = household.useHouseholdPlan ? household.targetCorpusToday : (Number(state.targetCorpus) || 0);
  const corpusRatio = targetCorpusReal > 0 ? (final.realClosing || 0) / targetCorpusReal : 1;
  const taxBurden = (final.cumInterest || 0) > 0 ? (final.cumTax || 0) / final.cumInterest : 0;
  const successDisplay = formatProbabilityForDisplay(mc.successProbability, mc.successMargin95);
  // R4.9.5h Pass-2 Dispatch 5 D25 — MC-pending guard for §3 corpus-journey
  // chart + sibling table (defense-in-depth alongside R4-Q18 export gate).
  const mcPending = mc?.simulations == null || mc.simulations === 0;

  // Chart 1: Corpus journey P10/P50/P90 (rasterized PNG via canvas)
  // mc.p10/p50/p90 are arrays of length years+1
  if (mcPending) {
    renderMcPendingPlaceholder(doc, PAGE.headingY + 28, 200);
  } else {
    const journeyImage = createChartCanvas(
      "Corpus journey (P10 / P50 / P90)",
      "Monte Carlo percentile fan across the full projection horizon.",
      // c8: canvas-context draw callback — never invoked under jsdom because
      // createChartCanvas returns null before the draw function fires. Real
      // canvas rendering covered by Puppeteer in pdf-export-regression.mjs.
      /* c8 ignore start */
      (ctx, box) => {
        const p10 = mc.p10 || [];
        const p50 = mc.p50 || [];
        const p90 = mc.p90 || [];
        const allVals = [...p10, ...p50, ...p90];
        const maxValue = Math.max(1, ...allVals);
        drawChartGrid(ctx, box, maxValue, { horizonYears });
        drawChartLineSeries(ctx, box, p90, CHART_TEAL, { maxValue, fill: true });
        drawChartLineSeries(ctx, box, p50, CHART_BLUE, { maxValue, lineWidth: 6 });
        drawChartLineSeries(ctx, box, p10, CHART_CORAL, { maxValue, dashed: true });
        // D11: annotate scenario depletion points (vertical marker + callout).
        drawDepletionMarkers(ctx, box, buildDepletionCallouts(p10, p50, p90), horizonYears,
          { P90: CHART_TEAL, P50: CHART_BLUE, P10: CHART_CORAL });
        drawChartLegend(ctx, [
          { label: "P90 (optimistic)", color: CHART_TEAL },
          { label: "P50 (median)", color: CHART_BLUE },
          { label: "P10 (downside)", color: CHART_CORAL },
        ], box.left + 460, 180);
      }
      /* c8 ignore stop */
    );
    if (journeyImage) {
      doc.addImage(journeyImage, "PNG", PAGE.marginLeft, PAGE.headingY + 28, IW, 200, undefined, "FAST");
    } else {
      // Headless / test environment fallback — emit a placeholder card.
      const [pR, pG, pB] = hexToRgb(LIGHT_PALETTE.panel);
      const [lR, lG, lB] = hexToRgb(LIGHT_PALETTE.line);
      _sI(doc, pR, pG, pB);
      _sD(doc, lR, lG, lB);
      doc.roundedRect(PAGE.marginLeft, PAGE.headingY + 28, IW, 200, 6, 6, "FD");
    }
  }

  // Sibling data table for the corpus journey chart (a11y surrogate).
  // Sample at decile checkpoints to keep the table compact. Sampling logic
  // delegated to the pure `buildJourneySampleYears` helper (R4.9.5g R4-Q14).
  // D25 guard: when MC pending, render a placeholder instead of the collapsed
  // P10=P50=P90 rows that would otherwise mislead readers.
  if (mcPending) {
    renderMcPendingPlaceholder(doc, PAGE.headingY + 240, 80);
  } else {
    const sampleYears = buildJourneySampleYears(horizonYears);
    const p10Arr = mc.p10 || [];
    const p50Arr = mc.p50 || [];
    const p90Arr = mc.p90 || [];
    const journeyRows = sampleYears.map((y) => [
      `Year ${y}`,
      money(p10Arr[y] || 0),
      money(p50Arr[y] || 0),
      money(p90Arr[y] || 0),
    ]);
    _atDef(doc, {
      head: [["Year", "P10 corpus", "P50 corpus", "P90 corpus"]],
      body: journeyRows,
      startY: PAGE.headingY + 240,
      styles: _AT_STY(8),
    });
  }

  // Chart 2: Balance composition donut (starting / total withdrawn / growth net / final balance)
  _newPage(doc);
  drawSectionHeading(doc, section);

  // R4.9.5g fin-c96.13: mirror the live overview donut at src/main.jsx:6522-6526
  // (LegendRows with Starting principal / Top-ups / Reinvested growth). Previous
  // 4-slice composition (Starting / Withdrawn / Growth / Final balance) was
  // structurally muddled — `final = principal + contributions + growth -
  // withdrawals`, so including final-balance AND withdrawn AND growth AND
  // principal triple-counts flows. The 3-slice partition (principal +
  // contributions + reinvested growth = final closing) is what the live UI shows.
  const finalBalance = final.closing || 0;
  const topUps = final.cumContributions || 0;
  const reinvestedGrowth = Math.max(0, finalBalance - principal - topUps);
  const composition = [
    { label: "Starting principal",  value: principal,         color: CHART_TEAL },
    { label: "Top-ups",             value: topUps,            color: CHART_BLUE },
    { label: "Reinvested growth",   value: reinvestedGrowth,  color: CHART_GOLD },
  ];
  const compositionImage = createChartCanvas(
    "Balance composition",
    "Where the money came from and where it went over the horizon.",
    // c8: canvas-context draw callback for donut renderer — never invoked
    // under jsdom; real canvas rendering covered by Puppeteer in
    // r4.9.5g-pdf-autotable-verify.mjs (donut sibling table verified).
    /* c8 ignore start */
    (ctx, box) => {
      const total = Math.max(1, composition.reduce((sum, item) => sum + (item.value || 0), 0));
      const cx = box.left + 360;
      const cy = box.top + 180;
      let start = -Math.PI / 2;
      composition.forEach((item) => {
        const arc = (Math.PI * 2 * (item.value || 0)) / total;
        ctx.beginPath();
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 70;
        ctx.arc(cx, cy, 140, start, start + arc);
        ctx.stroke();
        start += arc;
      });
      ctx.fillStyle = CHART_TEXT;
      ctx.font = cf(800, 36);
      ctx.textAlign = "center";
      ctx.fillText(formatInr(finalBalance), cx, cy + 6);
      ctx.font = cf(600, 18);
      ctx.fillStyle = CHART_MUTED;
      ctx.fillText("final corpus", cx, cy + 32);
      ctx.textAlign = "left";
      composition.forEach((item, idx) => {
        const yRow = box.top + 60 + idx * 80;
        ctx.fillStyle = item.color;
        ctx.fillRect(box.left + 730, yRow - 18, 22, 22);
        ctx.fillStyle = CHART_TEXT;
        ctx.font = cf(800, 22);
        ctx.fillText(item.label, box.left + 768, yRow);
        ctx.fillStyle = CHART_MUTED;
        ctx.font = cf(600, 20);
        ctx.fillText(formatInr(item.value), box.left + 768, yRow + 28);
      });
    }
    /* c8 ignore stop */
  );
  if (compositionImage) {
    doc.addImage(compositionImage, "PNG", PAGE.marginLeft, PAGE.headingY + 28, IW, 200, undefined, "FAST");
  }

  // Chart 3: Projection statement bar chart (4 bars: Corpus Goal, Cash Goal, End Chance, Tax Drag)
  // Mirrors src/main.jsx:7292-7295 / 7350-7352 StatementRow content.
  // D25: when MC pending, suppress "rare (under 5%)" misleading default and
  // emit explicit pending sentinel + zero-height bar instead.
  const endChanceDisplay = mcPending ? "Pending MC" : successDisplay.primary;
  const endChanceBarValue = mcPending ? 0 : clamp(Number(mc.successProbability) || 0, 0, 1);
  const statementImage = createChartCanvas(
    "Projection statement",
    "Plan health summary — corpus goal hit, cash goal hit, end chance, and tax drag.",
    // c8: canvas-context draw callback for statement-bar renderer — never
    // invoked under jsdom; bar values themselves are verified via the
    // sibling statement-bar autotable in pdf-export-regression.mjs.
    /* c8 ignore start */
    (ctx, box) => {
      const bars = [
        { label: "Corpus Goal", value: clamp(corpusRatio, 0, 1.25), display: `${Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%`, color: CHART_TEAL },
        { label: "Cash Goal",   value: clamp(cashRatio, 0, 1.25), display: `${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`,   color: CHART_CORAL },
        { label: "End Chance",  value: endChanceBarValue, display: endChanceDisplay, color: CHART_BLUE },
        { label: "Tax Drag",    value: clamp(taxBurden, 0, 1), display: formatInr(final.cumTax || 0), color: CHART_GOLD },
      ];
      const maxValue = 1.25;
      // grid (0..125%)
      ctx.strokeStyle = CHART_GRID;
      ctx.fillStyle = CHART_MUTED;
      ctx.font = cf(600, 16);
      for (let i = 0; i <= 5; i++) {
        const yLine = box.top + box.plotHeight - (box.plotHeight * i) / 5;
        ctx.beginPath();
        ctx.moveTo(box.left, yLine);
        ctx.lineTo(box.left + box.plotWidth, yLine);
        ctx.stroke();
        ctx.fillText(`${Math.round((maxValue * i * 100) / 5)}%`, 18, yLine + 6);
      }
      const barWidth = 140;
      const gap = (box.plotWidth - bars.length * barWidth) / (bars.length + 1);
      bars.forEach((bar, idx) => {
        const x = box.left + gap + idx * (barWidth + gap);
        const h = (box.plotHeight * bar.value) / maxValue;
        ctx.fillStyle = bar.color;
        ctx.fillRect(x, box.top + box.plotHeight - h, barWidth, h);
        // label
        ctx.fillStyle = CHART_MUTED;
        ctx.font = cf(700, 18);
        ctx.fillText(bar.label, x, box.top + box.plotHeight + 28);
        // value display
        ctx.fillStyle = CHART_TEXT;
        ctx.font = cf(800, 22);
        ctx.fillText(bar.display, x, box.top + box.plotHeight - h - 14);
      });
    }
    /* c8 ignore stop */
  );
  if (statementImage) {
    doc.addImage(statementImage, "PNG", PAGE.marginLeft, PAGE.headingY + 248, IW, 180, undefined, "FAST");
  }

  // R4.9.5h Pass-2 Dispatch 3 — D24 fix: the donut-composition and
  // projection-statement sibling tables (R4.9.5g fin-c96.6 / R4-Q11 surrogate
  // bundle) are relocated from beneath the §3 charts to Appendix A at the
  // document tail. AT users still get text-extractable equivalents for the
  // rasterised PNG charts via the appendix; sighted readers no longer see
  // the dense duplicate-rows panel below each chart.
  const statementBars = [
    ["Corpus Goal", `${Math.round(clamp(corpusRatio, 0, 9.99) * 100)}%`],
    ["Cash Goal",   `${Math.round(clamp(cashRatio, 0, 9.99) * 100)}%`],
    ["End Chance",  endChanceDisplay],
    ["Tax Drag",    money(final.cumTax || 0)],
  ];
  collectA11yAppendixTable(exportContext, {
    title: "Table A.2 — §3 Balance composition donut",
    sourceLabel: "Mirrors the balance-composition donut chart on the §3 page (Starting principal / Top-ups / Reinvested growth).",
    head: [["Donut composition", "Value"]],
    body: composition.map((item) => [item.label, money(item.value || 0)]),
    columnStyles: { 0: { cellWidth: 240, fontStyle: "bold" }, 1: { halign: "right" } },
  });
  collectA11yAppendixTable(exportContext, {
    title: "Table A.3 — §3 Projection statement bars",
    sourceLabel: "Mirrors the 4-bar projection-statement chart on the §3 page (Corpus Goal / Cash Goal / End Chance / Tax Drag).",
    head: [["Projection statement", "Value"]],
    body: statementBars,
    columnStyles: { 0: { cellWidth: 240, fontStyle: "bold" }, 1: { halign: "right" } },
  });

  // Projection summary autotable — light theme, screen-reader friendly.
  _newPage(doc);
  drawSectionHeading(doc, section);
  _sF(doc, _NRM);
  _sS(doc, 10);
  _sT(doc, ...hexToRgb(LIGHT_PALETTE.muted));
  doc.text("Projection summary — same values that drive the live Decision Workspace.",
    PAGE.marginLeft, PAGE.headingY + 30, { maxWidth: IW });

  // Projection summary body delegated to pure `buildProjectionSummaryRows`
  // helper (R4.9.5g R4-Q14 refactor — hoisted for honest unit testing).
  const summaryRows = buildProjectionSummaryRows({ model, principal });
  _atDef(doc, {
    head: [["Metric", "Value"]],
    body: summaryRows,
    startY: PAGE.headingY + 50,
    styles: _AT_STY(10),
    columnStyles: { 0: { cellWidth: 280 } },
  });
}

/**
 * §4 Tax Path — §87A rebate detail, §74 capital-loss carry-forward, §115BAC
 * basic-exemption setoff, surcharge marginal relief at cliffs, effective
 * yield + tax drag breakdown. Mirrors src/main.jsx:6580-6621 (Tax studio).
 */
export async function renderTaxPath(doc, exportContext) {
  _newPage(doc);

  const section = SECTIONS[3];
  drawSectionHeading(doc, section);

  const state = exportContext?.reportState || {};
  const taxLaw = exportContext?.reportTaxLaw || {};
  const y1Tax = exportContext?.reportY1Tax || {};
  const taxLotSummary = exportContext?.reportTaxLotSummary || {};
  const model = exportContext?.reportModel || { final: {} };
  const final = model.final || {};

  // Provenance band
  const [pR, pG, pB] = hexToRgb(LIGHT_PALETTE.panel);
  const [lR, lG, lB] = hexToRgb(LIGHT_PALETTE.line);
  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  const [aR, aG, aB] = hexToRgb(LIGHT_PALETTE.coral);
  const provY = PAGE.headingY + 24;
  const provW = IW;
  const provH = 56;
  _sI(doc, pR, pG, pB);
  _sD(doc, lR, lG, lB);
  doc.roundedRect(PAGE.marginLeft, provY, provW, provH, 6, 6, "FD");
  _sI(doc, aR, aG, aB);
  doc.rect(PAGE.marginLeft, provY, 4, provH, "F");
  // D9 H2 heading
  drawH2Heading(doc, "TAX RULESET PROVENANCE", PAGE.marginLeft + 14, provY + 18);
  _sB(doc, _NRM, 10, tR, tG, tB);
  doc.text(String(taxLaw.version || "FY 2025-26 / AY 2026-27 baseline"), PAGE.marginLeft + 14, provY + 36);
  _sS(doc, 8);
  _sT(doc, mR, mG, mB);
  doc.text(`Source: ${taxLaw.source || "FA-2025 / CBDT Oct 2024 / ITA-1961"} · Updated ${taxLaw.updatedOn || "n/a"}`,
    PAGE.marginLeft + 14, provY + 50);

  // 87A / §74 / §115BAC mini-grid (a11y: autotable sibling)
  // §87A rebate cap — read from taxLaw.rebates.new.threshold and rebateUsed
  const rebateThreshold = (taxLaw.rebates && taxLaw.rebates.new && taxLaw.rebates.new.threshold) || 0;
  const rebateUsed = y1Tax.rebateUsed || 0;
  const basicExemption = y1Tax.basicExemptionUsed || 0;
  const section80TTB = y1Tax.section80TTBUsed || 0;
  const surcharge = y1Tax.surcharge || 0;
  const marginalRelief = y1Tax.marginalRelief || 0;
  const slabIncomeTax = y1Tax.normalTax || 0;
  const specialTax = y1Tax.specialTax || 0;
  const totalRelief = rebateUsed + basicExemption + section80TTB;

  // R4.9.5h Pass-2 Dispatch 5 D26 — citation polish: shrink Lever 150→130 +
  // Value 140→125 to widen citation col (35pt), expand "Yr1"/"8yr FIFO pool"/
  // "50L/1Cr/2Cr/5Cr cliffs" abbreviations to readable statutory phrasing.
  const taxFactsRows = [
    ["§87A rebate (new regime)", `Threshold ${money(rebateThreshold)} · Used ${money(rebateUsed)}`, "ITA-1961 §87A; FA-2025; CBDT Oct-2024 §87A/special-rate interaction."],
    ["§115BAC basic exemption", money(basicExemption), "ITA-1961 §115BAC; new-regime Year-1 row."],
    ["§80TTB deduction", money(section80TTB), `ITA-1961 §80TTB; cap ${money((taxLaw.deductions?.section80TTB?.max)||0)}`],
    ["§74 capital-loss carry-forward", `Gain ${money(taxLotSummary.realizedGain||0)} · Exempt ${money(taxLotSummary.exemptionUsed||0)}`, "ITA-1961 §74; 8-year FIFO carry-forward pool."],
    ["Slab vs special-rate (Year 1)", `Slab ${money(slabIncomeTax)} · Special ${money(specialTax)}`, "§111A(STCG)/§112A(LTCG); outside §87A."],
    ["Surcharge / marginal relief", `${money(surcharge)} / ${money(marginalRelief)}`, "FA-2025; marginal relief at INR 50L / 1Cr / 2Cr / 5Cr surcharge cliffs."],
    ["Total Year-1 relief", money(totalRelief), "§87A + §115BAC + §80TTB for Year 1."],
  ];

  _atDef(doc, {
      head: [["Lever", "Value (Year 1)", "Statutory citation"]],
      body: taxFactsRows,
      startY: provY + provH + 12,
      styles: _AT_STY(8, 1),
      columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 125 } },


  });

  // Surcharge cliffs callout
  const cliffY = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : provY + provH + 200) + 12;
  // D9 H2 heading
  drawH2Heading(doc, "SURCHARGE CLIFFS (FA-2025 FIRST SCHEDULE)", PAGE.marginLeft, cliffY);
  _sB(doc, _NRM, 9, tR, tG, tB);
  const cliffLines = [
    "INR 50L / 1Cr / 2Cr / 5Cr — marginal relief prevents incremental tax exceeding income just above each cliff.",
    "Equity LTCG/STCG: separate 15% surcharge cap (ITA-1961 §112A(8)/FA-2023), any regime.",
  ];
  cliffLines.forEach((ln, idx) => {
    doc.text(ln, PAGE.marginLeft, cliffY + 18 + idx * 14, {
      maxWidth: IW,
    });
  });

  // Effective yield + tax drag breakdown
  _newPage(doc);
  drawSectionHeading(doc, section);
  _sB(doc, _NRM, 10, mR, mG, mB);
  doc.text("Effective yield and tax drag — cumulative across the horizon.",PAGE.marginLeft,PAGE.headingY+30,{maxWidth:IW});
  const grossGrowth = final.cumInterest || 0;
  const taxPaid = final.cumTax || 0;
  const netGrowth = Math.max(0, grossGrowth - taxPaid);
  const taxBurden = grossGrowth > 0 ? taxPaid / grossGrowth : 0;
  const yieldRows = [
    ["Effective yield (modelled)", typeof model.effYield === "number" ? formatPct(model.effYield) : "N/A"],
    ["Gross growth (cumulative)", money(grossGrowth)],
    ["Tax paid (cumulative)", money(taxPaid)],
    ["Net growth after tax", money(netGrowth)],
    ["Tax burden (tax / gross growth)", formatPct(taxBurden)],
    ["Tax-lot method", String(model.taxLotMethod || "n/a")],
    ["Cost capital recovered (SWP)", money(taxLotSummary.capitalRecovered || 0)],
    ["Tax profile", taxProfileLabel(state) || "n/a"],
    ["Equity product", state.useAssetReturns === 1 ? productClassLabel(state.equityProductClass) : "n/a (manual return mode)"],
    ["Debt product", state.useAssetReturns === 1 ? productClassLabel(state.debtProductClass) : "n/a (manual return mode)"],
  ];
  _atDef(doc, {
      head: [["Metric", "Value"]],
      body: yieldRows,
      startY: PAGE.headingY + 50,
      styles: _AT_STY(10),
      columnStyles: { 0: { cellWidth: 280 } },

  });
}

/**
 * §5 Scenarios — Active / Income / Growth / Stress side-by-side. Uses the
 * scenarios array supplied in exportContext.reportScenarios (built upstream
 * with the same SCENARIOS spec as src/main.jsx:4109-4150). If unavailable,
 * renders only the Active scenario from the projection model.
 */
export async function renderScenarios(doc, exportContext) {
  _newPage(doc);

  const section = SECTIONS[4];
  drawSectionHeading(doc, section);
  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  _sB(doc, _NRM, 10, mR, mG, mB);
  doc.text("Active/Income/Growth/Stress — same scenario logic as the live app Overview strip.",PAGE.marginLeft,PAGE.headingY+30,{maxWidth:IW});

  // Scenario rows delegated to the pure `buildScenarioRows` helper at the
  // top of this file (R4.9.5g R4-Q14 refactor — hoisted out for honest
  // unit testing). Tooltip copy lives in the exported SCENARIO_TOOLTIPS
  // map; depletion-annotation precedence in buildScenarioRow.
  const scenarioRows = buildScenarioRows(exportContext?.reportScenarios);

  _atDef(doc, {
      head: [["Scenario", "Final (nominal)", "Final (real-today)", "Cash ratio", "Depletion", "Description"]],
      body: scenarioRows,
      startY: PAGE.headingY + 50,
      styles: _AT_STY(9, 1),
      columnStyles: {
        0: { cellWidth: 60, fontStyle: "bold" },
        1: { cellWidth: 75 },
        2: { cellWidth: 75 },
        3: { cellWidth: 50 },
        4: { cellWidth: 90 },
      },


  });

  // Per-scenario one-line summaries beneath the table.
  let summaryY = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : PAGE.headingY + 200) + 18;
  // D9 H2 heading
  drawH2Heading(doc, "READ ACROSS THE SCENARIO STRIP", PAGE.marginLeft, summaryY);
  summaryY += 16;
  _sB(doc, _NRM, 9, tR, tG, tB);
  [
    "Active = today's plan; Income/Growth/Stress are bounded variations.",
    "Strong (corpus > real target, cash >= target) · Watch (85-99%) · Gap (below).",
    "Depleted = 'Plan depleted at year N' where N is first close-to-zero annual row.",
  ].forEach((ln,i)=>doc.text(ln,PAGE.marginLeft,summaryY+i*14,{maxWidth:IW}));
}

/* === §6 — month-by-month cash flow ledger ================================ */

/**
 * §6 Month-by-month Cash Flow Ledger — paginated jspdf-autotable rendering
 * of the Q-LEDGER-MONTHLY relation (audit/round-3/02-spec.md §3097-3164).
 *
 * Source-of-truth: `buildMonthlyLedger(report, params)` in src/model.js. We
 * do NOT re-derive the schema here — every cell is a passthrough from the
 * pure helper. The helper guarantees INV-L01 (accounting identity),
 * INV-L04 (row count = 12T unconditionally), INV-L05 (annual reconciliation),
 * and the R4-Q12 owner-resolved conventions (uniform tax/12 in Interest/IDCW,
 * month-12 contribution credit, all-zero pad post-depletion).
 *
 * Column set (10 of the 16 schema fields — the most useful for reading;
 * the full 16-field row is preserved in the R4.9.5h CSV export):
 *   1.  Month#         — month_index (1..12T)
 *   2.  Year           — year_index  (1..T)
 *   3.  Age            — age (floored years)
 *   4.  Opening        — opening_balance (INR nominal)
 *   5.  W/d (nom)      — withdrawal_nominal
 *   6.  W/d (real)     — withdrawal_real_today  (Year-0 purchasing power)
 *   7.  Growth         — growth_nominal
 *   8.  Tax            — tax_nominal
 *   9.  Closing        — closing_balance
 *  10.  Scenario       — scenario_marker (always "active" in the PDF)
 *
 * Visual conventions:
 *   - Year-end rows (`month_within_year === 12`): faint light-gray shade
 *     + bold text. Marks the year reconciliation boundary.
 *   - Final-year row (`year_index === T && month_within_year === 12`):
 *     additional top border + slightly darker shade. Marks the
 *     reportFinal handoff (INV-L06).
 *   - Theme "plain" — explicit control over row styling via didParseCell.
 *   - 8pt font + tight padding — fits ~30 rows/page comfortably; header
 *     repeats on every page via autotable's `showHead: 'everyPage'`.
 *
 * Page header re-emission (`didDrawPage` hook): top-left "§6 Month-by-month
 * cash flow ledger", top-right fingerprint, subtitle below — so a reader
 * landing on page 17 still knows which section + which plan.
 */
export async function renderMonthlyLedger(doc, exportContext) {
  _newPage(doc);

  const section = SECTIONS[5];
  drawSectionHeading(doc, section);

  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  _sB(doc, _NRM, 10, mR, mG, mB);
  doc.text("Nominal INR unless marked real-today. Year-end rows shaded; final-year row marked.",PAGE.marginLeft,PAGE.headingY+28,{maxWidth:IW});

  // Build the ledger via the pure helper. No re-derivation in pdf-report.js.
  const reportModel = exportContext?.reportModel || { rows: [], monthlyRows: [] };
  const reportParams = exportContext?.reportParams || { years: 0 };
  let ledger = [];
  try {
    ledger = buildMonthlyLedger(reportModel, reportParams, { scenarioMarker: "active" });
  /* c8 ignore start */
  // c8: buildMonthlyLedger defensive catch — buildMonthlyLedger is a pure
  // helper with 26 Vitest invariant tests at tests/monthly-ledger.test.jsx
  // and never throws on the schema-compliant input shapes the live app
  // emits. This catch is a structural safety net for malformed upstream
  // reports; reachable only when a regression in calculate() emits a
  // non-conforming row array. No honest test path exists without mocking
  // buildMonthlyLedger to throw, which would be eyewash per Eco discipline.
  } catch (err) {
    ledger = [];
    _sF(doc, _BLD);
    _sS(doc, 10);
    _sT(doc, ...hexToRgb(LIGHT_PALETTE.danger));
    doc.text(
      `Monthly ledger unavailable: ${String(err && err.message || err)}`,
      PAGE.marginLeft,
      PAGE.headingY + 56,
    );
    return;
  }
  /* c8 ignore stop */

  const horizonYears = Math.round(Number(reportParams?.years) || 0);

  if (ledger.length === 0) {
    _sB(doc, _NRM, 10, mR, mG, mB);
    doc.text("(No projection rows — supply reportModel + reportParams.)",PAGE.marginLeft,PAGE.headingY+56);
    return;
  }

  // Body rows — schema → display strings. Numeric columns are right-aligned
  // by columnStyles below; we keep strings here so autotable does not try to
  // reformat. money() = formatInr with "INR " prefix swap (ASCII-safe).
  const body = ledger.map((row) => [
    String(row.month_index),
    String(row.year_index),
    String(row.age),
    money(row.opening_balance || 0),
    money(row.withdrawal_nominal || 0),
    money(row.withdrawal_real_today || 0),
    money(row.growth_nominal || 0),
    money(row.tax_nominal || 0),
    money(row.closing_balance || 0),
    String(row.scenario_marker || "active"),
  ]);

  const fingerprintRaw = String(exportContext?.reportFingerprint || "no-fingerprint");
  const fingerprintShort = fingerprintRaw.length > 22 ? fingerprintRaw.slice(0, 19) + "..." : fingerprintRaw;

  // D8: year-end shade promoted panel2→panel3 for luminance contrast
  const yearEndFill = hexToRgb(LIGHT_PALETTE.panel3);
  const finalYearFill = hexToRgb(LIGHT_PALETTE.panel3);
  const finalYearBorder = hexToRgb(LIGHT_PALETTE.lineStrong);
  const [hbR, hbG, hbB] = hexToRgb(LIGHT_PALETTE.bg2);

  const cp4 = { top: 4, right: 4, bottom: 4, left: 4 };
  const cR = (cellWidth) => ({ halign: "right", cellWidth });
  _atDef(doc, {
    head: [["Month#", "Year", "Age", "Opening", "W/d (nom)", "W/d (real)",
      "Growth", "Tax", "Closing", "Scenario"]],
    body,
    // Start below the section heading + subtitle on page 1.
    startY: PAGE.headingY + 48,
    showHead: "everyPage",
    styles: { ..._AT_STY(8, 1), cellPadding: cp4, lineWidth: 0 },
    headStyles: { ..._AT_HEAD(), fillColor: [hbR, hbG, hbB], halign: "right", cellPadding: cp4 },
    alternateRowStyles: { fillColor: hexToRgb(LIGHT_PALETTE.panel) },
    columnStyles: {
      0: cR(36), 1: cR(30), 2: cR(28), 3: cR(70), 4: cR(60),
      5: cR(60), 6: cR(60), 7: cR(50), 8: cR(70),
      9: { halign: "left", cellWidth: 50 },
    },
    margin: {
      top: PAGE.marginTop + 26, // D15: 86pt (was 128pt)
      left: PAGE.marginLeft, right: PAGE.marginRight,
      bottom: PAGE.marginBottom + 6,
    },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = ledger[data.row.index];
        if (!row) return;
        const isYearEnd = row.month_within_year === 12;
        const isFinalYear = isYearEnd && row.year_index === horizonYears;
        if (isFinalYear) {
          data.cell.styles.fillColor = finalYearFill;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = hexToRgb(LIGHT_PALETTE.text);
              data.cell.styles.lineColor = finalYearBorder;
          data.cell.styles.lineWidth = { top: 0.8, right: 0, bottom: 0, left: 0 };
        } else if (isYearEnd) {
          // D8: panel3 fill + 0.5pt border
          data.cell.styles.fillColor = yearEndFill;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.lineColor = hexToRgb(LIGHT_PALETTE.line);
          data.cell.styles.lineWidth = { top: 0.5, right: 0, bottom: 0, left: 0 };
        }
      },
      // Re-emit section header on continuation pages (willDrawPage fires before content).
      // Page 1 already carries the full SECTION 6 heading via
      // drawSectionHeading() above, so we skip the banner there.
      willDrawPage: (data) => {
        if (data.pageNumber === 1) return;
        // Background wash to match the section.
        paintPageBg(doc);
        // Compact continuation banner.
        const [bnR, bnG, bnB] = hexToRgb(LIGHT_PALETTE.teal);
        _sB(doc, _BLD, 9, bnR, bnG, bnB);
        doc.text("§6 MONTH-BY-MONTH CASH FLOW LEDGER (CONT.)", PAGE.marginLeft, 36);
        const [bnMR, bnMG, bnMB] = hexToRgb(LIGHT_PALETTE.muted);
        _sB(doc, _NRM, 8, bnMR, bnMG, bnMB);
        const fpLabel = `Plan ${fingerprintShort}`;
        const fpWidth = doc.getTextWidth(fpLabel);
        doc.text(fpLabel, PAGE.width - PAGE.marginRight - fpWidth, 36);
        // Hairline beneath the banner.
        const [lR, lG, lB] = hexToRgb(LIGHT_PALETTE.line);
        _sDLW(doc, lR, lG, lB, 0.5);
        doc.line(PAGE.marginLeft, 42, PAGE.width - PAGE.marginRight, 42);
      },


  });

  // Tail-of-section interpretation note (one short paragraph beneath the
  // last page of the ledger, only if there is room — otherwise autotable
  // will already be on a new page and we just add a small footnote).
  const lastY = (doc.lastAutoTable && doc.lastAutoTable.finalY) || PAGE.headingY + 48;
  if (lastY < PAGE.height - PAGE.marginBottom - 60) {
    _sB(doc, "italic", 8, mR, mG, mB);
    doc.text(
      `Ledger contains ${ledger.length} rows (= ${horizonYears} years × 12 months). ` +
        "Year-end rows reconcile to the annual projection (Q-LEDGER-MONTHLY INV-L05). " +
        "Final-year closing balance equals reportFinal.nominal (INV-L06).",
      PAGE.marginLeft,
      lastY + 18,
      { maxWidth: IW },
    );
  }
}

/* === §7 — methodology + full archival disclaimer ========================== */

/**
 * §7 Methodology + Disclaimer.
 *
 * Methodology page (~1 page):
 *   - Monte Carlo sample count + seed (pulled from exportContext.reportMc).
 *   - Regime model description (lognormal stochastic + regime-switching fat
 *     tail vs normal — cf. src/model.js Monte Carlo runner; spec citation
 *     audit/round-3/02-spec.md Q-MC and Q-MC-ENDURANCE).
 *   - Tax law version (taxLaw.version + FA-2025 / AY 2026-27 baseline; cites
 *     §87A FY 2025-26, §115BAC new regime default, §74 8-year carry-forward
 *     — same facts already enumerated in §4; §7 references rather than
 *     duplicates).
 *   - Scenario library version + names — Active / Income / Growth / Stress
 *     per src/model.js:228-233. Fingerprint is the count + ordered names.
 *
 * Disclaimer page (1-2 pages):
 *   - The FULL DISCLAIMER.md content (verbatim). The §1 cover already carries
 *     the abridged DisclaimerNotice modal copy — §7 carries the archival full
 *     text. Source comes from `exportContext.disclaimerFullText` (extended in
 *     src/main.jsx). On callsites that don't pass it, a one-line note tells
 *     the reader where the canonical text lives.
 *   - MIT license attribution (LICENSE one-liner — no full MIT body in PDF).
 *   - PDF/UA honesty disclaimer (jspdf cannot emit a true PDF/UA structure
 *     tree; data tables ship alongside every chart as a11y surrogates — full
 *     PDF/UA support tracked under R5 / fin-9oj).
 */
export async function renderMethodology(doc, exportContext) {
  _newPage(doc);

  const section = SECTIONS[6];
  drawSectionHeading(doc, section);

  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  const [pR, pG, pB] = hexToRgb(LIGHT_PALETTE.panel);
  const [lR, lG, lB] = hexToRgb(LIGHT_PALETTE.line);
  // Content width + right edge — reused across §7 text, rules, and disclaimer.
  const rightEdge = PAGE.width - PAGE.marginRight;
  const discMaxWidth = rightEdge - PAGE.marginLeft;
  // Shared autotable config fragments (methodology facts + disclaimer pipe table).
  const tblMargin = _AT_MARG();
  const tblStyles = _AT_STY(9);
  const tblHead = { fontStyle: _BLD, textColor: [mR, mG, mB] };
  // Shared full-width horizontal rule (banner underlines + markdown --- rules).
  /* c8 ignore next */
  const hr = (y, w) => { _sD(doc, lR, lG, lB); _sLW(doc, w); doc.line(PAGE.marginLeft, y, rightEdge, y); };
  // Compression: route the local txt to the module-level _sB triplet helper.
  // Shared font/size/color setter — collapses repeated 3-call jspdf sequences.
  /* c8 ignore next */
  const txt = (style, size, r, g, b) => _sB(doc, style, size, r, g, b);

  // ── Methodology facts table ────────────────────────────────────────────
  const mc = exportContext?.reportMc || {};
  const taxLaw = exportContext?.reportTaxLaw || {};
  // Scenario library: names come from reportScenarios if available, else the
  // canonical fallback (which mirrors src/model.js:228-233).
  const scenarioNames = Array.isArray(exportContext?.reportScenarios) && exportContext.reportScenarios.length > 0
    ? exportContext.reportScenarios.map((s) => s.name || "Scenario")
    : METHODOLOGY_SCENARIO_NAMES;

  txt("normal", 10, mR, mG, mB);
  doc.text("How the numbers are produced. Citations point to the spec.",PAGE.marginLeft,PAGE.headingY+28,{maxWidth:discMaxWidth});

  // Methodology rows delegated to the pure `buildMethodologyFactsRows`
  // helper (R4.9.5g R4-Q14 refactor — hoisted out for honest unit testing).
  const methodologyRows = buildMethodologyFactsRows({ mc, taxLaw, scenarioNames });

  _atDef(doc, {
    head: [["Component", "Value", "Source / citation"]],
    body: methodologyRows,
    startY: PAGE.headingY + 50,
    styles: { ..._AT_STY(9, 1), cellPadding: { vertical: 4, horizontal: 5 } },
    columnStyles: { 0: { cellWidth: 90, fontStyle: _BLD }, 1: { cellWidth: 170 } },
  });

  // PDF/UA honesty disclaimer beneath the methodology table.
  const facteyY = ((doc.lastAutoTable || {}).finalY || PAGE.headingY + 200) + 18;
  // D9 H2 heading
  drawH2Heading(doc, "ACCESSIBILITY POSTURE", PAGE.marginLeft, facteyY);
  txt("normal", 8.5, tR, tG, tB);
  const a11yLines = [
    "This PDF is not claimed as PDF/UA compliant. jspdf cannot emit a true PDF/UA structure tree.",
    "What is provided: doc.setProperties (Title / Subject / Author / Keywords / Creator), catalog /Lang=en-IN,",
    "PDF outline bookmarks for §1-§7, and sibling data tables alongside every rasterised chart so screen-reader",
    "users get text-extractable equivalents. Full PDF/UA support is tracked under R5 (fin-9oj).",
  ];
  a11yLines.forEach((ln, idx) => {
    doc.text(ln, PAGE.marginLeft, facteyY + 14 + idx * 12, {
      maxWidth: discMaxWidth,
    });
  });

  // ── Full disclaimer page(s) ─────────────────────────────────────────────
  _newPage(doc);

  // Section continuation banner — §7 continues with the archival disclaimer.
  const [bnR, bnG, bnB] = hexToRgb(LIGHT_PALETTE.teal);
  txt("bold", 10, bnR, bnG, bnB);
  doc.text("§7 METHODOLOGY — FULL DISCLAIMER (ARCHIVAL)", PAGE.marginLeft, PAGE.headingY - 18);
  txt("bold", 16, tR, tG, tB);
  doc.text("DISCLAIMER", PAGE.marginLeft, PAGE.headingY);
  hr(PAGE.headingY + 8, 0.5);

  // Subtitle pointing at the source-of-truth file and explaining the §1/§7 split.
  txt("normal", 9, mR, mG, mB);
  doc.text("Full disclaimer from DISCLAIMER.md. §1 cover = abridged; this §7 = archival full text.",PAGE.marginLeft,PAGE.headingY+24,{maxWidth:discMaxWidth});

  // Source: exportContext.disclaimerFullText (extended in src/main.jsx export
  // path). When absent (test contexts, scaffold tests), render a one-line
  // marker that points at the canonical file — the §1 cover already carries
  // the abridged disclaimer regardless, so this is a non-blocking fallback.
  const disclaimerText = typeof exportContext?.disclaimerFullText === "string"
    && exportContext.disclaimerFullText.trim().length > 0
    ? exportContext.disclaimerFullText
    : null;

  let discY = PAGE.headingY + 50;
  const bottomMargin = PAGE.height - PAGE.marginBottom - 20;

  if (disclaimerText) {
    // Strip YAML frontmatter via the pure `stripDisclaimerFrontmatter` helper
    // (R4.9.5g R4-Q14 refactor — hoisted out for honest unit testing).
    const body = stripDisclaimerFrontmatter(disclaimerText);

    // R4.9.5h: render disclaimer with markdown stripping via stripInlineMd (R4-Q17).
    // Line-by-line renderer: headings/rules/tables handled structurally;
    // paragraph text stripped of inline markdown before splitTextToSize.
    const lineHeight = 11;
    // Shared body-text style reset (helvetica/8.5/text) — dedups 4 call sites.
    /* c8 ignore next */
    const setBody = () => txt("normal", 8.5, tR, tG, tB);
    setBody();
    // c8: continuation-banner emitter — jspdf-coupled; exercised by real DISCLAIMER.md
    // in prod and Puppeteer pdf-export-regression.mjs §7 page-count axis.
    /* c8 ignore start */
    const disclaimerNewPage = () => {
      _newPage(doc);
      txt("bold", 9, bnR, bnG, bnB);
      doc.text("§7 DISCLAIMER (CONT.)", PAGE.marginLeft, 36);
      hr(42, 0.5);
      discY = 60; setBody();
    };
    /* c8 ignore stop */
    let tRows = [], inTbl = false;
    /* c8 ignore next */
    const flushTbl = () => {
      /* c8 ignore start */
      if (tRows.length >= 2 && typeof doc.autoTable === "function") {
        doc.autoTable({ head: [tRows[0]], body: tRows.slice(1), startY: discY, theme: "plain",
          styles: tblStyles, headStyles: tblHead, margin: tblMargin });
        discY = ((doc.lastAutoTable || {}).finalY || discY) + lineHeight;
      }
      tRows = []; inTbl = false; setBody();
      /* c8 ignore stop */
    };
    // R4.9.5h Pass-2 D4 — structural inline-run emitter. Word-wraps the runs
    // from parseInlineRuns, switching jsPDF font/style/colour per run so
    // `**bold**` renders with Helvetica-Bold (verifiable in font dict).
    /* c8 ignore start */
    const emitRuns = (runs, x, width, size, baseColor) => {
      if (!runs || runs.length === 0) return;
      const [br, bg, bb] = baseColor || [tR, tG, tB];
      const toks = [];
      for (const r of runs) for (const seg of String(r.text).split(/(\s+)/)) {
        if (seg !== "") toks.push({ t: seg, ws: /^\s/.test(seg), s: r });
      }
      const ss = (s) => {
        const w = s.bold && s.italic ? "bolditalic" : s.bold ? "bold" : s.italic ? "italic" : "normal";
        if (s.code) { doc.setFont("courier", w); _sT(doc, mR, mG, mB); }
        else { _sF(doc, w); _sT(doc, br, bg, bb); }
        _sS(doc, size);
      };
      const mw = (k) => { ss(k.s); return doc.getTextWidth(k.t); };
      let line = [], lw = 0;
      const flush = () => {
        if (line.length === 0) return;
        if (discY > bottomMargin) disclaimerNewPage();
        let cx = x, first = true;
        for (const k of line) {
          if (first && k.ws) { first = false; continue; }
          first = false; ss(k.s);
          // fin-vkv R4.9.5j: emit clickable annotation for absolute-URL runs.
          if (k.s.link && typeof doc.textWithLink === "function") {
            doc.textWithLink(k.t, cx, discY, { url: k.s.link });
          } else {
            doc.text(k.t, cx, discY);
          }
          cx += doc.getTextWidth(k.t);
        }
        discY += lineHeight; line = []; lw = 0;
      };
      for (const k of toks) {
        const w = mw(k);
        if (!k.ws && lw > 0 && lw + w > width) {
          while (line.length && line[line.length - 1].ws) lw -= mw(line.pop());
          flush();
        }
        if (k.ws && line.length === 0) continue;
        line.push(k); lw += w;
      }
      flush(); setBody();
    };
    /* c8 ignore stop */
    const sourceLines = body.split("\n");
    let pendingBlankSkip = false;
    for (let i = 0; i < sourceLines.length; i += 1) {
      const raw = sourceLines[i];
      const trimmed = raw.trim();
      /* c8 ignore next */
      if (discY > bottomMargin) disclaimerNewPage();
      // Pipe table rows (D19 — via autotable). Handled before the table flush
      // so consecutive pipe lines accumulate; any other line type flushes below.
      if (trimmed.startsWith("|")) {
        if (!inTbl) { tRows = []; inTbl = true; }
        const cols = trimmed.split("|").map(c => c.trim()).filter((_, i2, a) => i2 > 0 && i2 < a.length - 1);
        if (!cols.every(c => /^[-:]+$/.test(c))) tRows.push(cols.map(sanitizeForPdf));
        continue;
      }
      // Any non-pipe line closes an open table.
      if (inTbl) { /* c8 ignore next */ flushTbl(); }
      if (trimmed === "") {
        if (pendingBlankSkip) { pendingBlankSkip = false; continue; }
        discY += lineHeight * 0.55;
        continue;
      }
      // Markdown headings — D2 structural rendering (R4.9.5h Pass-2 Dispatch 4).
      // Owner R4-Q17 Option B: heading hierarchy must be visually distinct.
      // H1 (#)=16pt, H2 (##, numbered section)=14pt, H3 (###)=12pt. All bold.
      const hd = trimmed.match(/^(#{1,3})\s+(.*)/);
      if (hd) {
        const lv = hd[1].length, hs = lv === 1 ? 16 : lv === 2 ? 14 : 12;
        const tp = lv === 1 ? 10 : lv === 2 ? 8 : 5, bp = lv === 1 ? 8 : lv === 2 ? 6 : 4;
        if (discY + tp + hs > bottomMargin) disclaimerNewPage();
        discY += tp; txt("bold", hs, tR, tG, tB);
        /* c8 ignore next */
        doc.text(sanitizeForPdf(hd[2]), PAGE.marginLeft, discY, { maxWidth: discMaxWidth });
        discY += hs + bp; setBody(); pendingBlankSkip = true; continue;
      }
      // Horizontal rule — jsPDF-coupled; DISCLAIMER.md rarely contains ---.
      /* c8 ignore next 4 */
      if (/^-{3,}$/.test(trimmed)) {
        hr(discY - 4, 0.4);
        discY += lineHeight * 0.6;
        continue;
      }
      // Blockquote — structural italic + muted + indent (D2, D13, D16, D17).
      // Inline runs preserved so **bold** inside a blockquote still renders bold-italic.
      if (trimmed.startsWith("> ")) {
        emitRuns(
          parseInlineRuns(trimmed.slice(2)).map((r) => ({ ...r, italic: true })),
          PAGE.marginLeft + 12, discMaxWidth - 12, 8.5, [mR, mG, mB]
        );
        setBody();
        continue;
      }
      // List items (D2 — structural markdown rendering). Unordered "- " and ordered "N. ".
      // jsPDF-coupled; ternary arms exercised only with full DISCLAIMER.md (R4-Q14).
      const olM = trimmed.match(/^(\d+)\. (.*)/);
      /* c8 ignore next 6 */
      if (/^- /.test(trimmed) || olM) {
        const marker = olM ? `${olM[1]}.` : "•";
        setBody();
        doc.text(marker, PAGE.marginLeft + 8, discY);
        emitRuns(parseInlineRuns(olM ? olM[2] : trimmed.slice(2)),
          PAGE.marginLeft + (olM ? 18 : 16), discMaxWidth - 18, 8.5);
        continue;
      }
      // Normal paragraph — structural inline-run rendering.
      // D2: `**bold**` → bold runs; `*italic*` → italic; `` `code` `` → courier.
      // R4-Q19: `[text](url)` → text + " (url)"; `<url>` → url. No clickable annotations.
      // D2/D13/D14/D16/D17: no raw markdown syntax visible in rendered PDF.
      //
      // DISCLAIMER.md hard-wraps paragraphs at ~80 cols, which means a single
      // **bold** or *italic* span can straddle a newline (e.g. "**not tax\nadvice**").
      // Concatenate consecutive paragraph lines into a single logical paragraph
      // before parsing so the regex sees both ends of every span on one string.
      let paraLines = [raw];
      /* c8 ignore start */
      while (i + 1 < sourceLines.length) {
        const next = sourceLines[i + 1];
        const nt = next.trim();
        if (nt === "" || nt.startsWith("|") || nt.startsWith("> ") || /^- /.test(nt)
          || /^#{1,3}\s/.test(nt) || /^\d+\. /.test(nt) || /^-{3,}$/.test(nt)) break;
        paraLines.push(next); i += 1;
      }
      /* c8 ignore stop */
      emitRuns(parseInlineRuns(paraLines.join(" ")), PAGE.marginLeft, discMaxWidth, 8.5);
    }
    /* c8 ignore next */
    if (inTbl) flushTbl();
  } else {
    txt("normal", 9, tR, tG, tB);
    doc.text("Disclaimer not embedded — see DISCLAIMER.md. §1 cover carries abridged notice.",PAGE.marginLeft,discY,{maxWidth:discMaxWidth});
    discY += 30;
  }

  // ── MIT license attribution ────────────────────────────────────────────
  // c8: pagination-overflow check on MIT line — branch fires only when the
  // disclaimer body's final line lands within 30pt of the bottom margin.
  // Production DISCLAIMER.md (long) does exercise this; the scaffold test
  // disclaimer fixtures intentionally stay short so the no-overflow branch
  // is the one canonically tested. Branch behaviour is verified end-to-end
  // by the Puppeteer pdf-export-regression.mjs assertions on §7 page count.
  /* c8 ignore next 6 */
  if (discY > bottomMargin - 30) {
    _newPage(doc);
    discY = 60;
  } else {
    discY += 8;
  }
  _sI(doc, pR, pG, pB);
  _sD(doc, lR, lG, lB);
  doc.roundedRect(PAGE.marginLeft, discY, discMaxWidth, 38, 4, 4, "FD");
  txt("bold", 8, mR, mG, mB);
  doc.text("LICENSE", PAGE.marginLeft + 10, discY + 14);
  txt("normal", 9, tR, tG, tB);
  doc.text("MIT License · Copyright (c) 2026 Stribog IT Solutions Pvt. Ltd. <hello@stribog.com> — see LICENSE.",PAGE.marginLeft+10,discY+30,{maxWidth:discMaxWidth-20});
}

/**
 * Appendix A — Accessibility Data Tables.
 *
 * R4.9.5h Pass-2 Dispatch 3 — D24 fix. Renders the §2 tile-mirror table, the
 * §3 donut-composition table, and the §3 projection-statement table on a
 * dedicated set of pages at the document tail, rather than inline beneath
 * their visual sources (which sighted owners flagged as duplicate clutter).
 *
 * Posture justification: jspdf v4.2.1 does not expose a StructTreeRoot /
 * MCID / mark-content API, so a truly non-visible structural surrogate is
 * not technically achievable. Relocating the sibling tables to a dedicated
 * appendix is the strongest available form of "tagged-surrogate" posture
 * given the engine — the tables remain present in the PDF text stream
 * (indexable by AT and copy-paste extractable) but no longer compete with
 * the visual on the same page.
 *
 * Page 3 corpus-journey P10/P50/P90 table is NOT moved: the corpus-journey
 * chart does not embed numeric values in-band, so that table is the data
 * itself, not a duplicate.
 *
 * This renderer is a no-op when nothing was collected.
 */
async function renderAccessibilityAppendix(doc, exportContext) {
  const tables = Array.isArray(exportContext?.__a11yAppendixTables)
    ? exportContext.__a11yAppendixTables
    : [];
  if (tables.length === 0) return;

  _newPage(doc);

  const [tR, tG, tB] = hexToRgb(LIGHT_PALETTE.text);
  const [mR, mG, mB] = hexToRgb(LIGHT_PALETTE.muted);
  const [tealR, tealG, tealB] = hexToRgb(LIGHT_PALETTE.teal);
  const [lR, lG, lB] = hexToRgb(LIGHT_PALETTE.line);
  const discMaxWidth = IW;
  const bottomMargin = PAGE.height - PAGE.marginBottom - 20;

  // Banner + section title (mirrors drawSectionHeading style but uses the
  // "APPENDIX A" eyebrow instead of "SECTION N" so the bookmark + footer
  // tooling can tell it apart from §1-§7).
  _sB(doc, _BLD, 10, tealR, tealG, tealB);
  doc.text("APPENDIX A", PAGE.marginLeft, PAGE.headingY - 18);
  _sS(doc, 20);
  _sT(doc, tR, tG, tB);
  doc.text("ACCESSIBILITY DATA TABLES", PAGE.marginLeft, PAGE.headingY);
  _sDLW(doc, lR, lG, lB, 0.5);
  doc.line(PAGE.marginLeft, PAGE.headingY + 8, PAGE.width - PAGE.marginRight, PAGE.headingY + 8);

  // Intro paragraph — explains why the appendix exists and how it relates to
  // the visual content on prior pages.
  _sB(doc, _NRM, 9, mR, mG, mB);
  const introLines = [
    "The tables in this appendix mirror the visual content on prior pages for screen-reader and",
    "tabular-data consumers. Each table cites its source page or chart. jspdf cannot emit a true",
    "PDF/UA structure tree (see §7 ACCESSIBILITY POSTURE), so these data tables provide the",
    "text-extractable equivalent that AT consumers rely on.",
  ];
  introLines.forEach((ln, idx) => {
    doc.text(ln, PAGE.marginLeft, PAGE.headingY + 28 + idx * 12, { maxWidth: discMaxWidth });
  });

  let cursorY = PAGE.headingY + 28 + introLines.length * 12 + 14;

  /* c8 ignore start -- jspdf-coupled pagination branch */
  const ensureRoom = (needed) => {
    if (cursorY + needed > bottomMargin) {
      _newPage(doc);
      _sB(doc, _BLD, 9, tealR, tealG, tealB);
      doc.text("APPENDIX A (CONT.)", PAGE.marginLeft, 36);
      _sDLW(doc, lR, lG, lB, 0.5);
      doc.line(PAGE.marginLeft, 42, PAGE.width - PAGE.marginRight, 42);
      cursorY = 60;
    }
  };
  /* c8 ignore stop */

  for (const tbl of tables) {
    // Per-table title (Table A.N) and source-pointer caption.
    ensureRoom(50);
    _sB(doc, _BLD, 11, tR, tG, tB);
    doc.text(tbl.title || "Table", PAGE.marginLeft, cursorY);
    cursorY += 14;
    if (tbl.sourceLabel) {
      _sB(doc, _NRM, 8.5, mR, mG, mB);
      for (const ln of doc.splitTextToSize(tbl.sourceLabel, discMaxWidth)) {
        ensureRoom(11);
        doc.text(ln, PAGE.marginLeft, cursorY);
        cursorY += 11;
      }
    }
    cursorY += 4;

    _atDef(doc, {
      head: tbl.head,
      body: tbl.body,
      startY: cursorY,
      styles: _AT_STY(9, 1),
      columnStyles: tbl.columnStyles || undefined,
    });
    // The `|| {}` / `|| cursorY` arms are defensive against a regression in
    // jspdf-autotable that fails to populate lastAutoTable; in v5 the
    // plugin always sets both, so production exercises the populated path.
    /* c8 ignore next */
    cursorY = ((doc.lastAutoTable || {}).finalY || cursorY) + 18;
  }
}

/* === Document-level passes (footer + metadata) ============================ */

/**
 * Apply the page footer to every page in the document: plan fingerprint
 * on the left, "Page N of M" on the right. Called once at the end of
 * `buildPdfReport` after all sections are rendered so `doc.getNumberOfPages()`
 * returns the final count. jspdf has no native deferred-page-count token.
 */
function applyPageFooters(doc, exportContext) {
  const totalPages = doc.getNumberOfPages();
  const fingerprint = String(exportContext?.reportFingerprint || "no-fingerprint");
  const short = fingerprint.length > 18 ? fingerprint.slice(0, 15) + "..." : fingerprint;
  const [mr, mg, mb] = hexToRgb(LIGHT_PALETTE.muted);
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    _sB(doc, _NRM, 8, mr, mg, mb);
    doc.text(short, PAGE.marginLeft, PAGE.footerBaseline);
    const label = `Page ${i} of ${totalPages}`;
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, PAGE.width - PAGE.marginRight - labelWidth, PAGE.footerBaseline);
  }
}

/**
 * Apply the accessibility-adjacent jspdf APIs at the document level:
 * Title, Subject, Author, Keywords, Creator metadata; Language tag; PDF
 * outline (bookmarks) mirroring §1–§7 heading hierarchy.
 *
 * @param {object} doc - jspdf document
 * @param {object} exportContext
 * @param {number[]} [sectionFirstPages] - first-page index for each of the 7
 *   sections. When provided, bookmarks land on actual pages (especially
 *   important for §6, whose page count depends on the horizon).
 */
function applyAccessibilityMetadata(doc, exportContext, sectionFirstPages) {
  const fp = exportContext?.reportFingerprint || "no-fingerprint";
  doc.setProperties({
    title: "Retirement Corpus & Income Planner",
    subject: `Structured planning report (fingerprint ${fp})`,
    author: "Self (planning tool output)",
    keywords: "retirement, planning, India, tax, SWP, corpus, income",
    creator: `Retirement Corpus & Income Planner v${_appVersion}`,
  });
  // jspdf's setLanguage whitelists language codes and silently no-ops on
  // anything outside its built-in map (which omits "en-IN"). Write the
  // catalog /Lang entry directly via the putCatalog event so en-IN actually
  // lands in the PDF — that's the closure criterion per R4-Q11.
  if (doc.internal && doc.internal.events && typeof doc.internal.events.subscribe === "function") {
    doc.internal.events.subscribe("putCatalog", function () {
      this.internal.write("/Lang (en-IN)");
    });
  }
  if (doc.outline && typeof doc.outline.add === "function") {
    const root = doc.outline.add(null, "Retirement Corpus & Income Planner", { pageNumber: 1 });
    const totalPages = doc.getNumberOfPages();
    if (Array.isArray(sectionFirstPages) && sectionFirstPages.length === SECTIONS.length) {
      // Accurate path — buildPdfReport recorded the actual first-page index
      // of each section as the renderers ran.
      SECTIONS.forEach((section, idx) => {
        const target = Math.max(1, Math.min(sectionFirstPages[idx] || 1, totalPages));
        doc.outline.add(root, `Section ${section.num} ${section.title}`, { pageNumber: target });
      });
    } else {
      // Heuristic fallback (callers that hand-construct a doc without the
      // pipeline). Keeps the test surface stable.
      let estimatedPage = 1;
      for (const section of SECTIONS) {
        const target = Math.min(estimatedPage, totalPages);
        doc.outline.add(root, `Section ${section.num} ${section.title}`, { pageNumber: target });
        if (section.key === "diagnosis") estimatedPage += 3;
        else if (section.key === "tax") estimatedPage += 2;
        else estimatedPage += 1;
      }
    }
  }
}

/**
 * Top-level entry point — build the full 7-section structured PDF report.
 *
 * @param {Object} exportContext  — settled export context from
 *   `buildExportContext()` in src/main.jsx.
 * @param {Object} [options]      — optional caller knobs.
 * @returns {Promise<{ doc: any, filename: string }>}
 */
export async function buildPdfReport(exportContext, options = {}) {
  const { jsPDF } = await import("jspdf");
  // R4.9.5g fin-c96.10 root-cause fix: jspdf-autotable v5 only attaches
  // `doc.autoTable(...)` via its side-effect IIFE when `window.jsPDF`
  // (or `window.jspdf.jsPDF`) is set. In a Vite ESM bundle that condition
  // is never true, so `doc.autoTable` stays undefined and every callsite
  // is silently skipped by its `typeof doc.autoTable === "function"`
  // guard. The v5 module also exports a functional `autoTable(doc, opts)`
  // entrypoint — we use that directly to avoid global mutation entirely.
  const autoTableModule = await import("jspdf-autotable");
  const autoTableFn = autoTableModule.default || autoTableModule.autoTable;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  // Attach `doc.autoTable` so existing callsites work and `doc.lastAutoTable`
  // continues to be populated by the plugin (we rely on it for layout).
  if (typeof autoTableFn === "function") {
    doc.autoTable = (opts) => autoTableFn(doc, opts);
  }

  // Record the actual first-page index of each section so the PDF outline
  // bookmarks land on real pages — important now that §6 expands to dozens
  // of pages at the 30y default and ~50 pages at 50y. §1 (cover) uses the
  // page that the `new jsPDF()` constructor auto-created; every other
  // renderer begins with `doc.addPage()`, so the first page of section N+1
  // equals (page-count after section N has finished) + 1.
  const sectionFirstPages = new Array(SECTIONS.length);
  sectionFirstPages[0] = 1; // §1 cover always lives on the constructor page
  await renderCover(doc, exportContext, options);
  sectionFirstPages[1] = doc.getNumberOfPages() + 1;
  await renderDecisionSummary(doc, exportContext, options);
  sectionFirstPages[2] = doc.getNumberOfPages() + 1;
  await renderPlanDiagnosis(doc, exportContext, options);
  sectionFirstPages[3] = doc.getNumberOfPages() + 1;
  await renderTaxPath(doc, exportContext, options);
  sectionFirstPages[4] = doc.getNumberOfPages() + 1;
  await renderScenarios(doc, exportContext, options);
  sectionFirstPages[5] = doc.getNumberOfPages() + 1;
  await renderMonthlyLedger(doc, exportContext, options);
  sectionFirstPages[6] = doc.getNumberOfPages() + 1;
  await renderMethodology(doc, exportContext, options);

  // Appendix A — Accessibility Data Tables (R4.9.5h Pass-2 Dispatch 3 / D24).
  // Emitted after §7 so the §1-§7 reading flow is uninterrupted by a11y
  // surrogate clutter; AT consumers reach the data via the appendix page.
  // No-op when nothing was collected (test scaffolds may render only a subset).
  await renderAccessibilityAppendix(doc, exportContext);

  applyAccessibilityMetadata(doc, exportContext, sectionFirstPages);
  applyPageFooters(doc, exportContext);

  return {
    doc,
    // Canonical filename matches the old `exportPdf` path in src/main.jsx and the
    // dashboard-regression E2E expectation (tests/e2e/dashboard-regression.mjs:1497).
    // The previous `_report.pdf` suffix predated the atomic flag flip and would have
    // produced a different download filename — fixed when §7 landed.
    filename: "retirement_corpus_income_planner.pdf",
  };
}

/* Internal helpers exposed for unit tests (R4-Q14 pure-helper backfill). */
export const __test__ = Object.freeze({
  drawSectionHeading,
  drawFactLine,
  drawMetricCard,
  applyPageFooters,
  applyAccessibilityMetadata,
  // R4-Q14 pure helpers — internal to keep bundle lean; exposed for honest
  // Vitest unit tests at tests/pdf-report-pure.test.jsx.
  formatMoneyForPdf,
  buildVerdictMood,
  buildVerdictHeadline,
  buildEnduranceDetail,
  buildSuccessDetail,
  buildIncomeDetail,
  buildGapActions,
  buildGapDetailParts,
  buildScenarioRow,
  buildScenarioRows,
  buildPlanFactRows,
  buildProjectionSummaryRows,
  buildJourneySampleYears,
  findDepletionYear,
  buildDepletionCallouts,
  computeScenarioFingerprint,
  stripDisclaimerFrontmatter,
  buildMethodologyFactsRows,
  SCENARIO_TOOLTIPS,
  DISCLAIMER_BLOCKS,
  METHODOLOGY_SCENARIO_NAMES,
  // R4.9.5h pure helpers — glyph sanitizer + markdown parser (R4-Q17, R4-Q14/M08-coda).
  sanitizeForPdf,
  stripInlineMd,
  parseDisclaimerTokens,
  // R4.9.5j fin-vkv — absolute-URL classifier (pure, Vitest-testable).
  isAbsoluteUrl,
  // R4.9.5h Pass-2 Dispatch 4 — D2 structural-markdown inline run parser.
  parseInlineRuns,
  // R4.9.5h Pass-2 pure helpers — D7 confidence bucket + tile mood colour map.
  confidenceMoodBucket,
  TILE_MOOD_COLOURS,
  // R4.9.5h Pass-2 jspdf-coupled tile renderer — exposed for branch-coverage
  // backfill on the defensive `||` / badge-absent / unknown-mood paths.
  drawDecisionTile,
  // R4.9.5h Pass-2 Dispatch 3 — D24 fix helpers (Appendix A relocation).
  collectA11yAppendixTable,
  renderAccessibilityAppendix,
  // R4.9.5h Pass-2 Dispatch 5 — D25 MC-pending placeholder (defense-in-depth).
  renderMcPendingPlaceholder,
});
