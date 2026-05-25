export const PLANNING_VERSION = "retirement-advice-v1";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pct = (value) => `${Math.round(value * 1000) / 10}%`;
const months = (value) => `${Math.round(value)} months`;

export const INSTRUMENT_CATALOG = [
  {
    id: "cashSweep",
    name: "Savings sweep / liquid cash",
    role: "Emergency cash",
    bucket: "cash",
    risk: "Very low",
    liquidity: "Same day to 1 day",
    tax: "Interest or fund gains taxed by product and slab treatment",
    bestFor: "One to six months of expenses and emergency buffers",
    caution: "Return usually trails inflation"
  },
  {
    id: "shortFd",
    name: "Short bank FD ladder",
    role: "Cash reserve",
    bucket: "income",
    risk: "Low",
    liquidity: "Breakable, with penalties",
    tax: "Interest is slab-rate income; TDS may affect cash timing",
    bestFor: "Predictable near-term withdrawals",
    caution: "Reinvestment risk and slab tax drag"
  },
  {
    id: "scss",
    name: "Senior Citizens Savings Scheme",
    role: "Income floor",
    bucket: "income",
    risk: "Low",
    liquidity: "Lock-in based",
    tax: "Interest taxable as slab income",
    bestFor: "Eligible senior citizens needing stable income",
    caution: "Scheme limits, lock-in, and rate resets need review"
  },
  {
    id: "rbiLadder",
    name: "RBI Retail Direct T-bill / G-sec / SDL ladder",
    role: "Sovereign income ladder",
    bucket: "income",
    risk: "Low to medium duration risk",
    liquidity: "Tradable, but liquidity varies",
    tax: "Coupon interest is slab-rate income; listed capital gains need review",
    bestFor: "Known cash-flow dates and sovereign exposure",
    caution: "Market price moves before maturity"
  },
  {
    id: "targetMaturity",
    name: "Target maturity / debt index fund",
    role: "Debt bucket",
    bucket: "income",
    risk: "Low to medium",
    liquidity: "Market-day liquidity",
    tax: "Debt fund gains commonly slab-taxed for specified post-2023 treatment",
    bestFor: "Debt exposure with fund convenience",
    caution: "Tax treatment depends on acquisition date and portfolio classification"
  },
  {
    id: "equityIndex",
    name: "Broad equity index fund / ETF",
    role: "Growth engine",
    bucket: "growth",
    risk: "High",
    liquidity: "Market-day liquidity",
    tax: "Equity STCG/LTCG special-rate treatment when conditions apply",
    bestFor: "Inflation protection and long retirement horizons",
    caution: "Avoid funding near-term spending after sharp drawdowns"
  },
  {
    id: "annuity",
    name: "Immediate annuity",
    role: "Longevity insurance",
    bucket: "floor",
    risk: "Low market risk",
    liquidity: "Usually poor",
    tax: "Pension income generally taxable as income",
    bestFor: "Non-negotiable expense floor",
    caution: "Low flexibility and inflation risk unless features are priced in"
  },
  {
    id: "pomis",
    name: "Post Office Monthly Income Scheme",
    role: "Income floor",
    bucket: "income",
    risk: "Low",
    liquidity: "Lock-in based",
    tax: "Interest taxable as slab income",
    bestFor: "Small stable-income sleeve",
    caution: "Investment limits and rate changes"
  }
];

export function catalogByBucket(catalog = INSTRUMENT_CATALOG) {
  return catalog.reduce((groups, item) => {
    groups[item.bucket] = groups[item.bucket] || [];
    groups[item.bucket].push(item);
    return groups;
  }, {});
}

export function withdrawalRateForState(state = {}, context = {}) {
  const principal = Math.max(0, Number(state.principal) || 0);
  const household = context.household || state.householdProfile || {};
  const monthly = Math.max(0, Number(household.useHouseholdPlan ? household.monthlyCashNeed : state.monthlyTarget) || 0);
  return principal > 0 ? (monthly * 12) / principal : Infinity;
}

export function withdrawalRateBand(rate) {
  if (!Number.isFinite(rate)) return { tone: "danger", label: "No corpus base", guide: "Enter investable corpus before trusting withdrawal guidance." };
  if (rate <= 0.035) return { tone: "strong", label: "Comfortable", guide: "The starting withdrawal rate leaves room for tax, inflation, and bad years." };
  if (rate <= 0.055) return { tone: "watch", label: "Manageable", guide: "The plan needs disciplined buckets and annual review, but is not automatically stressed." };
  if (rate <= 0.075) return { tone: "risk", label: "Stretched", guide: "The plan should solve cash need, tax drag, and downside years before chasing returns." };
  return { tone: "danger", label: "Gap first", guide: "This is a corpus or spending-gap problem before it is an allocation problem." };
}

