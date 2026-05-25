/**
 * tests/pdf-report-pure.test.jsx
 *
 * R4.9.5g — Pure-helper Vitest unit tests for src/exports/pdf-report.js.
 *
 * Owner-resolved R4-Q14 Option 3 (2026-05-21): per-line `/* c8 ignore next *\/`
 * at jspdf-coupled boundaries with rationale; honest Vitest unit tests for
 * pure data-transform helpers WITHOUT mocking jsPDF (mocked-jsPDF tests
 * are eyewash per Eco discipline).
 *
 * This file targets the pure helpers that pdf-report.js hoisted out of its
 * render* functions for testability. Every assertion checks real values
 * (no `.toBeDefined()` smoke tests, no truthy-only assertions).
 *
 * Persona: Eco (anti-eyewash) + Hilbert (structural completeness).
 * Parent bead: fin-9o1 (R5-deferred coverage-gap tracking).
 */

import { describe, it, expect } from "vitest";
import {
  __test__,
  renderMonthlyLedger,
  renderScenarios,
  renderDecisionSummary,
  renderTaxPath,
  renderCover,
  renderMethodology,
} from "../src/exports/pdf-report.js";
import { BASE, calculate } from "../src/model.js";

const {
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
  // R4.9.5h new pure helpers
  sanitizeForPdf,
  stripInlineMd,
  parseDisclaimerTokens,
  // R4.9.5h Pass-2 Dispatch 4 — D2 structural-markdown inline run parser
  parseInlineRuns,
  // R4.9.5h Pass-2 D7 — tile mood bucket + colour map
  confidenceMoodBucket,
  TILE_MOOD_COLOURS,
  // R4.9.5j fin-vkv — absolute-URL classifier
  isAbsoluteUrl,
} = __test__;

