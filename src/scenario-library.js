import { BASE, householdPlanProfile, projectionParamsFromState, normalizeState } from "./model.js";

function effectiveScenarioState(state = {}) {
  return normalizeState({ ...BASE, ...state });
}

function effectiveProfile(state = {}) {
  return householdPlanProfile(effectiveScenarioState(state));
}

function effectiveParams(state = {}) {
  return projectionParamsFromState(effectiveScenarioState(state));
}

function effectiveMonthlyCash(state = {}) {
  return Math.max(0, Number(effectiveParams(state).monthlyTarget) || 0);
}

function effectiveTargetCorpusToday(state = {}) {
  const profile = effectiveProfile(state);
  return profile.useHouseholdPlan ? profile.targetCorpusToday : Math.max(0, Number(state.targetCorpus) || BASE.targetCorpus);
}

function higherCashPatch(state = {}, multiplier = 1.25) {
  const profile = effectiveProfile(state);
  const cash = Math.round((effectiveMonthlyCash(state) || BASE.monthlyTarget) * multiplier);
  if (!profile.useHouseholdPlan) return { monthlyTarget: cash };
  const currentDiscretionary = Math.max(0, Number(state.discretionaryMonthlyExpense) || 0);
  const uplift = Math.max(0, cash - profile.monthlyCashNeed);
  return {
    discretionaryMonthlyExpense: Math.round(currentDiscretionary + uplift)
  };
}

const STANDARD_SCENARIO_LIBRARY = [
  {
    id: "base-retirement",
    name: "Base Retirement Plan",
    role: "Current plan evidence",
    tone: "teal",
    notes: "Current live assumptions saved as the neutral review baseline.",
    patch: {}
  },
  {
    id: "conservative-income",
    name: "Conservative Income Floor",
    role: "Lower volatility, higher defensive cover",
    tone: "blue",
    notes: "Tests a retiree who prefers a cash/debt ladder and lower equity exposure.",
    patch: {
      incomeMode: "interest",
      cashMode: "monthlyTarget",
      riskComfort: "conservative",
      equityShare: 35,
      equityReturn: 10,
      debtReturn: 7,
      volatility: 8,
      equityVolatility: 12,
      liquidityMonths: 36,
      debtInstrument: "fdInterest",
      debtProductClass: "gsecTbill"
    }
  },
  {
    id: "higher-income",
    name: "Higher Income Need",
    role: "Lifestyle stretch case",
    tone: "coral",
    notes: "Raises monthly cash need by 25% to reveal corpus, tax, and sequence-risk pressure.",
    patch: (state) => ({
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      ...higherCashPatch(state, 1.25),
      withdrawRate: Math.max(60, Number(state.withdrawRate) || BASE.withdrawRate),
      allowPrincipalDrawdown: 1
    })
  },
  {
    id: "lower-return",
    name: "Lower Return Decade",
    role: "Muted return assumption",
    tone: "gold",
    notes: "Cuts equity and debt return assumptions and increases inflation friction.",
    patch: (state) => ({
      useAssetReturns: 1,
      equityReturn: Math.max(4, (Number(state.equityReturn) || BASE.equityReturn) - 4),
      debtReturn: Math.max(3, (Number(state.debtReturn) || BASE.debtReturn) - 2),
      annualRate: Math.max(3, (Number(state.annualRate) || BASE.annualRate) - 3),
      inflation: Math.min(10, (Number(state.inflation) || BASE.inflation) + 1),
      shockModel: "regime"
    })
  },
  {
    id: "tax-optimized-swp",
    name: "Tax-Optimised SWP",
    role: "Old units, LTCG exemption, FIFO review",
    tone: "teal",
    notes: "Uses retiree tax profile, SWP, LTCG harvesting, and equity-first sensitivity for old units.",
    patch: {
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      taxProfileMode: "retiree",
      taxRate: 0,
      section87A: 1,
      harvestLtcg: 1,
      costBasisPct: 80,
      legacyHoldingYears: 5,
      withdrawalPriority: "equityFirst",
      taxPreference: "optimize"
    }
  },
  {
    id: "crash-first-decade",
    name: "Crash In First Decade",
    role: "Sequence-risk stress case",
    tone: "coral",
    notes: "Models an early drawdown, elevated volatility, and defensive bucket response.",
    patch: (state) => ({
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      shockYear: 2,
      shockDrop: 25,
      volatility: Math.min(35, (Number(state.volatility) || BASE.volatility) + 5),
      equityVolatility: Math.min(45, (Number(state.equityVolatility) || BASE.equityVolatility) + 5),
      shockModel: "regime",
      liquidityMonths: Math.max(24, Number(state.liquidityMonths) || BASE.liquidityMonths),
      cashFlex: "guarded"
    })
  },
  {
    id: "medical-reserve-shock",
    name: "Healthcare Shock Reserve",
    role: "Medical contingency case",
    tone: "gold",
    notes: "Adds a healthcare reserve and higher emergency cover before judging income sustainability.",
    patch: (state) => {
      const cash = Math.round((effectiveMonthlyCash(state) || BASE.monthlyTarget) * 1.1);
      return {
        useHouseholdPlan: 1,
        healthcareReserve: Math.max(Number(state.healthcareReserve) || 0, 2500000),
        emergencyMonths: Math.max(Number(state.emergencyMonths) || 0, 18),
        essentialMonthlyExpense: Math.max(Number(state.essentialMonthlyExpense) || 0, cash),
        monthlyTarget: cash,
        liquidityMonths: Math.max(24, Number(state.liquidityMonths) || BASE.liquidityMonths),
        cashFlex: "guarded"
      };
    }
  },
  {
    id: "sticky-inflation",
    name: "Sticky Inflation Decade",
    role: "Purchasing-power stress",
    tone: "coral",
    notes: "Raises inflation and cash escalation while keeping return expectations conservative.",
    patch: (state) => ({
      inflateWithdrawals: 1,
      inflation: Math.min(12, (Number(state.inflation) || BASE.inflation) + 3),
      equityReturn: Math.max(4, (Number(state.equityReturn) || BASE.equityReturn) - 2),
      debtReturn: Math.max(3, (Number(state.debtReturn) || BASE.debtReturn) - 1),
      annualRate: Math.max(3, (Number(state.annualRate) || BASE.annualRate) - 2),
      shockModel: "regime"
    })
  },
  {
    id: "spouse-longevity",
    name: "Spouse Longevity Plan",
    role: "Survivor income and legacy case",
    tone: "blue",
    notes: "Extends the horizon and protects survivor income before optimising growth.",
    patch: (state) => {
      const params = effectiveParams(state);
      const contingencyYears = Math.max(Number(state.contingencyYears) || 0, 5);
      return {
        useHouseholdPlan: 1,
        spouseMonthlyNeed: Math.max(Number(state.spouseMonthlyNeed) || 0, Math.round((effectiveMonthlyCash(state) || BASE.monthlyTarget) * 0.75)),
        longevityYears: Math.max(Number(state.longevityYears) || 0, Number(params.years) - contingencyYears, 35),
        contingencyYears,
        legacyCorpusGoal: Math.max(Number(state.legacyCorpusGoal) || 0, effectiveTargetCorpusToday(state)),
        riskComfort: "conservative",
        cashFlex: "guarded"
      };
    }
  }
];

export { STANDARD_SCENARIO_LIBRARY };
