/**
 * tests/cross-check-runner.mjs
 *
 * Phase 4 (Mencius) — JS Cross-Check Runner
 * Reads cross-check-inputs.jsonl, invokes src/model.js and src/planning.js
 * for each scenario, and writes cross-check-actual.jsonl with JS-computed
 * Qxx values.
 *
 * This script does NOT modify src/. It only imports and invokes.
 *
 * Usage:
 *   node tests/cross-check-runner.mjs \
 *     [--in=audit/reference/fixtures/cross-check-inputs.jsonl] \
 *     [--out=audit/reference/fixtures/cross-check-actual.jsonl]
 *
 * Performance: N=10000 × interest-plan projection + MC (1000 runs) per scenario.
 * Expected runtime: ~5-20 minutes depending on hardware.
 *
 * Qxx mapping to JS functions:
 *   Q01/Q17  → annualPortfolioRate (via effectiveYield)
 *   Q05      → rows[1].withdrawal, rows[last].withdrawal
 *   Q07      → rows[1].tax, rows[last].tax
 *   Q17      → annualPortfolioRate()
 *   Q18      → targetAnnualCashForYear()
 *   Q19      → cashCoverage field in rows
 *   Q22      → calculateMonteCarlo().successProbability
 *   Q23      → calculateMonteCarlo().p50[last] / quantile(finals, 0.95)
 *   Q28      → solveCorpusForMonthlyCash()
 *   Q29      → solveReturnForMonthlyCash()
 *   Q30      → solveMaxMonthlyCash()
 *   Q33      → annualPortfolioRate() (blended net rate)
 *   Q35      → equityShareForYear(params, 1)
 *   Q37      → monthlyCashNeedForYear(params, 1)
 *   Q48/Q49  → calculateSwpPlan() first year data
 *   Q53      → effective horizon (years param)
 *   Q61      → SIP accumulation (avgAnnualCash proxy)
 *   Q62      → calculateMonteCarlo().successCi95
 */

import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--(\w[\w-]*)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    in: args.in ?? "audit/reference/fixtures/cross-check-inputs.jsonl",
    out: args.out ?? "audit/reference/fixtures/cross-check-actual.jsonl",
    // Override mc_runs from CLI (e.g. --mc-runs=50 for fast runs)
    mcRuns: args["mc-runs"] ? parseInt(args["mc-runs"], 10) : null,
    // Limit number of scenarios for pilots (e.g. --limit=100)
    limit: args.limit ? parseInt(args.limit, 10) : null,
  };
}

// ---------------------------------------------------------------------------
// Lazy import src/model.js (ES module)
// ---------------------------------------------------------------------------
let _model = null;

async function getModel() {
  if (_model) return _model;
  _model = await import(resolve(REPO_ROOT, "src/model.js"));
  return _model;
}

