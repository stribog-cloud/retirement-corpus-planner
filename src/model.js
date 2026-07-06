import {
  INSTRUMENT_CATALOG,
  PLANNING_VERSION,
  buildAssumptionAudit,
  buildRetirementActionPlan,
  buildTaxOptimizationPlan,
  buildWithdrawalPolicy,
  catalogByBucket,
  withdrawalRateBand,
  withdrawalRateForState
} from "./planning.js";

const DEFAULT_TAX_LAW = {
  version: "FY 2025-26 / AY 2026-27 baseline",
  source: "Seeded from Income Tax Department public guidance; review before relying on it",
  sourceUrl: "https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1",
  updatedOn: "2026-05-11",
  newRegimeSlabs: [
    { upto: 400000, rate: 0 },
    { upto: 800000, rate: 5 },
    { upto: 1200000, rate: 10 },
    { upto: 1600000, rate: 15 },
    { upto: 2000000, rate: 20 },
    { upto: 2400000, rate: 25 },
    { upto: null, rate: 30 }
  ],
  oldRegimeSlabs: {
    below60: [
      { upto: 250000, rate: 0 },
      { upto: 500000, rate: 5 },
      { upto: 1000000, rate: 20 },
      { upto: null, rate: 30 }
    ],
    senior: [
      { upto: 300000, rate: 0 },
      { upto: 500000, rate: 5 },
      { upto: 1000000, rate: 20 },
      { upto: null, rate: 30 }
    ],
    superSenior: [
      { upto: 500000, rate: 0 },
      { upto: 1000000, rate: 20 },
      { upto: null, rate: 30 }
    ]
  },
  rebates: {
    new: { threshold: 1200000, max: 60000, marginalRelief: true },
    old: { threshold: 500000, max: 12500, marginalRelief: false }
  },
  deductions: {
    section80TTB: { max: 50000, appliesTo: "resident senior/super-senior old-regime deposit interest" },
    standardDeduction: { new: 75000, old: 50000, appliesTo: "salary/pension income where eligible" }
  },
  specialRates: {
    equityLtcg: 12.5,
    equityStcg: 20,
    listedBondLtcg: 12.5
  },
  surchargeBands: [
    { above: 5000000, upto: 10000000, rate: 10, specialRateCap: 10 },
    { above: 10000000, upto: 20000000, rate: 15, specialRateCap: 15 },
    { above: 20000000, upto: 50000000, rate: 25, specialRateCap: 15 },
    { above: 50000000, upto: null, rate: 25, oldRegimeRate: 37, specialRateCap: 15 }
  ],
  surchargeMarginalRelief: true,
  tdsDefaults: {
    interest: 10,
    distribution: 10
  },
  equityLtcgExemption: 125000,
  equityLongTermMonths: 12,
  listedBondLongTermMonths: 12,
  section87AInterpretations: {
    aggregateThreshold: "Apply rebate only to slab tax and only when aggregate taxable income is within the rebate threshold.",
    normalOnly: "Apply rebate only to slab tax, testing only slab-rate income. Use only for adviser-reviewed sensitivity.",
    offForSpecialMix: "Disable rebate when special-rate capital gains are present."
  },
  productTaxRules: {
    equityMfEtf: { bucket: "equity", longTermMonths: 12, longTermStream: "equityLtcg", shortTermStream: "equityStcg", sttRequired: true },
    equityActive: { bucket: "equity", longTermMonths: 12, longTermStream: "equityLtcg", shortTermStream: "equityStcg", sttRequired: true },
    debtMfPost2023: { bucket: "debt", effectiveFromYear: 2023, stream: "normalIncome", note: "Specified debt mutual-fund gains are modelled as slab-rate income for post-2023 acquisitions." },
    debtMfGrandfathered: { bucket: "debt", longTermMonths: 36, longTermStream: "listedBondLtcg", shortTermStream: "normalIncome", note: "Older debt-fund lots are exposed for adviser-reviewed scenarios." },
    listedBondDebtEtf: { bucket: "debt", longTermMonths: 12, longTermStream: "listedBondLtcg", shortTermStream: "normalIncome" },
    fdInterest: { bucket: "income", stream: "normalIncome" },
    gsecTbill: { bucket: "income", stream: "normalIncome", note: "Coupon/interest is slab-rate income; sale gains need instrument-level review." },
    targetMaturityDebt: { bucket: "debt", effectiveFromYear: 2023, stream: "normalIncome", note: "Classification can vary by portfolio facts; default is conservative slab treatment." }
  },
  cess: 4,
  debtMfTaxation: "slab",
  notes: "Planning-grade ruleset. Users can edit this JSON when law changes; filing-grade advice still needs a CA."
};

function formatTaxLawJson(rule = DEFAULT_TAX_LAW) {
  return JSON.stringify(rule, null, 2);
}

const BASE = {
  principal: 30000000,
  annualRate: 12,
  useAssetReturns: 1,
  equityShare: 60,
  equityReturn: 14,
  debtReturn: 9,
  portfolioIncomeYield: 7.5,
  equityIncomeYield: 0,
  debtIncomeYield: 7.5,
  equityIncomePolicy: "reinvest",
  debtIncomePolicy: "available",
  expenseRatio: 0.4,
  equityInstrument: "equityLtcg",
  debtInstrument: "debtMfSlab",
  equityProductClass: "equityMfEtf",
  debtProductClass: "debtMfPost2023",
  equityAcquisitionYear: 2021,
  debtAcquisitionYear: 2024,
  equitySttPaid: 1,
  useFmvGrandfathering: 1,
  equityFmv2018Pct: 0,
  section87AInterpretation: "cbdtConservative",
  taxProfileMode: "retiree",
  taxRegime: "new",
  ageBand: "below60",
  residentStatus: "resident",
  otherIncome: 0,
  pensionIncome: 0,
  standardDeductionMode: "auto",
  standardDeduction: 0,
  section87A: 1,
  tdsEnabled: 1,
  interestTdsRate: 10,
  distributionTdsRate: 10,
  nriWithholdingRate: 20,
  form15Declaration: 1,
  taxSlab: 31.2,
  equityLtcgExemption: 125000,
  includeCess: 1,
  withdrawRate: 50,
  compounding: 1,
  years: 30,
  inflation: 6,
  taxRate: 0,
  annualContribution: 0,
  contributionStepUp: 0,
  volatility: 12,
  equityVolatility: 16,
  debtVolatility: 4,
  equityDebtCorrelation: 20,
  monteCarloSamples: 1000,
  monteCarloSeed: 24681357,
  shockModel: "regime",
  glidePathEnabled: 0,
  glidePathEndEquity: 40,
  glidePathYears: 20,
  shockYear: 0,
  shockDrop: 0,
  monthlyTarget: 300000,
  targetCorpus: 100000000,
  useHouseholdPlan: 0,
  retireeAge: 60,
  spouseAge: 58,
  dependantCount: 0,
  essentialMonthlyExpense: 0,
  discretionaryMonthlyExpense: 0,
  spouseMonthlyNeed: 0,
  dependantMonthlySupport: 0,
  dependantSupportYears: 0,
  pensionMonthlyIncome: 0,
  rentMonthlyIncome: 0,
  annuityMonthlyIncome: 0,
  pmvvyMonthlyIncome: 0,
  otherMonthlyIncome: 0,
  healthcareReserve: 0,
  emergencyMonths: 12,
  plannedLumpSumAmount: 0,
  plannedLumpSumYear: 0,
  plannedLumpSumInflate: 1,
  longevityYears: 30,
  contingencyYears: 5,
  legacyCorpusGoal: 0,
  incomeMode: "interest",
  cashMode: "interestPercent",
  inflateWithdrawals: 1,
  allowPrincipalDrawdown: 1,
  withdrawalPriority: "proRata",
  // fin-8fb F2 — dynamic withdrawal rules (guardrails / percent-of-corpus).
  // "fixed" preserves current behavior exactly (see resolveDynamicSpending).
  withdrawalRule: "fixed",
  guardrailBandPct: 20,
  guardrailAdjustPct: 10,
  percentOfCorpusRate: 5,
  spendingFloorMonthly: 0,
  costBasisPct: 75,
  legacyHoldingYears: 3,
  idcwYield: 6,
  harvestLtcg: 1,
  retirementObjective: "income",
  riskComfort: "balanced",
  cashFlex: "guarded",
  taxPreference: "optimize",
  legacyPriority: "medium",
  liquidityMonths: 24,
  lockCashBucket: 0,
  cashBucketMonthsOverride: 24,
  lockEquityShare: 0,
  equityShareOverride: 60,
  preferSimpleProducts: 0,
  avoidCreditRisk: 1,
  allowAnnuity: 0,
  taxLawJson: formatTaxLawJson(DEFAULT_TAX_LAW)
};

const PRESETS = {
  base: {
    label: "Workbook Base",
    detail: "12%, 50% withdrawal",
    patch: { ...BASE }
  },
  income: {
    label: "Income Tilt",
    detail: "Lower equity, higher cash",
    patch: { annualRate: 9.4, useAssetReturns: 1, equityShare: 35, equityReturn: 11, debtReturn: 8.5, expenseRatio: 0.25, withdrawRate: 70, compounding: 1, inflation: 6, taxRate: 0, taxSlab: 31.2, equityInstrument: "equityLtcg", debtInstrument: "fdInterest", shockYear: 0, shockDrop: 0 }
  },
  growth: {
    label: "Growth Tilt",
    detail: "Equity-led compounding",
    patch: { annualRate: 14.5, useAssetReturns: 1, equityShare: 80, equityReturn: 16, debtReturn: 8.5, expenseRatio: 0.55, withdrawRate: 30, compounding: 12, inflation: 6, taxRate: 0, taxSlab: 31.2, equityInstrument: "equityLtcg", debtInstrument: "listedBondLtcg", shockYear: 0, shockDrop: 0 }
  },
  stress: {
    label: "Stress Case",
    detail: "Drawdown + inflation stress",
    patch: { annualRate: 7.5, useAssetReturns: 1, equityShare: 50, equityReturn: 8, debtReturn: 7, expenseRatio: 0.5, withdrawRate: 60, compounding: 1, inflation: 7, taxRate: 0, taxSlab: 31.2, equityInstrument: "equityStcg", debtInstrument: "debtMfSlab", shockYear: 3, shockDrop: 18 }
  }
};

const SCENARIOS = [
  { name: "Active", colorKey: "teal", source: "active" },
  { name: "Income", colorKey: "blue", patch: PRESETS.income.patch },
  { name: "Growth", colorKey: "gold", patch: PRESETS.growth.patch },
  { name: "Stress", colorKey: "coral", patch: PRESETS.stress.patch }
];