export function buildWithdrawalPolicy(state = {}, context = {}) {
  const rate = withdrawalRateForState(state, context);
  const band = withdrawalRateBand(rate);
  const best = context.best || {};
  const allocationPlan = best.allocationPlan || {};
  const profile = context.profile || {};
  const defensiveMonths = Math.max(0, Number(best.debtMonths ?? profile.reserveCoverage ?? 0) || 0);
  const requestedMonths = Math.max(6, Number(profile.requestedReserveMonths || state.liquidityMonths || 24));
  const equity = Math.round(Number(best.equityShare ?? state.equityShare ?? 60));
  const cashFlex = state.cashFlex || "guarded";
  const crashRule = cashFlex === "flexible"
    ? "In a sharp drawdown, reduce discretionary spend first and fund essentials from the cash/debt bucket."
    : "In a sharp drawdown, pause equity redemptions and fund planned cash from the defensive bucket.";
  const refillRule = defensiveMonths >= requestedMonths
    ? `Refill cash bucket annually only when it falls below ${months(requestedMonths * 0.75)}.`
    : `Build defensive cover toward ${months(requestedMonths)} before increasing growth risk.`;
  const glidePath = equity > 65
    ? "Glide equity down in 2-3% steps after strong years or as cash need rises."
    : equity < 35
      ? "Add growth exposure only after income floor and emergency reserves are secure."
      : "Keep equity broadly stable and rebalance around the chosen band annually.";

  return {
    version: PLANNING_VERSION,
    withdrawalRate: rate,
    band,
    defensiveMonths,
    requestedMonths,
    summary: `${band.label}: starting withdrawal rate is ${pct(rate)} with about ${months(defensiveMonths)} defensive cover.`,
    rules: [
      { title: "Cash Bucket", detail: refillRule },
      { title: "Crash Response", detail: crashRule },
      { title: "Refill Rule", detail: "Refill from debt maturities, dividends/interest, or equity gains after strong years; avoid forced equity sales after drawdowns." },
      { title: "Glide Path", detail: glidePath },
      { title: "Bucket Ledger", detail: allocationPlan.refillSchedule?.[0] || "Translate strategy into rupee buckets before investing." }
    ],
    warnings: [
      rate > 0.055 ? "Starting cash need is above a conservative retirement withdrawal band." : "",
      defensiveMonths < requestedMonths * 0.5 ? "Defensive cover is thin for the selected cash reserve preference." : "",
      state.incomeMode === "idcw" ? "IDCW should not be treated as guaranteed retirement income." : ""
    ].filter(Boolean)
  };
}

export function buildTaxOptimizationPlan(state = {}, context = {}) {
  const taxProfile = context.taxProfile || {};
  const law = context.taxLaw || {};
  const actions = [];
  if (Number(state.taxRate) > 0) {
    actions.push({ title: "Manual override active", detail: "Switch Manual all-tax override to 0 when you want instrument and retiree-profile tax guidance." });
  }
  if (state.incomeMode !== "swp") {
    actions.push({ title: "Compare SWP", detail: "For mutual fund retirement drawdown, SWP can separate recovered cost capital from taxable gains." });
  }
  if (Number(state.harvestLtcg) === 1) {
    actions.push({ title: "Use LTCG exemption", detail: `Equity LTCG exemption is active; current ruleset uses ${Math.round(Number(law.equityLtcgExemption || 0))} rupees before taxable LTCG.` });
  } else {
    actions.push({ title: "Review LTCG harvesting", detail: "Disabling annual exemption can overstate tax drag for equity SWP planning." });
  }
  if (Number(state.otherIncome || 0) === 0 && state.taxRegime === "new" && state.residentStatus === "resident") {
    actions.push({ title: "Protect slab room", detail: "With no other income, slab-rate retirement income may benefit from eligible 87A rebate treatment; special-rate gains stay separate." });
  }
  if (state.debtInstrument === "fdInterest") {
    actions.push({ title: "Watch TDS and slab drag", detail: "FD interest is simple but can create taxable cash flow and TDS timing friction." });
    if (state.taxRegime === "old" && state.residentStatus === "resident" && (state.ageBand === "senior" || state.ageBand === "superSenior")) {
      actions.push({ title: "Check 80TTB room", detail: "Resident senior old-regime deposit interest may use Section 80TTB deduction room before slab tax." });
    }
  }
  if (state.debtInstrument === "listedBondLtcg") {
    actions.push({ title: "Verify listed-debt treatment", detail: "Listed bond/debt ETF treatment depends on instrument facts and holding period; keep this CA-reviewed." });
  }
  if (state.debtProductClass === "debtMfPost2023") {
    actions.push({ title: "Check debt-fund acquisition date", detail: "Post-2023 specified debt-fund lots are conservatively modelled as slab-rate gains; older lots need separate review." });
  }
  if (state.section87AInterpretation === "aggregateThreshold") {
    actions.push({ title: "87A aggregate sensitivity", detail: "This permissive sensitivity still reduces only slab tax; use the default mixed-gain guardrail for conservative planning." });
  }
  if ((taxProfile.rebateUsed || 0) > 0) {
    actions.push({ title: "Rebate used", detail: "The current year uses rebate relief. Extra slab income can quickly change net cash." });
  }

  return {
    version: PLANNING_VERSION,
    headline: actions[0].title,
    actions: actions.slice(0, 5),
    caution: "Planning-grade guidance only; law, acquisition dates, residential status, and product classification can change the answer."
  };
}

