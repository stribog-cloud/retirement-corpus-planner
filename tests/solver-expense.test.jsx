/**
 * tests/solver-expense.test.jsx
 *
 * fin-1j8 — Q29 return solver: expense_ratio must be passed through to projection.
 *
 * Spec (audit/round-3/02-spec.md Q29):
 *   Required return solver returns the GROSS annual return needed to achieve
 *   coverage. With expense_ratio=E, gross_required = net_required + E.
 *
 * Reference: if expense=0 requires r=1.265%, then expense=0.5% requires r=1.765%
 * (difference = full expense ratio). This verifies expense is properly accounted.
 *
 * Authority: audit/round-3/02-spec.md Q29.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  solveReturnForMonthlyCash
} from "../src/model.js";

function makeParams(expenseRatio, patch = {}) {
  return projectionParamsFromState(normalizeState({
    ...BASE,
    years: 25,
    inflation: 6,
    incomeMode: "interest",
    cashMode: "monthlyTarget",
    monthlyTarget: 50000,
    useAssetReturns: 0,
    annualRate: 8,
    expenseRatio,
    taxRate: 0,
    section87A: 0,
    inflateWithdrawals: 1,
    annualContribution: 0,
    shockYear: 0,
    shockDrop: 0,
    ...patch
  }));
}

describe("fin-1j8 — Q29 return solver expense_ratio pass-through", () => {
  it("Required return increases by expense_ratio when expense_ratio increases", () => {
    // With expense=0: solver finds minimum gross return for coverage
    const r0 = solveReturnForMonthlyCash(makeParams(0));
    // With expense=0.5%: solver must return r0 + 0.005 (gross) to achieve same net
    const r05 = solveReturnForMonthlyCash(makeParams(0.5));

    expect(r0).not.toBeNull();
    expect(r05).not.toBeNull();
    expect(r0).toBeGreaterThan(0);
    expect(r05).toBeGreaterThan(r0);

    // Difference should be ≈ 0.005 (0.5% expense)
    const diff = r05 - r0;
    expect(Math.abs(diff - 0.005)).toBeLessThan(0.001);
  });

  it("Required return with 1% expense is ~1% higher than with 0% expense", () => {
    const r0 = solveReturnForMonthlyCash(makeParams(0));
    const r10 = solveReturnForMonthlyCash(makeParams(1.0));

    expect(r10).toBeGreaterThan(r0);
    const diff = r10 - r0;
    // Difference should be ≈ 0.01 (1% expense)
    expect(Math.abs(diff - 0.01)).toBeLessThan(0.001);
  });

  it("Returned value is null when no feasible return exists", () => {
    // Very low max rate (0.40) but very aggressive target
    const params = makeParams(0, { monthlyTarget: 10000000, years: 100 });
    const r = solveReturnForMonthlyCash(params);
    expect(r).toBeNull();
  });

  it("Zero monthly target returns zero", () => {
    const params = makeParams(0, { monthlyTarget: 0 });
    const r = solveReturnForMonthlyCash(params);
    expect(r).toBe(0);
  });
});