const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const NUMERIC_FIELDS = new Set([
  "principal",
  "annualRate",
  "useAssetReturns",
  "equityShare",
  "equityReturn",
  "debtReturn",
  "portfolioIncomeYield",
  "equityIncomeYield",
  "debtIncomeYield",
  "expenseRatio",
  "equityAcquisitionYear",
  "debtAcquisitionYear",
  "equitySttPaid",
  "useFmvGrandfathering",
  "equityFmv2018Pct",
  "otherIncome",
  "pensionIncome",
  "standardDeduction",
  "section87A",
  "tdsEnabled",
  "interestTdsRate",
  "distributionTdsRate",
  "nriWithholdingRate",
  "form15Declaration",
  "taxSlab",
  "equityLtcgExemption",
  "includeCess",
  "withdrawRate",
  "compounding",
  "years",
  "inflation",
  "taxRate",
  "annualContribution",
  "contributionStepUp",
  "volatility",
  "equityVolatility",
  "debtVolatility",
  "equityDebtCorrelation",
  "monteCarloSamples",
  "monteCarloSeed",
  "glidePathEnabled",
  "glidePathEndEquity",
  "glidePathYears",
  "shockYear",
  "shockDrop",
  "monthlyTarget",
  "targetCorpus",
  "useHouseholdPlan",
  "retireeAge",
  "spouseAge",
  "dependantCount",
  "essentialMonthlyExpense",
  "discretionaryMonthlyExpense",
  "spouseMonthlyNeed",
  "dependantMonthlySupport",
  "dependantSupportYears",
  "pensionMonthlyIncome",
  "rentMonthlyIncome",
  "annuityMonthlyIncome",
  "pmvvyMonthlyIncome",
  "otherMonthlyIncome",
  "healthcareReserve",
  "emergencyMonths",
  "plannedLumpSumAmount",
  "plannedLumpSumYear",
  "plannedLumpSumInflate",
  "longevityYears",
  "contingencyYears",
  "legacyCorpusGoal",
  "inflateWithdrawals",
  "allowPrincipalDrawdown",
  "costBasisPct",
  "legacyHoldingYears",
  "idcwYield",
  "harvestLtcg",
  "liquidityMonths",
  "lockCashBucket",
  "cashBucketMonthsOverride",
  "lockEquityShare",
  "equityShareOverride",
  "preferSimpleProducts",
  "avoidCreditRisk",
  "allowAnnuity",
  "guardrailBandPct",
  "guardrailAdjustPct",
  "percentOfCorpusRate",
  "spendingFloorMonthly"
]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeFieldValue(key, value) {
  if (!NUMERIC_FIELDS.has(key)) return value;
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

// fin-8fb F3 — multi-goal planned lump sums. Dedicated sanitizer (NOT a
// NUMERIC_FIELDS entry — plannedLumpSums is an array, not a scalar). Accepts
// anything; returns a clean array of at most 10 entries, each
// { id?, name, amount, year, inflate }. Invalid entries (non-object, missing
// or negative/non-finite amount, non-finite year) are dropped; year is
// clamped into [1, 80] rather than dropped so a slightly-out-of-range year
// still yields a usable goal. Invalid/non-array input yields [].
function sanitizePlannedLumpSums(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    if (out.length >= 10) break;
    if (!raw || typeof raw !== "object") continue;
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const yearNum = Number(raw.year);
    if (!Number.isFinite(yearNum)) continue;
    const year = clamp(Math.round(yearNum), 1, 80);
    const inflate = Number(raw.inflate) === 1 ? 1 : 0;
    const name = (typeof raw.name === "string" ? raw.name : "").trim().slice(0, 40);
    const entry = { name, amount, year, inflate };
    if (raw.id !== undefined && raw.id !== null) entry.id = raw.id;
    out.push(entry);
  }
  return out;
}

// fin-8fb F3 — resolves the effective goals array for a given state: the
// sanitized plannedLumpSums array wins when non-empty; otherwise the legacy
// single-goal triple (plannedLumpSumAmount/Year/Inflate) is synthesized into
// a one-entry array so old saved states keep working. A legacy year < 1
// ("unset" — the pre-F3 code's own signal that the goal never matches any
// projection year, since actualYear >= 1 always) synthesizes no entry at
// all rather than a year-0 placeholder: this function must be idempotent
// (normalizeState resolves once into state.plannedLumpSums; householdPlanProfile
// then resolves again from that already-resolved state), and a year-0 entry
// re-run through sanitizePlannedLumpSums would get its year clamped up to 1,
// turning a previously-inert goal into one that fires in year 1.
function resolvePlannedLumpSums(state = {}) {
  const sanitized = sanitizePlannedLumpSums(state.plannedLumpSums);
  if (sanitized.length > 0) return sanitized;
  const legacyAmount = Math.max(0, Number(state.plannedLumpSumAmount) || 0);
  const legacyYear = Math.round(Number(state.plannedLumpSumYear) || 0);
  if (legacyAmount <= 0 || legacyYear < 1) return [];
  return [{
    name: "Planned lump sum",
    amount: legacyAmount,
    year: clamp(legacyYear, 1, 80),
    inflate: Number(state.plannedLumpSumInflate) === 1 ? 1 : 0
  }];
}

function normalizeState(input = {}) {
  const next = { ...BASE, ...input };
  NUMERIC_FIELDS.forEach((key) => {
    next[key] = normalizeFieldValue(key, next[key]);
  });
  if (!["auto", "custom"].includes(next.standardDeductionMode)) next.standardDeductionMode = "auto";
  if (!["regime", "normal"].includes(next.shockModel)) next.shockModel = "regime";
  if (!["fixed", "guardrails", "percentOfCorpus"].includes(next.withdrawalRule)) next.withdrawalRule = "fixed";
  // fin-8fb F3: normalized state always carries a resolved goals array
  // (possibly empty) — legacy scalar fields are kept in NUMERIC_FIELDS above
  // for back-compat loading and are otherwise untouched.
  next.plannedLumpSums = resolvePlannedLumpSums(input);
  return next;
}

function householdPlanProfile(state = {}) {
  const useHouseholdPlan = Number(state.useHouseholdPlan) === 1;
  const expenses = {
    essential: Math.max(0, Number(state.essentialMonthlyExpense) || 0),
    discretionary: Math.max(0, Number(state.discretionaryMonthlyExpense) || 0),
    spouse: Math.max(0, Number(state.spouseMonthlyNeed) || 0),
    dependant: Math.max(0, Number(state.dependantMonthlySupport) || 0)
  };
  const incomes = {
    pension: Math.max(0, Number(state.pensionMonthlyIncome) || 0),
    rent: Math.max(0, Number(state.rentMonthlyIncome) || 0),
    annuity: Math.max(0, Number(state.annuityMonthlyIncome) || 0),
    pmvvy: Math.max(0, Number(state.pmvvyMonthlyIncome) || 0),
    other: Math.max(0, Number(state.otherMonthlyIncome) || 0)
  };
  const permanentExpenses = expenses.essential + expenses.discretionary + expenses.spouse;
  const incomeFloor = incomes.pension + incomes.rent + incomes.annuity + incomes.pmvvy + incomes.other;
  const dependantYears = Math.max(0, Number(state.dependantSupportYears) || 0);
  const retireeAge = Math.max(0, Math.round(Number(state.retireeAge) || 0));
  const spouseAge = Math.max(0, Math.round(Number(state.spouseAge) || 0));
  const dependantCount = Math.max(0, Math.round(Number(state.dependantCount) || 0));
  const monthlyCashNeed = Math.max(0, permanentExpenses + expenses.dependant - incomeFloor);
  const monthlyNeedAfterDependants = Math.max(0, permanentExpenses - incomeFloor);
  const emergencyReserve = Math.max(0, (expenses.essential + expenses.spouse) * Math.max(0, Number(state.emergencyMonths) || 0));
  const healthcareReserve = Math.max(0, Number(state.healthcareReserve) || 0);
  const plannedLumpSum = Math.max(0, Number(state.plannedLumpSumAmount) || 0);
  const legacyGoal = Math.max(0, Number(state.legacyCorpusGoal) || 0);
  const baseTargetCorpus = Math.max(0, Number(state.targetCorpus) || 0);
  const targetCorpusToday = Math.max(baseTargetCorpus, legacyGoal) + emergencyReserve + healthcareReserve;
  return {
    useHouseholdPlan,
    expenses,
    incomes,
    retireeAge,
    spouseAge,
    dependantCount,
    dependantYears,
    incomeFloor,
    monthlyCashNeed: useHouseholdPlan ? monthlyCashNeed : Math.max(0, Number(state.monthlyTarget) || 0),
    monthlyNeedAfterDependants: useHouseholdPlan ? monthlyNeedAfterDependants : Math.max(0, Number(state.monthlyTarget) || 0),
    emergencyReserve,
    healthcareReserve,
    plannedLumpSum,
    plannedLumpSumYear: Math.max(0, Math.round(Number(state.plannedLumpSumYear) || 0)),
    plannedLumpSumInflate: Number(state.plannedLumpSumInflate) === 1,
    // fin-8fb F3: multi-goal array, active only under the household plan —
    // same scoping the legacy single-goal fields above already had (goals
    // never fire outside useHouseholdPlan; see plannedLumpSumForYear).
    plannedLumpSums: useHouseholdPlan ? resolvePlannedLumpSums(state) : [],
    // Q53 fin-711: in household mode, derive longevity from joint-life expectancy
    // (max(0, 90-retireeAge), max(0, 90-spouseAge)) → last-survivor basis.
    // Use max of age-derived and user-input longevityYears (conservative).
    longevityYears: useHouseholdPlan && (retireeAge > 0 || spouseAge > 0)
      ? Math.max(
          Math.max(1, Math.round(Number(state.longevityYears) || Number(state.years) || 1)),
          Math.max(0, 90 - Math.min(
            retireeAge > 0 ? retireeAge : 90,
            spouseAge > 0 ? spouseAge : 90
          ))
        )
      : Math.max(1, Math.round(Number(state.longevityYears) || Number(state.years) || 1)),
    contingencyYears: Math.max(0, Math.round(Number(state.contingencyYears) || 0)),
    legacyGoal,
    targetCorpusToday,
    preferSimpleProducts: Number(state.preferSimpleProducts) === 1,
    avoidCreditRisk: Number(state.avoidCreditRisk) === 1,
    allowAnnuity: Number(state.allowAnnuity) === 1
  };
}

function projectionParamsFromState(params) {
  const profile = householdPlanProfile(params);
  const effectiveYears = Number(profile.useHouseholdPlan ? Math.max(Number(params.years) || 0, profile.longevityYears + profile.contingencyYears) : params.years) || 0;
  const inflation = (Number(params.inflation) || 0) / 100;
  const targetCorpusReal = profile.useHouseholdPlan ? profile.targetCorpusToday : Number(params.targetCorpus) || 0;
  const targetCorpusNominal = targetCorpusReal * Math.pow(1 + inflation, effectiveYears);
  const monthlyCashOverride = Number(params.monthlyCashOverride);
  const effectiveMonthlyCash = Number.isFinite(monthlyCashOverride) ? Math.max(0, monthlyCashOverride) : profile.monthlyCashNeed;
  return {
    ...params,
    years: effectiveYears,
    monthlyTarget: effectiveMonthlyCash,
    targetCorpus: targetCorpusNominal,
    householdProfile: profile.useHouseholdPlan && Number.isFinite(monthlyCashOverride)
      ? { ...profile, monthlyCashNeed: effectiveMonthlyCash, monthlyNeedAfterDependants: effectiveMonthlyCash }
      : profile,
    activeTaxLaw: taxLawFromState(params)
  };
}

function roundToStep(value, step = 20) {
  return Math.round(value / step) * step;
}

function viewportBoundsForWidth(width) {
  const available = Math.max(320, width - (width <= 680 ? 10 : 28));
  if (width <= 680) return { min: 320, max: Math.max(320, Math.min(680, available)) };
  if (width <= 1180) return { min: 640, max: Math.max(640, Math.min(1180, available)) };
  return { min: 1180, max: 2080 };
}

function autoViewportForWidth(width) {
  const available = Math.max(320, width - (width <= 680 ? 10 : 28));
  if (width <= 680) return roundToStep(available, 2);
  if (width <= 1180) return roundToStep(available, 10);
  const target = available >= 1520 ? available * 0.9 : available * 0.94;
  return Math.min(available, clamp(roundToStep(target, 20), 1180, 1880));
}

function formatInr(value) {
  if (!Number.isFinite(Number(value))) return "N/A";
  const abs = Math.abs(value || 0);
  const sign = value < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(abs >= 100000000 ? 1 : 2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(abs >= 1000000 ? 1 : 2)} L`;
  return `${sign}₹${nf.format(abs)}`;
}

function formatFullInr(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}₹${nf.format(Math.abs(value || 0))}`;
}

function formatPct(value) {
  return `${pct.format((value || 0) * 100)}%`;
}

function annualPortfolioRate(params) {
  const expense = (Number(params.expenseRatio) || 0) / 100;
  if (Number(params.useAssetReturns) === 1) {
    const equityShare = (Number(params.equityShare) || 0) / 100;
    const debtShare = 1 - equityShare;
    return ((Number(params.equityReturn) || 0) / 100) * equityShare + ((Number(params.debtReturn) || 0) / 100) * debtShare - expense;
  }
  return (Number(params.annualRate) || 0) / 100 - expense;
}

function equityShareForYear(params = {}, year = 1) {
  const start = clamp((Number(params.equityShare) || 0) / 100, 0, 1);
  if (Number(params.glidePathEnabled) !== 1 || Number(params.useAssetReturns) !== 1) return start;
  const glideYears = Math.max(1, Number(params.glidePathYears) || 1);
  const end = clamp((Number(params.glidePathEndEquity) || 0) / 100, 0, 1);
  const progress = clamp((Math.max(1, Number(year) || 1) - 1) / glideYears, 0, 1);
  return start + (end - start) * progress;
}

function glideParamsForProjectionYear(params = {}, year = 1) {
  if (Number(params.glidePathEnabled) !== 1 || Number(params.useAssetReturns) !== 1) return params;
  return { ...params, equityShare: equityShareForYear(params, year) * 100 };
}

function paramsForProjectionYear(params = {}, year = 1) {
  const glideParams = glideParamsForProjectionYear(params, year);
  const override = Array.isArray(params.sequenceReturnOverrides) ? params.sequenceReturnOverrides[Math.max(0, Math.round(Number(year) || 1) - 1)] : null;
  if (!override) return glideParams;
  if (Number(glideParams.useAssetReturns) === 1) {
    return {
      ...glideParams,
      equityReturn: Number.isFinite(Number(override.equityReturn)) ? Number(override.equityReturn) : glideParams.equityReturn,
      debtReturn: Number.isFinite(Number(override.debtReturn)) ? Number(override.debtReturn) : glideParams.debtReturn
    };
  }
  return {
    ...glideParams,
    annualRate: Number.isFinite(Number(override.annualRate)) ? Number(override.annualRate) : glideParams.annualRate
  };
}

function annualPortfolioIncomeRate(params) {
  if (Number(params.useAssetReturns) === 1) {
    const equityShare = clamp((Number(params.equityShare) || 0) / 100, 0, 1);
    const debtShare = 1 - equityShare;
    return Math.max(0, (Number(params.equityIncomeYield) || 0) / 100) * equityShare
      + Math.max(0, (Number(params.debtIncomeYield) || 0) / 100) * debtShare;
  }
  return Math.max(0, (Number(params.portfolioIncomeYield) || 0) / 100);
}

function compoundRate(rate, periods) {
  return Math.pow(1 + rate / periods, periods) - 1;
}

function effectiveYield(params) {
  return compoundRate(annualPortfolioRate(params), Number(params.compounding) || 1);
}

function cessMultiplier(params) {
  return Number(params.includeCess) === 1 ? 1 + taxLawFromState(params).cess : 1;
}

function cessRate(params) {
  return Number(params.includeCess) === 1 ? taxLawFromState(params).cess : 0;
}

function useFlatTaxProfile(params) {
  return params.taxProfileMode === "flat";
}

function useManualTaxOverride(params) {
  return (Number(params.taxRate) || 0) > 0;
}

function emptyTaxStreams() {
  return { normalIncome: 0, equityLtcg: 0, equityStcg: 0, listedBondLtcg: 0, section80TTBInterest: 0 };
}

// R4.9.5i perf fix: normalizeTaxStreams + addTaxStreams are on the MC hot path
// (~1M calls per 1000-sample SWP MC). Original used Object.keys(emptyTaxStreams())
// .reduce(...) which allocated multiple objects + arrays per call. Inlined the
// 5-field shape directly. Capital-gain fields (equityLtcg/equityStcg/listedBondLtcg)
// preserve sign for §74 carry-forward; income fields are clamped non-negative.
// Output shape and per-field math identical to original — zero financial change,
// verified by full Vitest/pytest reference parity post-edit.
function normalizeTaxStreams(streams = {}) {
  return {
    normalIncome: Math.max(0, Number(streams.normalIncome) || 0),
    equityLtcg: Number(streams.equityLtcg) || 0,
    equityStcg: Number(streams.equityStcg) || 0,
    listedBondLtcg: Number(streams.listedBondLtcg) || 0,
    section80TTBInterest: Math.max(0, Number(streams.section80TTBInterest) || 0)
  };
}

function addTaxStreams(left = {}, right = {}) {
  // Equivalent to normalizeTaxStreams(a) + normalizeTaxStreams(b) field-wise.
  // Each pair: a + b where a,b are independently normalized (sign-preserved for
  // gains, non-negative for income). For income fields, clamp the SUM ≥ 0 — same
  // semantics as the original (which clamped each input then summed, since
  // non-negative + non-negative is already non-negative). For gains, just sum.
  return {
    normalIncome: (Math.max(0, Number(left.normalIncome) || 0)) + (Math.max(0, Number(right.normalIncome) || 0)),
    equityLtcg: (Number(left.equityLtcg) || 0) + (Number(right.equityLtcg) || 0),
    equityStcg: (Number(left.equityStcg) || 0) + (Number(right.equityStcg) || 0),
    listedBondLtcg: (Number(left.listedBondLtcg) || 0) + (Number(right.listedBondLtcg) || 0),
    section80TTBInterest: (Math.max(0, Number(left.section80TTBInterest) || 0)) + (Math.max(0, Number(right.section80TTBInterest) || 0))
  };
}

function totalTaxStreams(streams = {}) {
  const clean = normalizeTaxStreams(streams);
  return Math.max(0, clean.normalIncome + clean.equityLtcg + clean.equityStcg + clean.listedBondLtcg);
}

// R4.9.5i perf fix: applyLossToCapitalBuckets is 28.9% of MC self-time per
// cpuprofile (1M+ calls per 1000-sample SWP MC). Three optimizations:
//   1. Early return when loss <= 0 (avoids allocations + work entirely)
//   2. Memoize the specialRate-sorted key order (deterministic per params)
//   3. for-of replaces forEach (minor V8 win, larger because hot loop)
// Output identical to original; algorithm unchanged. Verified by full Vitest +
// pytest reference parity post-edit.
const __sortedKeysCache = new Map();
function applyLossToCapitalBuckets(gains, loss, keys, params = {}) {
  const remainingInit = Math.max(0, loss);
  const applied = { equityLtcg: 0, equityStcg: 0, listedBondLtcg: 0 };
  if (remainingInit === 0) return { remaining: 0, applied };
  // Sort cached: same keys + same taxRegime → same sortedRate order
  const cacheKey = `${keys.join(",")}|${params.taxRegime || "new"}`;
  let ordered = __sortedKeysCache.get(cacheKey);
  if (!ordered) {
    ordered = [...keys].sort((left, right) => specialRate(right, params) - specialRate(left, params));
    if (__sortedKeysCache.size > 64) __sortedKeysCache.clear();
    __sortedKeysCache.set(cacheKey, ordered);
  }
  let remaining = remainingInit;
  for (const key of ordered) {
    if (remaining <= 0) break;
    const gainValue = gains[key] || 0;
    const offset = Math.min(Math.max(0, gainValue), remaining);
    gains[key] = Math.max(0, gainValue - offset);
    applied[key] += offset;
    remaining -= offset;
  }
  return { remaining, applied };
}

// Q55 — §74 carry-forward pool helpers (FIFO by expiryAY, 8-year window).
// Pool shape: { stclPool: [{amount, expiryAY}], ltclPool: [{amount, expiryAY}] }
// The pool object is mutated in place so callers accumulate state across years.
const CARRY_FORWARD_YEARS = 8;

function _cfExpire(pool, currentAY) {
  let expired = 0;
  const remaining = pool.filter((e) => {
    if (e.expiryAY < currentAY) { expired += e.amount; return false; }
    return true;
  });
  return { remaining, expired };
}

function _cfApply(pool, gain) {
  let rem = gain;
  let used = 0;
  const newPool = [];
  for (const entry of pool) {
    if (rem <= 0) { newPool.push(entry); continue; }
    const use = Math.min(rem, entry.amount);
    rem -= use;
    used += use;
    const leftover = entry.amount - use;
    if (leftover > 0) newPool.push({ amount: leftover, expiryAY: entry.expiryAY });
  }
  return { newPool, remGain: rem, used };
}

function applyAndUpdateCarryForwardPool(pool, currentAY, grossStcg, grossLtcg, newStcl, newLtcl) {
  // Step 1: expire stale entries
  const { remaining: stclPool, expired: expiredStcl } = _cfExpire(pool.stclPool, currentAY);
  const { remaining: ltclPool, expired: expiredLtcl } = _cfExpire(pool.ltclPool, currentAY);
  pool.stclPool = stclPool;
  pool.ltclPool = ltclPool;

  // Step 2: apply STCL pool to STCG
  let { newPool: stclAfterStcg, remGain: remStcg, used: stclUsedOnStcg } = _cfApply(pool.stclPool, grossStcg);
  pool.stclPool = stclAfterStcg;

  // Step 3: apply residual STCL pool to LTCG
  let { newPool: stclAfterLtcg, remGain: remLtcg, used: stclUsedOnLtcg } = _cfApply(pool.stclPool, grossLtcg);
  pool.stclPool = stclAfterLtcg;

  // Step 4: apply LTCL pool to LTCG (NOT STCG — type isolation)
  let { newPool: ltclAfterLtcg, remGain: remLtcgFinal } = _cfApply(pool.ltclPool, remLtcg);
  pool.ltclPool = ltclAfterLtcg;

  // Step 5: record new losses for this AY
  const expiryAY = currentAY + CARRY_FORWARD_YEARS;
  if (newStcl > 0) pool.stclPool.push({ amount: newStcl, expiryAY });
  if (newLtcl > 0) pool.ltclPool.push({ amount: newLtcl, expiryAY });

  return {
    netStcg: Math.max(0, remStcg),
    netLtcg: Math.max(0, remLtcgFinal),
    expiredStcl,
    expiredLtcl
  };
}

// fin-8fb F1 — §74 carry-forward, live in projections.
// AY 2026-27 anchors projection year 1; each subsequent projection year
// advances the assessment year by one (year 2 -> AY 2027-28, etc).
const BASE_ASSESSMENT_YEAR = 2027;
function assessmentYearForProjectionYear(year) {
  return BASE_ASSESSMENT_YEAR + (Math.round(Number(year) || 1) - 1);
}

// fin-8fb F1 — apply the §74 pool ONCE per projection year, at the year
// boundary, against that year's fully-aggregated streams.
//
// Why once, and only here: calculateTaxProfile -> calculateRetireeTaxProfile
// (or the flat/override modes) -> netCapitalGainStreams mutates the pool it
// is given (expires stale entries, consumes them against this call's gains,
// then records this call's residual loss) as a side effect of every single
// invocation. previewLotSale/redeemNetFromBucket/estimatePrincipalSaleForNet
// call the tax-profile machinery many times per month (bisection search on
// candidate sale amounts, plus a separate "before" and "after" profile per
// lot) to size a single redemption. Threading a live, mutating pool into the
// params used by that hot path would consume/record pool entries dozens of
// times over for what is logically one year's transactions.
// Comparing a pool-free profile against a pool-attached profile computed on
// the IDENTICAL final streams isolates exactly the incremental benefit of
// carry-forward, and commits the pool mutation exactly once — the "before"
// call never touches the pool (no carryForwardPool key), so it cannot
// double-consume or double-record.
function applyYearEndCarryForward(pool, yearParams, finalStreams, year) {
  const currentAY = assessmentYearForProjectionYear(year);
  const noPoolProfile = calculateTaxProfile(yearParams, finalStreams);
  const pooledParams = { ...yearParams, carryForwardPool: pool, currentAY };
  const withPoolProfile = calculateTaxProfile(pooledParams, finalStreams);
  return {
    taxBenefit: Math.max(0, noPoolProfile.totalTax - withPoolProfile.totalTax),
    taxableGainBenefit: Math.max(0, noPoolProfile.taxableInvestmentIncome - withPoolProfile.taxableInvestmentIncome)
  };
}

function netCapitalGainStreams(streams = {}, params = {}) {
  const clean = normalizeTaxStreams(streams);
  const gains = {
    equityLtcg: Math.max(0, clean.equityLtcg),
    equityStcg: Math.max(0, clean.equityStcg),
    listedBondLtcg: Math.max(0, clean.listedBondLtcg)
  };
  const losses = {
    longTerm: Math.max(0, -Math.min(0, clean.equityLtcg)) + Math.max(0, -Math.min(0, clean.listedBondLtcg)),
    shortTerm: Math.max(0, -Math.min(0, clean.equityStcg))
  };
  // Within-year setoff (existing behavior)
  const longSetoff = applyLossToCapitalBuckets(gains, losses.longTerm, ["equityLtcg", "listedBondLtcg"], params);
  const shortSetoff = applyLossToCapitalBuckets(gains, losses.shortTerm, ["equityStcg", "equityLtcg", "listedBondLtcg"], params);

  // Q55 carry-forward pool: apply prior-year losses and record new losses
  const pool = params.carryForwardPool;
  if (pool && typeof pool === "object") {
    const currentAY = Math.round(Number(params.currentAY) || 0) || new Date().getFullYear() + 1;
    const grossStcg = gains.equityStcg;
    const grossLtcg = gains.equityLtcg + gains.listedBondLtcg;
    const newStcl = longSetoff.remaining > 0 ? 0 : shortSetoff.remaining;  // residual ST loss after within-year setoff
    const newLtcl = longSetoff.remaining;  // residual LT loss after within-year setoff
    const cf = applyAndUpdateCarryForwardPool(pool, currentAY, grossStcg, grossLtcg, newStcl, newLtcl);
    // Overwrite gains with carry-forward-reduced values
    gains.equityStcg = cf.netStcg;
    // Distribute netLtcg proportionally between equityLtcg and listedBondLtcg
    const totalLtcg = gains.equityLtcg + gains.listedBondLtcg;
    if (totalLtcg > 0) {
      gains.equityLtcg = cf.netLtcg * (gains.equityLtcg / totalLtcg);
      gains.listedBondLtcg = cf.netLtcg * (gains.listedBondLtcg / totalLtcg);
    } else {
      gains.equityLtcg = 0;
      gains.listedBondLtcg = 0;
    }
  }

  return {
    gains,
    losses,
    lossSetoff: {
      equityLtcg: longSetoff.applied.equityLtcg + shortSetoff.applied.equityLtcg,
      equityStcg: shortSetoff.applied.equityStcg,
      listedBondLtcg: longSetoff.applied.listedBondLtcg + shortSetoff.applied.listedBondLtcg
    },
    carryForward: {
      longTerm: longSetoff.remaining,
      shortTerm: shortSetoff.remaining
    }
  };
}

function normalizeTaxRuleRate(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric > 1 ? numeric / 100 : numeric;
}

function cleanSlabArray(slabs, fallback) {
  const source = Array.isArray(slabs) && slabs.length ? slabs : fallback;
  const cleaned = source.map((band) => ({
    upto: band.upto === null || band.upto === undefined ? Infinity : Math.max(0, Number(band.upto) || 0),
    rate: normalizeTaxRuleRate(band.rate)
  })).filter((band) => band.upto > 0 || band.upto === Infinity);
  return cleaned.length ? cleaned : fallback.map((band) => ({ upto: band.upto === null ? Infinity : band.upto, rate: normalizeTaxRuleRate(band.rate) }));
}

function cleanSurchargeBands(bands, fallback) {
  const source = Array.isArray(bands) && bands.length ? bands : fallback;
  const cleaned = source.map((band) => ({
    above: Math.max(0, Number(band.above) || 0),
    upto: band.upto === null || band.upto === undefined ? Infinity : Math.max(0, Number(band.upto) || 0),
    rate: normalizeTaxRuleRate(band.rate),
    oldRegimeRate: band.oldRegimeRate === undefined ? null : normalizeTaxRuleRate(band.oldRegimeRate),
    specialRateCap: band.specialRateCap === undefined ? null : normalizeTaxRuleRate(band.specialRateCap)
  })).filter((band) => band.upto === Infinity || band.upto > band.above);
  return cleaned.length ? cleaned : fallback.map((band) => ({
    above: band.above,
    upto: band.upto === null ? Infinity : band.upto,
    rate: normalizeTaxRuleRate(band.rate),
    oldRegimeRate: band.oldRegimeRate === undefined ? null : normalizeTaxRuleRate(band.oldRegimeRate),
    specialRateCap: band.specialRateCap === undefined ? null : normalizeTaxRuleRate(band.specialRateCap)
  }));
}

function cleanProductTaxRules(rules = {}, fallback = DEFAULT_TAX_LAW.productTaxRules) {
  const cleaned = { ...fallback };
  Object.entries(rules || {}).forEach(([key, rule]) => {
    if (!rule || typeof rule !== "object") return;
    cleaned[key] = {
      ...cleaned[key],
      ...rule,
      longTermMonths: rule.longTermMonths === undefined ? cleaned[key]?.longTermMonths : Math.max(1, Number(rule.longTermMonths) || 1),
      effectiveFromYear: rule.effectiveFromYear === undefined ? cleaned[key]?.effectiveFromYear : Math.max(1900, Math.round(Number(rule.effectiveFromYear) || 1900))
    };
  });
  return cleaned;
}

function sanitizeTaxLaw(raw = {}) {
  const fallback = DEFAULT_TAX_LAW;
  const old = raw.oldRegimeSlabs || {};
  const special = raw.specialRates || {};
  const rebates = raw.rebates || {};
  const deductions = raw.deductions || {};
  const tds = raw.tdsDefaults || {};
  return {
    version: String(raw.version || fallback.version),
    source: String(raw.source || fallback.source),
    sourceUrl: String(raw.sourceUrl || fallback.sourceUrl),
    updatedOn: String(raw.updatedOn || fallback.updatedOn),
    newRegimeSlabs: cleanSlabArray(raw.newRegimeSlabs, fallback.newRegimeSlabs),
    oldRegimeSlabs: {
      below60: cleanSlabArray(old.below60, fallback.oldRegimeSlabs.below60),
      senior: cleanSlabArray(old.senior, fallback.oldRegimeSlabs.senior),
      superSenior: cleanSlabArray(old.superSenior, fallback.oldRegimeSlabs.superSenior)
    },
    rebates: {
      new: {
        threshold: Math.max(0, Number(rebates.new?.threshold ?? fallback.rebates.new.threshold) || 0),
        max: Math.max(0, Number(rebates.new?.max ?? fallback.rebates.new.max) || 0),
        marginalRelief: rebates.new?.marginalRelief !== false
      },
      old: {
        threshold: Math.max(0, Number(rebates.old?.threshold ?? fallback.rebates.old.threshold) || 0),
        max: Math.max(0, Number(rebates.old?.max ?? fallback.rebates.old.max) || 0),
        marginalRelief: rebates.old?.marginalRelief === true
      }
    },
    specialRates: {
      equityLtcg: normalizeTaxRuleRate(special.equityLtcg ?? fallback.specialRates.equityLtcg),
      equityStcg: normalizeTaxRuleRate(special.equityStcg ?? fallback.specialRates.equityStcg),
      listedBondLtcg: normalizeTaxRuleRate(special.listedBondLtcg ?? fallback.specialRates.listedBondLtcg)
    },
    deductions: {
      section80TTB: {
        max: Math.max(0, Number(deductions.section80TTB?.max ?? fallback.deductions.section80TTB.max) || 0),
        appliesTo: String(deductions.section80TTB?.appliesTo || fallback.deductions.section80TTB.appliesTo)
      },
      standardDeduction: {
        new: Math.max(0, Number(deductions.standardDeduction?.new ?? fallback.deductions.standardDeduction.new) || 0),
        old: Math.max(0, Number(deductions.standardDeduction?.old ?? fallback.deductions.standardDeduction.old) || 0),
        appliesTo: String(deductions.standardDeduction?.appliesTo || fallback.deductions.standardDeduction.appliesTo)
      }
    },
    surchargeBands: cleanSurchargeBands(raw.surchargeBands, fallback.surchargeBands),
    surchargeMarginalRelief: raw.surchargeMarginalRelief !== false,
    tdsDefaults: {
      interest: normalizeTaxRuleRate(tds.interest ?? fallback.tdsDefaults.interest),
      distribution: normalizeTaxRuleRate(tds.distribution ?? fallback.tdsDefaults.distribution)
    },
    equityLtcgExemption: Math.max(0, Number(raw.equityLtcgExemption ?? fallback.equityLtcgExemption) || 0),
    equityLongTermMonths: Math.max(1, Number(raw.equityLongTermMonths ?? fallback.equityLongTermMonths) || fallback.equityLongTermMonths),
    listedBondLongTermMonths: Math.max(1, Number(raw.listedBondLongTermMonths ?? fallback.listedBondLongTermMonths) || fallback.listedBondLongTermMonths),
    section87AInterpretations: { ...fallback.section87AInterpretations, ...(raw.section87AInterpretations || {}) },
    productTaxRules: cleanProductTaxRules(raw.productTaxRules, fallback.productTaxRules),
    cess: normalizeTaxRuleRate(raw.cess ?? fallback.cess),
    debtMfTaxation: String(raw.debtMfTaxation || fallback.debtMfTaxation),
    notes: String(raw.notes || fallback.notes)
  };
}

// R4.9.5i perf fix: taxLawFromState was JSON.parse + sanitizeTaxLaw on every
// call. MC hot path (~1M calls per 1000-sample SWP run) re-parsed the same
// taxLawJson millions of times. Memoize by source string identity — same
// taxLawJson → same sanitized law object. Cache size bounded (clear at >32
// entries to avoid leaks across tax-law edits in long-lived sessions). Zero
// financial behavior change: returns the same sanitized object the original
// JSON.parse path would have produced.
const __lawByStateCache = new Map();
const __defaultTaxLawJson = formatTaxLawJson(DEFAULT_TAX_LAW);
function taxLawFromState(params = {}) {
  if (params.activeTaxLaw) return params.activeTaxLaw;
  const source = params.taxLawJson || __defaultTaxLawJson;
  const cached = __lawByStateCache.get(source);
  if (cached) return cached;
  let law;
  try {
    law = sanitizeTaxLaw(JSON.parse(source));
  } catch (error) {
    law = sanitizeTaxLaw(DEFAULT_TAX_LAW);
  }
  if (__lawByStateCache.size > 32) __lawByStateCache.clear();
  __lawByStateCache.set(source, law);
  return law;
}

function taxLawParseStatus(params = {}) {
  try {
    const law = sanitizeTaxLaw(JSON.parse(params.taxLawJson || formatTaxLawJson(DEFAULT_TAX_LAW)));
    return { ok: true, message: "Active", law };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function specialRate(kind, params = {}) {
  const rates = taxLawFromState(params).specialRates;
  if (kind === "equityLtcg") return rates.equityLtcg;
  if (kind === "equityStcg") return rates.equityStcg;
  if (kind === "listedBondLtcg") return rates.listedBondLtcg;
  return 0;
}

function slabBands(params) {
  const law = taxLawFromState(params);
  if (params.taxRegime === "old") {
    return law.oldRegimeSlabs[params.ageBand] || law.oldRegimeSlabs.below60;
  }
  return law.newRegimeSlabs;
}

function basicExemptionLimit(params) {
  return slabBands(params)[0].upto;
}

function slabTaxBeforeCess(income, params) {
  const taxable = Math.max(0, Number(income) || 0);
  let lower = 0;
  let tax = 0;
  for (const band of slabBands(params)) {
    const upper = band.upto;
    const slice = Math.max(0, Math.min(taxable, upper) - lower);
    tax += slice * band.rate;
    if (taxable <= upper) break;
    lower = upper;
  }
  return tax;
}

function applySection87A(normalTaxBeforeCess, normalTaxableIncome, params, aggregateTaxableIncome = normalTaxableIncome, hasSpecialRateIncome = false) {
  const tax = Math.max(0, Number(normalTaxBeforeCess) || 0);
  const income = Math.max(0, Number(normalTaxableIncome) || 0);
  if (Number(params.section87A) !== 1 || params.residentStatus !== "resident") return tax;
  const rule = params.taxRegime === "old" ? taxLawFromState(params).rebates.old : taxLawFromState(params).rebates.new;
  const interpretation = params.section87AInterpretation || "cbdtConservative";
  if (interpretation === "offForSpecialMix" && hasSpecialRateIncome) return tax;
  const eligibilityIncome = interpretation === "normalOnly" ? income : Math.max(0, Number(aggregateTaxableIncome) || 0);
  if (params.taxRegime === "old") {
    return eligibilityIncome <= rule.threshold ? Math.max(0, tax - Math.min(tax, rule.max)) : tax;
  }
  if (eligibilityIncome <= rule.threshold) return Math.max(0, tax - Math.min(tax, rule.max));
  if (!rule.marginalRelief) return tax;
  const excessOverThreshold = eligibilityIncome - rule.threshold;
  return tax > excessOverThreshold ? Math.max(0, excessOverThreshold) : tax;
}

function allocateBasicExemption(shortfall, gains, params = {}) {
  let remaining = Math.max(0, Number(shortfall) || 0);
  const allocation = { equityStcg: 0, equityLtcg: 0, listedBondLtcg: 0 };
  [
    ["equityStcg", specialRate("equityStcg", params)],
    ["equityLtcg", specialRate("equityLtcg", params)],
    ["listedBondLtcg", specialRate("listedBondLtcg", params)]
  ].sort((a, b) => b[1] - a[1]).forEach(([key]) => {
    if (remaining <= 0) return;
    const used = Math.min(remaining, Math.max(0, gains[key] || 0));
    allocation[key] = used;
    remaining -= used;
  });
  return allocation;
}

function surchargeBandForIncome(totalIncome, params = {}) {
  const income = Math.max(0, Number(totalIncome) || 0);
  const bands = taxLawFromState(params).surchargeBands || [];
  return bands.find((band) => income > band.above && income <= band.upto) || null;
}

function surchargeRates(totalIncome, params = {}) {
  const band = surchargeBandForIncome(totalIncome, params);
  if (!band) return { normal: 0, special: 0, band: null };
  const normal = params.taxRegime === "old" && band.oldRegimeRate !== null ? band.oldRegimeRate : band.rate;
  const special = band.specialRateCap !== null ? Math.min(normal, band.specialRateCap) : normal;
  return { normal, special, band };
}

function taxAtSurchargeThreshold(threshold, params = {}) {
  // fin-c96.2 (R4.2): The cap must be total tax at τ using the LOWER-BAND surcharge rate,
  // not bare slab tax. At τ=50L the lower band has 0% surcharge (no change); at
  // τ=1Cr/2Cr/5Cr the lower band has 10%/15%/25% surcharge which must be included.
  // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §5.3
  const before = slabTaxBeforeCess(threshold, params);
  const taxAfter87A = applySection87A(before, threshold, params);
  // surchargeRates(threshold) returns the rate for income at exactly threshold,
  // which is the band whose above < threshold <= upto — i.e. the LOWER band.
  const lowerRates = surchargeRates(threshold, params);
  return taxAfter87A * (1 + (lowerRates.normal || 0));
}

function applySurchargeRelief(taxBeforeCess, surcharge, totalIncome, params = {}) {
  if (!taxLawFromState(params).surchargeMarginalRelief || surcharge <= 0) {
    return { surcharge, marginalRelief: 0 };
  }
  const band = surchargeBandForIncome(totalIncome, params);
  if (!band) return { surcharge, marginalRelief: 0 };
  const threshold = band.above;
  // fin-c96.2 (R4.2): New-regime ₹5Cr guard — under ITA §115BAC(3)(a) the surcharge
  // is capped at 25% for all income above ₹2Cr, so there is no rate change at ₹5Cr
  // in the new regime. When the effective surcharge rate at totalIncome equals the
  // rate at threshold, there is no cliff and no marginal relief is applicable.
  // Ref: audit/round-4/02-spec-q12-r4-rederivation.md §5.3 / §4 Cliff 4 Sub-case 4a
  const currentRates = surchargeRates(totalIncome, params);
  const lowerRatesAtThreshold = surchargeRates(threshold, params);
  if (currentRates.normal === lowerRatesAtThreshold.normal) {
    return { surcharge, marginalRelief: 0 };
  }
  const taxAtThreshold = taxAtSurchargeThreshold(threshold, params);
  const cap = taxAtThreshold + Math.max(0, totalIncome - threshold);
  const current = taxBeforeCess + surcharge;
  const marginalRelief = Math.max(0, current - cap);
  return {
    surcharge: Math.max(0, surcharge - marginalRelief),
    marginalRelief
  };
}

function form15Eligible(params = {}, totalTax = 0, normalGross = 0) {
  if (Number(params.form15Declaration) !== 1 || params.residentStatus !== "resident") return false;
  if (totalTax > 1) return false;
  if (params.ageBand === "senior" || params.ageBand === "superSenior") return true;
  return normalGross <= basicExemptionLimit(params);
}

function tdsRateForNormalIncome(params = {}) {
  if (Number(params.tdsEnabled) !== 1) return 0;
  const law = taxLawFromState(params);
  const configured = Number(params.interestTdsRate);
  return Number.isFinite(configured) ? Math.max(0, configured) / 100 : law.tdsDefaults.interest;
}

function withholdingRateForProfile(params = {}) {
  if (Number(params.tdsEnabled) !== 1) return 0;
  if (params.residentStatus === "nonResident") {
    const rate = Number(params.nriWithholdingRate);
    return Number.isFinite(rate) ? clamp(rate / 100, 0, 1) : 0.20;
  }
  return tdsRateForNormalIncome(params);
}

function section80TTBEligible(params = {}) {
  return params.taxRegime === "old"
    && params.residentStatus === "resident"
    && (params.ageBand === "senior" || params.ageBand === "superSenior");
}

function standardDeductionLimit(params = {}) {
  const lawDeduction = taxLawFromState(params).deductions?.standardDeduction || DEFAULT_TAX_LAW.deductions.standardDeduction;
  if (String(params.standardDeductionMode || "auto") === "custom") {
    return Math.max(0, Number(params.standardDeduction) || 0);
  }
  return params.taxRegime === "old"
    ? Math.max(0, Number(lawDeduction.old) || 0)
    : Math.max(0, Number(lawDeduction.new) || 0);
}

function calculateRetireeTaxProfile(params, streams = {}) {
  // R4.9.5i perf fix: hoist taxLawFromState + specialRate × 3 + cessRate to a
  // single pre-compute at function entry. Original called these on the MC hot
  // path 5-8× per profile invocation (~1M calls). Even with memoization,
  // Map.get overhead added up. Behavior identical: same field values + math.
  const law = taxLawFromState(params);
  const rates = law.specialRates;
  const cessR = Number(params.includeCess) === 1 ? law.cess : 0;
  const cessMul = 1 + cessR;
  const equityLtcgRate = rates.equityLtcg;
  const equityStcgRate = rates.equityStcg;
  const listedBondLtcgRate = rates.listedBondLtcg;

  const clean = normalizeTaxStreams(streams);
  const otherIncome = Math.max(0, Number(params.otherIncome) || 0);
  const pensionIncome = Math.max(0, Number(params.pensionIncome) || 0);
  const deduction = standardDeductionLimit(params);
  const standardDeductionUsed = Math.min(deduction, pensionIncome);
  const standardDeductionDisallowed = Math.max(0, deduction - standardDeductionUsed);
  const normalGross = pensionIncome + otherIncome + clean.normalIncome;
  const section80TTBLimit = law.deductions?.section80TTB?.max || 0;
  const section80TTBEligibleInterest = Math.min(clean.section80TTBInterest, clean.normalIncome);
  const section80TTBUsed = section80TTBEligible(params)
    ? Math.min(section80TTBLimit, section80TTBEligibleInterest, Math.max(0, normalGross - standardDeductionUsed))
    : 0;
  const section80TTBDisallowed = Math.max(0, section80TTBEligibleInterest - section80TTBUsed);
  const normalTaxableIncome = Math.max(0, normalGross - standardDeductionUsed - section80TTBUsed);
  const normalBeforeRebate = slabTaxBeforeCess(normalTaxableIncome, params);

  const netCapital = netCapitalGainStreams(clean, params);
  const ltcgExemptionUsed = Number(params.harvestLtcg) === 1
    ? Math.min(law.equityLtcgExemption, netCapital.gains.equityLtcg)
    : 0;
  const specialBeforeBasic = {
    equityLtcg: Math.max(0, netCapital.gains.equityLtcg - ltcgExemptionUsed),
    equityStcg: netCapital.gains.equityStcg,
    listedBondLtcg: netCapital.gains.listedBondLtcg
  };
  const specialGross = specialBeforeBasic.equityLtcg + specialBeforeBasic.equityStcg + specialBeforeBasic.listedBondLtcg;
  const normalAfterRebate = applySection87A(
    normalBeforeRebate,
    normalTaxableIncome,
    params,
    normalTaxableIncome + specialGross,
    specialGross > 0
  );
  const rebateUsed = Math.max(0, normalBeforeRebate - normalAfterRebate);
  const basicExemptionUnused = Math.max(0, basicExemptionLimit(params) - normalTaxableIncome);
  // Q57 fin-w2c: new regime CONSERVATIVE (default) restricts basic exemption to slab income only.
  // Old regime: proviso §111A/§112A always allows setoff against STCG/LTCG.
  // New regime LIBERAL: setoff allowed (opt-in, legal grey area).
  const newRegimeBasicExemptionPolicy = params.newRegimeBasicExemptionPolicy || "conservative";
  const allowBasicSetoffOnSpecial = params.taxRegime === "old" || newRegimeBasicExemptionPolicy === "liberal";
  const basicSetoff = params.residentStatus === "resident" && allowBasicSetoffOnSpecial
    ? allocateBasicExemption(basicExemptionUnused, specialBeforeBasic, params)
    : { equityStcg: 0, equityLtcg: 0, listedBondLtcg: 0 };
  const taxableSpecial = {
    equityLtcg: Math.max(0, specialBeforeBasic.equityLtcg - basicSetoff.equityLtcg),
    equityStcg: Math.max(0, specialBeforeBasic.equityStcg - basicSetoff.equityStcg),
    listedBondLtcg: Math.max(0, specialBeforeBasic.listedBondLtcg - basicSetoff.listedBondLtcg)
  };
  const equityLtcgTax = taxableSpecial.equityLtcg * equityLtcgRate;
  const equityStcgTax = taxableSpecial.equityStcg * equityStcgRate;
  const listedBondLtcgTax = taxableSpecial.listedBondLtcg * listedBondLtcgRate;
  const specialBeforeCess = equityLtcgTax + equityStcgTax + listedBondLtcgTax;
  const taxBeforeCess = normalAfterRebate + specialBeforeCess;
  const surchargeIncome = normalTaxableIncome + taxableSpecial.equityLtcg + taxableSpecial.equityStcg + taxableSpecial.listedBondLtcg;
  const surchargeRate = surchargeRates(surchargeIncome, params);
  const normalSurchargeRaw = normalAfterRebate * surchargeRate.normal;
  const specialSurchargeRaw = specialBeforeCess * surchargeRate.special;
  const relief = applySurchargeRelief(taxBeforeCess, normalSurchargeRaw + specialSurchargeRaw, surchargeIncome, params);
  const rawSurcharge = normalSurchargeRaw + specialSurchargeRaw;
  const normalSurcharge = rawSurcharge > 0 ? relief.surcharge * (normalSurchargeRaw / rawSurcharge) : 0;
  const specialSurcharge = rawSurcharge > 0 ? relief.surcharge * (specialSurchargeRaw / rawSurcharge) : 0;
  const surcharge = normalSurcharge + specialSurcharge;
  const cess = (taxBeforeCess + surcharge) * cessR;
  const totalTax = taxBeforeCess + surcharge + cess;
  const withholdingBase = params.residentStatus === "nonResident"
    ? clean.normalIncome + taxableSpecial.equityLtcg + taxableSpecial.equityStcg + taxableSpecial.listedBondLtcg
    : clean.normalIncome;
  const grossTds = form15Eligible(params, totalTax, normalGross) ? 0 : withholdingBase * withholdingRateForProfile(params);

  return {
    mode: "retiree",
    normalIncome: clean.normalIncome,
    otherIncome,
    pensionIncome,
    standardDeductionUsed,
    standardDeductionDisallowed,
    standardDeductionMode: params.standardDeductionMode || "auto",
    standardDeductionLimit: deduction,
    section80TTBUsed,
    section80TTBDisallowed,
    capitalLossSetoff: netCapital.lossSetoff,
    capitalLossCarryForward: netCapital.carryForward,
    normalTaxableIncome,
    normalTaxBeforeRebate: normalBeforeRebate,
    normalTaxAfterRebate: normalAfterRebate,
    rebateUsed,
    rebateInterpretation: params.section87AInterpretation || "offForSpecialMix",
    mixedIncomeCaveat: specialGross > 0 ? "87A relief is disabled by default when special-rate gains are present; special-rate gains keep separate rules." : "",
    ltcgExemptionUsed,
    basicExemptionUsed: basicSetoff.equityStcg + basicSetoff.equityLtcg + basicSetoff.listedBondLtcg,
    taxableInvestmentIncome: Math.max(0, clean.normalIncome - section80TTBUsed) + taxableSpecial.equityLtcg + taxableSpecial.equityStcg + taxableSpecial.listedBondLtcg,
    normalSurcharge,
    specialSurcharge,
    surcharge,
    marginalRelief: relief.marginalRelief,
    surchargeBand: surchargeRate.band,
    normalTax: (normalAfterRebate + normalSurcharge) * cessMul,
    equityLtcgTax: (equityLtcgTax + (specialBeforeCess > 0 ? specialSurcharge * (equityLtcgTax / specialBeforeCess) : 0)) * cessMul,
    equityStcgTax: (equityStcgTax + (specialBeforeCess > 0 ? specialSurcharge * (equityStcgTax / specialBeforeCess) : 0)) * cessMul,
    listedBondLtcgTax: (listedBondLtcgTax + (specialBeforeCess > 0 ? specialSurcharge * (listedBondLtcgTax / specialBeforeCess) : 0)) * cessMul,
    specialTax: (specialBeforeCess + specialSurcharge) * cessMul,
    cess,
    tds: grossTds,
    withholdingBase,
    withholdingRate: withholdingRateForProfile(params),
    tdsRefundEstimate: Math.max(0, grossTds - totalTax),
    tdsCashTimingDrag: Math.max(0, grossTds - totalTax),
    form15Eligible: form15Eligible(params, totalTax, normalGross),
    totalTax,
    streams: clean,
    taxableSpecial
  };
}

function calculateFlatTaxProfile(params, streams = {}) {
  const clean = normalizeTaxStreams(streams);
  const netCapital = netCapitalGainStreams(clean, params);
  const slabRate = (Number(params.taxSlab) || 0) / 100;
  const multiplier = cessMultiplier(params);
  const normalTax = clean.normalIncome * slabRate;
  const equityLtcgTaxable = Number(params.harvestLtcg) === 1
    ? Math.max(0, netCapital.gains.equityLtcg - taxLawFromState(params).equityLtcgExemption)
    : netCapital.gains.equityLtcg;
  const equityLtcgTax = equityLtcgTaxable * specialRate("equityLtcg", params) * multiplier;
  const equityStcgTax = netCapital.gains.equityStcg * specialRate("equityStcg", params) * multiplier;
  const listedBondLtcgTax = netCapital.gains.listedBondLtcg * specialRate("listedBondLtcg", params) * multiplier;
  return {
    mode: "flat",
    normalIncome: clean.normalIncome,
    otherIncome: 0,
    normalTaxableIncome: clean.normalIncome,
    normalTaxBeforeRebate: normalTax,
    normalTaxAfterRebate: normalTax,
    rebateUsed: 0,
    section80TTBUsed: 0,
    section80TTBDisallowed: 0,
    capitalLossSetoff: netCapital.lossSetoff,
    capitalLossCarryForward: netCapital.carryForward,
    ltcgExemptionUsed: Math.max(0, netCapital.gains.equityLtcg - equityLtcgTaxable),
    basicExemptionUsed: 0,
    taxableInvestmentIncome: clean.normalIncome + equityLtcgTaxable + netCapital.gains.equityStcg + netCapital.gains.listedBondLtcg,
    normalTax,
    equityLtcgTax,
    equityStcgTax,
    listedBondLtcgTax,
    specialTax: equityLtcgTax + equityStcgTax + listedBondLtcgTax,
    cess: 0,
    totalTax: normalTax + equityLtcgTax + equityStcgTax + listedBondLtcgTax,
    streams: clean,
    taxableSpecial: { equityLtcg: equityLtcgTaxable, equityStcg: netCapital.gains.equityStcg, listedBondLtcg: netCapital.gains.listedBondLtcg }
  };
}

function calculateTaxProfile(params, streams = {}) {
  const clean = normalizeTaxStreams(streams);
  if (useManualTaxOverride(params)) {
    const rate = (Number(params.taxRate) || 0) / 100;
    const netCapital = netCapitalGainStreams(clean, params);
    const totalIncome = clean.normalIncome + netCapital.gains.equityLtcg + netCapital.gains.equityStcg + netCapital.gains.listedBondLtcg;
    const tax = totalIncome * rate;
    return {
      mode: "override",
      normalIncome: clean.normalIncome,
      otherIncome: 0,
      normalTaxableIncome: clean.normalIncome,
      normalTaxBeforeRebate: clean.normalIncome * rate,
      normalTaxAfterRebate: clean.normalIncome * rate,
      rebateUsed: 0,
      section80TTBUsed: 0,
      section80TTBDisallowed: 0,
      capitalLossSetoff: netCapital.lossSetoff,
      capitalLossCarryForward: netCapital.carryForward,
      ltcgExemptionUsed: 0,
      basicExemptionUsed: 0,
      taxableInvestmentIncome: totalIncome,
      normalTax: clean.normalIncome * rate,
      equityLtcgTax: netCapital.gains.equityLtcg * rate,
      equityStcgTax: netCapital.gains.equityStcg * rate,
      listedBondLtcgTax: netCapital.gains.listedBondLtcg * rate,
      specialTax: (netCapital.gains.equityLtcg + netCapital.gains.equityStcg + netCapital.gains.listedBondLtcg) * rate,
      cess: 0,
      totalTax: tax,
      streams: clean,
      taxableSpecial: { equityLtcg: netCapital.gains.equityLtcg, equityStcg: netCapital.gains.equityStcg, listedBondLtcg: netCapital.gains.listedBondLtcg }
    };
  }
  return useFlatTaxProfile(params) ? calculateFlatTaxProfile(params, clean) : calculateRetireeTaxProfile(params, clean);
}

function investmentTaxProfile(params, streams = {}) {
  const total = calculateTaxProfile(params, streams);
  // Base call: strip carryForwardPool so the pool is not applied to zero-stream base calc
  const baseParams = params.carryForwardPool ? { ...params, carryForwardPool: null } : params;
  const base = calculateTaxProfile(baseParams, emptyTaxStreams());
  return {
    ...total,
    baseTax: base.totalTax,
    tax: Math.max(0, total.totalTax - base.totalTax),
    normalTax: Math.max(0, total.normalTax - base.normalTax),
    specialTax: Math.max(0, total.specialTax - base.specialTax),
    equityLtcgTax: Math.max(0, total.equityLtcgTax - base.equityLtcgTax),
    equityStcgTax: Math.max(0, total.equityStcgTax - base.equityStcgTax),
    listedBondLtcgTax: Math.max(0, total.listedBondLtcgTax - base.listedBondLtcgTax),
    taxableInvestmentIncome: Math.max(0, total.taxableInvestmentIncome - base.taxableInvestmentIncome),
    rebateUsed: Math.max(0, total.rebateUsed - base.rebateUsed),
    rebateLost: Math.max(0, base.rebateUsed - total.rebateUsed),
    section80TTBUsed: Math.max(0, total.section80TTBUsed - base.section80TTBUsed),
    section80TTBDisallowed: Math.max(0, total.section80TTBDisallowed - base.section80TTBDisallowed),
    ltcgExemptionUsed: Math.max(0, total.ltcgExemptionUsed - base.ltcgExemptionUsed),
    basicExemptionUsed: Math.max(0, total.basicExemptionUsed - base.basicExemptionUsed)
  };
}

function acquisitionYearForKind(kind, params = {}) {
  return isEquityLike(kind) ? Number(params.equityAcquisitionYear) || 0 : Number(params.debtAcquisitionYear) || 0;
}

function productClassForInstrument(kind, params = {}) {
  if (kind === "equityLtcg" || kind === "equityStcg" || kind === "equityTaxFree") return params.equityProductClass || "equityMfEtf";
  if (kind === "listedBondLtcg") return params.debtProductClass || "listedBondDebtEtf";
  if (kind === "fdInterest") return "fdInterest";
  if (kind === "debtMfSlab") return params.debtProductClass || "debtMfPost2023";
  return params.debtProductClass || kind;
}

function productRuleForInstrument(kind, params = {}) {
  const law = taxLawFromState(params);
  const productClass = productClassForInstrument(kind, params);
  return {
    productClass,
    rule: law.productTaxRules?.[productClass] || law.productTaxRules?.debtMfPost2023 || {}
  };
}

function holdingMonthsForInstrument(kind, holdingMonths = 999, params = {}) {
  if (holdingMonths === null) return 0;
  const configured = Math.max(0, Number(holdingMonths) || 0);
  if (holdingMonths !== undefined && configured !== 999) return configured;
  const acquisitionYear = acquisitionYearForKind(kind, params);
  if (acquisitionYear > 1900) return Math.max(0, (new Date().getFullYear() - acquisitionYear) * 12); // fin-ajw: dynamic AY
  return configured;
}

function taxStreamsForStreamKey(streamKey, amount) {
  if (streamKey === "equityLtcg") return { ...emptyTaxStreams(), equityLtcg: amount };
  if (streamKey === "equityStcg") return { ...emptyTaxStreams(), equityStcg: amount };
  if (streamKey === "listedBondLtcg") return { ...emptyTaxStreams(), listedBondLtcg: amount };
  return { ...emptyTaxStreams(), normalIncome: amount };
}

function streamsForInstrument(kind, gain, holdingMonths = 999, params = {}) {
  // fin-m66: preserve sign for capital gain streams so losses (gain < 0) flow into
  // netCapitalGainStreams → §74 carry-forward pool. normalIncome streams remain ≥ 0.
  const raw = Number(gain) || 0;
  const amount = raw; // may be negative for capital loss lots
  const law = taxLawFromState(params);
  // Zero gain/loss: no stream entries needed
  if (amount === 0) return emptyTaxStreams();
  if (kind === "equityTaxFree") return emptyTaxStreams();
  const { rule } = productRuleForInstrument(kind, params);
  const monthsHeld = holdingMonthsForInstrument(kind, holdingMonths, params);
  if (kind === "equityStcg") return { ...emptyTaxStreams(), equityStcg: amount };
  if (kind === "equityLtcg") {
    // For a positive gain on a lot with STT-not-paid: taxed as normalIncome.
    // For a loss on such a lot: losses on normalIncome instruments are not §74 capital losses
    // (they reduce normalIncome, which is always ≥ 0 in practice). Clamp to 0.
    if (rule.sttRequired && params.equitySttPaid !== undefined && Number(params.equitySttPaid) !== 1) {
      return { ...emptyTaxStreams(), normalIncome: Math.max(0, amount) };
    }
    const threshold = law.equityLongTermMonths;
    return monthsHeld >= threshold
      ? { ...emptyTaxStreams(), equityLtcg: amount }
      : { ...emptyTaxStreams(), equityStcg: amount };
  }
  if (kind === "listedBondLtcg") {
    const threshold = law.listedBondLongTermMonths;
    return monthsHeld >= threshold
      ? taxStreamsForStreamKey(rule.longTermStream || "listedBondLtcg", amount)
      : taxStreamsForStreamKey(rule.shortTermStream || "normalIncome", Math.max(0, amount));
  }
  if (kind === "debtMfSlab") {
    if (rule.stream) return taxStreamsForStreamKey(rule.stream, Math.max(0, amount));
    const threshold = rule.longTermMonths || 36;
    return monthsHeld >= threshold
      ? taxStreamsForStreamKey(rule.longTermStream || "listedBondLtcg", amount)
      : taxStreamsForStreamKey(rule.shortTermStream || "normalIncome", Math.max(0, amount));
  }
  if (kind === "fdInterest") return { ...emptyTaxStreams(), normalIncome: Math.max(0, amount), section80TTBInterest: Math.max(0, amount) };
  return { ...emptyTaxStreams(), normalIncome: Math.max(0, amount) };
}

function taxableRate(kind, params) {
  if (useManualTaxOverride(params)) return (Number(params.taxRate) || 0) / 100;
  const cess = cessMultiplier(params);
  const slab = (Number(params.taxSlab) || 0) / 100;
  return {
    equityLtcg: specialRate("equityLtcg", params) * cess,
    equityStcg: specialRate("equityStcg", params) * cess,
    equityTaxFree: 0,
    debtMfSlab: slab,
    listedBondLtcg: specialRate("listedBondLtcg", params) * cess,
    fdInterest: slab
  }[kind] ?? 0;
}

function yearlyTax(opening, params) {
  const periods = Number(params.compounding) || 1;
  const expense = (Number(params.expenseRatio) || 0) / 100;
  const equityShare = Number(params.useAssetReturns) === 1 ? equityShareForYear(params, 1) : 0;
  const debtShare = Number(params.useAssetReturns) === 1 ? 1 - equityShare : 1;
  const eqRate = Number(params.useAssetReturns) === 1 ? compoundRate((Number(params.equityReturn) || 0) / 100 - expense, periods) : 0;
  const debtRate = Number(params.useAssetReturns) === 1 ? compoundRate((Number(params.debtReturn) || 0) / 100 - expense, periods) : effectiveYield(params);
  const equityIncomeRate = Number(params.useAssetReturns) === 1 ? Math.max(0, Number(params.equityIncomeYield) || 0) / 100 : 0;
  const debtIncomeRate = Number(params.useAssetReturns) === 1 ? Math.max(0, Number(params.debtIncomeYield) || 0) / 100 : annualPortfolioIncomeRate(params);
  const equityGain = opening * equityShare * eqRate;
  const debtGain = opening * debtShare * debtRate;
  const interest = equityGain + debtGain;
  const equityIncome = Math.max(0, opening * equityShare * equityIncomeRate);
  const debtIncome = Math.max(0, opening * debtShare * debtIncomeRate);
  const equitySpendableIncome = params.equityIncomePolicy === "reinvest" ? 0 : equityIncome;
  const debtSpendableIncome = params.debtIncomePolicy === "reinvest" ? 0 : debtIncome;
  const equityStreams = equityIncome > 0 && params.equityInstrument !== "equityTaxFree"
    ? { ...emptyTaxStreams(), normalIncome: equityIncome }
    : emptyTaxStreams();
  const debtStreams = streamsForInstrument(params.debtInstrument, debtIncome, 999, params);
  const streams = addTaxStreams(equityStreams, debtStreams);
  const taxProfile = investmentTaxProfile(params, streams);
  const equityTax = taxProfile.equityLtcgTax + taxProfile.equityStcgTax;
  const debtTax = Math.max(0, taxProfile.tax - equityTax);
  return {
    interest,
    tax: taxProfile.tax,
    realizedIncome: equityIncome + debtIncome,
    spendableIncome: Math.max(0, equitySpendableIncome + debtSpendableIncome - taxProfile.tax),
    reinvestOnlyIncome: Math.max(0, equityIncome + debtIncome - equitySpendableIncome - debtSpendableIncome),
    unrealizedGrowth: Math.max(0, interest - equityIncome - debtIncome),
    equityGain,
    debtGain,
    equityIncome,
    debtIncome,
    equitySpendableIncome,
    debtSpendableIncome,
    equityTax,
    debtTax,
    taxProfile,
    streams,
    normalIncome: streams.normalIncome,
    specialGain: streams.equityLtcg + streams.equityStcg + streams.listedBondLtcg
  };
}

function saleStreamsForPrincipalDrawdown(grossSale, params) {
  const sale = Math.max(0, Number(grossSale) || 0);
  if (sale <= 0) return emptyTaxStreams();
  const gainRatio = clamp(1 - (Number(params.costBasisPct) || 0) / 100, 0, 1);
  const equityShare = Number(params.useAssetReturns) === 1 ? clamp((Number(params.equityShare) || 0) / 100, 0, 1) : 0;
  const equitySale = sale * equityShare;
  const debtSale = sale - equitySale;
  const costRatio = clamp((Number(params.costBasisPct) || 0) / 100, 0, 1.5);
  const equityCost = equitySale * costRatio;
  const useFmv = Number(params.useFmvGrandfathering) === 1
    && isEquityLike(params.equityInstrument)
    && (Number(params.equityAcquisitionYear) || 0) <= 2018
    && holdingMonthsForInstrument(params.equityInstrument, Math.max(0, Number(params.legacyHoldingYears) || 0) * 12, params) >= taxLawFromState(params).equityLongTermMonths
    && (Number(params.equityFmv2018Pct) || 0) > 0;
  const equityGain = useFmv
    ? grandfatheredEquityGain(equitySale, equityCost, equitySale * clamp((Number(params.equityFmv2018Pct) || 0) / 100, 0, 2))
    : Math.max(0, equitySale - equityCost);
  const debtGain = Math.max(0, debtSale * gainRatio);
  return addTaxStreams(
    streamsForInstrument(params.equityInstrument, equityGain, Math.max(0, Number(params.legacyHoldingYears) || 0) * 12, params),
    streamsForInstrument(params.debtInstrument, debtGain, Math.max(0, Number(params.legacyHoldingYears) || 0) * 12, params)
  );
}

function estimatePrincipalSaleForNet(targetNetCash, opening, params, existingStreams = emptyTaxStreams()) {
  const target = Math.max(0, Number(targetNetCash) || 0);
  const maxSale = Math.max(0, Number(opening) || 0);
  const before = investmentTaxProfile(params, existingStreams);
  const preview = (gross) => {
    const saleStreams = saleStreamsForPrincipalDrawdown(gross, params);
    const after = investmentTaxProfile(params, addTaxStreams(existingStreams, saleStreams));
    const tax = Math.max(0, after.tax - before.tax);
    return {
      gross,
      tax,
      net: Math.max(0, gross - tax),
      taxProfile: after,
      streams: saleStreams,
      realizedGain: totalTaxStreams(saleStreams),
      taxableGain: Math.max(0, after.taxableInvestmentIncome - before.taxableInvestmentIncome),
      ltcgExemptionUsed: Math.max(0, after.ltcgExemptionUsed - before.ltcgExemptionUsed),
      basicExemptionUsed: Math.max(0, after.basicExemptionUsed - before.basicExemptionUsed),
      rebateUsed: Math.max(0, after.rebateUsed - before.rebateUsed),
      rebateLost: Math.max(0, before.rebateUsed - after.rebateUsed)
    };
  };
  if (target <= 0 || maxSale <= 0) return preview(0);
  if (preview(maxSale).net <= target) return preview(maxSale);
  let lo = 0;
  let hi = maxSale;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (preview(mid).net >= target) hi = mid; else lo = mid;
  }
  return preview(hi);
}

function monthlyCashNeedForYear(params = {}, year = 1) {
  const profile = params.householdProfile || householdPlanProfile(params);
  if (Number.isFinite(Number(params.monthlyCashOverride))) return Math.max(0, Number(params.monthlyCashOverride) || 0);
  if (!profile.useHouseholdPlan) return Math.max(0, Number(params.monthlyTarget) || 0);
  const actualYear = Math.max(1, Math.round(Number(params.sequenceYearOffset) || 0) + year);
  const dependantNeed = actualYear <= profile.dependantYears ? profile.expenses.dependant : 0;
  return Math.max(0, profile.expenses.essential + profile.expenses.discretionary + profile.expenses.spouse + dependantNeed - profile.incomeFloor);
}

// fin-8fb F3: sums every goal whose year matches this projection year, each
// inflated (or not) per its own entry flag — same inflationFactor convention
// the prior single-goal implementation used.
function plannedLumpSumForYear(params = {}, year = 1, inflationFactor = 1) {
  const profile = params.householdProfile || householdPlanProfile(params);
  if (!profile.useHouseholdPlan) return 0;
  const actualYear = Math.max(1, Math.round(Number(params.sequenceYearOffset) || 0) + year);
  const goals = Array.isArray(profile.plannedLumpSums) ? profile.plannedLumpSums : [];
  let total = 0;
  for (const goal of goals) {
    if (goal.year !== actualYear) continue;
    total += goal.amount * (goal.inflate ? inflationFactor : 1);
  }
  return total;
}

function targetAnnualCashForYear(params = {}, year = 1, inflationFactor = 1) {
  const monthly = monthlyCashNeedForYear(params, year);
  const recurring = monthly * 12 * (Number(params.inflateWithdrawals) === 1 ? inflationFactor : 1);
  return recurring + plannedLumpSumForYear(params, year, inflationFactor);
}

function targetMonthlyCashForMonth(params = {}, year = 1, month = 1, inflationFactor = 1) {
  const recurring = monthlyCashNeedForYear(params, year) * (Number(params.inflateWithdrawals) === 1 ? inflationFactor : 1);
  return recurring + (month === 1 ? plannedLumpSumForYear(params, year, inflationFactor) : 0);
}

// fin-8fb F2 — dynamic withdrawal rules (guardrails / percent-of-corpus).
//
// Pure per-year decision helper. Engines hold spendingMultiplier,
// heldInflationFactor, initialRate, and priorYearReturn as LOCAL variables
// (never on the shared params object — same discipline as F1's
// carryForwardPool) and call this once per projection year, at the year
// boundary, to resolve THIS year's recurring annual cash target and the
// state to carry into next year.
//
// Scope: operates ONLY on the recurring cash need (monthlyCashNeedForYear x
// 12, escalated per rule). Planned lump sums are never scaled by the
// multiplier or by percentOfCorpus — callers add plannedLumpSumForYear(...)
// on top of this function's annualCashTarget, using the natural (un-held,
// un-multiplied) inflation factor, exactly as targetAnnualCashForYear does
// today.
//
// "fixed" mode short-circuits before any rule-specific math and reproduces
// the exact expression targetAnnualCashForYear/targetMonthlyCashForMonth
// already compute (same operands, same order) so engines integrating this
// helper stay byte-identical to pre-F2 output at default state.
//
// Guardrails semantics (simplified Guyton-Klinger), evaluated at year >= 2
// once initialRate is established from year 1:
//   1. plannedAnnual = baseAnnualCash x candidateInflationFactor x multiplier
//      (candidateInflationFactor = one more compounding step on top of last
//      year's ACTUALLY-APPLIED, possibly-held, factor -- see below).
//      currentRate = plannedAnnual / openingCorpus.
//   2. Capital-preservation cut: currentRate > initialRate x (1+band) =>
//      multiplier x= (1-adjust), guardrailAction "cut".
//   3. Prosperity raise: currentRate < initialRate x (1-band) =>
//      multiplier x= (1+adjust), guardrailAction "raise".
//   4. Otherwise, inflation-hold: if last year's portfolio return was
//      negative AND currentRate is still above initialRate, withhold this
//      year's inflation escalation (freeze the held factor at last year's
//      level instead of advancing it) -- guardrailAction "inflation-hold".
//      Checked only when neither band rule fired, so an engineered band
//      breach always reports as "cut"/"raise" even in a prior-loss year.
//   5. multiplier is always clamped to [0.5, 2.0].
// The held inflation factor is genuinely stateful: a freeze is a permanent
// one-year skip, not a deferred catch-up -- later years keep compounding
// from the frozen level, matching classic Guyton-Klinger.
//
// percentOfCorpus: annualCashTarget = percentOfCorpusRate% x openingCorpus,
// every year (no multiplier, no band/hold state). inflateWithdrawals is
// bypassed by design (documented in model-contract.md).
//
// Floor (both dynamic rules): spendingFloorMonthly is expressed in today's
// rupees and always escalates by the NATURAL (un-held) inflation factor,
// regardless of rule or holdback, then annualCashTarget is floored at
// floorMonthly x 12 x naturalInflationFactor.
function resolveDynamicSpending({
  rule = "fixed",
  year = 1,
  openingCorpus = 0,
  baseAnnualCash = 0,
  inflationFactor = 1,
  heldInflationFactor = 1,
  initialRate = 0,
  multiplier = 1,
  priorYearReturn = null,
  params = {}
} = {}) {
  const naturalInflationFactor = Number(params.inflateWithdrawals) === 1 ? (Number(inflationFactor) || 0) : 1;
  const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const safeHeld = Number.isFinite(heldInflationFactor) && heldInflationFactor > 0 ? heldInflationFactor : 1;
  const floorMonthly = Math.max(0, Number(params.spendingFloorMonthly) || 0);
  const floorAnnual = floorMonthly > 0 ? floorMonthly * 12 * naturalInflationFactor : 0;

  if (rule !== "guardrails" && rule !== "percentOfCorpus") {
    // fixed (and any unrecognized rule, guarded upstream in normalizeState):
    // identical expression to targetAnnualCashForYear's recurring term.
    return {
      annualCashTarget: baseAnnualCash * naturalInflationFactor,
      nextMultiplier: 1,
      nextInflationFactor: naturalInflationFactor,
      inflationHeld: false,
      guardrailAction: "none"
    };
  }

  if (rule === "percentOfCorpus") {
    const rate = Math.max(0, Number(params.percentOfCorpusRate) || 0) / 100;
    const raw = rate * Math.max(0, openingCorpus);
    return {
      annualCashTarget: Math.max(raw, floorAnnual),
      nextMultiplier: 1,
      nextInflationFactor: naturalInflationFactor,
      inflationHeld: false,
      guardrailAction: "none"
    };
  }

  // guardrails
  const bandPct = Math.max(0, Number(params.guardrailBandPct) || 0) / 100;
  const adjustPct = clamp(Number(params.guardrailAdjustPct) || 0, 0, 100) / 100;
  const inflationRate = Number(params.inflateWithdrawals) === 1 ? (Number(params.inflation) || 0) / 100 : 0;
  // One more compounding step on top of last year's actually-applied factor
  // (not a fresh Math.pow(1+g, year-1) recompute) so a prior freeze is a
  // permanent, non-catch-up reduction. Year 1 has no prior state to step
  // from, so it takes the natural (calendar) factor directly.
  const candidateInflationFactor = year <= 1 ? naturalInflationFactor : safeHeld * (1 + inflationRate);

  let nextMultiplier = safeMultiplier;
  let nextInflationFactor = candidateInflationFactor;
  let inflationHeld = false;
  let guardrailAction = "none";

  if (year >= 2 && initialRate > 0) {
    const plannedAnnual = baseAnnualCash * candidateInflationFactor * safeMultiplier;
    const currentRate = openingCorpus > 0 ? plannedAnnual / openingCorpus : 0;
    const upperBand = initialRate * (1 + bandPct);
    const lowerBand = initialRate * (1 - bandPct);

    if (currentRate > upperBand) {
      nextMultiplier = clamp(safeMultiplier * (1 - adjustPct), 0.5, 2.0);
      guardrailAction = "cut";
    } else if (currentRate < lowerBand) {
      nextMultiplier = clamp(safeMultiplier * (1 + adjustPct), 0.5, 2.0);
      guardrailAction = "raise";
    } else if (Number.isFinite(priorYearReturn) && priorYearReturn < 0 && currentRate > initialRate) {
      nextInflationFactor = safeHeld;
      inflationHeld = true;
      guardrailAction = "inflation-hold";
    }
  }

  const annualBeforeFloor = baseAnnualCash * nextInflationFactor * nextMultiplier;
  return {
    annualCashTarget: Math.max(annualBeforeFloor, floorAnnual),
    nextMultiplier,
    nextInflationFactor,
    inflationHeld,
    guardrailAction
  };
}

function calculateInterestPlan(params) {
  const years = Math.round(Number(params.years) || 0);
  const effYield = effectiveYield(params);
  const withdrawalShare = (Number(params.withdrawRate) || 0) / 100;
  const inflation = (Number(params.inflation) || 0) / 100;
  const baseTax = yearlyTax(Number(params.principal) || 0, params);
  const taxShare = baseTax.interest > 0 ? baseTax.tax / baseTax.interest : 0;
  const baseContribution = Number(params.annualContribution) || 0;
  const contributionStepUp = (Number(params.contributionStepUp) || 0) / 100;
  const shockYear = Math.round(Number(params.shockYear) || 0);
  const shockDrop = (Number(params.shockDrop) || 0) / 100;
  const rows = [];
  let opening = Number(params.principal) || 0;
  let closing = opening;
  let cumWithdrawals = 0;
  let cumInterest = 0;
  let cumTax = 0;
  let cumContributions = 0;
  // fin-8fb F1 — §74 carry-forward pool: local to this run (never on the
  // shared `params` object), so it resets automatically for every
  // calculateInterestPlan invocation, including every Monte Carlo path.
  const carryForwardPool = { stclPool: [], ltclPool: [] };
  // fin-8fb F2 — dynamic withdrawal rule state: local to this run, same
  // discipline as the carry-forward pool (never on shared params, resets
  // per Monte Carlo path). See resolveDynamicSpending for semantics.
  const dynamicRule = ["guardrails", "percentOfCorpus"].includes(params.withdrawalRule) ? params.withdrawalRule : "fixed";
  let dynMultiplier = 1;
  let dynHeldInflationFactor = 1;
  let dynInitialRate = 0;
  let dynPriorYearReturn = null;

  rows.push({ year: 0, opening, effYield, interest: 0, tax: 0, netInterest: 0, withdrawal: 0, reinvested: 0, contribution: 0, shock: 0, closing, realClosing: closing, realWithdrawal: 0, cumWithdrawals, cumInterest, cumTax, cumContributions, cashCoverage: 0, taxableGain: 0, realizedGain: 0, capitalRecovered: 0, ltcgExemptionUsed: 0, basicExemptionUsed: 0, rebateUsed: 0, rebateLost: 0, section80TTBUsed: 0, section80TTBDisallowed: 0, grossRedemption: 0, targetCash: 0, spendingMultiplier: 1, guardrailAction: "none" });

  for (let year = 1; year <= years; year++) {
    const yearParams = paramsForProjectionYear(params, year);
    opening = closing;
    const taxCalc = yearlyTax(opening, yearParams);
    const interest = taxCalc.interest;
    const availableIncome = Math.max(0, taxCalc.spendableIncome ?? (taxCalc.realizedIncome - taxCalc.tax));
    // δ=1: withdrawal inflation factor uses (1+g)^(year-1) so Year-1 = base (uninflated)
    const withdrawalInflationFactor = Math.pow(1 + inflation, year - 1);
    // real-corpus deflation factor stays (1+g)^year
    const inflationFactor = Math.pow(1 + inflation, year);
    let targetAnnual;
    let spendingMultiplier = 1;
    let guardrailAction = "none";
    if (dynamicRule === "fixed") {
      targetAnnual = targetAnnualCashForYear(yearParams, year, withdrawalInflationFactor);
    } else {
      const dyn = resolveDynamicSpending({
        rule: dynamicRule,
        year,
        openingCorpus: opening,
        baseAnnualCash: monthlyCashNeedForYear(yearParams, year) * 12,
        inflationFactor: withdrawalInflationFactor,
        heldInflationFactor: dynHeldInflationFactor,
        initialRate: dynInitialRate,
        multiplier: dynMultiplier,
        priorYearReturn: dynPriorYearReturn,
        params: yearParams
      });
      dynMultiplier = dyn.nextMultiplier;
      dynHeldInflationFactor = dyn.nextInflationFactor;
      if (year === 1) dynInitialRate = opening > 0 ? dyn.annualCashTarget / opening : 0;
      spendingMultiplier = dyn.nextMultiplier;
      guardrailAction = dyn.guardrailAction;
      targetAnnual = dyn.annualCashTarget + plannedLumpSumForYear(yearParams, year, withdrawalInflationFactor);
    }
    dynPriorYearReturn = opening > 0 ? interest / opening : 0;
    const desiredWithdrawal = params.cashMode === "monthlyTarget" ? targetAnnual : availableIncome * withdrawalShare;
    const incomeWithdrawal = Math.min(availableIncome, Math.max(0, desiredWithdrawal));
    const sale = Number(params.allowPrincipalDrawdown) === 1
      ? estimatePrincipalSaleForNet(Math.max(0, desiredWithdrawal - incomeWithdrawal), opening, yearParams, taxCalc.streams)
      : estimatePrincipalSaleForNet(0, opening, yearParams, taxCalc.streams);
    const grossTax = taxCalc.tax + sale.tax;
    // fin-8fb F1 — §74 carry-forward true-up: applied ONCE per year, against
    // the year's fully-aggregated streams (equity/debt income + principal-
    // drawdown sale streams). See applyYearEndCarryForward doc comment: this
    // engine's estimatePrincipalSaleForNet already runs its own bisection
    // preview loop internally, so the pool must not be attached to yearParams
    // used there — it would be mutated once per preview trial instead of once
    // per year.
    const yearFinalStreams = addTaxStreams(taxCalc.streams, sale.streams);
    const yearCarryForward = applyYearEndCarryForward(carryForwardPool, yearParams, yearFinalStreams, year);
    const tax = Math.max(0, grossTax - yearCarryForward.taxBenefit);
    const taxableGainBenefit = yearCarryForward.taxableGainBenefit;
    const netInterest = taxCalc.realizedIncome - taxCalc.tax;
    const principalDrawdown = sale.gross;
    const withdrawal = incomeWithdrawal + sale.net;
    const reinvested = Math.max(0, interest - tax - withdrawal);
    // fin-cr2: FV-of-monthly-annuity (SIP) replaces annual lump-sum.
    // Treat annual contribution as 12 equal monthly payments made during the year.
    // FV_year = (annualContrib/12) × ((1+r_monthly)^12 − 1) / r_monthly
    // where r_monthly = (1+R)^(1/12) − 1  (R = net annual portfolio rate).
    const annualContrib = baseContribution * Math.pow(1 + contributionStepUp, year - 1);
    const yearRate = annualPortfolioRate(yearParams);
    const contribution = (() => {
      if (annualContrib === 0) return 0;
      if (yearRate <= 0) return annualContrib;
      const rMonthly = Math.pow(1 + yearRate, 1 / 12) - 1;
      return (annualContrib / 12) * ((Math.pow(1 + rMonthly, 12) - 1) / rMonthly);
    })();
    closing = Math.max(0, opening + interest + contribution - withdrawal - tax);
    const shock = shockYear === year && shockDrop > 0 ? closing * shockDrop : 0;
    closing -= shock;
    cumWithdrawals += withdrawal;
    cumInterest += interest;
    cumTax += tax;
    cumContributions += contribution;
    rows.push({ year, opening, effYield: effectiveYield(yearParams), interest, tax, netInterest, withdrawal, reinvested, contribution, shock, closing, realClosing: closing / inflationFactor, realWithdrawal: withdrawal / inflationFactor, cumWithdrawals, cumInterest, cumTax, cumContributions, principalDrawdown, taxableGain: Math.max(0, (taxCalc.taxProfile?.taxableInvestmentIncome || 0) + sale.taxableGain - taxableGainBenefit), realizedGain: taxCalc.realizedIncome + sale.realizedGain, unrealizedGrowth: taxCalc.unrealizedGrowth, capitalRecovered: Math.max(0, principalDrawdown - sale.realizedGain), ltcgExemptionUsed: (taxCalc.taxProfile?.ltcgExemptionUsed || 0) + sale.ltcgExemptionUsed, basicExemptionUsed: (taxCalc.taxProfile?.basicExemptionUsed || 0) + sale.basicExemptionUsed, rebateUsed: (taxCalc.taxProfile?.rebateUsed || 0) + sale.rebateUsed, rebateLost: (taxCalc.taxProfile?.rebateLost || 0) + sale.rebateLost, section80TTBUsed: taxCalc.taxProfile?.section80TTBUsed || 0, section80TTBDisallowed: taxCalc.taxProfile?.section80TTBDisallowed || 0, grossRedemption: principalDrawdown, cashCoverage: targetAnnual ? withdrawal / targetAnnual : 0, targetCash: targetAnnual, spendingMultiplier, guardrailAction });
  }

  const final = rows[rows.length - 1];
  const targetCorpus = Number(params.targetCorpus) || 0;
  const corpusHit = targetCorpus > 0 ? rows.find((row) => row.closing >= targetCorpus) : null;
  const targetAnnualToday = targetAnnualCashForYear(params, 1, 1);
  const firstYearTax = yearlyTax(Number(params.principal) || 0, paramsForProjectionYear(params, 1));
  const effectiveTaxShare = firstYearTax.interest > 0 ? firstYearTax.tax / firstYearTax.interest : 0;
  const yieldForIncome = annualPortfolioIncomeRate(params) * (1 - effectiveTaxShare) * withdrawalShare;
  const requiredCorpus = yieldForIncome > 0 ? targetAnnualToday / yieldForIncome : Infinity;
  const avgAnnualCash = years > 0 ? cumWithdrawals / years : 0;
  const withdrawalCagr = rows[1] && rows[1].withdrawal > 0 && final.withdrawal > 0 && years > 1
    ? Math.pow(final.withdrawal / rows[1].withdrawal, 1 / (years - 1)) - 1
    : 0;
  const finalMultiple = params.principal > 0 ? final.closing / params.principal : 0;

  return {
    rows,
    final,
    effYield,
    corpusHit,
    requiredCorpus,
    avgAnnualCash,
    withdrawalCagr,
    finalMultiple,
    effectiveTaxShare,
	    netPrincipalGrowthRate: effYield * (1 - effectiveTaxShare) * (1 - withdrawalShare),
	    targetAnnualToday,
	    cumContributions,
	    monthlyRows: [],
	    taxLotMethod: "Annual estimate"
	  };
	}

function isEquityLike(kind) {
  return ["equityLtcg", "equityStcg", "equityTaxFree"].includes(kind);
}

function capitalGainTaxRate(kind, holdingMonths, params) {
  const override = (Number(params.taxRate) || 0) / 100;
  if (override > 0) return override;
  const cess = cessMultiplier(params);
  const slab = (Number(params.taxSlab) || 0) / 100;
  const law = taxLawFromState(params);
  const { rule } = productRuleForInstrument(kind, params);
  const monthsHeld = holdingMonthsForInstrument(kind, holdingMonths, params);
  if (kind === "equityTaxFree") return 0;
  if (kind === "equityStcg") return specialRate("equityStcg", params) * cess;
  if (kind === "equityLtcg") {
    if (rule.sttRequired && params.equitySttPaid !== undefined && Number(params.equitySttPaid) !== 1) return slab;
    return monthsHeld >= law.equityLongTermMonths ? specialRate("equityLtcg", params) * cess : specialRate("equityStcg", params) * cess;
  }
  if (kind === "listedBondLtcg") return monthsHeld >= law.listedBondLongTermMonths ? specialRate("listedBondLtcg", params) * cess : slab;
  if (kind === "debtMfSlab") {
    if (rule.stream === "normalIncome") return slab;
    return monthsHeld >= (rule.longTermMonths || 36) ? specialRate("listedBondLtcg", params) * cess : slab;
  }
  if (kind === "fdInterest") return slab;
  return slab;
}

function isEquityLongTermLot(kind, holdingMonths, params = {}) {
  return kind === "equityLtcg" && holdingMonthsForInstrument(kind, holdingMonths, params) >= taxLawFromState(params).equityLongTermMonths;
}

function grandfatheredEquityGain(saleValue, costValue, fmv2018Value) {
  const sale = Math.max(0, Number(saleValue) || 0);
  const cost = Math.max(0, Number(costValue) || 0);
  const fmv = Math.max(0, Number(fmv2018Value) || 0);
  if (sale <= 0) return 0;
  const deemedCost = Math.max(cost, Math.min(fmv || cost, sale));
  return Math.max(0, sale - deemedCost);
}

function fmv2018PerUnitForLot(kind, params = {}) {
  if (Number(params.useFmvGrandfathering) !== 1 || !isEquityLike(kind)) return 0;
  const acquisitionYear = acquisitionYearForKind(kind, params);
  if (acquisitionYear > 2018 || acquisitionYear <= 1900) return 0;
  return Math.max(0, Math.min(2, (Number(params.equityFmv2018Pct) || 0) / 100));
}

function monthlyRateFromAnnual(rate) {
  return Math.pow(Math.max(0, 1 + rate), 1 / 12) - 1;
}

function swpBucketGrowthRate(params, bucket) {
  const expense = (Number(params.expenseRatio) || 0) / 100;
  if (Number(params.useAssetReturns) === 1) {
    const rawReturn = bucket === "equity" ? Number(params.equityReturn) : Number(params.debtReturn);
    return (Number(rawReturn) || 0) / 100 - expense;
  }
  return (Number(params.annualRate) || 0) / 100 - expense;
}

function setBucketGrowthRate(bucket, annualRate) {
  bucket.annualRate = annualRate;
  bucket.monthlyRate = monthlyRateFromAnnual(annualRate);
}

function makeBucket(value, annualRate, instrument, params) {
  const nav = 1;
  return {
    nav,
    annualRate,
    monthlyRate: monthlyRateFromAnnual(annualRate),
    instrument,
    lots: value > 0 ? [{
      units: value,
      costPerUnit: Math.max(0, Math.min(1.5, (Number(params.costBasisPct) || 0) / 100)),
      fmv2018PerUnit: fmv2018PerUnitForLot(instrument, params),
      acquisitionYear: acquisitionYearForKind(instrument, params),
      holdingMonths: Math.max(0, Math.round((Number(params.legacyHoldingYears) || 0) * 12))
    }] : []
  };
}

function bucketValue(bucket) {
  return bucket.lots.reduce((sum, lot) => sum + lot.units * bucket.nav, 0);
}

function growBucket(bucket) {
  const before = bucketValue(bucket);
  bucket.nav *= Math.max(0, 1 + bucket.monthlyRate);
  bucket.lots.forEach((lot) => { lot.holdingMonths += 1; });
  return bucketValue(bucket) - before;
}

function addContributionLot(bucket, amount) {
  if (amount <= 0 || bucket.nav <= 0) return;
  bucket.lots.push({ units: amount / bucket.nav, costPerUnit: bucket.nav, fmv2018PerUnit: 0, acquisitionYear: new Date().getFullYear(), holdingMonths: 0 }); // fin-ajw: dynamic AY
}

function transferBucketValueWithoutTax(fromBucket, toBucket, amount) {
  const available = bucketValue(fromBucket);
  const transfer = Math.min(Math.max(0, amount), available);
  if (transfer <= 0 || available <= 0) return 0;
  const ratio = transfer / available;
  fromBucket.lots.forEach((lot) => { lot.units *= (1 - ratio); });
  fromBucket.lots = fromBucket.lots.filter((lot) => lot.units > 1e-6);
  addContributionLot(toBucket, transfer);
  return transfer;
}

function rebalanceBucketsToShare(buckets, targetEquityShare) {
  const total = bucketValue(buckets.equity) + bucketValue(buckets.debt);
  if (total <= 0) return;
  const desiredEquity = total * clamp(targetEquityShare, 0, 1);
  const currentEquity = bucketValue(buckets.equity);
  if (Math.abs(desiredEquity - currentEquity) <= total * 0.002) return;
  if (desiredEquity > currentEquity) {
    transferBucketValueWithoutTax(buckets.debt, buckets.equity, desiredEquity - currentEquity);
  } else {
    transferBucketValueWithoutTax(buckets.equity, buckets.debt, currentEquity - desiredEquity);
  }
}

function previewLotSale(bucket, lot, sale, context, mutate = false) {
  const unitsSold = bucket.nav > 0 ? sale / bucket.nav : 0;
  const costCapital = unitsSold * lot.costPerUnit;
  const equityGrandfatheringApplies = Number(context.params.useFmvGrandfathering) === 1
    && isEquityLongTermLot(bucket.instrument, lot.holdingMonths, context.params)
    && (Number(lot.acquisitionYear) || 0) <= 2018
    && (Number(lot.fmv2018PerUnit) || 0) > 0;
  // fin-m66: allow negative realizedGain (capital loss) so §74 carry-forward pool receives the loss.
  // grandfatheredEquityGain always returns ≥ 0 per §55(2)(ac) deemed-cost floor; non-grandfathered
  // lots can produce a loss (sale < costCapital) which must flow into the carry-forward pool.
  const realizedGain = equityGrandfatheringApplies
    ? grandfatheredEquityGain(sale, costCapital, unitsSold * lot.fmv2018PerUnit)
    : (sale - costCapital);
  const streams = streamsForInstrument(bucket.instrument, realizedGain, lot.holdingMonths, context.params);
  // R4.9.5i perf fix: cache the most-recently-computed tax profile on the
  // context. Sequential calls within the same redemption sequence often share
  // the same context.streams reference (the "before" of call N equals the
  // "after" of call N-1 when mutate=true was used; or repeated previews with
  // mutate=false against the same baseline). Cache key is streams object
  // identity — same reference → guaranteed same profile. Halves
  // calculateTaxProfile calls in hot redemption loops. No semantic change.
  let beforeProfile;
  if (context.__lastProfileFor === context.streams && context.__lastProfile) {
    beforeProfile = context.__lastProfile;
  } else {
    beforeProfile = calculateTaxProfile(context.params, context.streams);
    context.__lastProfileFor = context.streams;
    context.__lastProfile = beforeProfile;
  }
  const afterStreams = addTaxStreams(context.streams, streams);
  const afterProfile = calculateTaxProfile(context.params, afterStreams);
  const tax = Math.max(0, afterProfile.totalTax - beforeProfile.totalTax);
  const taxableGain = Math.max(0, afterProfile.taxableInvestmentIncome - beforeProfile.taxableInvestmentIncome);
  const exemptionUsed = Math.max(0, afterProfile.ltcgExemptionUsed - beforeProfile.ltcgExemptionUsed);
  const basicExemptionUsed = Math.max(0, afterProfile.basicExemptionUsed - beforeProfile.basicExemptionUsed);
  const rebateUsed = Math.max(0, afterProfile.rebateUsed - beforeProfile.rebateUsed);
  const rebateLost = Math.max(0, beforeProfile.rebateUsed - afterProfile.rebateUsed);
  if (mutate) {
    context.streams = afterStreams;
    // Preserve cache continuity: the new "before" of the next call equals
    // afterProfile we just computed.
    context.__lastProfileFor = afterStreams;
    context.__lastProfile = afterProfile;
  }
  const net = Math.max(0, sale - tax);
  const { rule } = productRuleForInstrument(bucket.instrument, context.params);
  const debtLongTerm = bucket.instrument === "listedBondLtcg" && holdingMonthsForInstrument(bucket.instrument, lot.holdingMonths, context.params) >= (rule.longTermMonths || taxLawFromState(context.params).listedBondLongTermMonths);
  const longTermGain = isEquityLongTermLot(bucket.instrument, lot.holdingMonths, context.params) || debtLongTerm ? realizedGain : 0;
  const shortTermGain = realizedGain - longTermGain;
  return { unitsSold, costCapital, realizedGain, taxableGain, exemptionUsed, basicExemptionUsed, rebateUsed, rebateLost, tax, net, longTermGain, shortTermGain };
}

function redeemNetFromBucket(bucket, targetNetCash, context) {
  let remaining = Math.max(0, targetNetCash);
  let cash = 0;
  let gross = 0;
  let tax = 0;
  let realizedGain = 0;
  let taxableGain = 0;
  let exemptionUsed = 0;
  let capitalRecovered = 0;
  let longTermGain = 0;
  let shortTermGain = 0;
  let basicExemptionUsed = 0;
  let rebateUsed = 0;
  let rebateLost = 0;
  for (const lot of bucket.lots) {
    if (remaining <= 0 || lot.units <= 0) continue;
    const grossAvailable = lot.units * bucket.nav;
    let sale = grossAvailable;
    if (previewLotSale(bucket, lot, grossAvailable, context).net > remaining) {
      let lo = 0;
      let hi = grossAvailable;
      // fin-f08: tolerance-based termination (|hi-lo| < ₹1) replaces 18 fixed iterations
      while (hi - lo > 1) {
        const mid = (lo + hi) / 2;
        if (previewLotSale(bucket, lot, mid, context).net >= remaining) hi = mid; else lo = mid;
      }
      sale = hi;
    }
    const applied = previewLotSale(bucket, lot, sale, context, true);
    lot.units -= applied.unitsSold;
    cash += applied.net;
    gross += sale;
    tax += applied.tax;
    realizedGain += applied.realizedGain;
    taxableGain += applied.taxableGain;
    exemptionUsed += applied.exemptionUsed;
    basicExemptionUsed += applied.basicExemptionUsed;
    rebateUsed += applied.rebateUsed;
    rebateLost += applied.rebateLost;
    capitalRecovered += Math.max(0, sale - Math.max(0, applied.realizedGain)); // fin-m66: loss lot: entire sale is capital recovery
    longTermGain += applied.longTermGain;
    shortTermGain += applied.shortTermGain;
    remaining -= applied.net;
  }
  bucket.lots = bucket.lots.filter((lot) => lot.units > 1e-6);
  return { cash, gross, tax, realizedGain, taxableGain, exemptionUsed, basicExemptionUsed, rebateUsed, rebateLost, capitalRecovered, longTermGain, shortTermGain, shortfall: Math.max(0, remaining) };
}

function redeemForNetCash(buckets, targetNetCash, params, context) {
  const order = params.withdrawalPriority === "debtFirst"
    ? ["debt", "equity"]
    : params.withdrawalPriority === "equityFirst"
      ? ["equity", "debt"]
      : ["proRata"];
  const totals = { cash: 0, gross: 0, tax: 0, realizedGain: 0, taxableGain: 0, exemptionUsed: 0, basicExemptionUsed: 0, rebateUsed: 0, rebateLost: 0, capitalRecovered: 0, longTermGain: 0, shortTermGain: 0, shortfall: 0 };
  const take = (name, amount) => {
    const result = redeemNetFromBucket(buckets[name], amount, context);
    totals.cash += result.cash;
    totals.gross += result.gross;
    totals.tax += result.tax;
    totals.realizedGain += result.realizedGain;
    totals.taxableGain += result.taxableGain;
    totals.exemptionUsed += result.exemptionUsed;
    totals.basicExemptionUsed += result.basicExemptionUsed;
    totals.rebateUsed += result.rebateUsed;
    totals.rebateLost += result.rebateLost;
    totals.capitalRecovered += result.capitalRecovered;
    totals.longTermGain += result.longTermGain;
    totals.shortTermGain += result.shortTermGain;
    return result.shortfall;
  };

  if (order[0] === "proRata") {
    const equityValue = bucketValue(buckets.equity);
    const debtValue = bucketValue(buckets.debt);
    const total = equityValue + debtValue;
    if (total <= 0) return { ...totals, shortfall: targetNetCash };
    const equityNeed = targetNetCash * (equityValue / total);
    const debtNeed = targetNetCash - equityNeed;
    take("equity", equityNeed);
    take("debt", debtNeed);
    for (const name of ["equity", "debt"]) {
      const remaining = Math.max(0, targetNetCash - totals.cash);
      if (remaining <= 0) break;
      take(name, remaining);
    }
    totals.shortfall = Math.max(0, targetNetCash - totals.cash);
    return totals;
  }

  let remaining = targetNetCash;
  for (const name of order) {
    if (remaining <= 0) break;
    const before = totals.cash;
    take(name, remaining);
    remaining -= totals.cash - before;
  }
  totals.shortfall = Math.max(0, targetNetCash - totals.cash);
  return totals;
}

function finalizeModel(rows, params, effYield, cumWithdrawals, cumTax, cumContributions, monthlyRows = []) {
  const final = rows[rows.length - 1];
  const targetCorpus = Number(params.targetCorpus) || 0;
  const corpusHit = targetCorpus > 0 ? rows.find((row) => row.closing >= targetCorpus) : null;
  const targetAnnualToday = targetAnnualCashForYear(params, 1, 1);
  const avgAnnualCash = rows.length > 1 ? cumWithdrawals / (rows.length - 1) : 0;
  const finalMultiple = params.principal > 0 ? final.closing / params.principal : 0;
  const firstCash = rows[1]?.withdrawal || 0;
  const withdrawalCagr = firstCash > 0 && final.withdrawal > 0 && rows.length > 2
    ? Math.pow(final.withdrawal / firstCash, 1 / (rows.length - 2)) - 1
    : 0;
  const requiredCorpus = targetAnnualToday > 0 && avgAnnualCash > 0
    ? (Number(params.principal) || 0) * targetAnnualToday / avgAnnualCash
    : Infinity;
  return {
    rows,
    final,
    effYield,
    corpusHit,
    requiredCorpus,
    avgAnnualCash,
    withdrawalCagr,
    finalMultiple,
    effectiveTaxShare: rows.reduce((sum, row) => sum + (row.taxableGain || 0), 0) > 0 ? cumTax / rows.reduce((sum, row) => sum + (row.taxableGain || 0), 0) : 0,
    netPrincipalGrowthRate: finalMultiple > 0 && rows.length > 1 ? Math.pow(finalMultiple, 1 / (rows.length - 1)) - 1 : 0,
    targetAnnualToday,
    cumContributions,
    monthlyRows,
    taxLotMethod: monthlyRows.length ? "Monthly FIFO" : "Annual estimate"
  };
}

function calculateSwpPlan(params) {
  const years = Math.round(Number(params.years) || 0);
  const inflation = (Number(params.inflation) || 0) / 100;
  const equityShare = Number(params.useAssetReturns) === 1 ? (Number(params.equityShare) || 0) / 100 : 0;
  const principal = Number(params.principal) || 0;
  const buckets = {
    equity: makeBucket(principal * equityShare, swpBucketGrowthRate(params, "equity"), params.equityInstrument, params),
    debt: makeBucket(principal * (1 - equityShare), swpBucketGrowthRate(params, "debt"), params.debtInstrument, params)
  };
  const rows = [];
  const monthlyRows = [];
  let cumWithdrawals = 0;
  let cumInterest = 0;
  let cumTax = 0;
  let cumContributions = 0;
  // fin-8fb F1 — §74 carry-forward pool: local to this run (never on the
  // shared `params` object), so it resets automatically for every
  // calculateSwpPlan invocation, including every Monte Carlo path.
  const carryForwardPool = { stclPool: [], ltclPool: [] };
  // fin-8fb F2 — dynamic withdrawal rule state: local to this run, same
  // discipline as the carry-forward pool. See resolveDynamicSpending.
  const dynamicRule = ["guardrails", "percentOfCorpus"].includes(params.withdrawalRule) ? params.withdrawalRule : "fixed";
  let dynMultiplier = 1;
  let dynHeldInflationFactor = 1;
  let dynInitialRate = 0;
  let dynPriorYearReturn = null;
  rows.push({ year: 0, opening: principal, effYield: effectiveYield(params), interest: 0, tax: 0, netInterest: 0, withdrawal: 0, reinvested: 0, contribution: 0, shock: 0, closing: principal, realClosing: principal, realWithdrawal: 0, cumWithdrawals, cumInterest, cumTax, cumContributions, principalDrawdown: 0, taxableGain: 0, realizedGain: 0, capitalRecovered: 0, ltcgExemptionUsed: 0, basicExemptionUsed: 0, rebateUsed: 0, rebateLost: 0, section80TTBUsed: 0, section80TTBDisallowed: 0, grossRedemption: 0, cashCoverage: 0, targetCash: 0, spendingMultiplier: 1, guardrailAction: "none" });

  for (let year = 1; year <= years; year++) {
    const yearParams = paramsForProjectionYear(params, year);
    setBucketGrowthRate(buckets.equity, swpBucketGrowthRate(yearParams, "equity"));
    setBucketGrowthRate(buckets.debt, swpBucketGrowthRate(yearParams, "debt"));
    rebalanceBucketsToShare(buckets, Number(yearParams.useAssetReturns) === 1 ? clamp((Number(yearParams.equityShare) || 0) / 100, 0, 1) : 0);
    const opening = bucketValue(buckets.equity) + bucketValue(buckets.debt);
    const context = { params: yearParams, streams: emptyTaxStreams() };
    // fin-8fb F2 — resolve this year's recurring cash target once, at the
    // year boundary (before any monthly redemption), exactly mirroring F1's
    // year-boundary carry-forward commit. "fixed" mode never calls
    // resolveDynamicSpending's rule math (yearDynamic stays null) so the
    // month loop below takes the identical targetMonthlyCashForMonth call it
    // always has, guaranteeing byte-for-byte parity at default state.
    const yearNaturalInflationFactor = Math.pow(1 + inflation, year - 1);
    let yearDynamic = null;
    let spendingMultiplier = 1;
    let guardrailAction = "none";
    if (dynamicRule !== "fixed") {
      yearDynamic = resolveDynamicSpending({
        rule: dynamicRule,
        year,
        openingCorpus: opening,
        baseAnnualCash: monthlyCashNeedForYear(yearParams, year) * 12,
        inflationFactor: yearNaturalInflationFactor,
        heldInflationFactor: dynHeldInflationFactor,
        initialRate: dynInitialRate,
        multiplier: dynMultiplier,
        priorYearReturn: dynPriorYearReturn,
        params: yearParams
      });
      dynMultiplier = yearDynamic.nextMultiplier;
      dynHeldInflationFactor = yearDynamic.nextInflationFactor;
      if (year === 1) dynInitialRate = opening > 0 ? yearDynamic.annualCashTarget / opening : 0;
      spendingMultiplier = yearDynamic.nextMultiplier;
      guardrailAction = yearDynamic.guardrailAction;
    }
    const annual = {
      interest: 0,
      tax: 0,
      withdrawal: 0,
      grossRedemption: 0,
      realizedGain: 0,
      taxableGain: 0,
      ltcgExemptionUsed: 0,
      capitalRecovered: 0,
      longTermGain: 0,
      shortTermGain: 0,
      basicExemptionUsed: 0,
      rebateUsed: 0,
      rebateLost: 0,
      section80TTBUsed: 0,
      section80TTBDisallowed: 0,
      contribution: 0,
      shock: 0,
      targetCash: 0,
      shortfall: 0
    };

    for (let month = 1; month <= 12; month++) {
      const monthIndex = (year - 1) * 12 + month;
      const monthOpening = bucketValue(buckets.equity) + bucketValue(buckets.debt);
      const equityGrowth = growBucket(buckets.equity);
      const debtGrowth = growBucket(buckets.debt);
      const interest = equityGrowth + debtGrowth;
      // δ=1: withdrawal inflation factor uses (monthIndex-1)/12 so Month-1 = base (uninflated)
      const withdrawalInflationFactor = Math.pow(1 + inflation, (monthIndex - 1) / 12);
      // real-corpus deflation uses full monthIndex/12
      const inflationFactor = Math.pow(1 + inflation, monthIndex / 12);
      // fin-8fb F2: guardrails derives the monthly target from the
      // year-resolved annual figure, re-applying the SAME within-year
      // continuous escalation ratio that targetMonthlyCashForMonth already
      // uses for fixed mode (monthly natural factor / year natural factor),
      // so month 1 of a year always equals annualCashTarget/12 exactly.
      // percentOfCorpus ignores inflateWithdrawals escalation entirely (its
      // annualCashTarget is a flat share of opening corpus for the whole
      // year) so it is converted to monthly/12 with no within-year ratio.
      // Lump sums are added un-scaled by the multiplier, same as fixed mode.
      const withinYearRatio = dynamicRule === "percentOfCorpus"
        ? 1
        : (yearNaturalInflationFactor > 0 ? withdrawalInflationFactor / yearNaturalInflationFactor : 1);
      const targetMonthly = yearDynamic
        ? (yearDynamic.annualCashTarget / 12) * withinYearRatio
          + (month === 1 ? plannedLumpSumForYear(yearParams, year, withdrawalInflationFactor) : 0)
        : targetMonthlyCashForMonth(yearParams, year, month, withdrawalInflationFactor);
      let desiredCash = params.cashMode === "monthlyTarget"
        ? targetMonthly
        : Math.max(0, interest) * ((Number(params.withdrawRate) || 0) / 100);
      if (Number(params.allowPrincipalDrawdown) !== 1) desiredCash = Math.min(desiredCash, Math.max(0, interest));
      const redemption = redeemForNetCash(buckets, desiredCash, yearParams, context);
      let contribution = 0;
      if (month === 12) {
        contribution = (Number(params.annualContribution) || 0) * Math.pow(1 + (Number(params.contributionStepUp) || 0) / 100, year - 1);
        const equityContribution = contribution * (Number(yearParams.useAssetReturns) === 1 ? clamp((Number(yearParams.equityShare) || 0) / 100, 0, 1) : 0);
        addContributionLot(buckets.equity, equityContribution);
        addContributionLot(buckets.debt, contribution - equityContribution);
      }

      let closing = bucketValue(buckets.equity) + bucketValue(buckets.debt);
      let shock = 0;
      if (month === 12 && Math.round(Number(params.shockYear) || 0) === year && Number(params.shockDrop) > 0) {
        shock = closing * ((Number(params.shockDrop) || 0) / 100);
        if (shock > 0 && closing > 0) {
          const shockRatio = Math.max(0, 1 - shock / closing);
          buckets.equity.nav *= shockRatio;
          buckets.debt.nav *= shockRatio;
          closing = bucketValue(buckets.equity) + bucketValue(buckets.debt);
        }
      }

      annual.interest += interest;
      annual.tax += redemption.tax;
      annual.withdrawal += redemption.cash;
      annual.grossRedemption += redemption.gross;
      annual.realizedGain += redemption.realizedGain;
      annual.taxableGain += redemption.taxableGain;
      annual.ltcgExemptionUsed += redemption.exemptionUsed;
      annual.basicExemptionUsed += redemption.basicExemptionUsed;
      annual.rebateUsed += redemption.rebateUsed;
      annual.rebateLost += redemption.rebateLost;
      annual.capitalRecovered += redemption.capitalRecovered;
      annual.longTermGain += redemption.longTermGain;
      annual.shortTermGain += redemption.shortTermGain;
      annual.contribution += contribution;
      annual.shock += shock;
      annual.targetCash += params.cashMode === "monthlyTarget" ? targetMonthly : desiredCash;
      annual.shortfall += redemption.shortfall;

      monthlyRows.push({
        period: `Y${year} M${month}`,
        year,
        month,
        monthIndex,
        opening: monthOpening,
        interest,
        tax: redemption.tax,
        netInterest: interest - redemption.tax,
        targetCash: params.cashMode === "monthlyTarget" ? targetMonthly : desiredCash,
        withdrawal: redemption.cash,
        grossRedemption: redemption.gross,
        capitalRecovered: redemption.capitalRecovered,
        realizedGain: redemption.realizedGain,
        taxableGain: redemption.taxableGain,
        ltcgExemptionUsed: redemption.exemptionUsed,
        basicExemptionUsed: redemption.basicExemptionUsed,
        rebateUsed: redemption.rebateUsed,
        rebateLost: redemption.rebateLost,
        section80TTBUsed: 0,
        section80TTBDisallowed: 0,
        longTermGain: redemption.longTermGain,
        shortTermGain: redemption.shortTermGain,
        contribution,
        shock,
        closing,
        realClosing: closing / inflationFactor,
        realWithdrawal: redemption.cash / inflationFactor,
        withdrawalShortfall: redemption.shortfall,
        cashCoverage: targetMonthly ? redemption.cash / targetMonthly : 0,
        lotCount: buckets.equity.lots.length + buckets.debt.lots.length
      });
    }

    // fin-8fb F2 — portfolio return for THIS year, fed into next year's
    // guardrails inflation-hold decision (resolveDynamicSpending's
    // priorYearReturn). Computed unconditionally (cheap); unused in fixed
    // mode.
    dynPriorYearReturn = opening > 0 ? annual.interest / opening : 0;

    // fin-8fb F1 — §74 carry-forward true-up: applied ONCE per year, against
    // the year's fully-aggregated streams (context.streams), never inside the
    // monthly redemption loop (see applyYearEndCarryForward doc comment for
    // why). Any prior-year carried loss reduces this year's tax; any
    // unabsorbed loss this year rolls into the pool for future years.
    const yearCarryForward = applyYearEndCarryForward(carryForwardPool, yearParams, context.streams, year);
    if (yearCarryForward.taxBenefit > 0) {
      annual.tax = Math.max(0, annual.tax - yearCarryForward.taxBenefit);
      annual.taxableGain = Math.max(0, annual.taxableGain - yearCarryForward.taxableGainBenefit);
      // Credit the tax saved back into the corpus (fewer units needed to have
      // been sold to fund the lower, carry-forward-adjusted tax bill), split
      // by this year's asset allocation like the annual contribution is.
      const equityCreditShare = Number(yearParams.useAssetReturns) === 1 ? clamp((Number(yearParams.equityShare) || 0) / 100, 0, 1) : 0;
      addContributionLot(buckets.equity, yearCarryForward.taxBenefit * equityCreditShare);
      addContributionLot(buckets.debt, yearCarryForward.taxBenefit * (1 - equityCreditShare));
      // Attribute the whole-year benefit to the last month's ledger row so
      // INV-L06 (last monthly row's closing === annual closing) still holds;
      // this is a documented simplification — see model-contract.md — the
      // pool is a year-boundary concept, so intra-year monthly attribution is
      // necessarily approximate.
      const lastMonthRow = monthlyRows[monthlyRows.length - 1];
      if (lastMonthRow) {
        lastMonthRow.tax = Math.max(0, lastMonthRow.tax - yearCarryForward.taxBenefit);
        lastMonthRow.netInterest += yearCarryForward.taxBenefit;
        lastMonthRow.taxableGain = Math.max(0, lastMonthRow.taxableGain - yearCarryForward.taxableGainBenefit);
        lastMonthRow.closing += yearCarryForward.taxBenefit;
        lastMonthRow.realClosing = lastMonthRow.closing / Math.pow(1 + inflation, year);
      }
    }

    const closing = bucketValue(buckets.equity) + bucketValue(buckets.debt);
    const inflationFactor = Math.pow(1 + inflation, year);
    cumWithdrawals += annual.withdrawal;
    cumInterest += annual.interest;
    cumTax += annual.tax;
    cumContributions += annual.contribution;
    const principalDrawdown = Math.max(0, annual.grossRedemption - Math.max(0, annual.interest));
    rows.push({
      year,
      opening,
      effYield: effectiveYield(yearParams),
      interest: annual.interest,
      tax: annual.tax,
      netInterest: annual.interest - annual.tax,
      withdrawal: annual.withdrawal,
      reinvested: Math.max(0, annual.interest - annual.grossRedemption),
      contribution: annual.contribution,
      shock: annual.shock,
      closing,
      realClosing: closing / inflationFactor,
      realWithdrawal: annual.withdrawal / inflationFactor,
      cumWithdrawals,
      cumInterest,
      cumTax,
      cumContributions,
      principalDrawdown,
      taxableGain: annual.taxableGain,
      realizedGain: annual.realizedGain,
      capitalRecovered: annual.capitalRecovered,
      ltcgExemptionUsed: annual.ltcgExemptionUsed,
      basicExemptionUsed: annual.basicExemptionUsed,
      rebateUsed: annual.rebateUsed,
      rebateLost: annual.rebateLost,
      section80TTBUsed: annual.section80TTBUsed,
      section80TTBDisallowed: annual.section80TTBDisallowed,
      longTermGain: annual.longTermGain,
      shortTermGain: annual.shortTermGain,
      grossRedemption: annual.grossRedemption,
      withdrawalShortfall: annual.shortfall,
      cashCoverage: annual.targetCash ? annual.withdrawal / annual.targetCash : 0,
      targetCash: annual.targetCash,
      lotCount: buckets.equity.lots.length + buckets.debt.lots.length,
      spendingMultiplier,
      guardrailAction
    });
  }
  return finalizeModel(rows, params, effectiveYield(params), cumWithdrawals, cumTax, cumContributions, monthlyRows);
}

function calculateIdcwPlan(params) {
  const patched = { ...params, cashMode: params.cashMode || "monthlyTarget" };
  const years = Math.round(Number(patched.years) || 0);
  const effYield = effectiveYield(patched);
  const inflation = (Number(patched.inflation) || 0) / 100;
  const idcwRate = (Number(patched.idcwYield) || 0) / 100;
  const rows = [];
  let closing = Number(patched.principal) || 0;
  let cumWithdrawals = 0;
  let cumInterest = 0;
  let cumTax = 0;
  let cumContributions = 0;
  // fin-8fb F2 — dynamic withdrawal rule state: local to this run, same
  // discipline as SWP/Interest. See resolveDynamicSpending.
  const dynamicRule = ["guardrails", "percentOfCorpus"].includes(patched.withdrawalRule) ? patched.withdrawalRule : "fixed";
  let dynMultiplier = 1;
  let dynHeldInflationFactor = 1;
  let dynInitialRate = 0;
  let dynPriorYearReturn = null;
  rows.push({ year: 0, opening: closing, effYield, interest: 0, tax: 0, netInterest: 0, withdrawal: 0, reinvested: 0, contribution: 0, shock: 0, closing, realClosing: closing, realWithdrawal: 0, cumWithdrawals, cumInterest, cumTax, cumContributions, principalDrawdown: 0, taxableGain: 0, realizedGain: 0, capitalRecovered: 0, ltcgExemptionUsed: 0, basicExemptionUsed: 0, rebateUsed: 0, rebateLost: 0, section80TTBUsed: 0, section80TTBDisallowed: 0, grossRedemption: 0, cashCoverage: 0, targetCash: 0, spendingMultiplier: 1, guardrailAction: "none" });
  for (let year = 1; year <= years; year++) {
    const yearParams = paramsForProjectionYear(patched, year);
    const opening = closing;
    const interest = opening * effectiveYield(yearParams);
    // δ=1: withdrawal inflation factor uses (1+g)^(year-1) so Year-1 = base (uninflated)
    const withdrawalInflationFactor = Math.pow(1 + inflation, year - 1);
    // real-corpus deflation factor stays (1+g)^year
    const inflationFactor = Math.pow(1 + inflation, year);
    let targetAnnual;
    let spendingMultiplier = 1;
    let guardrailAction = "none";
    if (dynamicRule === "fixed") {
      targetAnnual = targetAnnualCashForYear(yearParams, year, withdrawalInflationFactor);
    } else {
      const dyn = resolveDynamicSpending({
        rule: dynamicRule,
        year,
        openingCorpus: opening,
        baseAnnualCash: monthlyCashNeedForYear(yearParams, year) * 12,
        inflationFactor: withdrawalInflationFactor,
        heldInflationFactor: dynHeldInflationFactor,
        initialRate: dynInitialRate,
        multiplier: dynMultiplier,
        priorYearReturn: dynPriorYearReturn,
        params: yearParams
      });
      dynMultiplier = dyn.nextMultiplier;
      dynHeldInflationFactor = dyn.nextInflationFactor;
      if (year === 1) dynInitialRate = opening > 0 ? dyn.annualCashTarget / opening : 0;
      spendingMultiplier = dyn.nextMultiplier;
      guardrailAction = dyn.guardrailAction;
      targetAnnual = dyn.annualCashTarget + plannedLumpSumForYear(yearParams, year, withdrawalInflationFactor);
    }
    dynPriorYearReturn = opening > 0 ? interest / opening : 0;
    const maxDistribution = Math.max(0, opening + interest) * idcwRate;
    let desiredGross = patched.cashMode === "monthlyTarget"
      ? maxDistribution
      : maxDistribution * ((Number(patched.withdrawRate) || 0) / 100);
    if (patched.cashMode === "monthlyTarget") {
      let lo = 0;
      let hi = maxDistribution;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        const midTax = investmentTaxProfile(yearParams, { ...emptyTaxStreams(), normalIncome: mid }).tax;
        if (Math.max(0, mid - midTax) >= targetAnnual) hi = mid; else lo = mid;
      }
      desiredGross = Math.min(maxDistribution, hi);
    }
    const taxProfile = investmentTaxProfile(yearParams, { ...emptyTaxStreams(), normalIncome: desiredGross });
    const tax = taxProfile.tax;
    const withdrawal = Math.max(0, desiredGross - tax);
    const contribution = (Number(patched.annualContribution) || 0) * Math.pow(1 + (Number(patched.contributionStepUp) || 0) / 100, year - 1);
    closing = Math.max(0, opening + interest - desiredGross + contribution);
    const shock = Math.round(Number(patched.shockYear) || 0) === year && Number(patched.shockDrop) > 0 ? closing * ((Number(patched.shockDrop) || 0) / 100) : 0;
    closing -= shock;
    cumWithdrawals += withdrawal;
    cumInterest += interest;
    cumTax += tax;
    cumContributions += contribution;
    rows.push({ year, opening, effYield: effectiveYield(yearParams), interest, tax, netInterest: interest - tax, withdrawal, reinvested: Math.max(0, interest - desiredGross), contribution, shock, closing, realClosing: closing / inflationFactor, realWithdrawal: withdrawal / inflationFactor, cumWithdrawals, cumInterest, cumTax, cumContributions, principalDrawdown: Math.max(0, desiredGross - interest), taxableGain: desiredGross, realizedGain: desiredGross, capitalRecovered: 0, ltcgExemptionUsed: 0, basicExemptionUsed: taxProfile.basicExemptionUsed, rebateUsed: taxProfile.rebateUsed, rebateLost: taxProfile.rebateLost, section80TTBUsed: taxProfile.section80TTBUsed || 0, section80TTBDisallowed: taxProfile.section80TTBDisallowed || 0, grossRedemption: desiredGross, cashCoverage: targetAnnual ? withdrawal / targetAnnual : 0, targetCash: targetAnnual, spendingMultiplier, guardrailAction });
  }
  return finalizeModel(rows, patched, effYield, cumWithdrawals, cumTax, cumContributions);
}

function calculate(params) {
  if (params.incomeMode === "swp") return calculateSwpPlan(params);
  if (params.incomeMode === "idcw") return calculateIdcwPlan(params);
  return calculateInterestPlan(params);
}

/**
 * Build the per-month cash-flow ledger row stream per Q-LEDGER-MONTHLY
 * (audit/round-3/02-spec.md §R4.9.5g addendum, lines 3097–3284).
 *
 * 16 fields per row, exactly 12 × T rows (INV-L04 unconditional).
 *
 * Conventions per R4-Q12 owner resolutions (2026-05-21):
 *   1. tax_nominal (Interest/IDCW): uniform τ_y / 12 (decision 1).
 *   2. contribution_nominal (Interest/IDCW): K_y at month 12, 0 elsewhere
 *      (decision 2 — mirrors SWP's month-12 credit; single source of truth).
 *   3. Depleted-tail: all-zero pad to 12T rows (decision 3); shortfall row
 *      tail equals the (would-be) target so INV-L10 still meaningful.
 *
 * SWP synthesis: passthrough of report.monthlyRows with rename to schema
 * field names; age and scenario_marker filled in here.
 *
 * Interest/IDCW synthesis from annual rows (skipping the year-0 sentinel):
 *   - growth_nominal       = G_y / 12  (uniform amortization; planning-
 *                            visualization convention since Q36's annual
 *                            growth has no first-principles per-month
 *                            attribution outside SWP)
 *   - withdrawal_nominal   = W_y / 12  (uniform; Q03 amortization clause)
 *   - tax_nominal          = τ_y / 12  (owner-resolved, R4-Q12 decision 1)
 *   - contribution_nominal = 0 for months 1..11; K_y at month 12
 *                            (owner-resolved, R4-Q12 decision 2)
 *   - shock_nominal        = Σ_y at month 12 of the shock-year only
 *   - withdrawal_target_nominal:
 *       cashMode = monthlyTarget → M_0 × (1+g)^((m-1)/12) (Q18 δ=1
 *                                  convention with planned-lump-sum at
 *                                  month 1 of the lump-sum year)
 *       otherwise               → W_y / 12
 *   - withdrawal_shortfall_nominal = max(0, target_m − withdrawal_m)
 *   - opening_balance: chained by INV-L03 (open_{m+1} = close_m); for
 *     m=1, equals params.principal.
 *   - closing_balance: INV-L01 identity applied per-row.
 *   - {*}_real_today: nominal / (1+g)^(m/12)  (monthly deflator).
 *
 * Depleted-tail: when chained closing hits zero (or the underlying annual
 * row has closing = 0 indicating annual-floor depletion), subsequent rows
 * emit zero for all monetary stocks/flows except:
 *   - withdrawal_target_nominal (still the inflated target)
 *   - withdrawal_shortfall_nominal (= target_m, the full target is
 *     foregone)
 *   - scenario_marker (preserved)
 * Row count remains 12T regardless of depletion (INV-L04).
 *
 * Decimal precision: implementation uses JS Number (matching the rest of
 * src/model.js); invariants hold within a small floating-point tolerance.
 * Test suite uses ~1e-6 relative tolerance on accounting identities and
 * a small absolute tolerance (paise) on monetary sums.
 *
 * @param {object} report - projection model returned by calculate/buildModel
 * @param {object} params - projection params (retireeAge, years, mode,
 *   inflation, shockYear, cashMode, monthlyTarget, principal, ...)
 * @param {object} [options]
 * @param {string} [options.scenarioMarker="active"] - one of "active",
 *   "income", "growth", "stress"
 * @returns {Array<object>} per-month rows; length === T × 12
 */
function buildMonthlyLedger(report, params, options = {}) {
  const scenarioMarker = options.scenarioMarker || "active";
  const years = Math.round(Number(params?.years) || 0);
  const rowCount = years * 12;
  if (rowCount <= 0) return [];

  const startAge = Math.max(0, Math.round(Number(params?.retireeAge) || 0));
  const inflation = (Number(params?.inflation) || 0) / 100;
  const mode = params?.incomeMode || "interest";

  // Year-0 sentinel exists in all three engines (rows[0]). Years 1..T are
  // rows[1..T]. We always expand rows[1..T] regardless of mode.
  const annualRows = report?.rows || [];

  const result = new Array(rowCount);

  if (mode === "swp" && Array.isArray(report?.monthlyRows) && report.monthlyRows.length === rowCount) {
    // SWP: passthrough with field-name alignment + age + scenario_marker.
    // INV-L04 guard: must already have 12T rows.
    for (let i = 0; i < rowCount; i++) {
      const src = report.monthlyRows[i];
      const m = src.monthIndex;
      const ageM = Math.floor(startAge + (m - 1) / 12);
      const target = src.targetCash || 0;
      const withdrawal = src.withdrawal || 0;
      const shortfall = src.withdrawalShortfall != null
        ? src.withdrawalShortfall
        : Math.max(0, target - withdrawal);
      result[i] = {
        month_index: m,
        year_index: src.year,
        month_within_year: src.month,
        age: ageM,
        opening_balance: src.opening || 0,
        growth_nominal: src.interest || 0,
        contribution_nominal: src.contribution || 0,
        withdrawal_nominal: withdrawal,
        withdrawal_target_nominal: target,
        withdrawal_shortfall_nominal: shortfall,
        withdrawal_real_today: src.realWithdrawal || 0,
        tax_nominal: src.tax || 0,
        shock_nominal: src.shock || 0,
        closing_balance: src.closing || 0,
        closing_balance_real_today: src.realClosing || 0,
        scenario_marker: scenarioMarker
      };
    }
    return result;
  }

  // Interest / IDCW (and SWP fallback when monthlyRows is unexpectedly
  // empty): synthesize from annual rows.
  const principal = Number(params?.principal) || 0;
  let chainedOpening = principal;
  let depleted = false;

  for (let y = 1; y <= years; y++) {
    const annual = annualRows[y] || {};
    const annualClosing = Number(annual.closing) || 0;
    const annualOpening = Number(annual.opening) || 0;
    const annualGrowth = Number(annual.interest) || 0;
    const annualWithdrawal = Number(annual.withdrawal) || 0;
    const annualTax = Number(annual.tax) || 0;
    const annualContribution = Number(annual.contribution) || 0;
    const annualShock = Number(annual.shock) || 0;

    const growthPerMonth = annualGrowth / 12;
    const withdrawalPerMonth = annualWithdrawal / 12;
    const taxPerMonth = annualTax / 12;

    // Per-year params for target computation (handles step-ups, planned lump-sum).
    const yearParams = paramsForProjectionYear(params, y);

    for (let mwy = 1; mwy <= 12; mwy++) {
      const m = (y - 1) * 12 + mwy;
      const idx = m - 1;
      const ageM = Math.floor(startAge + (m - 1) / 12);
      // δ=1 target deflator: (1+g)^((m-1)/12). Year-1 month-1 uninflated.
      const targetInflationFactor = Number(params?.inflateWithdrawals) === 1
        ? Math.pow(1 + inflation, (m - 1) / 12)
        : 1;
      // target_m: monthly target curve when cashMode = monthlyTarget, else W_y/12
      let target;
      if (params?.cashMode === "monthlyTarget") {
        target = targetMonthlyCashForMonth(yearParams, y, mwy, targetInflationFactor);
      } else {
        target = withdrawalPerMonth;
      }

      // Real deflator: (1+g)^(m/12)
      const realDeflator = Math.pow(1 + inflation, m / 12);

      if (depleted) {
        // All-zero pad; shortfall = full target; scenario preserved.
        result[idx] = {
          month_index: m,
          year_index: y,
          month_within_year: mwy,
          age: ageM,
          opening_balance: 0,
          growth_nominal: 0,
          contribution_nominal: 0,
          withdrawal_nominal: 0,
          withdrawal_target_nominal: target,
          withdrawal_shortfall_nominal: Math.max(0, target),
          withdrawal_real_today: 0,
          tax_nominal: 0,
          shock_nominal: 0,
          closing_balance: 0,
          closing_balance_real_today: 0,
          scenario_marker: scenarioMarker
        };
        continue;
      }

      const openingM = chainedOpening;
      const contributionM = mwy === 12 ? annualContribution : 0;
      const shockM = mwy === 12 ? annualShock : 0;
      // INV-L01 identity: close_m = open + growth + contrib - W - tax - shock.
      const closingRaw = openingM + growthPerMonth + contributionM - withdrawalPerMonth - taxPerMonth - shockM;

      // Depletion detection per spec line 3187: if close_m ≤ 0 the corpus
      // is exhausted; this row and all subsequent rows are the "all-zero
      // pad" with shortfall = target. INV-L01 holds trivially for the
      // zero pad (0 = 0 + 0 + 0 - 0 - 0 - 0); the transition is clean.
      if (closingRaw <= 0) {
        depleted = true;
        result[idx] = {
          month_index: m,
          year_index: y,
          month_within_year: mwy,
          age: ageM,
          opening_balance: 0,
          growth_nominal: 0,
          contribution_nominal: 0,
          withdrawal_nominal: 0,
          withdrawal_target_nominal: target,
          withdrawal_shortfall_nominal: Math.max(0, target),
          withdrawal_real_today: 0,
          tax_nominal: 0,
          shock_nominal: 0,
          closing_balance: 0,
          closing_balance_real_today: 0,
          scenario_marker: scenarioMarker
        };
        chainedOpening = 0;
        continue;
      }

      let closingM = closingRaw;

      // INV-L05 year-end reconciliation (non-depleted case): when the
      // annual model did NOT floor at zero, the uniform-amortization
      // chained close_{12y} mathematically equals C_y (by linearity of
      // sum). To absorb floating-point drift (Decimal-50 in spec vs JS
      // Number here), snap close_{12y} exactly to annual closing at every
      // healthy year-end.
      if (mwy === 12 && annualClosing > 0) {
        closingM = annualClosing;
      }

      const withdrawalReal = withdrawalPerMonth / realDeflator;
      const closingReal = closingM / realDeflator;

      result[idx] = {
        month_index: m,
        year_index: y,
        month_within_year: mwy,
        age: ageM,
        opening_balance: openingM,
        growth_nominal: growthPerMonth,
        contribution_nominal: contributionM,
        withdrawal_nominal: withdrawalPerMonth,
        withdrawal_target_nominal: target,
        withdrawal_shortfall_nominal: Math.max(0, target - withdrawalPerMonth),
        withdrawal_real_today: withdrawalReal,
        tax_nominal: taxPerMonth,
        shock_nominal: shockM,
        closing_balance: closingM,
        closing_balance_real_today: closingReal,
        scenario_marker: scenarioMarker
      };

      chainedOpening = closingM;
    }

    // Suppress unused-var lint for annualOpening: it documents the spec
    // identity (annualRows[y].opening should equal chainedOpening at the
    // start of year y), but we trust the chained value as the source of
    // truth for monthly continuity (INV-L03). Reference it to keep the
    // tooling happy and make the spec correspondence explicit.
    void annualOpening;
  }

  return result;
}

function calculateGuidancePlan(params) {
  if (params.incomeMode === "swp") {
    return calculateInterestPlan({ ...params, incomeMode: "interest" });
  }
  return calculate(params);
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function normalSample(rng) {
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function fatTailSample(rng) {
  const denominator = Math.sqrt((normalSample(rng) ** 2 + normalSample(rng) ** 2 + normalSample(rng) ** 2 + 1e-9) / 3);
  return normalSample(rng) / denominator;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function sampledReturnParams(params, annualShock) {
  const shock = typeof annualShock === "object" && annualShock
    ? annualShock
    : { portfolioShock: Number(annualShock) || 0, equityShock: Number(annualShock) || 0, debtShock: (Number(annualShock) || 0) * 0.35 };
  if (Number(params.useAssetReturns) === 1) {
    const equityReturn = clamp((Number(params.equityReturn) || 0) / 100 + (Number(shock.equityShock) || 0), -0.85, 0.85) * 100;
    const debtReturn = clamp((Number(params.debtReturn) || 0) / 100 + (Number(shock.debtShock) || 0), -0.35, 0.45) * 100;
    return { ...params, equityReturn, debtReturn };
  }
  return { ...params, annualRate: clamp((Number(params.annualRate) || 0) / 100 + (Number(shock.portfolioShock) || 0), -0.85, 0.85) * 100 };
}

function sampledReturnOverride(params, year, annualShock) {
  const baseYearParams = glideParamsForProjectionYear(params, year);
  const sampled = sampledReturnParams(baseYearParams, annualShock);
  if (Number(baseYearParams.useAssetReturns) === 1) {
    return { equityReturn: sampled.equityReturn, debtReturn: sampled.debtReturn };
  }
  return { annualRate: sampled.annualRate };
}

function annualSequenceShock(params, rng = mulberry32(1)) {
  const model = params.shockModel || "regime";
  const sample = () => model === "normal" ? normalSample(rng) : fatTailSample(rng);
  const portfolioVol = Math.max(0, Number(params.volatility) || 0) / 100;
  if (Number(params.useAssetReturns) !== 1) {
    const baseShock = portfolioVol * sample();
    const crisisShock = model === "regime" && rng() < 0.07 ? -portfolioVol * (1.2 + rng() * 2.4) : 0;
    return { portfolioShock: clamp(baseShock + crisisShock, -0.85, 0.85), equityShock: 0, debtShock: 0, model };
  }
  const globalVol = Math.max(0, Number(params.volatility) || 0);
  const globalScale = BASE.volatility > 0 ? globalVol / BASE.volatility : 1;
  const hasEquityVol = params.equityVolatility !== undefined && params.equityVolatility !== null && params.equityVolatility !== "";
  const hasDebtVol = params.debtVolatility !== undefined && params.debtVolatility !== null && params.debtVolatility !== "";
  const equityBaseVol = Math.max(0, hasEquityVol ? Number(params.equityVolatility) || 0 : globalVol);
  const debtBaseVol = Math.max(0, hasDebtVol ? Number(params.debtVolatility) || 0 : globalVol * 0.35);
  const equityVol = equityBaseVol * globalScale / 100;
  const debtVol = debtBaseVol * globalScale / 100;
  const corr = clamp((Number(params.equityDebtCorrelation) || 0) / 100, -0.95, 0.95);
  const equityZ = sample();
  const independentDebtZ = sample();
  const debtZ = corr * equityZ + Math.sqrt(Math.max(0, 1 - corr * corr)) * independentDebtZ;
  const crisis = model === "regime" && rng() < 0.07;
  const equityShock = clamp(equityVol * equityZ + (crisis ? -equityVol * (1.6 + rng() * 2.6) : 0), -0.85, 0.85);
  const debtShock = clamp(debtVol * debtZ + (crisis ? -debtVol * (0.3 + rng() * 1.2) : 0), -0.35, 0.45);
  const equityShare = clamp((Number(params.equityShare) || 0) / 100, 0, 1);
  return {
    portfolioShock: equityShock * equityShare + debtShock * (1 - equityShare),
    equityShock,
    debtShock,
    model
  };
}

function calculateSequencePath(params, rng = mulberry32(1)) {
  const years = Math.round(Number(params.years) || 0);
  const explicitOverrides = Array.isArray(params.sequenceReturnOverrides) ? params.sequenceReturnOverrides : null;
  const sequenceReturnOverrides = Array.from({ length: years }, (_, index) => (
    explicitOverrides?.[index] || sampledReturnOverride(params, index + 1, annualSequenceShock(params, rng))
  ));
  return calculate({ ...params, sequenceReturnOverrides });
}

function calculateMonteCarlo(params, simulations = undefined) {
  const years = Math.round(Number(params.years) || 0);
  const targetCorpus = Number(params.targetCorpus) || 0;
  const simulationCount = clamp(Math.round(Number(simulations ?? params.monteCarloSamples ?? 1000) || 0), 0, 1000);
  const seed = Math.round(Number(params.monteCarloSeed) || 24681357);
  const yearlyClosings = Array.from({ length: years + 1 }, () => []);
  const finals = [];
  let successes = 0;
  let endurances = 0;

  for (let sim = 0; sim < simulationCount; sim++) {
    const rng = mulberry32(seed + sim * 97 + years * 13);
    const sampled = calculateSequencePath(params, rng);
    for (let year = 0; year <= years; year++) {
      yearlyClosings[year].push(sampled.rows[year]?.closing || 0);
    }
    const closing = sampled.final.closing;
    finals.push(closing);
    if (closing >= targetCorpus) successes++;
    if (closing > 0) endurances++;
  }

  const p10 = [];
  const p50 = [];
  const p90 = [];
  for (let year = 0; year <= years; year++) {
    const sorted = yearlyClosings[year].sort((a, b) => a - b);
    p10.push(quantile(sorted, 0.1));
    p50.push(quantile(sorted, 0.5));
    p90.push(quantile(sorted, 0.9));
  }
  finals.sort((a, b) => a - b);
  const successProbability = simulationCount ? successes / simulationCount : 0;
  const successStdError = simulationCount ? Math.sqrt((successProbability * (1 - successProbability)) / simulationCount) : 0;
  const successMargin95 = simulationCount ? 1.96 * successStdError : 0;
  const successCi95 = [
    clamp(successProbability - successMargin95, 0, 1),
    clamp(successProbability + successMargin95, 0, 1)
  ];
  const enduranceProbability = simulationCount ? endurances / simulationCount : 0;
  const enduranceStdError = simulationCount ? Math.sqrt((enduranceProbability * (1 - enduranceProbability)) / simulationCount) : 0;
  const enduranceMargin95 = simulationCount ? 1.96 * enduranceStdError : 0;
  const enduranceCi95 = {
    lower: clamp(enduranceProbability - enduranceMargin95, 0, 1),
    upper: clamp(enduranceProbability + enduranceMargin95, 0, 1)
  };
  const shockModel = params.shockModel || "regime";
  const glidePath = Number(params.glidePathEnabled) === 1
    ? `glide path ${Math.round(Number(params.equityShare) || 0)}% to ${Math.round(Number(params.glidePathEndEquity) || 0)}% equity over ${Math.round(Number(params.glidePathYears) || 0)} years`
    : "fixed allocation";
  return {
    p10,
    p50,
    p90,
    finals,
    successProbability,
    successCount: successes,
    successStdError,
    successMargin95,
    successCi95,
    enduranceProbability,
    enduranceCount: endurances,
    enduranceMargin95,
    enduranceCi95,
    finalIqr: Math.max(0, quantile(finals, 0.75) - quantile(finals, 0.25)),
    worst: finals[0] || 0,
    best: finals[finals.length - 1] || 0,
    targetCorpus,
    simulations: simulationCount,
    seed,
    shockModel,
    glidePath,
    method: `${simulationCount} ${shockModel === "normal" ? "normal" : "fat-tail regime"} sequence-of-returns simulations using the active cash engine and ${glidePath}`
  };
}

function solveTopup(params) {
  if (calculate(params).final.closing >= params.targetCorpus) return 0;
  let lo = 0;
  let hi = Math.max(1000000, Number(params.targetCorpus) || 0);
  for (let i = 0; i < 24 && calculate({ ...params, annualContribution: hi }).final.closing < params.targetCorpus; i++) {
    hi *= 2;
    if (hi > 1e15) return Infinity;
  }
  if (calculate({ ...params, annualContribution: hi }).final.closing < params.targetCorpus) return Infinity;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const final = calculate({ ...params, annualContribution: mid }).final.closing;
    if (final >= params.targetCorpus) hi = mid; else lo = mid;
  }
  return hi;
}

function solveReturn(params) {
  if (calculate(params).final.closing >= params.targetCorpus) return params.annualRate / 100;
  let lo = 0;
  let hi = 0.40;
  if (calculate({ ...params, annualRate: hi * 100, useAssetReturns: 0 }).final.closing < params.targetCorpus) return null;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const final = calculate({ ...params, annualRate: mid * 100, useAssetReturns: 0 }).final.closing;
    if (final >= params.targetCorpus) hi = mid; else lo = mid;
  }
  return hi;
}

function paramsWithMonthlyCashTarget(params, monthlyTarget) {
  const householdMode = params.householdProfile?.useHouseholdPlan ?? householdPlanProfile(params).useHouseholdPlan;
  return householdMode
    ? { ...params, monthlyCashOverride: Math.max(0, Number(monthlyTarget) || 0) }
    : { ...params, monthlyTarget: Math.max(0, Number(monthlyTarget) || 0) };
}

function monthlyCashCoverageModel(params) {
  const base = params.householdProfile ? params : projectionParamsFromState(params);
  const patched = { ...base, cashMode: "monthlyTarget" };
  return calculate(patched);
}

function planCoversMonthlyCash(params) {
  const model = monthlyCashCoverageModel(params);
  const rows = model.rows.slice(1);
  return rows.length > 0 && rows.every((row) => row.cashCoverage >= 0.995);
}

function solveCorpusForMonthlyCash(params) {
  const target = Number(params.monthlyCashOverride ?? params.monthlyTarget) || 0;
  if (target <= 0) return 0;
  let lo = 0;
  let hi = Math.max(Number(params.principal) || 0, target * 12 * 40, 1000000);
  const targetParams = paramsWithMonthlyCashTarget(params, target);
  for (let i = 0; i < 12 && !planCoversMonthlyCash({ ...targetParams, principal: hi }); i++) hi *= 1.8;
  if (!planCoversMonthlyCash({ ...targetParams, principal: hi })) return Infinity;
  // fin-rkm: tolerance-based termination (|hi-lo| < Rs1) replaces 18 fixed iterations
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (planCoversMonthlyCash({ ...targetParams, principal: mid })) hi = mid; else lo = mid;
  }
  return hi;
}

function solveReturnForMonthlyCash(params) {
  const target = Number(params.monthlyCashOverride ?? params.monthlyTarget) || 0;
  if (target <= 0) return 0;
  let lo = -0.10;
  // fin-est: widen upper bound from 40% to 100%; expand further if still not covered (up to 300%)
  let hi = 1.00;
  const targetParams = paramsWithMonthlyCashTarget(params, target);
  for (let i = 0; i < 4 && !planCoversMonthlyCash({ ...targetParams, useAssetReturns: 0, annualRate: hi * 100 }); i++) hi = Math.min(hi * 2, 3.0);
  if (!planCoversMonthlyCash({ ...targetParams, useAssetReturns: 0, annualRate: hi * 100 })) return null;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (planCoversMonthlyCash({ ...targetParams, useAssetReturns: 0, annualRate: mid * 100 })) hi = mid; else lo = mid;
  }
  return hi;
}

