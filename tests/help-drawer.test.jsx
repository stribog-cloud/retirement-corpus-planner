/**
 * help-drawer.test.jsx
 *
 * R4.9.5f (fin-eia) — Help System Expansion structural verification.
 *
 * Verifies the shape, count, category assignments, and cross-link integrity of
 * the HelpDrawer.topics object after the R4.9.5f expansion (22 existing + 47
 * new = 69) plus the fin-8fb F2/F3 pass (+2: withdrawalRules, plannedGoals)
 * and the fin-8fb.8 F4 UI pass 2 (+1: historicalBacktest = 72 total). The
 * topics object is factored into a module-level `buildHelpTopics(activeTaxLaw)`
 * factory so the suite can verify it without mounting React.
 *
 * Assertions:
 *   1. Total topic count is 72 (22 existing + 47 R4.9.5f + 2 fin-8fb F2/F3 + 1 fin-8fb.8 F4).
 *   2. Every expected key from the R4.9.5f manifest is present; no extras.
 *   3. Every topic has a non-empty title and summary.
 *   4. Every topic has a category in the canonical 5-category set.
 *   5. No duplicate keys (vacuous because Object.keys() but explicit).
 *   6. Every `related` cross-reference resolves to an existing topic key.
 *
 * Persona: Eco  |  Phase: R4.9.5f  |  Parent: fin-eia under fin-c96
 */

import { describe, expect, it } from "vitest";
import { buildHelpTopics, DEFAULT_TAX_LAW } from "../src/main.jsx";

// ── Expected manifest (authoritative per owner reconciliation 2026-05-21) ───────

const EXISTING_KEYS = [
  "tutorial",
  "coach",
  "whyChanged",
  "privacy",
  "trustCenter",
  "core",
  "india",
  "household",
  "scenarioLibrary",
  "tax",
  "taxLawUpdates",
  "taxScenarios",
  "retirement",
  "fifo",
  "risk",
  "sensitivity",
  "glossary",
  "hindiGlossary",
  "goals",
  "optimizer",
  "policy",
  "reviewPack"
];

const TIER_1_KEYS = [
  "planEndurance",
  "targetConfidence",
  "incomeCover",
  "closingTheGap",
  "scenarioDepletion",
  "monteCarloUncertainty",
  "displayRule"
];

const TIER_2_KEYS = [
  "decisionWorkspace",
  "canThisPlanWork",
  "cashFlowTile",
  "corpusFloor",
  "marketMargin",
  "strategyShortlist",
  "taxPath",
  "riskGuardrail",
  "realityCheck",
  "watchCards",
  "planDiagnosis",
  "projectionStatement",
  "smartInsights",
  "gapSolver",
  "effectiveYield",
  "taxDrag",
  "paybackRatio",
  "portfolioJourney",
  "finalMix",
  "monthlyCashSolver",
  "planFingerprint",
  "canvasControl"
];

const TIER_3_KEYS = [
  "understandingMC",
  "realVsNominal",
  "sequenceOfReturns",
  "defensiveCover",
  "gapFramings",
  "swpVsInterestVsIdcw",
  "inflationModel",
  "withdrawalRate",
  "section87aRebate",
  "section74CarryForward",
  "section115bacNewRegime",
  "surchargeMarginalRelief",
  "fa2025Scope",
  "whenToConsult",
  "planEnduranceVsTargetConfidence",
  "pdfExport",
  "csvExport"
];

const MOBILE_GUIDE_KEY = "mobileGuide";

// fin-8fb F2/F3 UI pass (2026-07): withdrawal-rule and planned-goals help
// topics, added after the R4.9.5f manifest was frozen.
const FIN_8FB_KEYS = [
  "withdrawalRules",
  "plannedGoals"
];

// fin-8fb.8 F4 UI pass 2 (2026-07): Historical Backtest Lab help topic, added
// after the FIN_8FB_KEYS manifest above was itself frozen.
const FIN_8FB_F4_KEYS = [
  "historicalBacktest"
];

const ALL_EXPECTED_KEYS = [
  ...EXISTING_KEYS,
  ...TIER_1_KEYS,
  ...TIER_2_KEYS,
  ...TIER_3_KEYS,
  MOBILE_GUIDE_KEY,
  ...FIN_8FB_KEYS,
  ...FIN_8FB_F4_KEYS
];

const CANONICAL_CATEGORIES = new Set([
  "getting-started",
  "metrics",
  "concepts",
  "tax",
  "trust"
]);

// ── Suite ───────────────────────────────────────────────────────────────────────

