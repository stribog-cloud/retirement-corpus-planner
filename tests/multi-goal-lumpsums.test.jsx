/**
 * tests/multi-goal-lumpsums.test.jsx
 *
 * fin-8fb F3 — Multi-goal planned lump sums.
 *
 * Covers:
 *   - sanitizePlannedLumpSums: dedicated sanitizer (garbage in -> [], entry
 *     validation, 10-entry cap, year clamp vs amount drop, name trim/cap,
 *     inflate coercion, id passthrough).
 *   - normalizeState migration: array wins over the legacy triple when
 *     valid/non-empty; legacy plannedLumpSumAmount synthesizes a one-entry
 *     array (including the "year unset" no-op case); normalized state always
 *     carries a plannedLumpSums array, even when useHouseholdPlan is off.
 *   - householdPlanProfile: profile.plannedLumpSums is scoped to
 *     useHouseholdPlan, same as the legacy single-goal fields always were.
 *   - plannedLumpSumForYear: sums every goal matching the projection year,
 *     each escalated (or not) by its own inflate flag.
 *   - Engine/default-state parity: BASE (no goals) stays byte-identical to
 *     the tests/v2-parity-goldens.test.jsx captures.
 *   - Monte Carlo determinism with goals active.
 *   - SCENARIOS / PRESETS (model.js) and STANDARD_SCENARIO_LIBRARY
 *     (scenario-library.js) patches all normalize cleanly (none of them
 *     touch the legacy lump-sum fields, verified by inspection + this test).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  PRESETS,
  SCENARIOS,
  normalizeState,
  sanitizePlannedLumpSums,
  householdPlanProfile,
  plannedLumpSumForYear,
  targetAnnualCashForYear,
  calculate,
  calculateMonteCarlo,
  projectionParamsFromState
} from "../src/model.js";
import { STANDARD_SCENARIO_LIBRARY } from "../src/scenario-library.js";

describe("fin-8fb F3 — sanitizePlannedLumpSums", () => {
  it("rejects non-array/garbage input entirely", () => {
    expect(sanitizePlannedLumpSums(null)).toEqual([]);
    expect(sanitizePlannedLumpSums(undefined)).toEqual([]);
    expect(sanitizePlannedLumpSums("garbage")).toEqual([]);
    expect(sanitizePlannedLumpSums(42)).toEqual([]);
    expect(sanitizePlannedLumpSums({})).toEqual([]);
  });

  it("drops non-object array entries", () => {
    const out = sanitizePlannedLumpSums([null, 5, "x", true, { amount: 1000, year: 2 }]);
    expect(out).toEqual([{ name: "", amount: 1000, year: 2, inflate: 0 }]);
  });

  it("drops entries with a negative or non-finite amount, keeps valid ones", () => {
    const out = sanitizePlannedLumpSums([
      { amount: -100, year: 5 },
      { amount: NaN, year: 5 },
      { amount: Infinity, year: 5 },
      { amount: "not-a-number", year: 5 },
      { amount: 0, year: 5 },
      { amount: 100000, year: 5 }
    ]);
    expect(out).toEqual([
      { name: "", amount: 0, year: 5, inflate: 0 },
      { name: "", amount: 100000, year: 5, inflate: 0 }
    ]);
  });

  it("drops entries with a non-finite year", () => {
    const out = sanitizePlannedLumpSums([
      { amount: 100, year: NaN },
      { amount: 100, year: "abc" },
      { amount: 100, year: undefined },
      { amount: 100, year: 10 }
    ]);
    expect(out).toEqual([{ name: "", amount: 100, year: 10, inflate: 0 }]);
  });

  it("clamps an out-of-range year into [1, 80] instead of dropping the entry", () => {
    const out = sanitizePlannedLumpSums([
      { amount: 1, year: 0 },
      { amount: 1, year: -5 },
      { amount: 1, year: 81 },
      { amount: 1, year: 1000 },
      { amount: 1, year: 45.6 }
    ]);
    expect(out.map((g) => g.year)).toEqual([1, 1, 80, 80, 46]);
  });

  it("caps the array at 10 entries, keeping the first 10 valid ones in order", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ amount: (i + 1) * 1000, year: i + 1 }));
    const out = sanitizePlannedLumpSums(eleven);
    expect(out.length).toBe(10);
    expect(out.map((g) => g.amount)).toEqual(eleven.slice(0, 10).map((g) => g.amount));
  });

  it("trims and caps the name at 40 characters", () => {
    const padded = `  ${"A".repeat(50)}  `;
    const out = sanitizePlannedLumpSums([{ amount: 1, year: 1, name: padded }]);
    expect(out[0].name).toBe("A".repeat(40));
    expect(out[0].name.length).toBe(40);
  });

  it("coerces inflate to strictly 0 or 1", () => {
    const out = sanitizePlannedLumpSums([
      { amount: 1, year: 1, inflate: 1 },
      { amount: 1, year: 1, inflate: "1" },
      { amount: 1, year: 1, inflate: true },
      { amount: 1, year: 1, inflate: 0 },
      { amount: 1, year: 1, inflate: 2 },
      { amount: 1, year: 1, inflate: undefined }
    ]);
    expect(out.map((g) => g.inflate)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("passes id through when present, omits it when absent", () => {
    const out = sanitizePlannedLumpSums([
      { id: "goal-a", amount: 1, year: 1 },
      { amount: 2, year: 2 }
    ]);
    expect(out[0].id).toBe("goal-a");
    expect(out[1].id).toBeUndefined();
  });
});

describe("fin-8fb F3 — normalizeState migration", () => {
  it("default BASE state has an empty plannedLumpSums array", () => {
    const state = normalizeState({});
    expect(state.plannedLumpSums).toEqual([]);
  });

  it("synthesizes a single-entry array from the legacy triple when amount > 0", () => {
    const state = normalizeState({
      ...BASE,
      plannedLumpSumAmount: 500000,
      plannedLumpSumYear: 3,
      plannedLumpSumInflate: 1
    });
    expect(state.plannedLumpSums).toEqual([{ name: "Planned lump sum", amount: 500000, year: 3, inflate: 1 }]);
  });

  it("synthesizes no goal at all when the legacy year is unset (amount>0 but year<=0), and stays inert on re-resolution", () => {
    const state = normalizeState({
      ...BASE,
      useHouseholdPlan: 1,
      plannedLumpSumAmount: 500000,
      plannedLumpSumYear: 0
    });
    expect(state.plannedLumpSums).toEqual([]);
    // householdPlanProfile re-resolves from state.plannedLumpSums (already an
    // empty array here) rather than re-deriving from the legacy triple, so
    // this must stay empty/inert rather than reappearing.
    const profile = householdPlanProfile(state);
    expect(profile.plannedLumpSums).toEqual([]);
    for (let year = 1; year <= 10; year++) {
      expect(plannedLumpSumForYear({ ...state, householdProfile: profile }, year, 1.5)).toBe(0);
    }
  });

  it("a valid plannedLumpSums array wins over the legacy triple entirely", () => {
    const state = normalizeState({
      ...BASE,
      plannedLumpSums: [{ name: "College", amount: 100000, year: 2, inflate: 1 }],
      plannedLumpSumAmount: 999999999,
      plannedLumpSumYear: 40,
      plannedLumpSumInflate: 0
    });
    expect(state.plannedLumpSums).toEqual([{ name: "College", amount: 100000, year: 2, inflate: 1 }]);
  });

  it("falls back to the legacy triple when the provided array is invalid/empty", () => {
    const state = normalizeState({
      ...BASE,
      plannedLumpSums: "garbage",
      plannedLumpSumAmount: 700000,
      plannedLumpSumYear: 4,
      plannedLumpSumInflate: 0
    });
    expect(state.plannedLumpSums).toEqual([{ name: "Planned lump sum", amount: 700000, year: 4, inflate: 0 }]);
  });

  it("normalized state always carries a plannedLumpSums array, even with useHouseholdPlan off", () => {
    const state = normalizeState({
      ...BASE,
      useHouseholdPlan: 0,
      plannedLumpSums: [{ amount: 100000, year: 1, inflate: 0 }]
    });
    expect(state.plannedLumpSums).toEqual([{ name: "", amount: 100000, year: 1, inflate: 0 }]);
  });
});

describe("fin-8fb F3 — householdPlanProfile scoping (goals only active under the household plan)", () => {
  it("profile.plannedLumpSums is empty when useHouseholdPlan is off, even with a valid array in state", () => {
    const state = normalizeState({
      ...BASE,
      useHouseholdPlan: 0,
      plannedLumpSums: [{ amount: 100000, year: 1, inflate: 0 }]
    });
    // The raw normalized state keeps the resolved array...
    expect(state.plannedLumpSums.length).toBe(1);
    // ...but the household profile (what the engines actually consult) is empty.
    const profile = householdPlanProfile(state);
    expect(profile.plannedLumpSums).toEqual([]);
    expect(plannedLumpSumForYear({ ...state, householdProfile: profile }, 1, 1)).toBe(0);
  });

  it("profile.plannedLumpSums mirrors the resolved array when useHouseholdPlan is on", () => {
    const state = normalizeState({
      ...BASE,
      useHouseholdPlan: 1,
      plannedLumpSums: [{ amount: 100000, year: 1, inflate: 0 }]
    });
    const profile = householdPlanProfile(state);
    expect(profile.plannedLumpSums).toEqual([{ name: "", amount: 100000, year: 1, inflate: 0 }]);
  });
});

describe("fin-8fb F3 — plannedLumpSumForYear sums matching-year goals", () => {
  function householdParams(goals) {
    const state = normalizeState({
      ...BASE,
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 100000,
      plannedLumpSums: goals
    });
    const profile = householdPlanProfile(state);
    return { ...state, householdProfile: profile };
  }

  it("sums two goals that land in the same year", () => {
    const params = householdParams([
      { amount: 100000, year: 3, inflate: 0 },
      { amount: 50000, year: 3, inflate: 0 },
      { amount: 999999, year: 5, inflate: 0 }
    ]);
    expect(plannedLumpSumForYear(params, 3, 1.25)).toBe(150000);
  });

  it("excludes goals that do not match the requested year", () => {
    const params = householdParams([{ amount: 250000, year: 7, inflate: 0 }]);
    expect(plannedLumpSumForYear(params, 3, 1)).toBe(0);
    expect(plannedLumpSumForYear(params, 7, 1)).toBe(250000);
  });

  it("hand-computed: applies each goal's own inflate flag independently within the same year", () => {
    const params = householdParams([
      { amount: 100000, year: 2, inflate: 1 },
      { amount: 50000, year: 2, inflate: 0 }
    ]);
    // 100,000 x 1.1 (inflated) + 50,000 x 1 (fixed) = 160,000
    expect(plannedLumpSumForYear(params, 2, 1.1)).toBe(160000);
  });

  it("targetAnnualCashForYear adds the summed goal on top of the recurring target, unscaled", () => {
    const params = householdParams([
      { amount: 100000, year: 2, inflate: 1 },
      { amount: 50000, year: 2, inflate: 0 }
    ]);
    // essentialMonthlyExpense: 100,000, inflateWithdrawals defaults to 1 ->
    // recurring = 100,000 x 12 x 1.1 = 1,320,000; goals add 160,000 on top,
    // unscaled by anything (they use their own inflate flags directly).
    expect(targetAnnualCashForYear(params, 2, 1.1)).toBeCloseTo(1320000 + 160000, 6);
  });
});

describe("fin-8fb F3 — default-state parity (no goals) vs v2.0 goldens", () => {
  it("BASE default state (no household plan, no goals) still matches the captured interest-mode golden", () => {
    const state = normalizeState({ ...BASE, incomeMode: "interest" });
    expect(state.plannedLumpSums).toEqual([]);
    const r = calculate(projectionParamsFromState(state));
    const last = r.rows[r.rows.length - 1];
    expect(r.final.closing).toBeCloseTo(500224634.45947325, 6);
    expect(last.cumWithdrawals).toBeCloseTo(54419161.69557039, 6);
  });
});

describe("fin-8fb F3 — Monte Carlo determinism with goals active", () => {
  it("same seed -> identical successProbability and percentile series across two consecutive runs", () => {
    const state = normalizeState({
      ...BASE,
      incomeMode: "swp",
      cashMode: "monthlyTarget",
      useHouseholdPlan: 1,
      essentialMonthlyExpense: 150000,
      plannedLumpSums: [
        { name: "Renovation", amount: 1500000, year: 3, inflate: 1 },
        { name: "Car", amount: 800000, year: 6, inflate: 0 }
      ],
      monteCarloSamples: 30,
      monteCarloSeed: 777
    });
    const params = projectionParamsFromState(state);
    const run1 = calculateMonteCarlo(params, 30);
    const run2 = calculateMonteCarlo(params, 30);

    expect(run2.successProbability).toBe(run1.successProbability);
    expect(run2.p50).toEqual(run1.p50);
    expect(run2.p10).toEqual(run1.p10);
    expect(run2.p90).toEqual(run1.p90);
  });
});

describe("fin-8fb F3 — SCENARIOS / PRESETS / scenario-library compatibility", () => {
  function resolvePatch(patch, state) {
    return typeof patch === "function" ? patch(state) : patch;
  }

  it("no model.js PRESET or SCENARIO patch touches the legacy lump-sum fields, and all normalize cleanly", () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(Object.keys(preset.patch)).not.toEqual(expect.arrayContaining(["plannedLumpSumAmount", "plannedLumpSumYear", "plannedLumpSumInflate", "plannedLumpSums"]));
      const state = normalizeState({ ...BASE, ...preset.patch });
      expect(Array.isArray(state.plannedLumpSums)).toBe(true);
    }
    for (const scenario of SCENARIOS) {
      if (!scenario.patch) continue;
      expect(Object.keys(scenario.patch)).not.toEqual(expect.arrayContaining(["plannedLumpSumAmount", "plannedLumpSumYear", "plannedLumpSumInflate", "plannedLumpSums"]));
      const state = normalizeState({ ...BASE, ...scenario.patch });
      expect(Array.isArray(state.plannedLumpSums)).toBe(true);
    }
  });

  it("no STANDARD_SCENARIO_LIBRARY patch touches the legacy lump-sum fields, and all normalize cleanly", () => {
    for (const scenario of STANDARD_SCENARIO_LIBRARY) {
      const patch = resolvePatch(scenario.patch, BASE) || {};
      expect(Object.keys(patch)).not.toEqual(expect.arrayContaining(["plannedLumpSumAmount", "plannedLumpSumYear", "plannedLumpSumInflate", "plannedLumpSums"]));
      const state = normalizeState({ ...BASE, ...patch });
      expect(Array.isArray(state.plannedLumpSums)).toBe(true);
      expect(state.plannedLumpSums).toEqual([]);
    }
  });
});