function solveMaxMonthlyCash(params) {
  let lo = 0;
  let hi = Math.max(Number(params.monthlyCashOverride ?? params.monthlyTarget) || 0, 100000);
  for (let i = 0; i < 12 && planCoversMonthlyCash(paramsWithMonthlyCashTarget(params, hi)); i++) hi *= 1.6;
  // fin-qvd: upgrade from 18 fixed iterations to ₹1 tolerance (matching fin-rkm fix in solveCorpusForMonthlyCash)
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (planCoversMonthlyCash(paramsWithMonthlyCashTarget(params, mid))) lo = mid; else hi = mid;
  }
  return lo;
}

function withdrawalShareNeeded(params) {
  const annualTarget = (Number(params.monthlyCashOverride ?? params.monthlyTarget) || 0) * 12;
  const opening = Number(params.principal) || 0;
  const taxCalc = yearlyTax(opening, params);
  const netInterest = Math.max(0, taxCalc.interest - taxCalc.tax);
  return netInterest > 0 ? annualTarget / netInterest : Infinity;
}

function instrumentLabel(kind) {
  return {
    equityLtcg: "Equity MF / ETF, LTCG",
    equityStcg: "Equity STCG / active",
    equityTaxFree: "Deferred placeholder",
    debtMfSlab: "Debt MF post-2023",
    listedBondLtcg: "Listed bond / debt ETF",
    fdInterest: "FD / interest income"
  }[kind] || kind;
}

