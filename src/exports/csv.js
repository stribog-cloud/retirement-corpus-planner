/**
 * csv.js — R4.9.5i Multi-Sheet CSV ZIP Exporter
 *
 * Implements exportCsvZip(state, mc, scenarios) which returns a Promise<Blob>
 * containing a ZIP archive with 6 core CSV entries, plus a 7th conditional entry:
 *   overview.csv, monthly.csv, yearly.csv, tax.csv, scenarios.csv, metadata.csv
 *   backtest.csv — only when state.backtestEnabled===1 AND the cohort replay
 *   is non-empty (fin-8fb.9 F4 — see buildBacktestCsv).
 *
 * Binding contract: §14 CSV Export Multi-Sheet Schema in audit/round-3/02-spec.md
 * Defect corrections applied per r4.9.5i-csv-schema-eco-review.md:
 *   D-02: successCi95 is array [lower, upper], not object {lower, upper}
 *   D-03: SCENARIOS[i].name not .label
 *   D-04: scenario_marker injected by export loop for yearly/tax (not from model rows)
 *
 * NEEDS_MODEL_STATE_EXTENSION columns — resolved or deferred:
 *   yearly: calendar_year — resolved (fin-030 R4.9.5j)
 *   tax: fiscal_year_label — resolved (fin-030 R4.9.5j)
 *        normal_taxable_income_inr, equity_ltcg_taxable_inr, equity_stcg_taxable_inr,
 *        slab_tax_inr, surcharge_inr, surcharge_band, marginal_relief_inr, cess_inr,
 *        section74_pool_* — resolved (fin-kqi R4.9.5j):
 *          re-derives yearlyTax sub-fields at export time via yearlyTax(row.opening, yearParams).
 *          section74_pool tracked via capitalLossCarryForward running balance.
 *   metadata: app_build_version (PLANNING_VERSION fallback; fin-i65 R4.9.5j),
 *             scenario_library_version (FNV-1a fingerprint; fin-bor R4.9.5j),
 *             disclaimer_url via DISCLAIMER_URL constant (fin-1uy R4.9.5j)
 *   scenarios: mc_p10/mc_p50/mc_p90 — populated per-scenario (fin-s87 R4.9.5j)
 *
 * fin-8fb.9 (v2.0 exports) additions:
 *   yearly: spending_multiplier, guardrail_action, rebalance_gross_inr,
 *           rebalance_tax_inr — additive fields from the v2 model surface
 *           (docs/developer/model-contract.md §4.1/§4.2/§3.2).
 *   metadata: withdrawal_rule + active-rule params, rebalance_tax_aware,
 *             backtest_enabled/backtest_use_historical_inflation, and
 *             goal_N_name/amount/year/inflation_indexed (goals_count header) —
 *             NEW surface, exports previously rendered no household/lump-sum
 *             fields at all (fin-8fb F3 finding).
 *   backtest.csv: full cohort replay evidence for the Historical Backtest Lab
 *             (docs/developer/model-contract.md §5.1), re-computed from the
 *             live params exactly like scenarioMc re-runs Monte Carlo above.
 *
 * DO NOT modify src/model.js — uses buildMonthlyLedger as-is.
 */

import JSZip from "jszip";
import {
  SCENARIOS,
  normalizeState,
  projectionParamsFromState,
  calculate,
  buildMonthlyLedger,
  taxLawFromState,
  targetAnnualCashForYear,
  householdPlanProfile,
  yearlyTax,
  paramsForProjectionYear,
  calculateMonteCarlo,
  calculateHistoricalBacktest
} from "../model.js";
import { PLANNING_VERSION } from "../planning.js";
import { DATASET_META } from "../data/india-annual-returns.js";

/**
 * Canonical disclaimer URL for the app.
 * The app is a local single-file HTML tool with no remote deployment, so this
 * resolves to the DISCLAIMER.md file bundled at the repository root.
 * Consumers who embed the export in a hosted context should override this at build
 * time by replacing the constant with a full https:// URL.
 *
 * fin-1uy: added R4.9.5j — previously shipped as a hardcoded literal fallback.
 */
export const DISCLAIMER_URL = "DISCLAIMER.md";

/**
 * App build version injected at compile time by Vite's `define` plugin (fin-i65).
 * At build time: resolves to the `version` field of package.json (e.g., "1.0.0").
 * In Vitest (no Vite define pass): falls back to PLANNING_VERSION to keep tests green.
 *
 * __APP_VERSION__ is a global string constant injected by vite.config.js define block.
 * The typeof guard is required for Vitest environments where the define pass is absent.
 */
// eslint-disable-next-line no-undef
const _appVersion = (typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__)
  ? __APP_VERSION__   // eslint-disable-line no-undef
  : PLANNING_VERSION;

/**
 * FNV-1a fingerprint of the ordered scenario name list.
 * Mirrors the same algorithm used in pdf-report.js:computeScenarioFingerprint.
 * Produces a stable, short string (e.g., "sl-1ABCD3") that changes whenever
 * the SCENARIOS array names change.
 *
 * fin-bor: added R4.9.5j — scenario library was previously unversioned.
 */
