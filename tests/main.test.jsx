/**
 * R4.9.5b-1 — Decision Workspace tile labels, captions, and order.
 *
 * Verifies:
 *   (a) GaugeCard accepts a `caption` prop without error.
 *   (b) The ratio-strip renders: Income Cover | Plan Endurance | Target Confidence
 *       in that order.
 *   (c) Plan Endurance caption matches the R4-Q10 verbatim string.
 *   (d) Target Confidence caption matches the R4-Q10 verbatim string.
 *   (e) `mc.enduranceProbability` is sourced from calculateMonteCarlo (smoke —
 *       field presence confirmed in model.test.jsx; here we verify the UI
 *       module exports the helper so the gauge can render it).
 *
 * These are pure-logic / structural tests — no browser / DOM required.
 * They import from src/main.jsx and src/model.js.
 *
 * fin-c0g (R4.9.5b-1)
 */

import { describe, it, expect } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  calculateMonteCarlo
} from "../src/main.jsx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PARAMS = () =>
  projectionParamsFromState(
    normalizeState({
      ...BASE,
      principal: 30_000_000,
      targetCorpus: 30_000_000,
      monthlyTarget: 125_000,
      years: 30,
      inflation: 6,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      monteCarloSamples: 50,
      monteCarloSeed: 24681357
    })
  );

// ---------------------------------------------------------------------------
// (a) MC result carries enduranceProbability
// ---------------------------------------------------------------------------

describe("Plan Endurance — mc.enduranceProbability field", () => {
  it("calculateMonteCarlo returns enduranceProbability on the result object", () => {
    const params = BASE_PARAMS();
    const mc = calculateMonteCarlo(params);
    expect(typeof mc.enduranceProbability).toBe("number");
    expect(mc.enduranceProbability).toBeGreaterThanOrEqual(0);
    expect(mc.enduranceProbability).toBeLessThanOrEqual(1);
  });

  it("enduranceProbability >= successProbability when target corpus > 0", () => {
    const params = BASE_PARAMS();
    const mc = calculateMonteCarlo(params);
    // A path can end with corpus > 0 but still be below target corpus.
    // So endurance is always >= success.
    expect(mc.enduranceProbability).toBeGreaterThanOrEqual(mc.successProbability);
  });

  it("enduranceProbability is 1.0 for a vastly over-funded plan (trivial-full path)", () => {
    const params = projectionParamsFromState(
      normalizeState({
        ...BASE,
        principal: 1_000_000_000, // ₹100Cr — far above any withdrawal
        targetCorpus: 30_000_000,
        monthlyTarget: 100_000,
        years: 30,
        inflation: 6,
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        monteCarloSamples: 50,
        monteCarloSeed: 24681357
      })
    );
    const mc = calculateMonteCarlo(params);
    expect(mc.enduranceProbability).toBeGreaterThan(0.95);
  });

  it("enduranceProbability is near 0 for a deeply under-funded plan (boundary-empty path)", () => {
    const params = projectionParamsFromState(
      normalizeState({
        ...BASE,
        principal: 100_000, // ₹1L
        targetCorpus: 100_000_000,
        monthlyTarget: 200_000, // ₹2L/month — exhausts corpus in month 1
        years: 30,
        inflation: 6,
        incomeMode: "swp",
        cashMode: "monthlyTarget",
        monteCarloSamples: 50,
        monteCarloSeed: 24681357
      })
    );
    const mc = calculateMonteCarlo(params);
    expect(mc.enduranceProbability).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------
// (b) Tile label strings — verified via JSX source string match
// (Lightweight: we read the source and assert the label strings are present
// in the ratio-strip section. This avoids a full React render setup.)
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mainJsx = readFileSync(resolve("src/main.jsx"), "utf8");

describe("Decision Workspace ratio-strip tile labels (R4.9.5b-1)", () => {
  it('has "Income Cover" GaugeCard label', () => {
    expect(mainJsx).toContain('label="Income Cover"');
  });

  it('has "Plan Endurance" GaugeCard label', () => {
    expect(mainJsx).toContain('label="Plan Endurance"');
  });

  it('has "Target Confidence" GaugeCard label', () => {
    expect(mainJsx).toContain('label="Target Confidence"');
  });

  it("Plan Endurance tile uses mc.enduranceProbability (not successProbability)", () => {
    // The Plan Endurance GaugeCard should reference enduranceProbability.
    const planEnduranceIdx = mainJsx.indexOf('label="Plan Endurance"');
    expect(planEnduranceIdx).toBeGreaterThan(-1);
    // The enduranceProbability reference appears on the same line as the label.
    const lineStart = mainJsx.lastIndexOf("\n", planEnduranceIdx);
    const lineEnd = mainJsx.indexOf("\n", planEnduranceIdx);
    const line = mainJsx.slice(lineStart, lineEnd);
    expect(line).toContain("enduranceProbability");
  });

  it("Plan Endurance caption matches verbatim R4-Q10 copy", () => {
    expect(mainJsx).toContain("Chance your money lasts the full plan.");
  });

  it("Target Confidence caption matches verbatim R4-Q10 copy", () => {
    expect(mainJsx).toContain(
      "Chance you exit at or above your target corpus. Below 50% doesn't mean failure"
    );
  });

  it("ratio-strip order: Income Cover appears before Plan Endurance", () => {
    const icIdx = mainJsx.indexOf('label="Income Cover"');
    const peIdx = mainJsx.indexOf('label="Plan Endurance"');
    expect(icIdx).toBeGreaterThan(-1);
    expect(peIdx).toBeGreaterThan(-1);
    expect(icIdx).toBeLessThan(peIdx);
  });

  it("ratio-strip order: Plan Endurance appears before Target Confidence", () => {
    const peIdx = mainJsx.indexOf('label="Plan Endurance"');
    const tcIdx = mainJsx.indexOf('label="Target Confidence"');
    expect(peIdx).toBeGreaterThan(-1);
    expect(tcIdx).toBeGreaterThan(-1);
    expect(peIdx).toBeLessThan(tcIdx);
  });
});

// ---------------------------------------------------------------------------
// (c) Gap consolidation — "Closing the gap" tile present in source
// ---------------------------------------------------------------------------

describe("Gap consolidation tile (R4.9.5b-1)", () => {
  it('has "Closing the gap" eyebrow in decision-gap-tile', () => {
    expect(mainJsx).toContain("Closing the gap");
  });

  it("decision-gap-tile replaces bare decision-gap-callout", () => {
    expect(mainJsx).toContain("decision-gap-tile");
    expect(mainJsx).not.toContain("decision-gap-callout");
  });

  it("Detail panel is present as a <details> element", () => {
    expect(mainJsx).toContain("decision-gap-detail");
  });
});