function productClassLabel(kind) {
  return {
    equityMfEtf: "Equity MF / ETF with STT",
    equityActive: "Equity active / STT eligible",
    debtMfPost2023: "Specified debt MF post-2023",
    debtMfGrandfathered: "Debt MF older lot sensitivity",
    listedBondDebtEtf: "Listed bond / listed debt ETF",
    fdInterest: "FD / deposit interest",
    gsecTbill: "G-sec / T-bill coupon",
    targetMaturityDebt: "Target-maturity debt fund"
  }[kind] || kind;
}

function taxRegimeLabel(params) {
  return params.taxRegime === "old" ? "Old regime" : "New regime";
}

function ageBandLabel(value) {
  return {
    below60: "Below 60",
    senior: "60-79",
    superSenior: "80+"
  }[value] || "Below 60";
}

function taxProfileLabel(params) {
  if (useManualTaxOverride(params)) return `Manual ${params.taxRate}%`;
  if (useFlatTaxProfile(params)) return `Flat ${formatPct((Number(params.taxSlab) || 0) / 100)}`;
  const resident = params.residentStatus === "resident" ? "resident" : "non-resident";
  return `${taxRegimeLabel(params)}, ${resident}`;
}

function taxRuleLabel(kind, params) {
  if (useManualTaxOverride(params)) return `Manual override ${params.taxRate}%`;
  const cess = Number(params.includeCess) === 1 ? " + cess" : "";
  const law = taxLawFromState(params);
  const slabText = useFlatTaxProfile(params)
    ? `Flat slab ${formatPct((Number(params.taxSlab) || 0) / 100)}`
    : `${taxRegimeLabel(params)} slab${Number(params.section87A) === 1 && params.residentStatus === "resident" ? " + 87A" : ""}`;
  return {
    equityLtcg: `${formatPct(law.specialRates.equityLtcg)} LTCG${cess}, ${formatInr(law.equityLtcgExemption)} exemption`,
    equityStcg: `${formatPct(law.specialRates.equityStcg)} STCG${cess}`,
    equityTaxFree: "0% modelled tax",
    debtMfSlab: params.debtProductClass === "debtMfGrandfathered" ? `Older lot sensitivity: long-term ${formatPct(law.specialRates.listedBondLtcg)}${cess}, otherwise ${slabText}` : slabText,
    listedBondLtcg: `${formatPct(law.specialRates.listedBondLtcg)} LTCG${cess}; ${productClassLabel(params.debtProductClass || "listedBondDebtEtf")}`,
    fdInterest: slabText
  }[kind] || "-";
}