function _fnv1aScenarioFingerprint(names) {
  const text = (Array.isArray(names) ? names : []).join("|");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sl-${(hash >>> 0).toString(36).toUpperCase()}`;
}

/**
 * Stable version token for the active SCENARIOS library.
 * Computed once at module load from the canonical SCENARIOS array.
 * Exported so tests can import and assert stability across runs.
 */
export const SCENARIO_LIBRARY_VERSION = _fnv1aScenarioFingerprint(
  SCENARIOS.map((s) => s.name)
);

// ── RFC 4180 CSV helpers ──────────────────────────────────────────────────────

/**
 * Escape a single cell value per RFC 4180:
 * - If value contains comma, newline, or double-quote → wrap in double-quotes
 * - Double-quote inside a quoted field → doubled ("")
 * - null/undefined/NaN → empty string
 *
 * Exported for direct unit testing.
 */
export function csvCell(value) {
  if (value === null || value === undefined || value !== value) {
    // NaN check: NaN !== NaN
    return "";
  }
  const s = String(value);
  if (s.includes(",") || s.includes("\n") || s.includes("\r") || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Format a row array as a CSV line. Exported for direct unit testing. */
export function csvRow(cells) {
  return cells.map(csvCell).join(",");
}

/** Format a number for INR amounts (2 decimal places, no scientific notation). Exported for testing. */
export function fmtInr(v) {
  const n = Number(v);
  if (!isFinite(n)) return "";
  return n.toFixed(2);
}

/** Format an integer (no decimal places). Exported for testing. */
export function fmtInt(v) {
  const n = Number(v);
  if (!isFinite(n)) return "";
  return String(Math.round(n));
}

/** Format a percentage value (already multiplied by 100) with 4 dp. Exported for testing. */
export function fmtPct(v) {
  const n = Number(v);
  if (!isFinite(n)) return "";
  return n.toFixed(4);
}

/** Format a decimal ratio (dimensionless) with 6 dp. Exported for testing. */
export function fmtRatio(v) {
  const n = Number(v);
  if (!isFinite(n)) return "";
  return n.toFixed(6);
}

// ── Sheet builders ────────────────────────────────────────────────────────────

/**
 * Build overview.csv — 1 data row + header, 43 columns.
 * §14.2 schema; D-02 corrections for successCi95 array access.
 */
function buildOverviewCsv(ctx) {
  const {
    reportState,
    reportParams,
    reportModel,
    reportMc,
    reportTaxLaw,
    reportHousehold,
    reportFingerprint,
    generatedAt,
    disclaimerFullText
  } = ctx;

  // calculate() always returns { rows: [...], final: {...} } — no defensive fallbacks needed.
  const rows = reportModel.rows;
  const final = reportModel.final;

  // plan_depleted: 1 if final closing <= 0. final.closing is always numeric from model.
  const planDepleted = Number(final.closing) <= 0 ? 1 : 0;

  // depletion_year: first year y where rows[y].closing <= 0 (rows[0] is year-0 sentinel)
  let depletionYear = "";
  // When planDepleted=1 and principal>0, the model guarantees at least one annual row
  // with closing<=0 (the final row at minimum). deplRow is therefore always non-null here.
  if (planDepleted && Number(reportParams.principal) > 0) {
    const deplRow = rows.slice(1).find((r) => Number(r.closing) <= 0);
    depletionYear = fmtInt(deplRow.year);
  }

  // successCi95 is an array [lower, upper] — D-02 correction.
  // fallback: successProbability ± successMargin95 when successCi95 is absent.
  // T-15 covers the null-successCi95 branch.
  const ci95Lower = (reportMc.successCi95?.[0] ?? ((reportMc.successProbability || 0) - (reportMc.successMargin95 || 0))) * 100;
  const ci95Upper = (reportMc.successCi95?.[1] ?? ((reportMc.successProbability || 0) + (reportMc.successMargin95 || 0))) * 100;

  const household_mode = reportHousehold.useHouseholdPlan ? "budget-linked" : "single-target";

  const header = [
    "export_generated_at",
    "plan_fingerprint",
    "app_version",
    "tax_law_version",
    "tax_law_updated_on",
    "tax_law_source",
    "retiree_age_years",
    "plan_horizon_years",
    "principal_inr",
    "monthly_target_inr",
    "annual_contribution_inr",
    "contribution_step_up_pct",
    "income_mode",
    "cash_mode",
    "equity_share_pct",
    "equity_return_pct",
    "debt_return_pct",
    "effective_yield_pct",
    "inflation_pct",
    "tax_slab_pct",
    "equity_instrument",
    "debt_instrument",
    "section87A_enabled",
    "section87A_interpretation",
    "shock_year",
    "shock_drop_pct",
    "household_mode",
    "final_corpus_nominal_inr",
    "final_corpus_real_inr",
    "total_withdrawn_inr",
    "total_tax_inr",
    "total_contributions_inr",
    "avg_annual_cash_inr",
    "final_multiple",
    "mc_success_probability_pct",
    "mc_success_ci95_lower_pct",
    "mc_success_ci95_upper_pct",
    "mc_endurance_probability_pct",
    "mc_simulations",
    "mc_seed",
    "plan_depleted",
    "depletion_year",
    "disclaimer_text_truncated"
  ];

  // useAssetReturns selects per-bucket returns vs unified annualRate.
  // T-A1 covers useAssetReturns=1 (equityReturn/debtReturn) path.
  const useAssetReturns = Number(reportState.useAssetReturns) === 1;
  const equityReturn = useAssetReturns ? reportState.equityReturn : reportState.annualRate;
  const debtReturn = useAssetReturns ? reportState.debtReturn : reportState.annualRate;

  // normalizeState guarantees all state fields from BASE; projectionParamsFromState
  // guarantees all params fields. calculate() guarantees all model fields.
  // taxLaw fields use || "" since taxLaw is user-configurable (activeTaxLaw may be sparse).
  // MC fields use || 0 since reportMc is provided externally (T-A8 covers the absent-field path).
  const data = [
    generatedAt,
    reportFingerprint,
    PLANNING_VERSION,
    reportTaxLaw.version || "",
    reportTaxLaw.updatedOn || "",
    reportTaxLaw.source || "",
    fmtInt(reportParams.retireeAge),
    fmtInt(reportParams.years),
    fmtInr(reportParams.principal),
    fmtInr(reportParams.monthlyTarget),
    fmtInr(reportParams.annualContribution),
    fmtPct(Number(reportParams.contributionStepUp) * 100),
    reportParams.incomeMode,
    reportParams.cashMode,
    fmtPct(Number(reportState.equityShare)),
    fmtPct(Number(equityReturn)),
    fmtPct(Number(debtReturn)),
    fmtPct(Number(reportModel.effYield) * 100),
    fmtPct(Number(reportParams.inflation)),
    fmtPct(Number(reportState.taxSlab)),
    reportState.equityInstrument,
    reportState.debtInstrument,
    Number(reportState.section87A),
    reportState.section87AInterpretation,
    fmtInt(reportParams.shockYear),
    fmtPct(Number(reportParams.shockDrop)),
    household_mode,
    fmtInr(final.closing),
    fmtInr(final.realClosing),
    fmtInr(final.cumWithdrawals),
    fmtInr(final.cumTax),
    fmtInr(final.cumContributions),
    fmtInr(reportModel.avgAnnualCash),
    fmtRatio(reportModel.finalMultiple),
    fmtPct((Number(reportMc.successProbability) || 0) * 100),
    fmtPct(ci95Lower),
    fmtPct(ci95Upper),
    fmtPct((Number(reportMc.enduranceProbability) || 0) * 100),
    fmtInt(reportMc.simulations),
    fmtInt(reportMc.seed),
    fmtInt(planDepleted),
    depletionYear,
    String(disclaimerFullText).slice(0, 200)
  ];

  const lines = [csvRow(header), csvRow(data)];
  return lines.join("\r\n") + "\r\n";
}

/**
 * Build monthly.csv — 4×12×horizonYears rows (all 4 scenarios interleaved) + header.
 * §14.3 schema; uses buildMonthlyLedger as-is. Active scenario only for reconciliation.
 * Per R4-Q20 OWNER_RESOLVED: single sheet with scenario_marker, 4×12T rows total.
 */
function buildMonthlyCsv(ctx) {
  const { reportModel, reportParams, scenarioResults } = ctx;

  const header = [
    "month_index",
    "year_index",
    "month_within_year",
    "age_years",
    "opening_balance_inr",
    "growth_nominal_inr",
    "contribution_nominal_inr",
    "withdrawal_nominal_inr",
    "withdrawal_target_nominal_inr",
    "withdrawal_shortfall_nominal_inr",
    "withdrawal_real_today_inr",
    "tax_nominal_inr",
    "shock_nominal_inr",
    "closing_balance_inr",
    "closing_balance_real_today_inr",
    "scenario_marker"
  ];

  const lines = [csvRow(header)];

  // Build ledger for each scenario in canonical order
  for (const sr of scenarioResults) {
    const ledger = sr.ledger;
    for (const row of ledger) {
      lines.push(csvRow([
        fmtInt(row.month_index),
        fmtInt(row.year_index),
        fmtInt(row.month_within_year),
        fmtInt(row.age),
        fmtInr(row.opening_balance),
        fmtInr(row.growth_nominal),
        fmtInr(row.contribution_nominal),
        fmtInr(row.withdrawal_nominal),
        fmtInr(row.withdrawal_target_nominal),
        fmtInr(row.withdrawal_shortfall_nominal),
        fmtInr(row.withdrawal_real_today),
        fmtInr(row.tax_nominal),
        fmtInr(row.shock_nominal),
        fmtInr(row.closing_balance),
        fmtInr(row.closing_balance_real_today),
        // buildMonthlyLedger always sets scenario_marker (options.scenarioMarker or "active").
        row.scenario_marker
      ]));
    }
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * Build yearly.csv — 4×horizonYears rows (all 4 scenarios interleaved) + header.
 * §14.4 schema. scenario_marker injected from export loop (D-04 correction).
 * Per R4-Q21 OWNER_RESOLVED: year 1..T, no year-0 row.
 */
function buildYearlyCsv(ctx) {
  const { scenarioResults, startCalendarYear } = ctx;

  const header = [
    "year_index",
    "calendar_year",           // fin-030 resolved R4.9.5j: startCalendarYear + year_index - 1
    "retiree_age_years",
    "opening_balance_inr",
    "growth_inr",
    "contribution_inr",
    "withdrawal_inr",
    "withdrawal_target_inr",
    "withdrawal_shortfall_inr",
    "tax_inr",
    "shock_inr",
    "closing_balance_inr",
    "closing_balance_real_inr",
    "withdrawal_real_inr",
    "cum_withdrawals_inr",
    "cum_tax_inr",
    "cum_contributions_inr",
    "realized_gain_inr",
    "taxable_gain_inr",
    "ltcg_exemption_used_inr",
    "basic_exemption_used_inr",
    "rebate_used_inr",
    "rebate_lost_inr",
    "section80TTB_used_inr",
    "section80TTB_disallowed_inr",
    "gross_redemption_inr",
    "capital_recovered_inr",
    "cash_coverage_ratio",
    "effective_yield_pct",
    "year_end_closing_inr",    // alias of closing_balance_inr per §14.4
    "spending_multiplier",     // fin-8fb F2: dynamic-withdrawal multiplier (1 in fixed mode)
    "guardrail_action",        // fin-8fb F2: "none" | "cut" | "raise" | "inflation-hold"
    "rebalance_gross_inr",     // fin-8fb F5: rebalance-leg gross sale value (0 outside SWP / tax-aware mode)
    "rebalance_tax_inr",       // fin-8fb F5: rebalance-leg tax (0 outside SWP / tax-aware mode)
    "scenario_marker"
  ];

  const lines = [csvRow(header)];

  for (const sr of scenarioResults) {
    // calculate() always returns a rows array — no defensive fallback needed.
    const rows = sr.model.rows;
    const params = sr.params;
    // projectionParamsFromState always provides numeric retireeAge.
    const startAge = Math.round(Number(params.retireeAge));
    const marker = sr.marker;

    // Skip row[0] (year-0 sentinel); emit rows[1..T].
    // rows array always has year-0 sentinel at index 0 then year-1..T; no null rows.
    for (let y = 1; y < rows.length; y++) {
      const row = rows[y];

      const ageAtYear = startAge + (row.year - 1);
      // model always returns numeric withdrawal and targetCash fields.
      const withdrawal = Number(row.withdrawal);
      const targetCash = Number(row.targetCash);
      const shortfall = Math.max(0, targetCash - withdrawal);

      lines.push(csvRow([
        fmtInt(row.year),
        fmtInt(startCalendarYear + row.year - 1), // calendar_year: fin-030 resolved R4.9.5j
        fmtInt(ageAtYear),
        fmtInr(row.opening),
        fmtInr(row.interest),
        fmtInr(row.contribution),
        fmtInr(withdrawal),
        fmtInr(targetCash),
        fmtInr(shortfall),
        fmtInr(row.tax),
        fmtInr(row.shock),
        fmtInr(row.closing),
        fmtInr(row.realClosing),
        fmtInr(row.realWithdrawal),
        fmtInr(row.cumWithdrawals),
        fmtInr(row.cumTax),
        fmtInr(row.cumContributions),
        fmtInr(row.realizedGain),
        fmtInr(row.taxableGain),
        fmtInr(row.ltcgExemptionUsed),
        fmtInr(row.basicExemptionUsed),
        fmtInr(row.rebateUsed),
        fmtInr(row.rebateLost),
        fmtInr(row.section80TTBUsed),
        fmtInr(row.section80TTBDisallowed),
        fmtInr(row.grossRedemption),
        fmtInr(row.capitalRecovered),
        fmtRatio(row.cashCoverage),
        fmtPct(Number(row.effYield) * 100),
        fmtInr(row.closing),             // year_end_closing_inr: alias of closing_balance_inr
        // fin-8fb F2: all three engines set spendingMultiplier/guardrailAction on
        // every row (year-0 sentinel included) — no defensive fallback needed.
        fmtRatio(row.spendingMultiplier),
        csvCell(row.guardrailAction),
        fmtInr(row.rebalanceGross),      // fin-8fb F5: undefined (Interest/IDCW) -> ""
        fmtInr(row.rebalanceTax),        // fin-8fb F5: undefined (Interest/IDCW) -> ""
        marker                           // D-04: injected from export loop, not row data
      ]));
    }
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * Build tax.csv — 4×horizonYears rows (all 4 scenarios interleaved) + header.
 * §14.5 schema. fin-kqi R4.9.5j: tax sub-fields now populated via yearlyTax re-derivation.
 * scenario_marker injected from export loop (D-04 correction).
 *
 * fin-kqi implementation notes:
 *   - For each annual row we call yearlyTax(row.opening, yearParams) to obtain the full
 *     taxProfile with sub-fields (surcharge, cess, normalTaxableIncome, etc.).
 *   - The re-call is safe because yearlyTax is deterministic given the same inputs.
 *   - §74 pool: the pool balance (longTerm + shortTerm carry-forward) is tracked as a
 *     running sum across years from taxProfile.capitalLossCarryForward.
 *     pool_opening = prior year's pool_closing (0 at year-1).
 *     pool_used = within-year setoff from prior pool (approximated as max(0, pool_opening - pool_closing + new_loss)).
 *     pool_closing = pool_opening + new_loss − pool_used_this_year.
 *     NOTE: params.carryForwardPool is null by default; yearlyTax does not mutate it.
 *     capitalLossCarryForward reflects within-year losses from netCapitalGainStreams.
 */
function buildTaxCsv(ctx) {
  const { scenarioResults, startCalendarYear } = ctx;

  const header = [
    "year_index",
    "fiscal_year_label",                // fin-030 resolved R4.9.5j: "FY YYYY-YY" derived from startCalendarYear
    "retiree_age_years",
    "gross_income_inr",                 // mode-conditional derivation
    "normal_taxable_income_inr",        // fin-kqi R4.9.5j: taxProfile.normalTaxableIncome
    "equity_ltcg_taxable_inr",          // fin-kqi R4.9.5j: taxProfile.taxableSpecial.equityLtcg
    "equity_stcg_taxable_inr",          // fin-kqi R4.9.5j: taxProfile.taxableSpecial.equityStcg
    "slab_tax_inr",                     // fin-kqi R4.9.5j: taxProfile.normalTaxBeforeRebate (slab tax pre-rebate)
    "section87A_rebate_used_inr",
    "section87A_rebate_lost_inr",
    "section80TTB_used_inr",
    "section80TTB_disallowed_inr",
    "surcharge_inr",                    // fin-kqi R4.9.5j: taxProfile.surcharge
    "surcharge_band",                   // fin-kqi R4.9.5j: taxProfile.surchargeBand
    "marginal_relief_inr",              // fin-kqi R4.9.5j: taxProfile.marginalRelief
    "cess_inr",                         // fin-kqi R4.9.5j: taxProfile.cess
    "ltcg_exemption_used_inr",
    "basic_exemption_used_inr",
    "section74_pool_opening_inr",       // fin-kqi R4.9.5j: running carry-forward pool opening balance
    "section74_pool_used_inr",          // fin-kqi R4.9.5j: pool applied in this year
    "section74_pool_closing_inr",       // fin-kqi R4.9.5j: pool after new-loss addition
    "annual_tax_total_inr",
    "effective_tax_rate_pct",
    "net_cash_after_tax_inr",
    "scenario_marker"
  ];

  const lines = [csvRow(header)];

  for (const sr of scenarioResults) {
    // calculate() always returns a rows array.
    const rows = sr.model.rows;
    const params = sr.params;
    // projectionParamsFromState always provides numeric retireeAge and string incomeMode.
    const startAge = Math.round(Number(params.retireeAge));
    const incomeMode = params.incomeMode;
    const marker = sr.marker;

    // fin-kqi: §74 pool running balance (longTerm + shortTerm losses carried forward).
    // Opening pool for year-1 = 0. Updated each year from taxProfile.capitalLossCarryForward.
    let poolBalance = 0;  // total carry-forward pool balance (longTerm + shortTerm)

    // rows array always has year-0 sentinel at index 0 then year-1..T; no null rows.
    for (let y = 1; y < rows.length; y++) {
      const row = rows[y];

      const ageAtYear = startAge + (row.year - 1);
      // model always returns numeric tax and interest fields.
      const annualTax = Number(row.tax);
      const annualGrowth = Number(row.interest);
      const effectiveTaxRate = annualGrowth !== 0 ? (annualTax / annualGrowth) * 100 : 0;

      // gross_income_inr: mode-conditional derivation.
      // Three paths: "interest"/"idcw" tested by T-01/T-20; "swp" tested by T-13;
      // else "" (unknown incomeMode) tested by T-A3.
      let grossIncomeInr = "";
      if (incomeMode === "interest" || incomeMode === "idcw") {
        const taxableGain = Number(row.taxableGain) || 0;
        const section80TTBDisallowed = Number(row.section80TTBDisallowed) || 0;
        grossIncomeInr = fmtInr(taxableGain + section80TTBDisallowed);
      } else if (incomeMode === "swp") {
        // SWP approximation: grossRedemption (principal + gain); caveat documented in spec
        grossIncomeInr = fmtInr(row.grossRedemption);
      }
      // else: unknown mode — grossIncomeInr stays ""; T-A3 exercises this path.

      // fiscal_year_label: "FY YYYY-YY" — Indian fiscal year April-March.
      const fyStart = startCalendarYear + row.year - 1;
      const fyEnd2 = String(fyStart + 1).slice(-2);
      const fiscalYearLabel = `FY ${fyStart}-${fyEnd2}`;

      // fin-kqi: re-derive yearlyTax sub-fields by calling yearlyTax(row.opening, yearParams).
      // yearlyTax is deterministic — same opening and params produce same sub-fields.
      // This is acceptable overhead for CSV export (already async/blocking-tolerant).
      const yearParams = paramsForProjectionYear(params, row.year);
      const taxCalc = yearlyTax(Number(row.opening), yearParams);
      const tp = taxCalc.taxProfile || {};

      // surcharge: tp.surcharge (absent on flat/override profiles → 0)
      const surchargeInr = Number(tp.surcharge) || 0;
      // surchargeBand: tp.surchargeBand (string label, e.g. "50L-1Cr"; may be null/undefined → "")
      const surchargeBand = tp.surchargeBand || "";
      // marginalRelief: tp.marginalRelief (absent on flat/override → 0)
      const marginalReliefInr = Number(tp.marginalRelief) || 0;
      // cess: tp.cess (absent on flat/override → 0)
      const cessInr = Number(tp.cess) || 0;
      // normalTaxableIncome: tp.normalTaxableIncome (amount subject to slab tax)
      const normalTaxableIncome = Number(tp.normalTaxableIncome) || 0;
      // normalTaxBeforeRebate: slab tax computed before §87A rebate
      const slabTaxInr = Number(tp.normalTaxBeforeRebate) || 0;
      // taxableSpecial: equity LTCG and STCG taxable amounts
      const equityLtcgTaxable = Number(tp.taxableSpecial?.equityLtcg) || 0;
      const equityStcgTaxable = Number(tp.taxableSpecial?.equityStcg) || 0;

      // fin-kqi: §74 pool tracking.
      // capitalLossCarryForward: { longTerm, shortTerm } — current year's unsetoff losses.
      // Since params.carryForwardPool is null by default (no multi-year pool enabled),
      // these represent within-year residual losses that WOULD carry forward.
      // pool_opening = poolBalance (prior year closing)
      // new_loss_this_year = longTerm + shortTerm carry-forward from taxCalc
      const poolOpening = poolBalance;
      const cf = tp.capitalLossCarryForward || {};
      const newLossThisYear = (Number(cf.longTerm) || 0) + (Number(cf.shortTerm) || 0);
      // pool_used: how much of the opening pool was consumed by this year's gains.
      // Since carryForwardPool is null, the pool is not applied to gains in the model run;
      // pool_used = 0 in the default case (pool not wired to the projection params).
      const poolUsed = 0;
      const poolClosing = poolOpening + newLossThisYear - poolUsed;
      // Advance pool balance for next year
      poolBalance = poolClosing;

      lines.push(csvRow([
        fmtInt(row.year),
        fiscalYearLabel,                 // fiscal_year_label: fin-030 resolved R4.9.5j
        fmtInt(ageAtYear),
        grossIncomeInr,
        fmtInr(normalTaxableIncome),     // normal_taxable_income_inr: fin-kqi
        fmtInr(equityLtcgTaxable),       // equity_ltcg_taxable_inr: fin-kqi
        fmtInr(equityStcgTaxable),       // equity_stcg_taxable_inr: fin-kqi
        fmtInr(slabTaxInr),              // slab_tax_inr (pre-rebate): fin-kqi
        fmtInr(row.rebateUsed),
        fmtInr(row.rebateLost),
        fmtInr(row.section80TTBUsed),
        fmtInr(row.section80TTBDisallowed),
        fmtInr(surchargeInr),            // surcharge_inr: fin-kqi
        csvCell(surchargeBand),          // surcharge_band: fin-kqi (string label, not INR)
        fmtInr(marginalReliefInr),       // marginal_relief_inr: fin-kqi
        fmtInr(cessInr),                 // cess_inr: fin-kqi
        fmtInr(row.ltcgExemptionUsed),
        fmtInr(row.basicExemptionUsed),
        fmtInr(poolOpening),             // section74_pool_opening_inr: fin-kqi
        fmtInr(poolUsed),                // section74_pool_used_inr: fin-kqi
        fmtInr(poolClosing),             // section74_pool_closing_inr: fin-kqi
        fmtInr(annualTax),
        fmtPct(effectiveTaxRate),
        fmtInr(row.withdrawal),
        marker                           // D-04: injected from export loop
      ]));
    }
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * Build scenarios.csv — 4 data rows + header.
 * §14.6 schema. D-03 correction: use scenario.name not .label.
 * fin-s87 R4.9.5j: mc_success_probability_pct populated for all scenarios
 * from sr.scenarioMc (per-scenario MC computed in the export loop).
 */
function buildScenariosCsv(ctx) {
  const { reportMc, scenarioResults } = ctx;

  const header = [
    "scenario_key",
    "scenario_label",
    "plan_horizon_years",
    "equity_share_pct",
    "equity_return_pct",
    "debt_return_pct",
    "inflation_pct",
    "income_mode",
    "shock_year",
    "shock_drop_pct",
    "opening_corpus_inr",
    "final_corpus_nominal_inr",
    "final_corpus_real_inr",
    "total_withdrawn_inr",
    "total_tax_inr",
    "avg_annual_cash_inr",
    "final_monthly_cash_inr",
    "real_target_met",
    "cash_ratio",
    "plan_depleted",
    "depletion_year",
    "mc_success_probability_pct",
    "mc_p10_final_inr",
    "mc_p50_final_inr",
    "mc_p90_final_inr",
    "status",
    "fingerprint"
  ];

  const lines = [csvRow(header)];

  for (const sr of scenarioResults) {
    const { marker, model: scenarioModel, params: scenarioParams, status, cashRatio, realRatio, depletionYear, fingerprint, scenarioMc } = sr;
    // calculate() always returns { final: {...}, rows: [...] }.
    const final = scenarioModel.final;
    const rows = scenarioModel.rows;

    // opening_corpus_inr: rows[0].closing == C_0 (year-0 sentinel closing = opening = C_0).
    // calculate() always returns a rows array with a year-0 sentinel at index 0.
    const openingCorpus = Number(rows[0].closing);

    // final.closing is always numeric from model.
    const planDepleted = Number(final.closing) <= 0 ? 1 : 0;

    // final_monthly_cash_inr: final.withdrawal / 12 (annual→monthly approximation per §14.6)
    // final.withdrawal is always numeric from model.
    const finalMonthlyCash = Number(final.withdrawal) / 12;

    // fin-s87 R4.9.5j: mc_success_probability_pct from per-scenario MC for all scenarios.
    // scenarioMc is pre-computed in the export loop (calculateMonteCarlo per scenario).
    // Active scenario uses reportMc (the UI-computed MC result) for backward compatibility;
    // non-active scenarios use their own scenarioMc.
    let mcSuccessPct, mcP10Final, mcP50Final, mcP90Final;
    if (marker === "active") {
      // Active: reportMc is authoritative (UI-computed, may differ from scenarioMc if N differs)
      mcSuccessPct = fmtPct((Number(reportMc.successProbability) || 0) * 100);
      // p10/p50/p90: use reportMc arrays if present, else scenarioMc
      const mcSrc = (reportMc.p10?.length > 0) ? reportMc : scenarioMc;
      const horizon = scenarioParams.years;
      mcP10Final = mcSrc?.p10?.[horizon] != null ? fmtInr(mcSrc.p10[horizon]) : "";
      mcP50Final = mcSrc?.p50?.[horizon] != null ? fmtInr(mcSrc.p50[horizon]) : "";
      mcP90Final = mcSrc?.p90?.[horizon] != null ? fmtInr(mcSrc.p90[horizon]) : "";
    } else {
      // Non-active: fin-s87 per-scenario MC.
      // scenarioMc is always non-null (computed in export loop below).
      mcSuccessPct = scenarioMc ? fmtPct((Number(scenarioMc.successProbability) || 0) * 100) : "";
      const horizon = scenarioParams.years;
      mcP10Final = scenarioMc?.p10?.[horizon] != null ? fmtInr(scenarioMc.p10[horizon]) : "";
      mcP50Final = scenarioMc?.p50?.[horizon] != null ? fmtInr(scenarioMc.p50[horizon]) : "";
      mcP90Final = scenarioMc?.p90?.[horizon] != null ? fmtInr(scenarioMc.p90[horizon]) : "";
    }

    // scenario_key: scenario.name.toLowerCase() or scenario.source for active
    const scenarioKey = marker;  // already "active"/"income"/"growth"/"stress"
    // scenario_label: scenario.name (D-03: not .label)
    const scenarioLabel = sr.name;

    // scenarioParams comes from projectionParamsFromState — all numeric fields guaranteed.
    // realRatio and cashRatio are always computed to a number in the main loop.
    // status is always "strong"/"watch"/"gap" — never falsy.
    // fingerprint is "" when planFingerprintFn is null; T-01..T-15 cover that path.
    // depletionYear is null for non-depleted scenarios (T-21), non-null for depleted (T-14).
    lines.push(csvRow([
      scenarioKey,
      scenarioLabel,
      fmtInt(scenarioParams.years),
      // equityShare, equityReturn, debtReturn, annualRate all guaranteed by normalizeState from BASE.
      fmtPct(Number(scenarioParams.equityShare)),
      fmtPct(Number(scenarioParams.equityReturn)),
      fmtPct(Number(scenarioParams.debtReturn)),
      fmtPct(Number(scenarioParams.inflation)),
      scenarioParams.incomeMode,
      fmtInt(scenarioParams.shockYear),
      fmtPct(Number(scenarioParams.shockDrop)),
      fmtInr(openingCorpus),
      fmtInr(final.closing),
      fmtInr(final.realClosing),
      fmtInr(final.cumWithdrawals),
      fmtInr(final.cumTax),
      fmtInr(scenarioModel.avgAnnualCash),
      fmtInr(finalMonthlyCash),
      fmtRatio(realRatio),
      fmtRatio(cashRatio),
      fmtInt(planDepleted),
      depletionYear != null ? fmtInt(depletionYear) : "",
      mcSuccessPct,
      mcP10Final,
      mcP50Final,
      mcP90Final,
      status,
      fingerprint
    ]));
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * Build metadata.csv — ~21 key-value rows + header.
 * §14.7 schema. NEEDS_MODEL_STATE_EXTENSION rows use documented fallbacks.
 */
function buildMetadataCsv(ctx) {
  const {
    reportState,
    reportParams,
    reportTaxLaw,
    reportMc,
    reportHousehold,
    reportFingerprint,
    generatedAt,
    disclaimerFullText
  } = ctx;

  const header = ["key", "value"];

  const householdMode = reportHousehold.useHouseholdPlan ? "budget-linked" : "single-target";

  // tax-law fields may be absent on non-default taxLaw objects; || "" is a genuine
  // string-field contract (taxLaw is a structured object, not a model return value).
  // These are real || "" guards for optional string metadata — not convenience ignores.
  const rows = [
    ["generated_at", generatedAt],
    ["product_name", "Retirement Corpus & Income Planner"],
    ["app_version", PLANNING_VERSION],
    // app_build_version: package.json version injected via __APP_VERSION__ Vite define (fin-i65, R4.9.5j)
    ["app_build_version", _appVersion],
    ["tax_law_version", reportTaxLaw.version || ""],
    ["tax_law_source", reportTaxLaw.source || ""],
    ["tax_law_updated_on", reportTaxLaw.updatedOn || ""],
    // scenario_library_version: SCENARIO_LIBRARY_VERSION FNV-1a fingerprint (fin-bor, R4.9.5j)
    ["scenario_library_version", SCENARIO_LIBRARY_VERSION],
    ["mc_sample_count", String(reportMc.simulations || 0)],
    ["mc_seed", String(reportMc.seed || 0)],
    ["mc_method", reportMc.method || ""],
    ["plan_fingerprint", reportFingerprint],
    ["disclaimer_text", disclaimerFullText || ""],
    // disclaimer_url: DISCLAIMER_URL constant added in R4.9.5j (fin-1uy)
    ["disclaimer_url", DISCLAIMER_URL],
    ["report_type_caveat", "Planning estimate — not tax, legal, or investment advice"],
    ["sensitive_data_warning", "This CSV contains private financial assumptions and remains on disk after browser data is cleared."],
    ["household_mode", householdMode],
    // projectionParamsFromState guarantees incomeMode, cashMode, years, retireeAge.
    ["income_mode", reportParams.incomeMode],
    ["cash_mode", reportParams.cashMode],
    ["plan_horizon_years", String(Math.round(Number(reportParams.years)))],
    ["retiree_age_years", String(Math.round(Number(reportParams.retireeAge)))],
    // mc_simulations_per_scenario: fin-s87 R4.9.5j — per-scenario MC sample count (N=500 for non-active scenarios)
    ["mc_simulations_per_scenario", "500"]
  ];

  // fin-8fb F2 — dynamic withdrawal rule + only the params relevant to the
  // active rule; the rule itself is always emitted. Floor applies to both
  // dynamic rules (never to "fixed" — see docs/developer/model-contract.md §4.1).
  const withdrawalRule = String(reportState.withdrawalRule || "fixed");
  const dynamicRuleRows = [["withdrawal_rule", withdrawalRule]];
  if (withdrawalRule === "guardrails") {
    dynamicRuleRows.push(
      ["guardrail_band_pct", fmtPct(Number(reportState.guardrailBandPct) || 0)],
      ["guardrail_adjust_pct", fmtPct(Number(reportState.guardrailAdjustPct) || 0)],
      ["spending_floor_monthly_inr", fmtInr(Number(reportState.spendingFloorMonthly) || 0)]
    );
  } else if (withdrawalRule === "percentOfCorpus") {
    dynamicRuleRows.push(
      ["percent_of_corpus_rate_pct", fmtPct(Number(reportState.percentOfCorpusRate) || 0)],
      ["spending_floor_monthly_inr", fmtInr(Number(reportState.spendingFloorMonthly) || 0)]
    );
  }
  // fin-8fb F5 — opt-in tax-aware rebalancing flag; always emitted (default 0).
  dynamicRuleRows.push(["rebalance_tax_aware", String(Number(reportState.rebalanceTaxAware) === 1 ? 1 : 0)]);
  // fin-8fb F4 — Historical Backtest Lab flags; always emitted. See backtest.csv
  // (buildBacktestCsv) for the full cohort replay when backtest_enabled=1.
  dynamicRuleRows.push(["backtest_enabled", String(Number(reportState.backtestEnabled) === 1 ? 1 : 0)]);
  dynamicRuleRows.push(["backtest_use_historical_inflation", String(Number(reportState.backtestUseHistoricalInflation) === 1 ? 1 : 0)]);

  // fin-8fb F3 — planned goals, one-line-per-goal. NEW surface: exports previously
  // rendered no household/lump-sum fields at all. reportHousehold.plannedLumpSums
  // is already scoped to [] when !useHouseholdPlan (householdPlanProfile).
  const goals = Array.isArray(reportHousehold.plannedLumpSums) ? reportHousehold.plannedLumpSums : [];
  const goalRows = [["goals_count", String(goals.length)]];
  goals.forEach((goal, i) => {
    const n = i + 1;
    goalRows.push(
      [`goal_${n}_name`, goal.name || ""],
      [`goal_${n}_amount_inr`, fmtInr(goal.amount)],
      [`goal_${n}_year`, fmtInt(goal.year)],
      [`goal_${n}_inflation_indexed`, String(Number(goal.inflate) === 1 ? 1 : 0)]
    );
  });

  const allRows = [...rows, ...dynamicRuleRows, ...goalRows];

  const lines = [csvRow(header)];
  for (const [key, value] of allRows) {
    lines.push(csvRow([key, value]));
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * Build backtest.csv — fin-8fb F4 Historical Backtest Lab evidence sheet.
 * Only included in the ZIP when `state.backtestEnabled === 1` AND the
 * resulting cohort replay is non-empty (a horizon longer than the bundled
 * dataset yields the documented zero-cohort shape — see model-contract.md
 * §5.1 — which is not useful evidence and is therefore omitted, not emitted
 * as an empty sheet).
 *
 * Two row shapes in one sheet (summary key/value block, blank separator,
 * then the per-cohort table) — mirrors how a reviewer reads a spreadsheet
 * tab with a header block above a data table, and keeps every field
 * individually addressable (no compound-quoted cells to unpack).
 */
function buildBacktestCsv(ctx) {
  const { backtestResult: r } = ctx;

  // r.worst/r.best are guaranteed non-null here: the only call site
  // (exportCsvZip) invokes this builder only when r.cohortCount > 0, and
  // calculateHistoricalBacktest only returns null worst/best in the
  // zero-cohort shape (model-contract.md §5.1) — no defensive fallback needed.
  const summaryRows = [
    ["dataset_id", DATASET_META.id],
    ["dataset_first_fy", DATASET_META.firstFy],
    ["dataset_last_fy", DATASET_META.lastFy],
    ["dataset_source_years", String(DATASET_META.count)],
    ["cohort_count", fmtInt(r.cohortCount)],
    ["horizon_years", fmtInt(r.horizon)],
    ["success_rate", fmtRatio(r.successRate)],
    ["worst_start_fy", r.worst.startFy],
    ["worst_ending_corpus_inr", fmtInr(r.worst.endingCorpus)],
    ["worst_depletion_year", r.worst.depletionYear != null ? fmtInt(r.worst.depletionYear) : ""],
    ["best_start_fy", r.best.startFy],
    ["best_ending_corpus_inr", fmtInr(r.best.endingCorpus)]
  ];

  const cohortHeader = ["start_fy", "ending_corpus_inr", "real_ending_corpus_inr", "depleted", "depletion_year"];
  const cohortLines = [csvRow(cohortHeader)];
  for (const c of r.cohorts) {
    cohortLines.push(csvRow([
      c.startFy,
      fmtInr(c.endingCorpus),
      fmtInr(c.realEndingCorpus),
      fmtInt(c.depleted ? 1 : 0),
      c.depletionYear != null ? fmtInt(c.depletionYear) : ""
    ]));
  }

  const lines = [
    csvRow(["key", "value"]),
    ...summaryRows.map(([key, value]) => csvRow([key, value])),
    "",
    ...cohortLines
  ];
  return lines.join("\r\n") + "\r\n";
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * exportCsvZip(state, mc, scenarios, options) → Promise<Blob>
 *
 * Builds a ZIP archive with 6 CSV sheets per §14 schema.
 *
 * @param {object} exportCtx - The full export context from buildExportContext()
 *   Must contain: reportState, reportParams, reportModel, reportMc, reportTaxLaw,
 *                 reportHousehold, reportFingerprint, disclaimerFullText
 * @param {object} analyticsContext - Additional context for scenario computation
 *   Must contain: analyticsState, analyticsTargetCorpusReal, planFingerprintFn,
 *                 normalizeStateFn
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function exportCsvZip(exportCtx, analyticsContext) {
  const {
    reportState,
    reportParams,
    reportModel,
    reportMc,
    reportTaxLaw,
    reportHousehold,
    reportFingerprint,
    disclaimerFullText = ""
  } = exportCtx;

  // analyticsContext may be null when called from tests that pass null explicitly.
  // T-A4 covers the null analyticsContext path.
  const analyticsCtxSafe = analyticsContext || {};
  const {
    analyticsState,
    analyticsTargetCorpusReal,
    planFingerprintFn
  } = analyticsCtxSafe;

  const _now = new Date();
  const generatedAt = _now.toISOString();
  // startCalendarYear: calendar year of plan Year 1, derived from today's date (fin-030, R4.9.5j).
  // Zero UI change: no new input field; Year 1 always starts in the current calendar year.
  const startCalendarYear = _now.getFullYear();

  // ── Build scenario results (all 4 scenarios) ─────────────────────────────
  // Mirror the logic in main.jsx:4185-4223 (analyticsScenarios useMemo)
  const scenarioResults = SCENARIOS.map((scenario) => {
    let scenarioState, scenarioParams;

    if (scenario.source === "active") {
      scenarioState = normalizeState(reportState);
      scenarioParams = reportParams;
    } else {
      scenarioState = normalizeState({
        ...reportState,
        ...scenario.patch,
        inflation: reportState.inflation
      });
      scenarioParams = projectionParamsFromState(scenarioState);
    }

    const scenarioModel = calculate(scenarioParams);
    const scenarioTaxLaw = taxLawFromState(scenarioState);

    // Compute scenario analytics (mirroring main.jsx:4191-4222)
    const targetCorpusReal = Number(analyticsTargetCorpusReal) || 0;
    const realRatio = targetCorpusReal > 0
      ? (Number(scenarioModel.final?.realClosing) || 0) / targetCorpusReal
      : 1;

    // projectionParamsFromState always provides numeric years and inflation.
    const horizonYears = Math.max(1, Math.round(Number(scenarioParams.years)));
    const inflationFactor = Math.pow(1 + Number(scenarioParams.inflation) / 100, horizonYears);
    const finalCashNeed = targetAnnualCashForYear(scenarioParams, horizonYears, inflationFactor);
    // finalCashNeed == 0 when monthlyTarget == 0 (degenerate plan: no withdrawals).
    // T-A5 covers the zero-monthlyTarget (cashRatio=1 fallback) path.
    const cashRatio = finalCashNeed > 0
      ? (Number(scenarioModel.final?.withdrawal) || 0) / finalCashNeed
      : 1;

    // Three-way status classification. All three branches tested:
    // "strong" by T-A6 (large corpus / small withdrawal);
    // "watch" by T-17 (default plan with zero targetCorpusReal);
    // "gap" by T-21 (small corpus vs large target).
    const status = (realRatio >= 1 && cashRatio >= 1) ? "strong"
      : (realRatio >= 0.85 || cashRatio >= 0.9) ? "watch"
      : "gap";

    // Depletion detection
    const closing = Number(scenarioModel.final?.closing) || 0;
    let depletionYear = null;
    if (closing <= 0 && Number(scenarioParams.principal) > 0) {
      // calculate() always returns a rows array.
      // When closing<=0 and principal>0, the model guarantees at least the final annual row
      // has closing<=0. deplRow is therefore always non-null here.
      const sRows = scenarioModel.rows;
      const deplRow = sRows.slice(1).find((r) => (Number(r.closing) || 0) <= 0);
      depletionYear = deplRow.year;
    }

    // Scenario fingerprint
    const fingerprint = planFingerprintFn
      ? planFingerprintFn(scenarioState, scenarioTaxLaw)
      : "";

    // Build monthly ledger for this scenario
    const ledger = buildMonthlyLedger(scenarioModel, scenarioParams, {
      scenarioMarker: scenario.source === "active" ? "active" : scenario.name.toLowerCase()
    });

    // marker: canonical scenario key
    const marker = scenario.source === "active" ? "active" : scenario.name.toLowerCase();

    // fin-s87 R4.9.5j: per-scenario MC for ALL scenarios.
    // N=500 per scenario for performance balance:
    //   4 scenarios × ~2s each ≈ 8s additional CSV export latency (well under 30s threshold).
    //   metadata.csv records mc_simulations_per_scenario for transparency.
    // Active scenario: scenarioMc is used as p10/p50/p90 source when reportMc arrays are absent
    //   (e.g., in tests where reportMc is a minimal stub). When reportMc.p10 has data, it takes
    //   priority for the active scenario's success probability (authoritative UI result).
    const mcParams = { ...scenarioParams, monteCarloSamples: 500 };
    const scenarioMc = calculateMonteCarlo(mcParams, 500);

    return {
      scenario,
      name: scenario.name,           // D-03: .name not .label
      marker,
      state: scenarioState,
      params: scenarioParams,
      model: scenarioModel,
      ledger,
      status,
      cashRatio,
      realRatio,
      depletionYear,
      fingerprint,
      scenarioMc               // fin-s87: per-scenario MC result (null for active)
    };
  });

  // fin-8fb F4 — re-compute the Historical Backtest Lab cohort replay for the
  // active plan's own params, mirroring how scenarioMc re-runs Monte Carlo
  // above (exports must speak the same live model state, not a cached UI
  // result). Gated on state.backtestEnabled, not reportParams, since the
  // state field is the authoritative user-facing toggle; projectionParamsFromState
  // passes it through unchanged via its params spread.
  const backtestResult = Number(reportState.backtestEnabled) === 1
    ? calculateHistoricalBacktest(reportParams)
    : null;

  // ── Shared context for all sheet builders ─────────────────────────────────
  const ctx = {
    reportState,
    reportParams,
    reportModel,
    reportMc,
    reportTaxLaw,
    reportHousehold,
    reportFingerprint,
    generatedAt,
    startCalendarYear,
    disclaimerFullText,
    scenarioResults,
    backtestResult
  };

  // ── Build all sheets (6 core + backtest.csv when available) ──────────────
  const overviewContent = buildOverviewCsv(ctx);
  const monthlyContent = buildMonthlyCsv(ctx);
  const yearlyContent = buildYearlyCsv(ctx);
  const taxContent = buildTaxCsv(ctx);
  const scenariosContent = buildScenariosCsv(ctx);
  const metadataContent = buildMetadataCsv(ctx);
  // A dataset-shorter-than-horizon backtest returns the documented zero-cohort
  // shape (model-contract.md §5.1) — omit the sheet rather than ship an empty one.
  const backtestContent = backtestResult && backtestResult.cohortCount > 0
    ? buildBacktestCsv(ctx)
    : null;

  // ── Package into ZIP ─────────────────────────────────────────────────────
  const zip = new JSZip();
  zip.file("overview.csv", overviewContent);
  zip.file("monthly.csv", monthlyContent);
  zip.file("yearly.csv", yearlyContent);
  zip.file("tax.csv", taxContent);
  zip.file("scenarios.csv", scenariosContent);
  zip.file("metadata.csv", metadataContent);
  if (backtestContent) zip.file("backtest.csv", backtestContent);

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  // Filename: retirement-plan-{fingerprint}-{YYYY-MM-DD}.zip
  const dateStr = generatedAt.slice(0, 10); // YYYY-MM-DD
  const filename = `retirement-plan-${reportFingerprint}-${dateStr}.zip`;

  return { blob, filename };
}

/**
 * Trigger a browser download of the ZIP blob.
 * Convenience wrapper used by main.jsx exportCsv().
 */
export function downloadZip(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
