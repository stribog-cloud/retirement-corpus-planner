/**
 * tests/household-horizon.test.jsx
 *
 * fin-711 — Q53 effective horizon: household mode extends via 90-age formula.
 *
 * Spec (audit/round-3/02-spec.md Q53, Q62):
 *   longevityYears = max(0, 90 - min(retireeAge, spouseAge))   [joint-life last-survivor]
 *   T = max(state.years, longevityYears + contingencyYears)
 *
 * Reference values (Python decimal.Decimal precision 50 via household.py):
 *   retireeAge=38, spouseAge=27, horizon=24, contingency=5:
 *     joint_life_expectancy = max(52, 63) = 63
 *     T = max(24, 63+5) = 68
 *   retireeAge=60, spouseAge=58, horizon=30, contingency=5:
 *     joint_life_expectancy = max(30, 32) = 32
 *     T = max(30, 32+5) = 37
 *   Non-household mode: T = state.years = 24 (no extension)
 *
 * Authority: audit/round-3/02-spec.md Q53; BKM-11 Ch. 21 (age-90 longevity rule).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState
} from "../src/model.js";

// Reference values from household.py joint_life_expectancy + effective_horizon
const REF_YOUNG_COUPLE_HORIZON = 68;  // age=38, partner=27, user_years=24, contingency=5
const REF_SENIOR_COUPLE_HORIZON = 37; // age=60, partner=58, user_years=30, contingency=5

function makeHouseholdState(patch = {}) {
  return normalizeState({
    ...BASE,
    useHouseholdPlan: 1,
    contingencyYears: 5,
    ...patch
  });
}

describe("fin-711 — Q53 household effective horizon via 90-age formula", () => {
  it("Young couple: horizon extended to max(user_years, 90-min_age + contingency)", () => {
    // age=38, partner=27 → longevity = max(52,63) = 63 → T = max(24, 68) = 68
    const state = makeHouseholdState({
      retireeAge: 38,
      spouseAge: 27,
      years: 24,
      contingencyYears: 5
    });
    const projection = projectionParamsFromState(state);
    expect(projection.years).toBe(REF_YOUNG_COUPLE_HORIZON);
  });

  it("Senior couple: horizon extended to max(user_years, longevity + contingency)", () => {
    // age=60, partner=58 → longevity = max(30,32) = 32 → T = max(30, 37) = 37
    const state = makeHouseholdState({
      retireeAge: 60,
      spouseAge: 58,
      years: 30,
      contingencyYears: 5
    });
    const projection = projectionParamsFromState(state);
    expect(projection.years).toBe(REF_SENIOR_COUPLE_HORIZON);
  });

  it("User horizon binding: when user_years > longevity + contingency, user wins", () => {
    // age=60, partner=58 → longevity=32, contingency=5 → 32+5=37 but user=40
    const state = makeHouseholdState({
      retireeAge: 60,
      spouseAge: 58,
      years: 40,
      contingencyYears: 5
    });
    const projection = projectionParamsFromState(state);
    expect(projection.years).toBe(40);  // user_years is binding
  });

  it("Non-household mode: effective horizon = user_years (no extension)", () => {
    // useHouseholdPlan=0 → no age-based extension
    const state = normalizeState({
      ...BASE,
      useHouseholdPlan: 0,
      retireeAge: 38,
      spouseAge: 27,
      years: 24,
      contingencyYears: 5
    });
    const projection = projectionParamsFromState(state);
    expect(projection.years).toBe(24);
  });

  it("Older couple: age-derived longevity < user default; user-default wins", () => {
    // retireeAge=70, spouseAge=65 → age-derived = max(20,25) = 25
    // BASE longevityYears=30 > 25 → effective longevity = max(30,25) = 30
    // T = max(20, 30+5) = 35
    const state = makeHouseholdState({
      retireeAge: 70,
      spouseAge: 65,
      years: 20,
      contingencyYears: 5
    });
    // age-derived (25) < BASE longevityYears (30) → user default wins → T = 35
    const projection = projectionParamsFromState(state);
    expect(projection.years).toBe(35);
  });
});