describe("R4.9.5g pdf-report pure helpers — formatMoneyForPdf", () => {
  it("swaps the ₹ glyph for 'INR ' so the PDF stays ASCII-safe", () => {
    // formatInr emits ₹1.00 L for 100_000 (helvetica AFM lacks ₹).
    expect(formatMoneyForPdf(100000)).toBe("INR 1.00 L");
    expect(formatMoneyForPdf(50000000)).toBe("INR 5.00 Cr");
  });

  it("renders sub-lakh values with the nf locale group separator", () => {
    expect(formatMoneyForPdf(45678)).toBe("INR 45,678");
    expect(formatMoneyForPdf(0)).toBe("INR 0");
  });

  it("returns 'N/A' for non-finite input (matches formatInr contract)", () => {
    expect(formatMoneyForPdf(NaN)).toBe("N/A");
    expect(formatMoneyForPdf(Infinity)).toBe("N/A");
    expect(formatMoneyForPdf(undefined)).toBe("N/A");
  });

  it("propagates the negative sign", () => {
    expect(formatMoneyForPdf(-100000)).toBe("-INR 1.00 L");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildVerdictMood", () => {
  it("returns 'attention' when hasCashStress is true regardless of other inputs", () => {
    // Cash stress dominates per src/main.jsx:3925-3935 precedence.
    expect(buildVerdictMood({
      hasCashStress: true, cashRatio: 10, corpusRatio: 10, successProbability: 1,
    })).toBe("attention");
  });

  it("returns 'strong' when all three thresholds met", () => {
    expect(buildVerdictMood({
      hasCashStress: false, cashRatio: 1.05, corpusRatio: 1.02, successProbability: 0.75,
    })).toBe("strong");
  });

  it("returns 'strong' at exact thresholds (>= 1, >= 1, >= 0.65)", () => {
    expect(buildVerdictMood({
      hasCashStress: false, cashRatio: 1, corpusRatio: 1, successProbability: 0.65,
    })).toBe("strong");
  });

  it("returns 'watch' when cashRatio in [0.9, 1) and corpusRatio in [0.85, 1)", () => {
    expect(buildVerdictMood({
      hasCashStress: false, cashRatio: 0.92, corpusRatio: 0.88, successProbability: 0.5,
    })).toBe("watch");
  });

  it("returns 'watch' when strong thresholds miss only on successProbability < 0.65", () => {
    expect(buildVerdictMood({
      hasCashStress: false, cashRatio: 1.0, corpusRatio: 1.0, successProbability: 0.5,
    })).toBe("watch");
  });

  it("returns 'gap' when cashRatio < 0.9", () => {
    expect(buildVerdictMood({
      hasCashStress: false, cashRatio: 0.5, corpusRatio: 0.95, successProbability: 0.4,
    })).toBe("gap");
  });

  it("returns 'gap' when corpusRatio < 0.85", () => {
    expect(buildVerdictMood({
      hasCashStress: false, cashRatio: 0.95, corpusRatio: 0.5, successProbability: 0.4,
    })).toBe("gap");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildVerdictHeadline", () => {
  it("mirrors src/main.jsx:3939-3950 strings verbatim for each mood", () => {
    expect(buildVerdictHeadline("strong")).toBe(
      "Yes — the plan covers income, protects the corpus goal, and has room to spare.");
    expect(buildVerdictHeadline("watch")).toBe(
      "Mostly yes — income is close, but the corpus cushion is thin.");
    expect(buildVerdictHeadline("attention")).toBe(
      "The plan is under stress — income, corpus, or both need attention.");
    expect(buildVerdictHeadline("gap")).toBe(
      "Not yet — the plan needs more corpus, lower cash, or a higher return to close the gap.");
  });

  it("defaults to the gap headline for unknown moods (defensive)", () => {
    expect(buildVerdictHeadline("nonsense")).toBe(
      "Not yet — the plan needs more corpus, lower cash, or a higher return to close the gap.");
    expect(buildVerdictHeadline(undefined)).toBe(
      "Not yet — the plan needs more corpus, lower cash, or a higher return to close the gap.");
  });
});

describe("R4.9.5g pdf-report pure helpers — detail-string builders", () => {
  it("buildEnduranceDetail prepends marginText with separator when present", () => {
    expect(buildEnduranceDetail({ marginText: "±3pp", mcSamples: 1000, mcSeed: 42 }))
      .toBe("±3pp · 1000 samples · seed 42");
  });

  it("buildEnduranceDetail omits prefix when marginText absent", () => {
    expect(buildEnduranceDetail({ marginText: "", mcSamples: 500, mcSeed: 7 }))
      .toBe("500 samples · seed 7");
    expect(buildEnduranceDetail({ marginText: null, mcSamples: 500, mcSeed: 7 }))
      .toBe("500 samples · seed 7");
  });

  it("buildEnduranceDetail substitutes 'n/a' for null seed (with samples>0)", () => {
    // mcSamples must be >0 here, otherwise the Pass-2 fin-c96.15 sentinel
    // suppresses the entire detail line (see test below).
    expect(buildEnduranceDetail({ marginText: "", mcSamples: 250, mcSeed: null }))
      .toBe("250 samples · seed n/a");
  });

  it("buildEnduranceDetail emits 'Pending MC computation' sentinel when mcSamples is 0 / non-finite (Pass-2 D2/fin-c96.15)", () => {
    // Pass-1 leaked the literal "0 samples · seed n/a" into tile detail lines
    // whenever the slow-tier MC had not yet settled. Owner reality-check flagged
    // this as the source of the §2 leak on cold-load exports. Pass-2 swaps the
    // leak for a muted "Pending MC computation" sentinel that mirrors the §7
    // methodology row, so cold-load PDFs no longer carry the misleading 0.
    expect(buildEnduranceDetail({ marginText: "", mcSamples: 0, mcSeed: null }))
      .toBe("Pending MC computation");
    expect(buildEnduranceDetail({ marginText: "±3pp", mcSamples: 0, mcSeed: 42 }))
      .toBe("Pending MC computation");
    expect(buildEnduranceDetail({ marginText: "", mcSamples: NaN, mcSeed: 42 }))
      .toBe("Pending MC computation");
    expect(buildEnduranceDetail({ marginText: "", mcSamples: "not-a-number", mcSeed: 42 }))
      .toBe("Pending MC computation");
  });

  it("buildSuccessDetail substitutes 'pending MC' for sample-suffix when mcSamples is 0 / non-finite (Pass-2 D2/fin-c96.15)", () => {
    // Same fin-c96.15 sentinel handling on the Target Confidence tile detail.
    // The deterministic 'P50 vs target' portion still renders (it's not derived
    // from the stochastic MC), but the trailing "· N samples" is replaced with
    // "· pending MC" so cold-load exports stop leaking a misleading "0 samples".
    expect(buildSuccessDetail({
      marginText: "", mcP50: 0, targetCorpusNominal: 0, mcSamples: NaN,
    })).toBe("INR 0 P50 vs INR 0 target · pending MC");
    expect(buildSuccessDetail({
      marginText: "±5pp", mcP50: 0, targetCorpusNominal: 0, mcSamples: 0,
    })).toBe("±5pp · INR 0 P50 vs INR 0 target · pending MC");
  });

  it("buildSuccessDetail composes 'P50 vs target' with sample suffix", () => {
    expect(buildSuccessDetail({
      marginText: "", mcP50: 50000000, targetCorpusNominal: 100000000, mcSamples: 1000,
    })).toBe("INR 5.00 Cr P50 vs INR 10.0 Cr target · 1000 samples");
  });

  it("buildSuccessDetail prepends marginText when present", () => {
    const result = buildSuccessDetail({
      marginText: "±5pp", mcP50: 50000000, targetCorpusNominal: 100000000, mcSamples: 1000,
    });
    expect(result).toBe("±5pp · INR 5.00 Cr P50 vs INR 10.0 Cr target · 1000 samples");
  });

  it("buildIncomeDetail divides annual figures by 12", () => {
    // 1.2M/yr withdrawal vs 1.5M/yr target → 100k/mo vs 125k/mo.
    expect(buildIncomeDetail({ withdrawal: 1200000, targetAnnualFinal: 1500000 }))
      .toBe("INR 1.00 L vs INR 1.25 L final-month need");
  });

  it("buildIncomeDetail tolerates zero / missing inputs", () => {
    expect(buildIncomeDetail({ withdrawal: 0, targetAnnualFinal: 0 }))
      .toBe("INR 0 vs INR 0 final-month need");
    expect(buildIncomeDetail({}))
      .toBe("INR 0 vs INR 0 final-month need");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildGapActions", () => {
  it("emits (a)+(b)+(c) when topup>1, safeMonthlyCashTarget>0, finalCorpusPct present", () => {
    const actions = buildGapActions({
      topup: 240000, safeMonthlyCashTarget: 80000, finalCorpusPct: "72%",
    });
    expect(actions).toHaveLength(3);
    expect(actions[0]).toBe("(a) Add INR 2.40 L per year");
    expect(actions[1]).toBe("(b) Reduce monthly cash to INR 80,000");
    expect(actions[2]).toBe("(c) Accept finishing at 72% of target");
  });

  it("omits (a) when topup<=1 — option suppressed", () => {
    const actions = buildGapActions({ topup: 0, safeMonthlyCashTarget: 50000, finalCorpusPct: "60%" });
    expect(actions).toHaveLength(2);
    expect(actions[0]).toBe("(b) Reduce monthly cash to INR 50,000");
    expect(actions[1]).toBe("(c) Accept finishing at 60% of target");
  });

  it("omits (b) when safeMonthlyCashTarget<=0", () => {
    const actions = buildGapActions({ topup: 100000, safeMonthlyCashTarget: 0, finalCorpusPct: "50%" });
    expect(actions).toHaveLength(2);
    expect(actions[0]).toBe("(a) Add INR 1.00 L per year");
    expect(actions[1]).toBe("(c) Accept finishing at 50% of target");
  });

  it("always emits (c) — even when no other gap-closing options are viable", () => {
    const actions = buildGapActions({ topup: 0, safeMonthlyCashTarget: 0, finalCorpusPct: "40%" });
    expect(actions).toEqual(["(c) Accept finishing at 40% of target"]);
  });
});

describe("R4.9.5g pdf-report pure helpers — buildGapDetailParts", () => {
  it("includes corpus + cash gap + return-needed when all present", () => {
    const parts = buildGapDetailParts({
      realCorpusGap: 5000000, monthlyCashGap: 15000, requiredReturnForCash: 0.12,
    });
    expect(parts).toEqual([
      "Corpus short INR 50.0 L today's rupees",
      "Monthly cash gap INR 15,000",
      "Return needed 12%",
    ]);
  });

  it("substitutes '>40%' when requiredReturnForCash is null", () => {
    const parts = buildGapDetailParts({
      realCorpusGap: 0, monthlyCashGap: 0, requiredReturnForCash: null,
    });
    expect(parts).toEqual(["Return needed >40%"]);
  });

  it("substitutes '>40%' when requiredReturnForCash is undefined", () => {
    const parts = buildGapDetailParts({ realCorpusGap: 0, monthlyCashGap: 0 });
    expect(parts).toEqual(["Return needed >40%"]);
  });

  it("omits corpus part when realCorpusGap<=1", () => {
    const parts = buildGapDetailParts({
      realCorpusGap: 0, monthlyCashGap: 5000, requiredReturnForCash: 0.08,
    });
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("Monthly cash gap INR 5,000");
    expect(parts[1]).toBe("Return needed 8%");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildScenarioRow", () => {
  it("produces the canonical 6-column scenario row for an Active scenario", () => {
    const row = buildScenarioRow({
      name: "Active", final: 75000000, real: 45000000, cashRatio: 1.02,
    });
    expect(row).toHaveLength(6);
    expect(row[0]).toBe("Active");
    expect(row[1]).toBe("INR 7.50 Cr");      // nominal
    expect(row[2]).toBe("INR 4.50 Cr");      // real
    expect(row[3]).toBe("102%");             // cashRatio×100
    expect(row[4]).toBe("—");                // not depleted
    expect(row[5]).toBe(SCENARIO_TOOLTIPS.Active);
  });

  it("emits 'INR 0' and depletion-annotation for a depleted scenario", () => {
    const row = buildScenarioRow({
      name: "Stress", final: 0, real: 0, cashRatio: 0.3, depletionYear: 18,
    });
    expect(row[1]).toBe("INR 0");
    expect(row[2]).toBe("—");
    expect(row[3]).toBe("30%");
    expect(row[4]).toBe("Plan depleted at year 18");
    expect(row[5]).toBe(SCENARIO_TOOLTIPS.Stress);
  });

  it("prefers isZeroStart over depletionYear annotation", () => {
    const row = buildScenarioRow({
      name: "Stress", final: 0, real: 0, cashRatio: 0, isZeroStart: true, depletionYear: 5,
    });
    expect(row[4]).toBe("Scenario starts at zero corpus");
  });

  it("falls back to generic 'Plan depleted' when neither isZeroStart nor depletionYear", () => {
    const row = buildScenarioRow({ name: "Income", final: 0, real: 0, cashRatio: 0.4 });
    expect(row[4]).toBe("Plan depleted");
  });

  it("clamps cashRatio to [0, 9.99] and rounds the percent", () => {
    expect(buildScenarioRow({ name: "X", final: 1, real: 1, cashRatio: -1 })[3]).toBe("0%");
    expect(buildScenarioRow({ name: "X", final: 1, real: 1, cashRatio: 999 })[3]).toBe("999%");
    expect(buildScenarioRow({ name: "X", final: 1, real: 1, cashRatio: 0.857 })[3]).toBe("86%");
  });

  it("emits empty-string tooltip for an unknown scenario name", () => {
    const row = buildScenarioRow({ name: "Custom", final: 1, real: 1, cashRatio: 0.5 });
    expect(row[5]).toBe("");
  });

  it("treats missing final/real as zero (depleted) — defensive ?? coalesce", () => {
    const row = buildScenarioRow({ name: "Active", cashRatio: 0.5 });
    expect(row[1]).toBe("INR 0");
    expect(row[4]).toBe("Plan depleted");
  });

  it("falls back to 'Scenario' literal when scenario.name is missing", () => {
    // Exercises the `scenario.name || "Scenario"` defensive branch.
    const row = buildScenarioRow({ final: 1, real: 1, cashRatio: 0.5 });
    expect(row[0]).toBe("Scenario");
  });

  it("treats null cashRatio as 0% (?? coalesce)", () => {
    const row = buildScenarioRow({ name: "X", final: 1, real: 1, cashRatio: null });
    expect(row[3]).toBe("0%");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildScenarioRows", () => {
  it("returns a placeholder row when scenarios array is empty", () => {
    const rows = buildScenarioRows([]);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("(no scenarios in export context)");
    expect(rows[0][5]).toMatch(/Pass reportScenarios/);
  });

  it("returns a placeholder row when input is not an array", () => {
    expect(buildScenarioRows(undefined)).toHaveLength(1);
    expect(buildScenarioRows(null)[0][0]).toBe("(no scenarios in export context)");
  });

  it("maps every scenario through buildScenarioRow", () => {
    const rows = buildScenarioRows([
      { name: "Active", final: 1000000, real: 800000, cashRatio: 1.1 },
      { name: "Stress", final: 0, real: 0, cashRatio: 0.2, depletionYear: 15 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe("Active");
    expect(rows[1][4]).toBe("Plan depleted at year 15");
  });
});

describe("R4.9.5g pdf-report pure helpers — SCENARIO_TOOLTIPS constant", () => {
  it("contains the verbatim Income copy with 'can meet' (R4.9.5g fin-c96.12 closure)", () => {
    // R4.9.5g fin-c96.12: the live UI says "can meet"; prior PDF copy used
    // "meets" which was the drift the bead closed. Lock the string here.
    expect(SCENARIO_TOOLTIPS.Income).toMatch(/can meet the plan/);
  });

  it("includes all 4 canonical scenario names", () => {
    expect(Object.keys(SCENARIO_TOOLTIPS).sort()).toEqual(
      ["Active", "Growth", "Income", "Stress"]);
  });
});

describe("R4.9.5g pdf-report pure helpers — DISCLAIMER_BLOCKS constant", () => {
  it("renders exactly 6 paragraph blocks (matches src/main.jsx DisclaimerNotice)", () => {
    expect(DISCLAIMER_BLOCKS).toHaveLength(6);
  });

  it("first and last blocks have null labels (anchor + tail)", () => {
    expect(DISCLAIMER_BLOCKS[0][0]).toBeNull();
    expect(DISCLAIMER_BLOCKS[DISCLAIMER_BLOCKS.length - 1][0]).toBeNull();
  });

  it("preserves the 'No telemetry. No cookies.' privacy claim verbatim", () => {
    const privacyBlock = DISCLAIMER_BLOCKS.find(([label]) => label === "Your data stays here.");
    expect(privacyBlock).toBeDefined();
    expect(privacyBlock[1]).toMatch(/No telemetry\. No cookies\./);
    expect(privacyBlock[1]).toMatch(/PRIVACY\.md/);
  });

});

describe("R4.9.5g pdf-report pure helpers — buildPlanFactRows", () => {
  it("emits 8 fact rows with the canonical labels in order", () => {
    const rows = buildPlanFactRows({
      state: { principal: 50000000, inflation: 5, targetCorpus: 100000000 },
      params: { years: 30, monthlyTarget: 150000 },
      taxLaw: { version: "FY 2025-26" },
    });
    expect(rows).toHaveLength(8);
    expect(rows[0][0]).toBe("Monthly cash target");
    expect(rows[1][0]).toBe("Starting corpus");
    expect(rows[2][0]).toBe("Horizon");
    expect(rows[3][0]).toBe("Income mode");
    expect(rows[4][0]).toBe("Expected return");
    expect(rows[5][0]).toBe("Inflation assumption");
    expect(rows[6][0]).toBe("Target corpus (today's rupees)");
    expect(rows[7][0]).toBe("Tax ruleset");
  });

  it("formats the monthly target with '/ month' suffix", () => {
    const rows = buildPlanFactRows({
      state: { principal: 0 }, params: { years: 30, monthlyTarget: 100000 }, taxLaw: {},
    });
    expect(rows[0][1]).toBe("INR 1.00 L / month");
  });

  it("renders 'Expected return' as 'X% equity / Y% debt' when useAssetReturns=1", () => {
    const rows = buildPlanFactRows({
      state: { principal: 0, useAssetReturns: 1, equityShare: 60 },
      params: { years: 30 }, taxLaw: {},
    });
    expect(rows[4][1]).toBe("60% equity / 40% debt");
  });

  it("renders 'Expected return' as 'Z% manual' when useAssetReturns is not 1", () => {
    const rows = buildPlanFactRows({
      state: { principal: 0, annualRate: 8 }, params: { years: 30 }, taxLaw: {},
    });
    expect(rows[4][1]).toBe("8% manual");
  });

  it("uppercases the incomeMode string", () => {
    const rows = buildPlanFactRows({
      state: { principal: 0, incomeMode: "swp", cashMode: "monthlyTarget" },
      params: { years: 30 }, taxLaw: {},
    });
    expect(rows[3][1]).toBe("SWP (monthlyTarget)");
  });

  it("falls back to canonical tax ruleset when taxLaw.version absent", () => {
    const rows = buildPlanFactRows({ state: { principal: 0 }, params: { years: 30 }, taxLaw: {} });
    expect(rows[7][1]).toBe("FY 2025-26 / AY 2026-27 baseline");
  });

  it("clamps years to >= 0 and rounds", () => {
    const rows = buildPlanFactRows({ state: {}, params: { years: -5 }, taxLaw: {} });
    expect(rows[2][1]).toBe("0 years");
    const rows30 = buildPlanFactRows({ state: {}, params: { years: 30.4 }, taxLaw: {} });
    expect(rows30[2][1]).toBe("30 years");
  });

  it("tolerates fully-null state/params/taxLaw inputs (defensive || {})", () => {
    const rows = buildPlanFactRows({});
    expect(rows).toHaveLength(8);
    expect(rows[1][1]).toBe("INR 0"); // starting corpus
    expect(rows[2][1]).toBe("0 years");
    expect(rows[3][1]).toBe("SWP (monthlyTarget)"); // default income mode
    expect(rows[4][1]).toBe("0% manual"); // no useAssetReturns
    expect(rows[7][1]).toBe("FY 2025-26 / AY 2026-27 baseline"); // default tax ruleset
  });

  it("derives years from state.years when params.years is absent", () => {
    const rows = buildPlanFactRows({
      state: { years: 25 }, params: {}, taxLaw: {},
    });
    expect(rows[2][1]).toBe("25 years");
  });

  it("renders 100% equity / 0% debt when equityShare reaches 100", () => {
    const rows = buildPlanFactRows({
      state: { useAssetReturns: 1, equityShare: 100 }, params: {}, taxLaw: {},
    });
    expect(rows[4][1]).toBe("100% equity / 0% debt");
  });

  it("guards against equityShare > 100 with Math.max(0, ...) on the debt side", () => {
    const rows = buildPlanFactRows({
      state: { useAssetReturns: 1, equityShare: 150 }, params: {}, taxLaw: {},
    });
    expect(rows[4][1]).toBe("150% equity / 0% debt");
  });

  it("treats missing equityShare as 0 (defensive || 0)", () => {
    const rows = buildPlanFactRows({
      state: { useAssetReturns: 1 }, params: {}, taxLaw: {},
    });
    expect(rows[4][1]).toBe("0% equity / 100% debt");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildProjectionSummaryRows", () => {
  it("computes payback ratio as cumWithdrawals / principal", () => {
    const rows = buildProjectionSummaryRows({
      model: { final: { cumWithdrawals: 30000000, cumInterest: 20000000, cumTax: 2000000, realClosing: 10000000, closing: 30000000 }, effYield: 0.07 },
      principal: 20000000,
    });
    // payback = 30M / 20M = 1.5 = 150%
    expect(rows.find((r) => r[0] === "Payback ratio (cash / starting corpus)")[1]).toBe("150%");
  });

  it("computes tax burden as cumTax / cumInterest", () => {
    const rows = buildProjectionSummaryRows({
      model: { final: { cumWithdrawals: 0, cumInterest: 10000000, cumTax: 1500000, realClosing: 0, closing: 0 } },
      principal: 0,
    });
    expect(rows.find((r) => r[0] === "Tax burden (tax / gross growth)")[1]).toBe("15%");
  });

  it("renders effective yield as 'N/A' when not a number", () => {
    const rows = buildProjectionSummaryRows({
      model: { final: {}, effYield: undefined }, principal: 0,
    });
    expect(rows.find((r) => r[0] === "Effective yield")[1]).toBe("N/A");
  });

  it("emits all 8 canonical metric labels in order", () => {
    const rows = buildProjectionSummaryRows({ model: { final: {} }, principal: 0 });
    expect(rows.map((r) => r[0])).toEqual([
      "Opening corpus",
      "Total withdrawn (cumulative)",
      "Real final balance (today's rupees)",
      "Nominal final balance",
      "Effective yield",
      "Tax drag (cumulative)",
      "Tax burden (tax / gross growth)",
      "Payback ratio (cash / starting corpus)",
    ]);
  });

  it("guards against zero principal (returns 0% payback)", () => {
    const rows = buildProjectionSummaryRows({
      model: { final: { cumWithdrawals: 1000000 } }, principal: 0,
    });
    expect(rows.find((r) => r[0] === "Payback ratio (cash / starting corpus)")[1]).toBe("0%");
  });

  it("tolerates fully-null model and principal (defensive || {} branches)", () => {
    const rows = buildProjectionSummaryRows({});
    expect(rows).toHaveLength(8);
    expect(rows[0][1]).toBe("INR 0");
    expect(rows[4][1]).toBe("N/A");
  });

  it("tolerates model with no final field", () => {
    const rows = buildProjectionSummaryRows({ model: {}, principal: 100000 });
    expect(rows[5][1]).toBe("INR 0"); // Tax drag
    expect(rows[1][1]).toBe("INR 0"); // Total withdrawn
  });

  it("returns 0% tax burden when cumInterest is zero (no gross growth)", () => {
    const rows = buildProjectionSummaryRows({
      model: { final: { cumInterest: 0, cumTax: 0 } }, principal: 0,
    });
    expect(rows.find((r) => r[0] === "Tax burden (tax / gross growth)")[1]).toBe("0%");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildJourneySampleYears", () => {
  it("returns [0..T] inclusive when horizon <= 10 (every year)", () => {
    expect(buildJourneySampleYears(0)).toEqual([0]);
    expect(buildJourneySampleYears(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(buildJourneySampleYears(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("returns 5 quartile checkpoints when horizon > 10", () => {
    expect(buildJourneySampleYears(20)).toEqual([0, 5, 10, 15, 20]);
    expect(buildJourneySampleYears(30)).toEqual([0, 7, 15, 22, 30]);
    expect(buildJourneySampleYears(50)).toEqual([0, 12, 25, 37, 50]);
  });

  it("rounds horizon to nearest integer", () => {
    expect(buildJourneySampleYears(11.6)).toEqual([0, 3, 6, 9, 12]);
  });

  it("clamps horizon to >= 0", () => {
    expect(buildJourneySampleYears(-5)).toEqual([0]);
  });
});

describe("R4.9.5h pdf-report pure helpers — findDepletionYear (D11 chart annotation)", () => {
  it("returns the first year-index where the path drops to/below the threshold", () => {
    // index 0 = today; depletion scanned from year 1 onward.
    expect(findDepletionYear([100, 80, 40, 0, 0])).toBe(3);
    expect(findDepletionYear([100, 1, 50])).toBe(1); // threshold default = 1 (<=)
  });

  it("returns null when the path never depletes within the horizon", () => {
    expect(findDepletionYear([100, 200, 300, 400])).toBeNull();
  });

  it("ignores a zero starting balance (index 0) so a not-yet-funded plan does not register", () => {
    expect(findDepletionYear([0, 50, 100])).toBeNull();
  });

  it("respects a custom threshold", () => {
    expect(findDepletionYear([100, 90, 60, 40], 50)).toBe(3);
    expect(findDepletionYear([100, 90, 60], 50)).toBeNull();
  });

  it("returns null for malformed / too-short series", () => {
    expect(findDepletionYear(null)).toBeNull();
    expect(findDepletionYear([])).toBeNull();
    expect(findDepletionYear([100])).toBeNull();
  });
});

describe("R4.9.5h pdf-report pure helpers — buildDepletionCallouts (D11 chart annotation)", () => {
  it("emits one callout per band that depletes, in P10/P50/P90 order", () => {
    const p10 = [100, 50, 0, 0];   // depletes yr 2
    const p50 = [100, 80, 60, 40]; // never
    const p90 = [100, 120, 140, 1];// depletes yr 3 (<=1)
    const out = buildDepletionCallouts(p10, p50, p90);
    expect(out).toEqual([
      { band: "P10", year: 2, label: "P10 depleted yr 2" },
      { band: "P90", year: 3, label: "P90 depleted yr 3" },
    ]);
  });

  it("returns an empty array when no band depletes", () => {
    expect(buildDepletionCallouts([10, 20], [10, 30], [10, 40])).toEqual([]);
  });

  it("tolerates missing / empty bands", () => {
    expect(buildDepletionCallouts(undefined, [], [100, 0])).toEqual([
      { band: "P90", year: 1, label: "P90 depleted yr 1" },
    ]);
  });
});

describe("R4.9.5g pdf-report pure helpers — computeScenarioFingerprint", () => {
  it("emits a deterministic 'sl-<base36>' fingerprint for the canonical list", () => {
    const fp = computeScenarioFingerprint(["Active", "Income", "Growth", "Stress"]);
    expect(fp).toMatch(/^sl-[0-9A-Z]+$/);
    // Determinism: same input ⇒ same output.
    expect(computeScenarioFingerprint(["Active", "Income", "Growth", "Stress"])).toBe(fp);
  });

  it("differs when scenario order changes (order-sensitive)", () => {
    const a = computeScenarioFingerprint(["Active", "Stress"]);
    const b = computeScenarioFingerprint(["Stress", "Active"]);
    expect(a).not.toBe(b);
  });

  it("handles empty array (produces fingerprint of empty string)", () => {
    expect(computeScenarioFingerprint([])).toMatch(/^sl-[0-9A-Z]+$/);
  });

  it("handles non-array input defensively (treats as empty)", () => {
    const empty = computeScenarioFingerprint([]);
    expect(computeScenarioFingerprint(undefined)).toBe(empty);
    expect(computeScenarioFingerprint(null)).toBe(empty);
  });
});

describe("R4.9.5g pdf-report pure helpers — stripDisclaimerFrontmatter", () => {
  it("strips a leading '---\\n...\\n---\\n' YAML block", () => {
    const text = "---\ntitle: Disclaimer\nupdated: 2026-05-21\n---\n# Body\nContent here.";
    expect(stripDisclaimerFrontmatter(text)).toBe("# Body\nContent here.");
  });

  it("returns unchanged body when no frontmatter present", () => {
    expect(stripDisclaimerFrontmatter("# Just content"))
      .toBe("# Just content");
  });

  it("normalises CRLF to LF", () => {
    expect(stripDisclaimerFrontmatter("a\r\nb\r\nc"))
      .toBe("a\nb\nc");
  });

  it("returns empty string for non-string input", () => {
    expect(stripDisclaimerFrontmatter(undefined)).toBe("");
    expect(stripDisclaimerFrontmatter(null)).toBe("");
    expect(stripDisclaimerFrontmatter(123)).toBe("");
  });

  it("strips frontmatter even when body contains embedded '---' separators", () => {
    const text = "---\ntitle: x\n---\nbody\n---\nmore body";
    expect(stripDisclaimerFrontmatter(text)).toBe("body\n---\nmore body");
  });
});

describe("R4.9.5g pdf-report pure helpers — buildMethodologyFactsRows", () => {
  it("emits 4 canonical rows (MC / Regime / Tax / Scenarios)", () => {
    const rows = buildMethodologyFactsRows({
      mc: { simulations: 1000, seed: 42, method: "stochastic-regime" },
      taxLaw: { version: "FY 2025-26" },
      scenarioNames: ["Active", "Income", "Growth", "Stress"],
    });
    expect(rows).toHaveLength(4);
    expect(rows[0][0]).toBe("Monte Carlo");
    expect(rows[1][0]).toBe("Regime model");
    expect(rows[2][0]).toBe("Tax law");
    expect(rows[3][0]).toBe("Scenario library");
  });

  it("composes the MC summary as 'N samples · seed S · method M'", () => {
    const rows = buildMethodologyFactsRows({
      mc: { simulations: 500, seed: 7, method: "antithetic" }, taxLaw: {}, scenarioNames: [],
    });
    expect(rows[0][1]).toBe("500 samples · seed 7 · method antithetic");
  });

  it("substitutes default mcMethod when missing", () => {
    const rows = buildMethodologyFactsRows({
      mc: { simulations: 100, seed: 1 }, taxLaw: {}, scenarioNames: [],
    });
    expect(rows[0][1]).toBe("100 samples · seed 1 · method stochastic-regime");
  });

  it("substitutes 'n/a' for null seed", () => {
    const rows = buildMethodologyFactsRows({
      mc: { simulations: 100, seed: null }, taxLaw: {}, scenarioNames: [],
    });
    expect(rows[0][1]).toMatch(/seed n\/a/);
  });

  it("falls back to METHODOLOGY_SCENARIO_NAMES when scenarioNames is empty", () => {
    const rows = buildMethodologyFactsRows({ mc: {}, taxLaw: {}, scenarioNames: [] });
    expect(rows[3][1]).toMatch(/4 scenarios · Active \/ Income \/ Growth \/ Stress/);
  });

  it("includes the FNV-1a fingerprint in the Scenario library row", () => {
    const rows = buildMethodologyFactsRows({
      mc: {}, taxLaw: {}, scenarioNames: ["Active", "Stress"],
    });
    const fp = computeScenarioFingerprint(["Active", "Stress"]);
    expect(rows[3][1]).toContain(fp);
  });

  it("preserves the spec citation in column 3 of every row", () => {
    const rows = buildMethodologyFactsRows({ mc: {}, taxLaw: {}, scenarioNames: [] });
    expect(rows[0][2]).toMatch(/Q-MC/);
    expect(rows[2][2]).toMatch(/FA-2025/);
    expect(rows[3][2]).toMatch(/SCENARIOS array/);
  });

  it("tolerates fully-null mc/taxLaw inputs (defensive || {} branches)", () => {
    const rows = buildMethodologyFactsRows({});
    expect(rows).toHaveLength(4);
    // D4 (R4.9.5h): mc.simulations===0 triggers sentinel, not raw "0 samples" string.
    expect(rows[0][1]).toMatch(/Monte Carlo not yet computed/);
  });

  it("falls back to canonical scenario list when scenarioNames is non-array", () => {
    const rows = buildMethodologyFactsRows({
      mc: {}, taxLaw: {}, scenarioNames: undefined,
    });
    expect(rows[3][1]).toMatch(/Active \/ Income \/ Growth \/ Stress/);
  });
});

describe("R4.9.5g pdf-report pure helpers — METHODOLOGY_SCENARIO_NAMES", () => {
  it("matches the src/model.js:228-233 canonical order", () => {
    expect(METHODOLOGY_SCENARIO_NAMES).toEqual(["Active", "Income", "Growth", "Stress"]);
  });

});

/**
 * Render-path branch coverage tests — these tests exercise specific
 * branches in the render* functions using REAL jsPDF (no mocking). They
 * close residual lines that aren't covered by the existing scaffold suite.
 */
describe("R4.9.5g pdf-report — render-path branch coverage (honest, no mocks)", () => {
  const buildDoc = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTableFn = autoTableModule.default || autoTableModule.autoTable;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    if (typeof autoTableFn === "function") doc.autoTable = (opts) => autoTableFn(doc, opts);
    return doc;
  };

  it("renderScenarios populates the autotable when reportScenarios is provided", async () => {
    const doc = await buildDoc();
    const before = doc.lastAutoTable && doc.lastAutoTable.finalY;
    await renderScenarios(doc, {
      reportScenarios: [
        { name: "Active", final: 50000000, real: 30000000, cashRatio: 1.1 },
        { name: "Income", final: 40000000, real: 25000000, cashRatio: 0.95 },
        { name: "Growth", final: 80000000, real: 50000000, cashRatio: 1.3, depletionYear: null },
        { name: "Stress", final: 0, real: 0, cashRatio: 0.4, depletionYear: 22 },
      ],
    });
    // After renderScenarios runs the autotable, doc.lastAutoTable.finalY moves.
    expect(doc.lastAutoTable).toBeTruthy();
    expect(doc.lastAutoTable.finalY).toBeGreaterThan(0);
    if (before !== undefined) {
      expect(doc.lastAutoTable.finalY).not.toBe(before);
    }
  }, 30000);

  it("renderMonthlyLedger short-circuits when ledger is empty (years=0)", async () => {
    const doc = await buildDoc();
    const pagesBefore = doc.getNumberOfPages();
    await renderMonthlyLedger(doc, {
      reportFingerprint: "ledger-empty-test",
      reportState: { principal: 0 },
      reportParams: { years: 0 },
      reportModel: { rows: [], monthlyRows: [] },
    });
    // §6 still adds its single section-heading page even with zero rows.
    expect(doc.getNumberOfPages()).toBe(pagesBefore + 1);
  }, 30000);

  it("renderDecisionSummary uses precomputed verdict booleans when reportVerdict is passed", async () => {
    // Exercises the `verdict ? ...` true branch at lines 872-877 (R4.9.5g
    // fin-c96.11 path). Without reportVerdict the function falls back to
    // its inline computation; the scaffold tests only exercise the fallback.
    const doc = await buildDoc();
    const params = { ...BASE, years: 10 };
    const reportModel = calculate(params);
    await renderDecisionSummary(doc, {
      reportFingerprint: "decision-verdict-test",
      reportState: { principal: 50000000, cashMode: "monthlyTarget" },
      reportParams: params,
      reportModel,
      reportMc: { successProbability: 0.8, enduranceProbability: 0.7, simulations: 1000, seed: 42, finals: [50000000, 60000000] },
      reportHousehold: { useHouseholdPlan: true, targetCorpusToday: 70000000 },
      reportRequiredReturnForCash: 0.09,
      reportMaxMonthlyCash: 75000,
      reportVerdict: { hasCashShortfall: true, hasCashStress: true },
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("renderDecisionSummary with the 'no funding gap' success branch covered", async () => {
    // Exercises the `else` branch of the gap check (success message path).
    const doc = await buildDoc();
    const params = { ...BASE, years: 10 };
    const reportModel = calculate(params);
    await renderDecisionSummary(doc, {
      reportFingerprint: "decision-no-gap-test",
      reportState: { principal: 100000000, cashMode: "monthlyTarget", targetCorpus: 0 },
      reportParams: params,
      reportModel,
      reportMc: { successProbability: 0.95, enduranceProbability: 0.95, simulations: 1000, seed: 42 },
      reportRequiredReturnForCash: null, // ">40%" branch
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("renderCover renders cover with full state/params/taxLaw passed through", async () => {
    // Exercises the household-plan branch and disclaimerBlocks loop.
    const doc = await buildDoc();
    await renderCover(doc, {
      reportFingerprint: "cover-full-test",
      reportState: {
        principal: 50000000, monthlyTarget: 100000, useAssetReturns: 1,
        equityShare: 60, incomeMode: "swp", targetCorpus: 80000000, inflation: 5,
      },
      reportParams: { years: 30, monthlyTarget: 100000 },
      reportTaxLaw: { version: "FY 2025-26 / AY 2026-27 baseline" },
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("renderTaxPath populates with a tax-law version + taxLotSummary", async () => {
    const doc = await buildDoc();
    await renderTaxPath(doc, {
      reportFingerprint: "tax-test",
      reportState: { useAssetReturns: 1, equityProductClass: "equityMfDirect", debtProductClass: "listedBondDebtEtf" },
      reportTaxLaw: { version: "FY 2025-26", rebates: { new: { threshold: 1200000 } }, deductions: { section80TTB: { max: 50000 } } },
      reportY1Tax: { rebateUsed: 25000, basicExemptionUsed: 300000, section80TTBUsed: 40000, surcharge: 0, marginalRelief: 0, normalTax: 100000, specialTax: 25000 },
      reportTaxLotSummary: { realizedGain: 500000, exemptionUsed: 125000, capitalRecovered: 200000 },
      reportModel: { final: { cumInterest: 5000000, cumTax: 800000 }, effYield: 0.075, taxLotMethod: "FIFO" },
    });
    expect(doc.lastAutoTable).toBeTruthy();
  }, 30000);

  it("renderMethodology with reportScenarios array exercises the .map name path", async () => {
    // Hits the `scenarios.map(s => s.name || ...)` branch (vs fallback constant).
    const doc = await buildDoc();
    await renderMethodology(doc, {
      reportFingerprint: "methodology-scenarios-named",
      reportMc: { simulations: 1000, seed: 42, method: "stochastic-regime" },
      reportTaxLaw: { version: "FY 2025-26" },
      reportScenarios: [{ name: "Active" }, { name: "Stress" }, { /* missing name → 'Scenario' */ }],
      disclaimerFullText: "## Disclaimer\nbody text.",
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("renderMethodology disclaimer — pipe-table, pendingBlankSkip, and plain blank-line paths (fin-9o1)", async () => {
    // fin-9o1 R4.9.5j: backfill coverage for the disclaimer rendering loop
    // branches that the minimal fixture (## heading + body text) misses:
    //   - the `continue` after a pipe table row (needs | ... | content)
    //   - pendingBlankSkip=true path (blank line immediately after a heading)
    //   - blank-line padding path (blank line NOT after heading)
    //
    // All three are inside the jspdf-coupled disclaimer rendering loop; they call
    // doc.autoTable / discY arithmetic — NOT canvas APIs — so Vitest with real
    // jspdf reaches them. The ignore rationale for emitRuns word-wrap and
    // disclaimerNewPage pagination branches remains — those only fire on
    // multi-page disclaimers or overflows which require real page geometry.
    const doc = await buildDoc();
    const disclaimerWithTableAndBlanks = [
      "## Section Heading",
      "",
      "A plain paragraph.",
      "",
      "Another paragraph.",
      "| Col A | Col B |",
      "|---|---|",
      "| val1 | val2 |",
      "",
      "Trailing text.",
    ].join("\n");
    await renderMethodology(doc, {
      reportFingerprint: "methodology-blanks-table",
      reportMc: { simulations: 500, seed: 1 },
      reportTaxLaw: { version: "FY 2025-26" },
      disclaimerFullText: disclaimerWithTableAndBlanks,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("renderMonthlyLedger applies the didParseCell year-end + final-year styling at 5y horizon", async () => {
    // Builds a real 5y ledger (60 rows = 5 year-end markers, of which year 5
    // is the final-year row) and asserts the autotable populates.
    const doc = await buildDoc();
    const params = { ...BASE, years: 5 };
    const reportModel = calculate(params);
    await renderMonthlyLedger(doc, {
      reportFingerprint: "ledger-5y-test",
      reportState: { principal: BASE.principal },
      reportParams: params,
      reportModel,
    });
    expect(doc.lastAutoTable).toBeTruthy();
    expect(doc.lastAutoTable.finalY).toBeGreaterThan(0);
    // 5y ledger fits on one page → no continuation banner needed.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  }, 30000);
});

// ─── R4.9.5h pure helpers ───────────────────────────────────────────────────
// sanitizeForPdf, stripInlineMd, parseDisclaimerTokens
// Covers D3/D5/D18 (glyph fallback) + D2/D13/D14/D16/D17 (markdown stripping)
// Per R4-Q14/Turing M08-coda: these pure functions MUST have real Vitest tests.

describe("R4.9.5h — sanitizeForPdf (glyph substitution, D3/D5/D18)", () => {
  it("replaces ₹ with 'INR ' (D5 fin-c96.16)", () => {
    expect(sanitizeForPdf("₹12L threshold")).toBe("INR 12L threshold");
  });

  it("replaces ⇒ with '=>' (D5 — ⇒ renders as !Ò in Helvetica AFM)", () => {
    expect(sanitizeForPdf("seed ⇒ path")).toBe("seed => path");
  });

  it("replaces → with '->' (defensive: U+2192 absent from Helvetica AFM)", () => {
    expect(sanitizeForPdf("A → B")).toBe("A -> B");
  });

  it("replaces en dash – with '-'", () => {
    expect(sanitizeForPdf("FY 2025–26")).toBe("FY 2025-26");
  });

  it("replaces em dash — with '--'", () => {
    expect(sanitizeForPdf("foo — bar")).toBe("foo -- bar");
  });

  it("replaces superscript ¹ with '(1)'", () => {
    expect(sanitizeForPdf("§87A ¹12L")).toBe("§87A (1)12L");
  });

  it("handles null/undefined gracefully", () => {
    expect(sanitizeForPdf(null)).toBe("");
    expect(sanitizeForPdf(undefined)).toBe("");
  });

  it("leaves plain ASCII text unchanged", () => {
    expect(sanitizeForPdf("Hello, world!")).toBe("Hello, world!");
  });
});

describe("R4.9.5h — stripInlineMd (inline markdown stripping, D2/D13/D14/D16/D17)", () => {
  it("strips **bold** markers (D13 — raw ** must not appear in PDF)", () => {
    expect(stripInlineMd("**not financial advice**")).toBe("not financial advice");
  });

  it("strips *italic* markers", () => {
    expect(stripInlineMd("*emphasis*")).toBe("emphasis");
  });

  it("strips `code` backticks (D16)", () => {
    expect(stripInlineMd("`src/model.js`")).toBe("src/model.js");
  });

  it("strips [text](url) link syntax keeping text (D14)", () => {
    expect(stripInlineMd("[PRIVACY.md](PRIVACY.md)")).toBe("PRIVACY.md");
  });

  it("strips <https://...> autolink keeping URL (D17)", () => {
    expect(stripInlineMd("<https://www.sebi.gov.in/>")).toBe("https://www.sebi.gov.in/");
  });

  it("also applies sanitizeForPdf glyph substitution (D5)", () => {
    expect(stripInlineMd("**₹12L** threshold")).toBe("INR 12L threshold");
  });

  it("handles multiple inline patterns on one line", () => {
    const result = stripInlineMd("**bold** and `code` and [link](url)");
    expect(result).toBe("bold and code and link");
  });

  it("leaves plain text unchanged", () => {
    expect(stripInlineMd("This is plain text.")).toBe("This is plain text.");
  });
});

describe("R4.9.5h — parseDisclaimerTokens (markdown token parser, D2/D13/D14/D16/D17/D19)", () => {
  it("parses ## heading into token {k:'H', level:2, v: string}", () => {
    const tokens = parseDisclaimerTokens("## Section Title");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ k: "H", level: 2, v: "Section Title" });
  });

  it("parses # H1 and ### H3 headings at correct levels", () => {
    const tokens = parseDisclaimerTokens("# Title\n### Subtitle");
    expect(tokens[0]).toMatchObject({ k: "H", level: 1 });
    expect(tokens[1]).toMatchObject({ k: "H", level: 3 });
  });

  it("parses --- horizontal rule into token {k:'R'}", () => {
    const tokens = parseDisclaimerTokens("---");
    expect(tokens[0]).toMatchObject({ k: "R" });
  });

  it("parses blank line into token {k:'B'}", () => {
    const tokens = parseDisclaimerTokens("line1\n\nline2");
    expect(tokens.some(t => t.k === "B")).toBe(true);
  });

  it("parses | pipe table | into table_start + table_row tokens (D19)", () => {
    const md = "| Version | Date | Change |\n|---|---|---|\n| 1.0.0 | 2026-05-19 | Initial |";
    const tokens = parseDisclaimerTokens(md);
    expect(tokens.some(t => t.k === "TS")).toBe(true);
    expect(tokens.some(t => t.k === "TR")).toBe(true);
    // Separator row (|---|---|---) must be skipped
    const rows = tokens.filter(t => t.k === "TR");
    expect(rows).toHaveLength(2); // header + one data row (separator skipped)
    expect(rows[0].cells).toEqual(["Version", "Date", "Change"]);
    expect(rows[1].cells).toEqual(["1.0.0", "2026-05-19", "Initial"]);
  });

  it("closes table block on blank line and emits table_end token", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n\nNext paragraph";
    const tokens = parseDisclaimerTokens(md);
    expect(tokens.some(t => t.k === "TE")).toBe(true);
  });

  it("parses > blockquote into token {k:'Q', v: string}", () => {
    const tokens = parseDisclaimerTokens("> MIT license text");
    expect(tokens[0]).toMatchObject({ k: "Q", v: "MIT license text" });
  });

  it("parses - list item into {k:'L', ordered:false}", () => {
    const tokens = parseDisclaimerTokens("- bullet item");
    expect(tokens[0]).toMatchObject({ k: "L", ordered: false, v: "bullet item" });
  });

  it("parses 1. ordered list item into {k:'L', ordered:true, index:1}", () => {
    const tokens = parseDisclaimerTokens("1. first item");
    expect(tokens[0]).toMatchObject({ k: "L", ordered: true, index: 1 });
  });

  it("parses plain paragraph into {k:'P', v: string} with inline md stripped (D13)", () => {
    const tokens = parseDisclaimerTokens("This is **bold** text.");
    expect(tokens[0]).toMatchObject({ k: "P", v: "This is bold text." });
  });

  it("applies sanitizeForPdf to heading text (D5 glyph safety)", () => {
    const tokens = parseDisclaimerTokens("## §87A ₹12L Threshold");
    expect(tokens[0].v).toContain("INR ");
    expect(tokens[0].v).not.toContain("₹");
  });

  it("handles empty input gracefully", () => {
    expect(parseDisclaimerTokens("")).toEqual([]);
    expect(parseDisclaimerTokens(null)).toEqual([]);
  });
});

describe("R4.9.5h Pass-2 Dispatch 4 — parseInlineRuns (D2 structural markdown)", () => {
  // Owner R4-Q17 Option B + R4-Q19: paragraph inline markdown must yield
  // styled runs so jsPDF can render **bold** as Helvetica-Bold, *italic* as
  // Helvetica-Oblique, `code` as Courier. Asterisks/backticks/angle brackets
  // must be consumed (e2e e1.1–e1.6 forbid raw markdown in the §7 text layer).
  it("returns a single plain run for plain text", () => {
    expect(parseInlineRuns("hello world")).toEqual([{ text: "hello world" }]);
  });

  it("marks **bold** spans with bold:true and consumes the asterisks", () => {
    const runs = parseInlineRuns("It is **not financial advice**.");
    expect(runs).toEqual([
      { text: "It is " },
      { text: "not financial advice", bold: true },
      { text: "." },
    ]);
    // Sanity: no raw asterisks survived (e2e e1.1).
    expect(runs.map((r) => r.text).join("")).not.toMatch(/\*/);
  });

  it("marks *italic* spans with italic:true and consumes the asterisks", () => {
    const runs = parseInlineRuns("an *emphasised* word");
    expect(runs).toEqual([
      { text: "an " },
      { text: "emphasised", italic: true },
      { text: " word" },
    ]);
  });

  it("marks `code` spans with code:true and consumes the backticks (e1.6)", () => {
    const runs = parseInlineRuns("source: `src/model.js` baseline");
    expect(runs[0]).toEqual({ text: "source: " });
    expect(runs[1]).toEqual({ text: "src/model.js", code: true });
    expect(runs[2]).toEqual({ text: " baseline" });
    expect(runs.map((r) => r.text).join("")).not.toMatch(/`/);
  });

  it("handles multiple bold spans on one line", () => {
    const runs = parseInlineRuns("**a** and **b**");
    expect(runs.filter((r) => r.bold).map((r) => r.text)).toEqual(["a", "b"]);
  });

  it("R4-Q19: [text](url) renders text + ' (url)' when they differ (text-only, no link annot)", () => {
    const runs = parseInlineRuns("see [PRIVACY](PRIVACY.md) for details");
    const joined = runs.map((r) => r.text).join("");
    expect(joined).toBe("see PRIVACY (PRIVACY.md) for details");
    expect(joined).not.toMatch(/\[|\]\(/);
  });

  it("R4-Q19: [url](url) collapses to a single URL when text === url", () => {
    const runs = parseInlineRuns("[https://x.test](https://x.test)");
    expect(runs.map((r) => r.text).join("")).toBe("https://x.test");
  });

  it("R4-Q19: <https://...> autolink renders the bare URL (e1.5)", () => {
    const runs = parseInlineRuns("visit <https://www.sebi.gov.in/> today");
    const joined = runs.map((r) => r.text).join("");
    expect(joined).toBe("visit https://www.sebi.gov.in/ today");
    expect(joined).not.toMatch(/<https?:\/\//);
  });

  it("applies sanitizeForPdf so ₹/⇒ glyphs are PDF-safe (D5)", () => {
    const runs = parseInlineRuns("threshold **₹12L** at seed ⇒");
    const joined = runs.map((r) => r.text).join("");
    expect(joined).toBe("threshold INR 12L at seed =>");
    // Bold flag preserved on the substituted text.
    const boldRun = runs.find((r) => r.bold);
    expect(boldRun.text).toBe("INR 12L");
  });

  it("merges adjacent runs that share the same style flags", () => {
    // Two consecutive plain segments (no markdown between them) should not
    // produce duplicate run objects — the renderer is faster with fewer runs.
    const runs = parseInlineRuns("plain text only");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ text: "plain text only" });
  });

  it("returns empty array for empty / null / undefined input", () => {
    expect(parseInlineRuns("")).toEqual([]);
    expect(parseInlineRuns(null)).toEqual([]);
    expect(parseInlineRuns(undefined)).toEqual([]);
  });

  it("handles SEBI-style bold phrase with a parenthetical inside the bold span", () => {
    // From DISCLAIMER.md §2: "Consult a **SEBI-registered Investment Adviser (RIA)**".
    // This is the assertion C.2 from the dispatch — the parenthetical "(RIA)"
    // must stay inside the bold run, not break it.
    const runs = parseInlineRuns("Consult a **SEBI-registered Investment Adviser (RIA)**.");
    const boldRun = runs.find((r) => r.bold);
    expect(boldRun).toBeDefined();
    expect(boldRun.text).toBe("SEBI-registered Investment Adviser (RIA)");
  });

  it("merges adjacent bold runs that share the same style flag (push-merge branch)", () => {
    // Two consecutive bold tokens with no plain text between them collapse
    // into a single bold run. Exercises the push() merge fast-path.
    const runs = parseInlineRuns("**a****b**");
    const bold = runs.filter((r) => r.bold);
    expect(bold.map((r) => r.text).join("")).toBe("ab");
  });

  it("preserves bare unmatched asterisks in surrounding text (no regex match path)", () => {
    // No regex match → trailing push(src.slice(cur)) branch is exercised.
    const runs = parseInlineRuns("a * b");
    expect(runs.map((r) => r.text).join("")).toBe("a * b");
  });

  it("emits plain trailing text after the last match (trailing push branch)", () => {
    const runs = parseInlineRuns("**lead** trailing tail");
    expect(runs[runs.length - 1].text).toBe(" trailing tail");
    expect(runs[runs.length - 1].bold).toBeFalsy();
  });
});

describe("R4.9.5h — buildMethodologyFactsRows D4 sentinel + D5 glyph fix", () => {
  it("D4: emits sentinel when mc.simulations === 0 (fin-c96.15)", () => {
    const rows = buildMethodologyFactsRows({ mc: { simulations: 0, seed: 42 } });
    // MC row is [0], value cell is [1]
    expect(rows[0][1]).toMatch(/not yet computed/i);
    expect(rows[0][1]).not.toMatch(/0 samples/);
  });

  it("D4: normal MC row when simulations > 0", () => {
    const rows = buildMethodologyFactsRows({ mc: { simulations: 1000, seed: 42, method: "stochastic-regime" } });
    expect(rows[0][1]).toMatch(/1000 samples/);
    expect(rows[0][1]).toMatch(/seed 42/);
  });

  it("D5/D18: no ₹ glyph in any methodology cell (causes exploded letter-spacing)", () => {
    const rows = buildMethodologyFactsRows({
      mc: { simulations: 500, seed: 1 },
      taxLaw: { version: "FY 2025-26 / AY 2026-27 baseline" },
    });
    const allText = rows.flat().join(" ");
    expect(allText).not.toContain("₹");
    expect(allText).not.toContain("⇒");
  });

  it("D5/D18: no ⇒ glyph in MC source citation (was 'identical seed ⇒ identical paths')", () => {
    const rows = buildMethodologyFactsRows({ mc: { simulations: 100, seed: 99 } });
    const mcCitation = rows[0][2];
    expect(mcCitation).not.toContain("⇒");
    // The => replacement is acceptable
    if (mcCitation.includes("identical seed")) {
      expect(mcCitation).toContain("=>");
    }
  });
});

describe("R4.9.5h Pass-2 pure helpers — confidenceMoodBucket (D7)", () => {
  it("returns 'pending' when mcSamples is 0 regardless of probability", () => {
    // Pass-2 D7 — when the slow-tier MC has not settled yet, all probability
    // input is meaningless (the fast-tier fallback returns simulations:0). The
    // bucket must reflect that the value is provisional, not high/med/low.
    expect(confidenceMoodBucket(0.95, 0)).toBe("pending");
    expect(confidenceMoodBucket(0.5, 0)).toBe("pending");
    expect(confidenceMoodBucket(0.1, 0)).toBe("pending");
  });

  it("returns 'pending' when mcSamples is non-finite (NaN / string)", () => {
    expect(confidenceMoodBucket(0.95, NaN)).toBe("pending");
    expect(confidenceMoodBucket(0.95, "abc")).toBe("pending");
    expect(confidenceMoodBucket(0.95, null)).toBe("pending");
  });

  it("returns 'high' at and above the 70% confidence threshold", () => {
    expect(confidenceMoodBucket(0.70, 1000)).toBe("high");
    expect(confidenceMoodBucket(0.85, 1000)).toBe("high");
    expect(confidenceMoodBucket(1.0, 1000)).toBe("high");
  });

  it("returns 'med' in the 30-70% confidence band", () => {
    expect(confidenceMoodBucket(0.30, 1000)).toBe("med");
    expect(confidenceMoodBucket(0.50, 1000)).toBe("med");
    expect(confidenceMoodBucket(0.699, 1000)).toBe("med");
  });

  it("returns 'low' below the 30% confidence threshold", () => {
    expect(confidenceMoodBucket(0.299, 1000)).toBe("low");
    expect(confidenceMoodBucket(0.10, 1000)).toBe("low");
    expect(confidenceMoodBucket(0, 1000)).toBe("low");
  });

  it("treats non-numeric probability as 0 (defensive against MC bundle shape drift)", () => {
    expect(confidenceMoodBucket(undefined, 1000)).toBe("low");
    expect(confidenceMoodBucket(null, 1000)).toBe("low");
    expect(confidenceMoodBucket("hello", 1000)).toBe("low");
  });
});

describe("R4.9.5h Pass-2 pure helpers — TILE_MOOD_COLOURS (D7)", () => {
  it("exposes every mood bucket plus the fixed income/tax tile colours", () => {
    // Locks the shape so a refactor that drops a mood key fails loudly rather
    // than silently rendering tiles with undefined colours.
    expect(Object.keys(TILE_MOOD_COLOURS).sort()).toEqual(
      ["high", "income", "low", "med", "pending", "tax"]
    );
  });

  it("each mood entry carries a stripe/body/chip hex + a chip label", () => {
    for (const [moodKey, entry] of Object.entries(TILE_MOOD_COLOURS)) {
      expect(entry.stripe, `${moodKey}.stripe`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.body, `${moodKey}.body`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.chip, `${moodKey}.chip`).toMatch(/^#[0-9a-f]{6}$/i);
      // income/tax are fixed-mood tiles and don't show a chip badge, so their
      // label is null by design; the three confidence buckets and pending all
      // surface a HIGH / MED / LOW / PEND chip.
      if (moodKey === "income" || moodKey === "tax") {
        expect(entry.label).toBeNull();
      } else {
        expect(typeof entry.label).toBe("string");
        expect(entry.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("frozen — the colour map cannot drift at runtime", () => {
    expect(Object.isFrozen(TILE_MOOD_COLOURS)).toBe(true);
  });
});

// ─── R4.9.5j fin-vkv — clickable absolute-URL link annotations ──────────────
// Pure-helper tests for isAbsoluteUrl and parseInlineRuns link-property
// extension. emitRuns (jspdf-coupled) carries the c8 ignore covering the
// textWithLink call site; the pure classification + run-tagging logic is
// tested here.

describe("R4.9.5j fin-vkv — isAbsoluteUrl (pure URL classifier)", () => {
  it("returns true for https:// URLs", () => {
    expect(isAbsoluteUrl("https://www.sebi.gov.in/")).toBe(true);
    expect(isAbsoluteUrl("https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13")).toBe(true);
  });

  it("returns true for http:// URLs", () => {
    expect(isAbsoluteUrl("http://example.com")).toBe(true);
  });

  it("returns false for relative paths", () => {
    expect(isAbsoluteUrl("PRIVACY.md")).toBe(false);
    expect(isAbsoluteUrl("./docs/foo.md")).toBe(false);
    expect(isAbsoluteUrl("../LICENSE")).toBe(false);
    expect(isAbsoluteUrl("README.md")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAbsoluteUrl("")).toBe(false);
  });

  it("returns false for non-string input", () => {
    expect(isAbsoluteUrl(null)).toBe(false);
    expect(isAbsoluteUrl(undefined)).toBe(false);
    expect(isAbsoluteUrl(42)).toBe(false);
  });

  it("is case-insensitive for the scheme prefix (HTTPS:// etc.)", () => {
    expect(isAbsoluteUrl("HTTPS://example.com")).toBe(true);
    expect(isAbsoluteUrl("HTTP://example.com")).toBe(true);
  });
});

describe("R4.9.5j fin-vkv — parseInlineRuns link property (clickable annotations)", () => {
  it("emits { link: url } on the run when [text](https://...) has an absolute URL", () => {
    // The SEBI link in DISCLAIMER.md §2: [text](https://www.sebi.gov.in/...)
    const url = "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13";
    const runs = parseInlineRuns(`check [SEBI registry](${url}) here`);
    const linkRun = runs.find((r) => r.link);
    expect(linkRun).toBeDefined();
    expect(linkRun.text).toBe("SEBI registry");
    expect(linkRun.link).toBe(url);
    // Surrounding plain runs must have no link property.
    const plainRuns = runs.filter((r) => !r.link);
    expect(plainRuns.length).toBeGreaterThan(0);
    expect(plainRuns[0].link).toBeUndefined();
  });

  it("emits { link: url } for <https://...> autolinks (SEBI canonical form in DISCLAIMER.md)", () => {
    const url = "https://www.sebi.gov.in/";
    const runs = parseInlineRuns(`visit <${url}> today`);
    const linkRun = runs.find((r) => r.link);
    expect(linkRun).toBeDefined();
    expect(linkRun.text).toBe(url);
    expect(linkRun.link).toBe(url);
  });

  it("does NOT emit link property for relative [text](PRIVACY.md) links (text-only)", () => {
    const runs = parseInlineRuns("see [PRIVACY.md](PRIVACY.md) for details");
    const linkRun = runs.find((r) => r.link);
    expect(linkRun).toBeUndefined();
    // The R4-Q19 text rendering still applies for same text==url relative links.
    const joined = runs.map((r) => r.text).join("");
    expect(joined).toContain("PRIVACY.md");
  });

  it("does NOT emit link property for relative [text](./path) links", () => {
    const runs = parseInlineRuns("see [docs](./docs/readme.md) here");
    const linkRun = runs.find((r) => r.link);
    expect(linkRun).toBeUndefined();
    // R4-Q19: relative link still renders "text (url)" form
    const joined = runs.map((r) => r.text).join("");
    expect(joined).toContain("docs");
    expect(joined).toContain("./docs/readme.md");
  });

  it("absolute [text](url) where text !== url keeps text as displayed text with link", () => {
    const runs = parseInlineRuns("[Click here](https://example.com/path?q=1)");
    const linkRun = runs.find((r) => r.link);
    expect(linkRun).toBeDefined();
    expect(linkRun.text).toBe("Click here");
    expect(linkRun.link).toBe("https://example.com/path?q=1");
    // The " (url)" suffix must NOT appear — that was the old text-only behavior.
    const joined = runs.map((r) => r.text).join("");
    expect(joined).not.toContain("(https://example.com");
  });

  it("link runs do not merge with adjacent plain runs (different link value)", () => {
    const runs = parseInlineRuns("text <https://a.test> more");
    const linkRun = runs.find((r) => r.link);
    expect(linkRun).toBeDefined();
    // The "text " and " more" parts must be separate runs from the link run.
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.some((r) => !r.link && /text/.test(r.text))).toBe(true);
  });

  it("sebi.gov.in autolink from DISCLAIMER.md §2 renders as single link run", () => {
    // Verbatim line from DISCLAIMER.md:
    const line = "<https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13>";
    const runs = parseInlineRuns(line);
    expect(runs).toHaveLength(1);
    expect(runs[0].link).toBe("https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13");
    expect(runs[0].text).toBe("https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13");
  });
});