export function buildAssumptionAudit(state = {}, context = {}) {
  const household = context.household || state.householdProfile || {};
  const rate = withdrawalRateForState(state, context);
  const target = Math.max(0, Number(household.useHouseholdPlan ? household.targetCorpusToday : state.targetCorpus) || 0);
  const principal = Math.max(0, Number(state.principal) || 0);
  const success = Number(context.successProbability ?? 0);
  const taxLawStatus = context.taxLawStatus || { ok: true };
  const effectiveYears = Math.max(0, Number(context.effectiveYears ?? state.years) || 0);
  const flags = [];
  if (rate > 0.075) flags.push({ severity: "high", text: "Starting withdrawal rate is above 7.5%; solve corpus/spending gap before relying on allocation." });
  if (Number(state.volatility || 0) < 4 && Number(state.equityShare || 0) > 50) flags.push({ severity: "medium", text: "Volatility assumption may be too low for an equity-heavy plan." });
  if (target > principal * 8 && effectiveYears < 20) flags.push({ severity: "medium", text: "Corpus target is aggressive relative to current corpus and horizon." });
  if (Number(state.taxRate) > 0) flags.push({ severity: "medium", text: "Manual tax override bypasses the retiree tax profile and instrument tax rules." });
  if (!taxLawStatus.ok) flags.push({ severity: "high", text: "Tax-law JSON is invalid; baseline rules are being used." });
  if (state.incomeMode === "idcw") flags.push({ severity: "medium", text: "IDCW payout is modelled as taxable distribution income and should not be treated as guaranteed." });
  if (Number(state.plannedLumpSumAmount || 0) > 0 && Number(state.plannedLumpSumYear || 0) <= 0) flags.push({ severity: "high", text: "Planned lump-sum amount is set but no target year is selected." });

  return {
    version: PLANNING_VERSION,
    confidence: flags.some((item) => item.severity === "high") ? "Needs adviser review" : flags.length ? "Planning estimate" : "Coherent planning case",
    flags,
    assumptions: [
      { label: "Tax rules", value: taxLawStatus.ok ? "Applied editable ruleset" : "Fallback baseline" },
      { label: "Return source", value: Number(state.useAssetReturns) === 1 ? "Equity/debt blend" : "Manual annual return" },
      { label: "Cash engine", value: state.incomeMode || "interest" },
      { label: "Inflation", value: `${state.inflation}%` },
      { label: "Household", value: Number(state.useHouseholdPlan) === 1 ? "Budget-linked" : "Single cash target" }
    ]
  };
}

export function buildRetirementActionPlan(state = {}, context = {}) {
  const policy = buildWithdrawalPolicy(state, context);
  const tax = buildTaxOptimizationPlan(state, context);
  const audit = buildAssumptionAudit(state, context);
  const catalog = catalogByBucket();
  return {
    version: PLANNING_VERSION,
    policy,
    tax,
    audit,
    catalog,
    checklist: [
      "Confirm monthly essential vs discretionary spending.",
      "Confirm spouse, dependant, healthcare, emergency, and known lump-sum assumptions.",
      "Hold the first cash bucket outside volatile assets.",
      "Review tax rules and product classification before each annual withdrawal plan.",
      "Rebalance only after checking market level, tax impact, and cash-bucket refill need.",
      "Export the plan PDF and ruleset JSON whenever assumptions change materially."
    ]
  };
}

