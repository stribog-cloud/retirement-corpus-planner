import { describe, expect, it } from "vitest";
import {
  BASE,
  calculate,
  calculateMonteCarlo,
  formatInr,
  generateOptimumStrategies,
  normalizeState,
  projectionParamsFromState
} from "../src/model.js";

describe("retirement domain model contract", () => {
  it("imports without mounting React and produces the core planning outputs", () => {
    expect(typeof calculate).toBe("function");
    const state = normalizeState({ ...BASE, principal: 17500000, monthlyTarget: 75000, incomeMode: "swp", cashMode: "monthlyTarget" });
    const model = calculate(projectionParamsFromState(state));
    const risk = calculateMonteCarlo(projectionParamsFromState(state), 40);
    const strategies = generateOptimumStrategies(state);

    expect(model.rows.length).toBeGreaterThan(1);
    expect(Number.isFinite(model.final.closing)).toBe(true);
    expect(risk.p50.length).toBe(model.rows.length);
    expect(strategies.best).toBeTruthy();
    expect(formatInr(model.final.closing)).toMatch(/^(₹|-₹|N\/A)/);
  });
});