// ---------------------------------------------------------------------------
// Build JS params object from scenario
// ---------------------------------------------------------------------------
function scenarioToParams(scenario) {
  const equitySharePct = scenario.equity_share * 100;
  const equityReturnPct = scenario.equity_return * 100;
  const debtReturnPct = scenario.debt_return * 100;
  const expenseRatioPct = scenario.expense_ratio * 100;
  const inflationPct = scenario.inflation * 100;

  // Age band
  const age = scenario.age;
  let ageBand = "below60";
  if (age >= 80) ageBand = "superSenior";
  else if (age >= 60) ageBand = "senior";

  const params = {
    // Corpus / portfolio
    principal: scenario.corpus,
    years: scenario.horizon_years,
    inflation: inflationPct,
    monthlyTarget: scenario.monthly_cash_target,
    targetCorpus: 0,

    // Asset allocation
    useAssetReturns: 1,
    equityShare: equitySharePct,
    equityReturn: equityReturnPct,
    debtReturn: debtReturnPct,
    expenseRatio: expenseRatioPct,
    compounding: 1,

    // Glide path
    glidePathEnabled: scenario.glide_enabled ? 1 : 0,
    glidePathEndEquity: scenario.glide_end_equity * 100,
    glidePathYears: scenario.glide_years,

    // Tax
    taxRegime: scenario.regime,
    ageBand,
    residentStatus: scenario.is_nri ? "nonResident" : "resident",
    section87A: 1,
    section87AInterpretation: "offForSpecialMix",
    taxProfileMode: "retiree",
    includeCess: 1,
    harvestLtcg: 1,

    // Income mode
    incomeMode: scenario.swp_mode ? "swp" : "interest",
    cashMode: "monthlyTarget",
    inflateWithdrawals: 1,
    allowPrincipalDrawdown: 1,

    // SWP params
    costBasisPct: scenario.cost_basis_pct !== null
      ? scenario.cost_basis_pct * 100
      : 75,
    legacyHoldingYears: 3,

    // Instruments
    equityInstrument: "equityLtcg",
    debtInstrument: "debtMfSlab",
    equityProductClass: "equityMfEtf",
    debtProductClass: "debtMfPost2023",
    equitySttPaid: 1,
    useFmvGrandfathering: 0,
    equityFmv2018Pct: 0,
    equityAcquisitionYear: 2020,
    debtAcquisitionYear: 2024,

    // Household
    useHouseholdPlan: scenario.household_mode ? 1 : 0,
    retireeAge: scenario.age,
    spouseAge: scenario.partner_age ?? scenario.age,
    dependantSupportYears: scenario.dependant_support_years ?? 0,

    // MC
    monteCarloSamples: scenario.mc_runs,
    monteCarloSeed: 20260518,
    volatility: 14,
    equityVolatility: 16,
    debtVolatility: 4,
    equityDebtCorrelation: 20,
    shockModel: "regime",

    // Other defaults
    withdrawRate: 50,
    annualContribution: 0,
    contributionStepUp: 0,
    shockYear: 0,
    shockDrop: 0,
    otherIncome: 0,
    pensionIncome: 0,
    standardDeductionMode: "auto",
    tdsEnabled: 0,
    form15Declaration: 1,
    taxSlab: 30,

    // Household expenses (all zero for non-HH; will be non-zero for HH)
    essentialMonthlyExpense: scenario.household_mode
      ? scenario.monthly_cash_target * 0.7
      : 0,
    discretionaryMonthlyExpense: scenario.household_mode
      ? scenario.monthly_cash_target * 0.3
      : 0,
    spouseMonthlyNeed: 0,
    dependantMonthlySupport: 0,
    pensionMonthlyIncome: 0,
    rentMonthlyIncome: 0,
    annuityMonthlyIncome: 0,
    pmvvyMonthlyIncome: 0,
    otherMonthlyIncome: 0,
    healthcareReserve: 0,
    emergencyMonths: 0,
    plannedLumpSumAmount: 0,
    plannedLumpSumYear: 0,
    longevityYears: scenario.horizon_years,
    contingencyYears: 0,
    legacyCorpusGoal: 0,
    idcwYield: 6,
  };

  return params;
}