const OBJECTIVE_OPTIONS = {
  income: { label: "Reliable income", equityAdjust: -6, note: "Prioritise monthly cash coverage and a larger safety bucket." },
  balance: { label: "Income + growth", equityAdjust: 0, note: "Balance current income, inflation protection, and corpus life." },
  legacy: { label: "Leave a legacy", equityAdjust: 10, note: "Keep more growth exposure after cash needs are covered." }
};

const RISK_OPTIONS = {
  conservative: { label: "Sleep-well", equity: 32, note: "Lower volatility; accepts lower upside." },
  balanced: { label: "Balanced", equity: 48, note: "Middle path for income plus inflation protection." },
  growth: { label: "Growth-ready", equity: 62, note: "Higher equity if drawdowns are tolerable." }
};

const CASH_FLEX_OPTIONS = {
  fixed: { label: "Fixed income", equityAdjust: -8, reserve: 36, note: "Monthly cash should not be cut in bad markets." },
  guarded: { label: "Guarded flexibility", equityAdjust: 0, reserve: 24, note: "Use cash bucket first, then small spending adjustments." },
  flexible: { label: "Flexible spend", equityAdjust: 6, reserve: 12, note: "Can trim spending in weak markets to protect corpus." }
};

const TAX_PREFERENCE_OPTIONS = {
  optimize: { label: "Tax optimise", note: "Prefer SWP, FIFO review, LTCG exemption use, and lower taxable distributions." },
  simple: { label: "Keep simple", note: "Prefer straightforward income instruments even if tax drag is higher." },
  defer: { label: "Defer gains", note: "Let growth compound and redeem only what the plan needs." }
};