describe("HelpDrawer topics — R4.9.5f shape and category invariants", () => {
  const topics = buildHelpTopics(DEFAULT_TAX_LAW);
  const topicKeys = Object.keys(topics);

  it("contains exactly 72 topics (22 existing + 47 R4.9.5f + 2 fin-8fb F2/F3 + 1 fin-8fb.8 F4)", () => {
    expect(topicKeys.length).toBe(72);
    expect(EXISTING_KEYS.length).toBe(22);
    expect(TIER_1_KEYS.length).toBe(7);
    expect(TIER_2_KEYS.length).toBe(22);
    expect(TIER_3_KEYS.length).toBe(17);
    expect(FIN_8FB_KEYS.length).toBe(2);
    expect(FIN_8FB_F4_KEYS.length).toBe(1);
    // 7 + 22 + 17 + 1 (mobileGuide) = 47 R4.9.5f topics
    expect(TIER_1_KEYS.length + TIER_2_KEYS.length + TIER_3_KEYS.length + 1).toBe(47);
    expect(ALL_EXPECTED_KEYS.length).toBe(72);
  });

  it("contains every expected key and no extras", () => {
    const expectedSet = new Set(ALL_EXPECTED_KEYS);
    const actualSet = new Set(topicKeys);

    const missing = ALL_EXPECTED_KEYS.filter((key) => !actualSet.has(key));
    const extras = topicKeys.filter((key) => !expectedSet.has(key));

    expect(missing).toEqual([]);
    expect(extras).toEqual([]);
  });

  it("has no duplicate keys (Object.keys() is unique by definition; sanity check)", () => {
    const uniqueKeys = new Set(topicKeys);
    expect(uniqueKeys.size).toBe(topicKeys.length);
  });

  it("every topic has a non-empty title (string, > 0 length after trim)", () => {
    for (const key of topicKeys) {
      const topic = topics[key];
      expect(topic.title, `topic "${key}" must have a title`).toBeTruthy();
      expect(typeof topic.title, `topic "${key}" title must be a string`).toBe("string");
      expect(topic.title.trim().length, `topic "${key}" title must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("every topic has a non-empty summary (string, > 0 length after trim)", () => {
    for (const key of topicKeys) {
      const topic = topics[key];
      expect(topic.summary, `topic "${key}" must have a summary`).toBeTruthy();
      expect(typeof topic.summary, `topic "${key}" summary must be a string`).toBe("string");
      expect(topic.summary.trim().length, `topic "${key}" summary must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("every topic has a category in the canonical 5-category set", () => {
    for (const key of topicKeys) {
      const topic = topics[key];
      expect(topic.category, `topic "${key}" must have a category`).toBeTruthy();
      expect(
        CANONICAL_CATEGORIES.has(topic.category),
        `topic "${key}" category "${topic.category}" must be one of ${[...CANONICAL_CATEGORIES].join(", ")}`
      ).toBe(true);
    }
  });

  it("every `related` cross-reference resolves to an existing topic key (no dangling refs)", () => {
    const topicKeySet = new Set(topicKeys);
    for (const key of topicKeys) {
      const topic = topics[key];
      if (!topic.related) continue;
      expect(Array.isArray(topic.related), `topic "${key}" related must be an array if present`).toBe(true);
      for (const ref of topic.related) {
        expect(
          topicKeySet.has(ref),
          `topic "${key}" has dangling related ref "${ref}"`
        ).toBe(true);
        // Self-reference is allowed but unusual; flag for review without failing.
        // (No assertion against self-ref — keeping it permissive.)
      }
    }
  });

  it("every topic with `steps` has a non-empty array of strings", () => {
    for (const key of topicKeys) {
      const topic = topics[key];
      if (!topic.steps) continue;
      expect(Array.isArray(topic.steps), `topic "${key}" steps must be an array if present`).toBe(true);
      expect(topic.steps.length, `topic "${key}" steps must be non-empty if present`).toBeGreaterThan(0);
      for (let i = 0; i < topic.steps.length; i++) {
        const step = topic.steps[i];
        expect(typeof step, `topic "${key}" step[${i}] must be a string`).toBe("string");
        expect(step.trim().length, `topic "${key}" step[${i}] must be non-empty`).toBeGreaterThan(0);
      }
    }
  });

  it("every topic with `sections` has well-formed section items", () => {
    for (const key of topicKeys) {
      const topic = topics[key];
      if (!topic.sections) continue;
      expect(Array.isArray(topic.sections), `topic "${key}" sections must be an array if present`).toBe(true);
      for (let s = 0; s < topic.sections.length; s++) {
        const section = topic.sections[s];
        expect(section.title, `topic "${key}" section[${s}] must have a title`).toBeTruthy();
        expect(Array.isArray(section.items), `topic "${key}" section[${s}] items must be an array`).toBe(true);
        expect(section.items.length, `topic "${key}" section[${s}] items must be non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

// ── Category distribution sanity check (informational, not gating) ──────────────

describe("HelpDrawer topics — category distribution (sanity)", () => {
  const topics = buildHelpTopics(DEFAULT_TAX_LAW);
  const topicKeys = Object.keys(topics);
  const byCategory = {};
  for (const key of topicKeys) {
    const cat = topics[key].category;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  it("at least one topic exists in every canonical category", () => {
    for (const cat of CANONICAL_CATEGORIES) {
      expect(byCategory[cat] || 0, `category "${cat}" must have at least one topic`).toBeGreaterThan(0);
    }
  });

  it("category counts sum to 72 (no topic loses or doubles its category)", () => {
    const total = Object.values(byCategory).reduce((acc, n) => acc + n, 0);
    expect(total).toBe(72);
  });
});