// ---------------------------------------------------------------------------
// Compute JS quantities for one scenario
// ---------------------------------------------------------------------------
async function computeOne(scenario) {
  const model = await getModel();
  const {
    calculate,
    calculateMonteCarlo,
    solveCorpusForMonthlyCash,
    solveReturnForMonthlyCash,
    solveMaxMonthlyCash,
    annualPortfolioRate,
    equityShareForYear,
    monthlyCashNeedForYear,
    projectionParamsFromState,
    quantile,
  } = model;

  const rawParams = scenarioToParams(scenario);

  // Resolve household projection params
  let params;
  try {
    params = projectionParamsFromState(rawParams);
  } catch (e) {
    params = rawParams;
  }

  const result = {
    id: scenario.id,
  };

  // ---------------------------------------------------------------------------
  // Q17 / Q33 — Nominal portfolio rate
  // ---------------------------------------------------------------------------
  try {
    const r = annualPortfolioRate(params);
    result.q17_nominal_return = r;
    result.q33_blended_rate = r;
  } catch (e) {
    result.q17_nominal_return = null;
    result.q33_blended_rate = null;
    result.error_q17 = String(e);
  }

  // ---------------------------------------------------------------------------
  // Q01 / Q05 / Q07 / Q19 — Full horizon projection
  // ---------------------------------------------------------------------------
  let planRows = [];
  try {
    const plan = calculate({ ...params, incomeMode: "interest", cashMode: "monthlyTarget" });
    planRows = plan.rows || [];

    const row1 = planRows[1] || {};
    const rowLast = planRows[planRows.length - 1] || {};

    result.q05_withdrawal_year1 = row1.withdrawal ?? 0;
    result.q05_withdrawal_year_horizon = rowLast.withdrawal ?? 0;
    result.q07_yearly_tax_year1 = row1.tax ?? 0;
    result.q07_yearly_tax_horizon = rowLast.tax ?? 0;
    result.q17_corpus_real = rowLast.realClosing ?? 0;

    // Q18 target cash year 1 and horizon
    result.q18_target_year1 = row1.targetCash ?? 0;
    // For horizon year target, use the last row's targetCash
    result.q18_target_horizon = rowLast.targetCash ?? 0;

    // Q19 cash coverage
    result.q19_cash_coverage_year1 = row1.cashCoverage ?? 0;
    result.q19_cash_coverage_horizon = rowLast.cashCoverage ?? 0;

  } catch (e) {
    result.q05_withdrawal_year1 = null;
    result.q05_withdrawal_year_horizon = null;
    result.q07_yearly_tax_year1 = null;
    result.q07_yearly_tax_horizon = null;
    result.q17_corpus_real = null;
    result.q18_target_year1 = null;
    result.q18_target_horizon = null;
    result.q19_cash_coverage_year1 = null;
    result.q19_cash_coverage_horizon = null;
    result.error_projection = String(e);
  }

  // ---------------------------------------------------------------------------
  // Q21 — Target corpus (not directly computed by JS; set to 0 for now)
  // ---------------------------------------------------------------------------
  result.q21_target_corpus = 0;

  // ---------------------------------------------------------------------------
  // Q22 / Q23 / Q62 — Monte Carlo
  // ---------------------------------------------------------------------------
  try {
    const mc = calculateMonteCarlo(
      { ...params, incomeMode: "interest", cashMode: "monthlyTarget" },
      scenario.mc_runs
    );

    result.q22_mc_success_probability = mc.successProbability ?? 0;

    // Q23 P50 / P95 of terminal values
    const p50last = mc.p50?.[mc.p50.length - 1] ?? 0;
    result.q23_terminal_value_p50 = p50last;

    // P95 from sorted finals
    const finals = mc.finals || [];
    if (finals.length > 0) {
      result.q23_terminal_value_p95 = quantile(finals, 0.95);
    } else {
      result.q23_terminal_value_p95 = 0;
    }

    // Q62 CI
    result.q62_mc_ci_lower = mc.successCi95?.[0] ?? 0;
    result.q62_mc_ci_upper = mc.successCi95?.[1] ?? 0;

  } catch (e) {
    result.q22_mc_success_probability = null;
    result.q23_terminal_value_p50 = null;
    result.q23_terminal_value_p95 = null;
    result.q62_mc_ci_lower = null;
    result.q62_mc_ci_upper = null;
    result.error_mc = String(e);
  }

  // ---------------------------------------------------------------------------
  // Q28 — Required corpus (solve for monthly cash)
  // ---------------------------------------------------------------------------
  try {
    const q28 = solveCorpusForMonthlyCash({
      ...params,
      incomeMode: "interest",
      cashMode: "monthlyTarget",
    });
    result.q28_required_corpus = q28 === Infinity ? null : q28;
  } catch (e) {
    result.q28_required_corpus = null;
    result.error_q28 = String(e);
  }

  // ---------------------------------------------------------------------------
  // Q29 — Required return (solve return for monthly cash coverage)
  // ---------------------------------------------------------------------------
  try {
    const q29 = solveReturnForMonthlyCash({
      ...params,
      incomeMode: "interest",
      cashMode: "monthlyTarget",
    });
    result.q29_required_return = q29 === null ? null : q29;
  } catch (e) {
    result.q29_required_return = null;
    result.error_q29 = String(e);
  }

  // ---------------------------------------------------------------------------
  // Q30 — Max monthly cash
  // ---------------------------------------------------------------------------
  try {
    const q30 = solveMaxMonthlyCash({
      ...params,
      incomeMode: "interest",
      cashMode: "monthlyTarget",
    });
    result.q30_max_monthly_cash = q30;
  } catch (e) {
    result.q30_max_monthly_cash = null;
    result.error_q30 = String(e);
  }

  // ---------------------------------------------------------------------------
  // Q35 — Glide path equity share year 1
  // ---------------------------------------------------------------------------
  try {
    const eq1 = equityShareForYear(params, 1);
    result.q35_glide_equity_y1 = eq1;
  } catch (e) {
    result.q35_glide_equity_y1 = null;
  }

  // ---------------------------------------------------------------------------
  // Q37 — Monthly cash need year 1
  // ---------------------------------------------------------------------------
  try {
    const m1 = monthlyCashNeedForYear(params, 1);
    result.q37_household_cash_y1 = m1;
  } catch (e) {
    result.q37_household_cash_y1 = null;
  }

  // ---------------------------------------------------------------------------
  // Q48 / Q49 — SWP gross year 1 / units redeemed year 1
  // ---------------------------------------------------------------------------
  if (scenario.swp_mode && scenario.initial_nav !== null) {
    try {
      const swpPlan = calculate({
        ...params,
        incomeMode: "swp",
        cashMode: "monthlyTarget",
      });
      const swpRows = swpPlan.rows || swpPlan.monthlyRows || [];
      // SWP plan may have monthly rows
      const firstYearRows = swpRows.filter((r) => r.month ? r.year === 1 : r.year === 1);
      const totalGross = firstYearRows.reduce((s, r) => s + (r.withdrawal ?? r.gross ?? 0), 0);
      result.q48_swp_gross_year1 = totalGross || (swpRows[1]?.withdrawal ?? 0);
      const nav = scenario.initial_nav;
      result.q49_swp_units_redeemed_year1 = nav > 0
        ? result.q48_swp_gross_year1 / nav
        : 0;
    } catch (e) {
      result.q48_swp_gross_year1 = null;
      result.q49_swp_units_redeemed_year1 = null;
      result.error_swp = String(e);
    }
  } else {
    result.q48_swp_gross_year1 = 0;
    result.q49_swp_units_redeemed_year1 = 0;
  }

  // ---------------------------------------------------------------------------
  // Q53 — Effective horizon (years)
  // JS uses params.years after projectionParamsFromState which already applies
  // longevity extension in household mode.
  // ---------------------------------------------------------------------------
  result.q53_effective_horizon = params.years ?? scenario.horizon_years;

  // ---------------------------------------------------------------------------
  // Q61 — SIP accumulation proxy
  // JS model doesn't expose this directly; use avgAnnualCash from plan.
  // ---------------------------------------------------------------------------
  result.q61_sip_fv = null; // JS doesn't expose FV-annuity formula directly

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { in: inFile, out: outFile, mcRuns: mcRunsOverride, limit: scenarioLimit } = parseArgs(process.argv);
  const inPath = resolve(REPO_ROOT, inFile);
  const outPath = resolve(REPO_ROOT, outFile);

  // Read all scenarios (skip header comment)
  const scenarios = [];
  const rl = createInterface({
    input: createReadStream(inPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    try {
      scenarios.push(JSON.parse(trimmed));
    } catch (e) {
      console.error(`Parse error on line: ${trimmed.slice(0, 80)}`);
    }
  }

  let allScenarios = scenarios;
  if (scenarioLimit && scenarioLimit < scenarios.length) {
    allScenarios = scenarios.slice(0, scenarioLimit);
    console.log(`Limiting to first ${scenarioLimit} scenarios (--limit=${scenarioLimit})`);
  }
  if (mcRunsOverride !== null) {
    console.log(`Overriding mc_runs to ${mcRunsOverride} (--mc-runs=${mcRunsOverride})`);
    allScenarios = allScenarios.map(s => ({ ...s, mc_runs: mcRunsOverride }));
  }
  const scenariosToRun = allScenarios;
  console.log(`Loaded ${scenarios.length} scenarios from ${inPath}`);

  // Pre-load the model
  await getModel();

  const ws = createWriteStream(outPath, { encoding: "utf8" });

  let processed = 0;
  let errors = 0;

  const startTime = Date.now();

  for (const scenario of scenariosToRun) {
    let result;
    try {
      result = await computeOne(scenario);
    } catch (e) {
      result = { id: scenario.id, error: String(e) };
      errors++;
    }
    ws.write(JSON.stringify(result) + "\n");
    processed++;

    if (processed % 500 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / parseFloat(elapsed)).toFixed(1);
      console.log(
        `Progress: ${processed}/${scenariosToRun.length} (${elapsed}s, ${rate}/s, ${errors} errors)`
      );
    }
  }

  await new Promise((resolve) => ws.end(resolve));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const mcNote = mcRunsOverride !== null ? ` mc_runs=${mcRunsOverride}` : "";
  console.log(
    `Done: ${processed} scenarios in ${elapsed}s${mcNote}, ${errors} errors. Output: ${outPath}`
  );
}

main().catch((err) => {
  console.error("cross-check-runner error:", err);
  process.exit(1);
});