const LEGACY_OPTIONS = {
  low: { label: "Spend down", equityAdjust: -4, targetBuffer: 0.85, note: "Corpus can decline if income is secure." },
  medium: { label: "Preserve some", equityAdjust: 0, targetBuffer: 1, note: "Try to preserve purchasing power." },
  high: { label: "Strong legacy", equityAdjust: 8, targetBuffer: 1.2, note: "Target a larger real end corpus." }
};

function safeOption(map, key, fallback) {
  return map[key] || map[fallback];
}

function retirementPlanningProfile(state) {
  const principal = Math.max(0, Number(state.principal) || 0);
  const household = householdPlanProfile(state);
  const monthlyCash = household.monthlyCashNeed;
  const annualCash = monthlyCash * 12;
  const withdrawalRate = principal > 0 ? annualCash / principal : Infinity;
  const objective = safeOption(OBJECTIVE_OPTIONS, state.retirementObjective, "income");
  const risk = safeOption(RISK_OPTIONS, state.riskComfort, "balanced");
  const cashFlex = safeOption(CASH_FLEX_OPTIONS, state.cashFlex, "guarded");
  const taxPreference = safeOption(TAX_PREFERENCE_OPTIONS, state.taxPreference, "optimize");
  const legacy = safeOption(LEGACY_OPTIONS, state.legacyPriority, "medium");
  const requestedReserveMonths = Number(state.lockCashBucket) === 1
    ? clamp(Number(state.cashBucketMonthsOverride) || cashFlex.reserve, 3, 72)
    : Math.max(6, Number(state.liquidityMonths) || cashFlex.reserve);
  const realTarget = Math.max(household.targetCorpusToday, principal * legacy.targetBuffer);
  const guideRate = withdrawalRate <= 0.045 ? "comfortable" : withdrawalRate <= 0.065 ? "watch" : "stretched";
  const computedEquity = clamp(Math.round(risk.equity + objective.equityAdjust + cashFlex.equityAdjust + legacy.equityAdjust - Math.max(0, withdrawalRate - 0.055) * 180), 18, 78);
  const idealEquity = Number(state.lockEquityShare) === 1 ? clamp(Number(state.equityShareOverride) || computedEquity, 5, 90) : computedEquity;
  const reserveCorpus = monthlyCash * requestedReserveMonths;
  const debtCorpus = principal * (1 - idealEquity / 100);
  const reserveCoverage = monthlyCash > 0 ? debtCorpus / monthlyCash : Infinity;
  return {
    principal,
    monthlyCash,
    annualCash,
    withdrawalRate,
    guideRate,
    idealEquity,
    requestedReserveMonths,
    reserveCorpus,
    reserveCoverage,
    realTarget,
    objective,
    risk,
    cashFlex,
    taxPreference,
    legacy,
    household,
    feasibleIncomeRate: withdrawalRate <= 0.055,
    urgentGap: withdrawalRate > 0.075
  };
}