export function buildRetireeGuidedPlan(state = {}, context = {}) {
  const household = context.household || {};
  const policy = context.policy || buildWithdrawalPolicy(state, context);
  const best = context.best || {};
  const maxMonthlyCash = Math.max(0, Number(context.maxMonthlyCash) || 0);
  const essentialNeed = Math.max(0, Number(household.expenses?.essential || state.essentialMonthlyExpense) || 0)
    + Math.max(0, Number(household.expenses?.spouse || state.spouseMonthlyNeed) || 0);
  const incomeFloor = Math.max(0, Number(household.incomeFloor) || 0);
  const floorGap = Math.max(0, essentialNeed - incomeFloor);
  const targetMonthly = Math.max(0, Number(household.useHouseholdPlan ? household.monthlyCashNeed : state.monthlyTarget) || 0);
  const safeUpper = maxMonthlyCash > 0 ? Math.min(targetMonthly || maxMonthlyCash, maxMonthlyCash) : targetMonthly;
  const safeLower = Math.max(0, Math.min(floorGap || targetMonthly, safeUpper || floorGap));
  const reserveMonths = Math.max(6, Math.round(Number(best.debtMonths || policy.requestedMonths || state.liquidityMonths || 24)));
  const equity = Math.round(Number(best.equityShare ?? state.equityShare ?? 60));
  const secureIncome = Math.max(0,
    Number(state.pensionMonthlyIncome || 0)
    + Number(state.rentMonthlyIncome || 0)
    + Number(state.annuityMonthlyIncome || 0)
    + Number(state.pmvvyMonthlyIncome || 0)
    + Number(state.otherMonthlyIncome || 0)
  );
  const caution = state.incomeMode === "idcw"
    ? "IDCW is taxable distribution cash and can reduce NAV; compare SWP before using it as the retirement engine."
    : state.incomeMode === "swp"
      ? "SWP is suitable for tax-aware mutual-fund drawdown only after checking FIFO lots, cost recovery, and LTCG exemption use."
      : "Interest-income mode is easy to understand, but slab tax, TDS timing, and reinvestment risk can reduce spendable cash.";
  const crashResponse = state.cashFlex === "flexible"
    ? "In a crash year, trim discretionary spend first and avoid forced equity sales."
    : "In a crash year, fund essentials from the cash/debt bucket and pause equity redemptions.";
  const householdFacts = [
    `Retiree age ${Math.round(Number(state.retireeAge) || 0)}, spouse age ${Math.round(Number(state.spouseAge) || 0)}.`,
    `${Math.round(Number(state.dependantCount) || 0)} dependant(s), support planned for ${Math.round(Number(state.dependantSupportYears) || 0)} years.`,
    `Healthcare reserve ${Math.round(Number(state.healthcareReserve) || 0)} and emergency reserve from ${Math.round(Number(state.emergencyMonths) || 0)} months.`
  ];
  return {
    version: PLANNING_VERSION,
    safeMonthlyRange: { lower: safeLower, upper: safeUpper },
    targetMonthly,
    floorGap,
    secureIncome,
    reserveMonths,
    equity,
    householdFacts,
    bucketStrategy: `${reserveMonths} months of defensive cover, ${equity}% equity growth sleeve, and annual refill review.`,
    incomeFloorPlan: floorGap > 0
      ? `Protect ${Math.round(floorGap)} monthly essential gap through cash, short FDs, sovereign/debt ladders, or reviewed annuity sleeves.`
      : "Known pension/rent/annuity-style income covers the essential floor before portfolio withdrawals.",
    taxCaution: caution,
    crashResponse,
    annualReviewChecklist: [
      "Refresh household expenses, spouse/dependant support, healthcare reserve, and known lump sums.",
      "Confirm tax-law JSON source, regime, age band, residential status, and product classification.",
      "Review cash bucket months before selling growth assets.",
      "Compare SWP, interest-income, and IDCW paths before locking withdrawals.",
      "Export adviser/CA review pack after material changes."
    ]
  };
}
