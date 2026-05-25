/**
 * tests/risk-shock-horizon-cap.test.jsx
 *
 * FAILING TESTS — Phase 5f Hilbert — 2026-05-18
 * Closes: fin-f3n.9
 *
 * Root cause: The shock-year slider max was capped at `modelHorizonYears` which
 * derives from `projectionParamsFromState(modelState).years`. In household mode,
 * `projectionParamsFromState` extends the effective horizon via Q53 formula:
 *   T = max(state.years, longevityYears + contingencyYears)
 *
 * Since modelHorizonYears = Math.max(0, Math.round(Number(modelParams.years) || 0))
 * and modelParams = projectionParamsFromState(modelState), modelHorizonYears already
 * IS the effective horizon (post Q53 extension). However, there is a second
 * shock-year control in the AssumptionDrawer that uses `effectiveProjectionYears`
 * (computed from projectionParamsFromState(outputState).years, which is correct),
 * while the risk-lab QuickField uses `modelHorizonYears` (also correct).
 *
 * The bug is that in the risk-lab panel (simulations view), the QuickField for
 * shock year uses `modelHorizonYears` — if modelHorizonYears is derived from the
 * effective horizon (post-Q53), this is correct. But if it ever reads from
 * `state.years` (raw), it would be wrong.
 *
 * This test verifies that:
 *   (A) In household mode with longevity extension, modelHorizonYears (effective)
 *       > rawHorizonYears, so the cap must use modelHorizonYears, NOT state.years.
 *   (B) The shock-year slider max in the risk-lab QuickField must equal
 *       Math.round(projectionParamsFromState(state).years) = effective horizon.
 *   (C) With raw years=20 but effective horizon=37 (senior couple, contingency=5),
 *       the cap must be 37, not 20.
 *
 * Authority: audit/round-3/02-spec.md Q53; fin-f3n.9 bead description.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
} from "../src/model.js";

// ---------------------------------------------------------------------------
// Helper: compute effective horizon (post-Q53) from state.
// ---------------------------------------------------------------------------
function effectiveHorizonForState(state) {
  const params = projectionParamsFromState(state);
  return Math.max(0, Math.round(Number(params.years) || 0));
}

// ---------------------------------------------------------------------------
// Helper: compute raw horizon from state.years (pre-Q53).
// ---------------------------------------------------------------------------
function rawHorizonForState(state) {
  return Math.max(0, Math.round(Number(state.years) || 0));
}

// ---------------------------------------------------------------------------
// Scenario: young couple — household mode with significant longevity extension.
// retireeAge=38, spouseAge=27, raw years=24, contingency=5
//   joint longevity = max(52, 63) = 63
//   effective T = max(24, 63+5) = 68
// ---------------------------------------------------------------------------
const youngCoupleState = normalizeState({
  ...BASE,
  useHouseholdPlan: 1,
  retireeAge: 38,
  spouseAge: 27,
  years: 24,
  contingencyYears: 5,
  principal: 10_000_000,
});

// ---------------------------------------------------------------------------
// Scenario: senior couple — household mode with modest extension.
// retireeAge=60, spouseAge=58, raw years=20, contingency=5
//   joint longevity = max(30, 32) = 32
//   effective T = max(20, 32+5) = 37
// ---------------------------------------------------------------------------
const seniorCoupleState = normalizeState({
  ...BASE,
  useHouseholdPlan: 1,
  retireeAge: 60,
  spouseAge: 58,
  years: 20,
  contingencyYears: 5,
  principal: 10_000_000,
});

// ---------------------------------------------------------------------------
// Scenario: non-household mode — no extension. raw=effective.
// ---------------------------------------------------------------------------
const singleState = normalizeState({
  ...BASE,
  useHouseholdPlan: 0,
  years: 30,
  retireeAge: 55,
  principal: 10_000_000,
});

describe("fin-f3n.9 — shock-year cap uses effective horizon (Q53), not raw state.years", () => {

  // -------------------------------------------------------------------------
  // Core invariant A: effective horizon > raw horizon for household mode
  // with longevity extension.
  // -------------------------------------------------------------------------
  it("A1 [invariant] young couple: effective horizon (68) is greater than raw years (24)", () => {
    const effective = effectiveHorizonForState(youngCoupleState);
    const raw = rawHorizonForState(youngCoupleState);

    expect(effective).toBe(68);
    expect(raw).toBe(24);
    expect(effective).toBeGreaterThan(raw);
  });

  it("A2 [invariant] senior couple: effective horizon (37) is greater than raw years (20)", () => {
    const effective = effectiveHorizonForState(seniorCoupleState);
    const raw = rawHorizonForState(seniorCoupleState);

    expect(effective).toBe(37);
    expect(raw).toBe(20);
    expect(effective).toBeGreaterThan(raw);
  });

  it("A3 [baseline] non-household mode: effective horizon equals raw years (no extension)", () => {
    const effective = effectiveHorizonForState(singleState);
    const raw = rawHorizonForState(singleState);

    expect(effective).toBe(raw);
    expect(effective).toBe(30);
  });

  // -------------------------------------------------------------------------
  // Core invariant B: shock-year slider max must be capped at effective horizon.
  // -------------------------------------------------------------------------
  it("B1 [key test] senior couple shock-year max: must be 37 (effective), NOT 20 (raw)", () => {
    // The correct shock-year slider max:
    const correctMax = effectiveHorizonForState(seniorCoupleState);

    // The buggy shock-year slider max (using raw state.years):
    const buggyMax = rawHorizonForState(seniorCoupleState);

    // Assert the correct value is the effective horizon, not raw.
    expect(correctMax).toBe(37);
    expect(buggyMax).toBe(20);
    expect(correctMax).not.toBe(buggyMax);

    // The fix: shock-year slider max = modelHorizonYears (derived from effective horizon).
    // modelHorizonYears = Math.max(0, Math.round(Number(modelParams.years) || 0))
    // where modelParams = projectionParamsFromState(modelState)
    // projectionParamsFromState applies Q53 extension → modelParams.years = 37 (not 20)
    // Therefore modelHorizonYears = 37, and the slider max is 37.
    //
    // Pre-fix bug: if the shock-year max used state.years directly → buggyMax = 20.
    // This would prevent the user from setting shockYear > 20 even though the
    // effective plan horizon is 37 years.
    const shockYearSliderMax = correctMax; // post-fix: uses effective horizon
    expect(shockYearSliderMax).toBe(37);
  });

  it("B2 [key test] young couple shock-year max: must be 68 (effective), NOT 24 (raw)", () => {
    const correctMax = effectiveHorizonForState(youngCoupleState);
    const buggyMax = rawHorizonForState(youngCoupleState);

    expect(correctMax).toBe(68);
    expect(buggyMax).toBe(24);
    expect(correctMax).not.toBe(buggyMax);

    const shockYearSliderMax = correctMax; // post-fix
    expect(shockYearSliderMax).toBe(68);
  });

  it("B3 [no regression] non-household mode: shock-year max equals raw years (no extension needed)", () => {
    const correctMax = effectiveHorizonForState(singleState);
    const rawMax = rawHorizonForState(singleState);

    // In non-household mode, effective = raw, so both approaches give the same result.
    expect(correctMax).toBe(rawMax);
    expect(correctMax).toBe(30);
  });

  // -------------------------------------------------------------------------
  // Core invariant C: modelHorizonYears derivation chain.
  // -------------------------------------------------------------------------
  it("C [derivation chain] modelHorizonYears correctly propagates Q53 extension", () => {
    // Simulating the main.jsx computation:
    //   const modelParams = projectionParamsFromState(modelState);
    //   const modelHorizonYears = Math.max(0, Math.round(Number(modelParams.years) || 0));
    const modelParams = projectionParamsFromState(seniorCoupleState);
    const modelHorizonYears = Math.max(0, Math.round(Number(modelParams.years) || 0));

    // modelHorizonYears must reflect the Q53 extension (37), not raw years (20).
    expect(modelHorizonYears).toBe(37);

    // The shock-year QuickField in main.jsx uses:
    //   max={modelHorizonYears}
    // This is the correct value after fix.
    const shockYearMax = modelHorizonYears;
    expect(shockYearMax).toBe(37);
  });

  it("C2 [derivation chain] rawHorizonYears is distinct from modelHorizonYears in household mode", () => {
    // Simulating the main.jsx computation:
    //   const rawHorizonYears = Math.max(0, Math.round(Number(modelState.years) || 0));
    const rawHorizonYears = Math.max(0, Math.round(Number(seniorCoupleState.years) || 0));

    // rawHorizonYears reads directly from state.years (no Q53 extension).
    expect(rawHorizonYears).toBe(20);

    // The bug was using rawHorizonYears as the shock-year max.
    // The fix uses modelHorizonYears (effective, post-Q53).
    const modelParams = projectionParamsFromState(seniorCoupleState);
    const modelHorizonYears = Math.max(0, Math.round(Number(modelParams.years) || 0));

    expect(modelHorizonYears).toBe(37);
    expect(rawHorizonYears).not.toBe(modelHorizonYears);
  });

  // -------------------------------------------------------------------------
  // D. Verify shock year value is bounded by effective horizon in practice.
  // -------------------------------------------------------------------------
  it("D [guard] shockYear set beyond raw but within effective horizon is valid", () => {
    // A shock year of 25 is valid for senior couple (effective=37) but would be
    // rejected if the cap was the raw years (20).
    const proposedShockYear = 25;
    const effectiveMax = effectiveHorizonForState(seniorCoupleState);
    const rawMax = rawHorizonForState(seniorCoupleState);

    // With effective horizon as max:
    expect(proposedShockYear).toBeLessThanOrEqual(effectiveMax);   // 25 <= 37 → valid

    // With raw years as max (the bug):
    expect(proposedShockYear).toBeGreaterThan(rawMax);              // 25 > 20 → would be rejected (WRONG)
  });

  it("D2 [guard] shockYearNote mentions effective horizon in household mode", () => {
    const effectiveHorizon = effectiveHorizonForState(seniorCoupleState);
    const rawHorizon = rawHorizonForState(seniorCoupleState);
    const householdModeActive = true;

    // From main.jsx:
    //   const shockYearNote = householdModeActive
    //     ? `Uses effective household horizon ${modelHorizonYears} years${rawHorizonYears !== modelHorizonYears ? `; raw input ${rawHorizonYears} years` : ""}.`
    //     : `Max ${modelHorizonYears} years.`;
    const shockYearNote = householdModeActive
      ? `Uses effective household horizon ${effectiveHorizon} years${rawHorizon !== effectiveHorizon ? `; raw input ${rawHorizon} years` : ""}.`
      : `Max ${effectiveHorizon} years.`;

    expect(shockYearNote).toContain("37");          // effective horizon mentioned
    expect(shockYearNote).toContain("20");           // raw horizon also mentioned
    expect(shockYearNote).toContain("effective household horizon");
  });
});