function strategyCandidateDefinitions(profile) {
  const prefersSimple = profile.taxPreference === TAX_PREFERENCE_OPTIONS.simple || Number(profile.household?.preferSimpleProducts) === 1;
  const taxOptimizedDebt = prefersSimple ? "fdInterest" : "listedBondLtcg";
  const taxOptimizedDebtClass = prefersSimple ? "fdInterest" : "listedBondDebtEtf";
  return [
    {
      id: "bucketedSwp",
      name: "Bucketed SWP Core",
      role: "Default retiree plan",
      patch: {
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        equityShare: profile.idealEquity,
        equityInstrument: "equityLtcg",
        debtInstrument: taxOptimizedDebt,
        debtProductClass: taxOptimizedDebtClass,
        withdrawalPriority: profile.cashFlex === CASH_FLEX_OPTIONS.flexible ? "proRata" : "debtFirst",
        harvestLtcg: 1,
        allowPrincipalDrawdown: 1
      },
      thesis: "Use a cash/debt bucket for near-term withdrawals and keep equity for inflation protection."
    },
    {
      id: "taxAwareSwp",
      name: "Tax-Aware Equity SWP",
      role: "Lowest-tax growth path",
      patch: {
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        equityShare: clamp(profile.idealEquity + 12, 25, 82),
        equityInstrument: "equityLtcg",
        debtInstrument: "listedBondLtcg",
        debtProductClass: "listedBondDebtEtf",
        withdrawalPriority: "equityFirst",
        harvestLtcg: 1,
        allowPrincipalDrawdown: 1
      },
      thesis: "Redeem tax-efficient old equity units and use LTCG exemption before leaning on slab-taxed income."
    },
    {
      id: "incomeFloor",
      name: "Income Floor Ladder",
      role: "Maximum stability",
      patch: {
        incomeMode: "interest",
        cashMode: "monthlyTarget",
        equityShare: clamp(profile.idealEquity - 18, 10, 55),
        equityInstrument: "equityLtcg",
        debtInstrument: "fdInterest",
        debtProductClass: "fdInterest",
        withdrawalPriority: "debtFirst",
        harvestLtcg: 1,
        allowPrincipalDrawdown: 1
      },
      thesis: "Build predictable cash flow first using deposits, T-bills/G-secs, SDLs, and short-duration debt exposure."
    },
    {
      id: "growthGuard",
      name: "Inflation Guard Portfolio",
      role: "Longevity hedge",
      patch: {
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        equityShare: clamp(profile.idealEquity + 20, 35, 85),
        equityInstrument: "equityLtcg",
        debtInstrument: "listedBondLtcg",
        debtProductClass: "listedBondDebtEtf",
        withdrawalPriority: "proRata",
        harvestLtcg: 1,
        allowPrincipalDrawdown: 1
      },
      thesis: "Accept more market movement to defend purchasing power over a long retirement."
    }
  ];
}

function scoreStrategy(candidate, state, profile) {
  const reserveAddOns = (profile.household?.emergencyReserve || 0) + (profile.household?.healthcareReserve || 0);
  const strategyTargetCorpus = profile.household?.useHouseholdPlan
    ? Math.max(0, profile.realTarget - reserveAddOns)
    : profile.realTarget;
  const candidateState = normalizeState({ ...state, ...candidate.patch, targetCorpus: strategyTargetCorpus });
  const candidateParams = projectionParamsFromState(candidateState);
  const model = calculate(candidateParams);
  const years = Math.max(1, Number(candidateParams.years) || 1);
  const cashCoveredYears = model.rows.slice(1).filter((row) => (row.cashCoverage || 0) >= 0.995).length;
  const cashScore = cashCoveredYears / years;
  const corpusScore = profile.realTarget > 0 ? clamp(model.final.realClosing / profile.realTarget, 0, 1.35) / 1.35 : 1;
  const taxBase = Math.max(1, model.final.cumWithdrawals + model.final.cumTax);
  const taxEfficiency = clamp(1 - model.final.cumTax / taxBase, 0, 1);
  const riskFit = clamp(1 - Math.abs(candidateState.equityShare - profile.idealEquity) / 55, 0, 1);
  const debtMonths = profile.monthlyCash > 0 ? (profile.principal * (1 - candidateState.equityShare / 100)) / profile.monthlyCash : 99;
  const liquidityFit = clamp(debtMonths / profile.requestedReserveMonths, 0, 1);
  const score = Math.round((cashScore * 34 + corpusScore * 25 + taxEfficiency * 16 + riskFit * 13 + liquidityFit * 12) * 100) / 100;
  const status = cashCoveredYears >= years && model.final.realClosing >= profile.realTarget
    ? "Strong fit"
    : cashCoveredYears >= years
      ? "Income covered"
      : cashCoveredYears >= Math.ceil(years * 0.7)
        ? "Stretch plan"
        : "Gap first";
  const scored = {
    ...candidate,
    state: candidateState,
    model,
    score,
    status,
    cashCoveredYears,
    finalReal: model.final.realClosing,
    finalCorpus: model.final.closing,
    taxDrag: model.final.cumTax,
    debtMonths,
    equityShare: candidateState.equityShare,
    monthlyCash: model.final.withdrawal / 12
  };
  return {
    ...scored,
    allocationPlan: buildAllocationPlan(candidateState, model, { ...profile, effectiveYears: years }, scored),
    lostReasons: []
  };
}

function buildAllocationPlan(candidateState, model, profile, strategy = {}) {
  const monthlyCash = Math.max(0, profile.monthlyCash || Number(candidateState.monthlyTarget) || 0);
  const principal = Math.max(0, profile.principal || Number(candidateState.principal) || 0);
  const cashMonths = Math.max(3, Math.round(Number(profile.requestedReserveMonths) || Number(candidateState.liquidityMonths) || 24));
  const cashBucket = monthlyCash * cashMonths;
  const equityValue = principal * clamp((Number(candidateState.equityShare) || 0) / 100, 0, 1);
  const defensiveValue = Math.max(0, principal - equityValue);
  const incomeFloor = Math.max(0, defensiveValue - cashBucket);
  const growthSleeve = equityValue;
  // fin-8fb F3: sum across every goal (not just the legacy single field) so
  // the "Known goals" bucket reflects all planned lump sums; for
  // legacy/single-goal states this equals profile.household.plannedLumpSum
  // exactly, since plannedLumpSums then holds that one synthesized entry.
  const plannedGoal = (profile.household?.plannedLumpSums || []).reduce((sum, goal) => sum + (Number(goal.amount) || 0), 0);
  const healthcareReserve = profile.household?.healthcareReserve || 0;
  const refillTrigger = monthlyCash * Math.max(6, Math.round(cashMonths * 0.5));
  const yearsCovered = monthlyCash > 0 ? Math.floor(defensiveValue / monthlyCash / 12) : 99;
  const effectiveYears = Math.max(1, Number(profile.effectiveYears) || Number(candidateState.years) || 1);
  const firstShortfallYear = model.rows.slice(1).find((row) => (row.cashCoverage || 0) < 0.995)?.year || null;
  const productWarnings = [
    Number(candidateState.avoidCreditRisk) === 1 && candidateState.debtInstrument !== "fdInterest" ? "Avoid credit-risk debt; prefer sovereign/AAA ladders or deposits for the income floor." : "",
    Number(candidateState.allowAnnuity) !== 1 && strategy.id === "incomeFloor" ? "Annuity is not assumed; floor is built with reversible instruments." : "",
    candidateState.debtProductClass === "debtMfPost2023" ? "Debt-fund gains are conservatively treated as slab-rate for post-2023 specified-fund planning." : ""
  ].filter(Boolean);
  return {
    cashMonths,
    yearsCovered,
    buckets: [
      { id: "cash", label: "Cash bucket", amount: cashBucket, description: `${cashMonths} months for essentials, withdrawals, and bad-market breathing room.` },
      { id: "floor", label: "Income floor", amount: incomeFloor, description: `Use ${productClassLabel(candidateState.debtProductClass || "fdInterest")} and low-volatility debt/cash instruments.` },
      { id: "growth", label: "Growth sleeve", amount: growthSleeve, description: "Equity sleeve reserved for inflation protection and long-horizon legacy growth." },
      { id: "tax", label: "Tax reserve", amount: Math.max(model.final.cumTax / effectiveYears, healthcareReserve * 0.03), description: "Annual tax and liquidity review reserve; not an extra return assumption." },
      { id: "goals", label: "Known goals", amount: plannedGoal + healthcareReserve, description: "Healthcare reserve and planned lump sums are kept visible before chasing yield." }
    ],
    refillSchedule: [
      `Review bucket every year; refill when cash bucket falls below ${formatInr(refillTrigger)}.`,
      firstShortfallYear ? `Current projection first misses target cash around year ${firstShortfallYear}; solve gap before adding risk.` : "Projected recurring cash is covered under this strategy.",
      strategy.id === "taxAwareSwp" ? "Harvest equity LTCG exemption before year-end when the tax studio confirms room." : "Use SWP/debt maturity refill after strong years before selling growth assets."
    ],
    suitability: {
      posture: productWarnings.length ? "Needs product filter" : "Suitable planning mix",
      warnings: productWarnings
    }
  };
}

function attachStrategyLossReasons(strategies = []) {
  const best = strategies[0];
  return strategies.map((strategy) => {
    if (!best || strategy.id === best.id) return { ...strategy, lostReasons: [] };
    const reasons = [];
    if (strategy.cashCoveredYears < best.cashCoveredYears) reasons.push(`Covers ${strategy.cashCoveredYears} years of cash vs ${best.cashCoveredYears}.`);
    if (strategy.taxDrag > best.taxDrag * 1.08) reasons.push(`Higher tax drag by ${formatInr(strategy.taxDrag - best.taxDrag)}.`);
    if (Math.abs(strategy.equityShare - strategy.state.equityShare) > 1) reasons.push("Constraint changed allocation during scoring.");
    if (strategy.finalReal < best.finalReal * 0.95) reasons.push(`Lower real end corpus by ${formatInr(best.finalReal - strategy.finalReal)}.`);
    if (!reasons.length) reasons.push("Close alternative, but the top strategy has a better blended score.");
    return { ...strategy, lostReasons: reasons.slice(0, 3) };
  });
}

function generateOptimumStrategies(state) {
  const normalized = normalizeState(state);
  const profile = retirementPlanningProfile(normalized);
  const scoredStrategies = strategyCandidateDefinitions(profile)
    .map((candidate) => scoreStrategy(candidate, normalized, profile))
    .sort((a, b) => b.score - a.score);
  const strategies = attachStrategyLossReasons(scoredStrategies);
  const best = strategies[0];
  const initialNeed = profile.withdrawalRate;
  const gapMessage = profile.urgentGap
    ? `The requested cash flow starts at ${formatPct(initialNeed)}, which is a gap-planning problem before it is an asset-allocation problem.`
    : profile.guideRate === "watch"
      ? `The requested cash flow starts at ${formatPct(initialNeed)}; workable plans need tax-aware withdrawals and spending discipline.`
      : `The requested cash flow starts at ${formatPct(initialNeed)}, which gives the planner room to optimise tax and buckets.`;
  return {
    profile,
    strategies,
    best,
    gapMessage,
    applyPatch: best.patch
  };
}

function instrumentGuidanceForStrategy(strategy, profile, state) {
  const equity = strategy?.equityShare ?? profile.idealEquity;
  const debt = 100 - equity;
  const cashMonths = profile.requestedReserveMonths;
  const taxProfile = taxProfileLabel(state);
  return [
    {
      title: "1. Cash Bucket",
      allocation: `${cashMonths} months of expenses`,
      instruments: "Savings sweep, short FDs, liquid or overnight funds.",
      guidance: "This is the sleep-at-night bucket. It protects SWP withdrawals during market falls."
    },
    {
      title: "2. Income Floor",
      allocation: `${debt}% debt / cash exposure`,
      instruments: "RBI Retail Direct T-bills/G-secs/SDL ladder, target-maturity funds, short-duration debt funds, senior schemes where eligible.",
      guidance: `Slab income is tested through ${taxProfile}; avoid assuming all debt income is tax-free.`
    },
    {
      title: "3. Growth Engine",
      allocation: `${equity}% equity exposure`,
      instruments: "Broad index funds, large/flexi-cap equity funds, or low-cost equity ETFs.",
      guidance: "The growth bucket fights inflation. Do not fund near-term cash needs from it after sharp drawdowns unless the wizard marks you flexible."
    },
    {
      title: "4. Tax Moves",
      allocation: "Annual review",
      instruments: "SWP over IDCW where suitable, FIFO review, equity LTCG exemption use, old-unit cost recovery.",
      guidance: "Use the tax profile engine; manual all-tax override is only for stress testing."
    }
  ];
}

export {
  BASE,
  PRESETS,
  SCENARIOS,
  DEFAULT_TAX_LAW,
  NUMERIC_FIELDS,
  clamp,
  normalizeFieldValue,
  normalizeState,
  sanitizePlannedLumpSums,
  resolvePlannedLumpSums,
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
  assessmentYearForProjectionYear,
  applyYearEndCarryForward,
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
  resolveDynamicSpending,
  calculate,
  buildMonthlyLedger,
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
};
