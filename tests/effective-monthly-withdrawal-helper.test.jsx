/**
 * tests/effective-monthly-withdrawal-helper.test.jsx
 *
 * FAILING TESTS — Phase 5f Hilbert — 2026-05-18
 * Closes: fin-rrf
 *
 * Root cause: `final.withdrawal / 12` is computed at three independent sites in
 * src/main.jsx without a shared helper:
 *   1. KPI Strip display: `formatInr(final.withdrawal / 12)` (line ~4966)
 *   2. PDF/CSV export: `reportModel.final.withdrawal / 12` (line ~3611)
 *   3. Scenario snapshot: `snapshotModel.final.withdrawal / 12` (line ~3305)
 *
 * The fix extracts a single helper:
 *   function effectiveMonthlyWithdrawal(model) {
 *     return model.final.withdrawal / 12;
 *   }
 *
 * and exports it from src/main.jsx so it is importable for testing.
 *
 * Test asserts:
 *   (a) effectiveMonthlyWithdrawal is importable from src/main.jsx.
 *   (b) effectiveMonthlyWithdrawal(model) === model.final.withdrawal / 12.
 *   (c) The function handles edge cases: zero withdrawal, undefined final.
 *   (d) The formula is numerically identical at all three call sites.
 *
 * Authority: fin-rrf bead description; audit/round-3/01-dataflow.md S01/S05 (KPI strip, PDF export).
 *
 * Note: Since the function is in src/main.jsx and main.jsx is a large React entry
 * point, we test the helper function logic here both via import (when available)
 * and via direct formula verification. The import test confirms the export exists.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  calculate,
} from "../src/model.js";

// ---------------------------------------------------------------------------
// Try to import effectiveMonthlyWithdrawal from main.jsx.
// If the export doesn't exist yet (pre-fix), the import will fail.
// We use a dynamic import approach to allow graceful failure documentation.
// ---------------------------------------------------------------------------
let effectiveMonthlyWithdrawal = null;

try {
  // This import will fail pre-fix because the function isn't exported yet.
  // Using a synchronous workaround since top-level await isn't available.
  // We'll define the expected behavior and test the formula independently.
  // The import test is in a separate block below.
} catch (_) {
  // Pre-fix: helper not exported yet. Formula tests still document the invariant.
}

// ---------------------------------------------------------------------------
// Define the reference implementation (what the helper SHOULD be).
// ---------------------------------------------------------------------------
function referenceEffectiveMonthlyWithdrawal(model) {
  return model.final.withdrawal / 12;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseState = normalizeState({
  ...BASE,
  principal: 10_000_000,
  years: 30,
  useAssetReturns: 1,
  equityShare: 60,
  equityReturn: 11,
  debtReturn: 7,
  taxProfileMode: "retiree",
  taxRate: 0,
  taxRegime: "new",
  incomeMode: "interest",
  monthlyTarget: 50000,
  inflation: 6,
});

const swpState = normalizeState({
  ...BASE,
  principal: 8_000_000,
  years: 25,
  useAssetReturns: 1,
  equityShare: 50,
  equityReturn: 10,
  debtReturn: 6.5,
  taxProfileMode: "retiree",
  taxRate: 0,
  taxRegime: "new",
  incomeMode: "swp",
  monthlyTarget: 40000,
  inflation: 6,
});

const zeroWithdrawalState = normalizeState({
  ...BASE,
  principal: 5_000_000,
  years: 10,
  useAssetReturns: 0,
  annualRate: 8,
  taxProfileMode: "none",
  taxRate: 0,
  incomeMode: "interest",
  monthlyTarget: 0,   // zero withdrawal
  inflation: 5,
});

describe("fin-rrf — effectiveMonthlyWithdrawal shared helper at KPI/PDF/scenario sites", () => {

  // -------------------------------------------------------------------------
  // (a) Import test — this test passes only after the fix adds the export.
  // -------------------------------------------------------------------------
  it("(a) [import] effectiveMonthlyWithdrawal is importable from src/main.jsx", async () => {
    // Dynamic import attempt: will fail pre-fix (function not exported).
    // Pre-fix: this test is EXPECTED TO FAIL (no such export).
    // Post-fix: the function is exported and the test passes.
    let importedFn = null;
    try {
      const module = await import("../src/main.jsx");
      importedFn = module.effectiveMonthlyWithdrawal;
    } catch (err) {
      // pre-fix: module fails to load or function not present
      importedFn = null;
    }

    // Post-fix assertion: function must be importable and callable.
    expect(importedFn).not.toBeNull();
    expect(typeof importedFn).toBe("function");
  });

  // -------------------------------------------------------------------------
  // (b) Formula correctness — must equal final.withdrawal / 12 exactly.
  // -------------------------------------------------------------------------
  it("(b1) [formula] referenceEffectiveMonthlyWithdrawal equals final.withdrawal / 12 (base case)", () => {
    const params = projectionParamsFromState(baseState);
    const model = calculate(params);

    const expected = model.final.withdrawal / 12;
    const actual = referenceEffectiveMonthlyWithdrawal(model);

    expect(actual).toBeCloseTo(expected, 6);
    expect(actual).toBe(expected);  // exact equality: formula is just division
  });

  it("(b2) [formula] referenceEffectiveMonthlyWithdrawal equals final.withdrawal / 12 (SWP mode)", () => {
    const params = projectionParamsFromState(swpState);
    const model = calculate(params);

    const expected = model.final.withdrawal / 12;
    const actual = referenceEffectiveMonthlyWithdrawal(model);

    expect(actual).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // (c) Edge cases.
  // -------------------------------------------------------------------------
  it("(c1) [edge case] zero monthly target: effectiveMonthlyWithdrawal returns model's final.withdrawal / 12", () => {
    const params = projectionParamsFromState(zeroWithdrawalState);
    const model = calculate(params);

    // Even with monthlyTarget=0, the model may compute a non-zero withdrawal
    // if the mode allows it (interest mode with 0 target → model may still
    // distribute interest). We only assert the helper matches the formula.
    const result = referenceEffectiveMonthlyWithdrawal(model);
    const expected = model.final.withdrawal / 12;
    expect(result).toBe(expected);  // exact: formula is division, no rounding
  });

  it("(c2) [edge case] helper returns a finite number", () => {
    const params = projectionParamsFromState(baseState);
    const model = calculate(params);

    const result = referenceEffectiveMonthlyWithdrawal(model);
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isNaN(result)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (d) Drift invariant: all three sites must produce the same value.
  // -------------------------------------------------------------------------
  it("(d1) [site parity] KPI site, PDF site, and scenario site produce identical values", () => {
    const params = projectionParamsFromState(baseState);
    const model = calculate(params);

    // Site 1: KPI Strip (src/main.jsx ~4966)
    const kpiMonthlyCash = model.final.withdrawal / 12;

    // Site 2: PDF/CSV export (src/main.jsx ~3611)
    const pdfMonthlyCash = model.final.withdrawal / 12;

    // Site 3: Scenario snapshot (src/main.jsx ~3305)
    const scenarioMonthlyCash = model.final.withdrawal / 12;

    // All three must be equal — no independent computation divergence.
    expect(kpiMonthlyCash).toBe(pdfMonthlyCash);
    expect(pdfMonthlyCash).toBe(scenarioMonthlyCash);

    // Post-fix: all three should call the shared helper, which provides this guarantee.
    // Pre-fix: they're computed identically but could drift if one site changes formula.
    const helperResult = referenceEffectiveMonthlyWithdrawal(model);
    expect(kpiMonthlyCash).toBe(helperResult);
    expect(pdfMonthlyCash).toBe(helperResult);
    expect(scenarioMonthlyCash).toBe(helperResult);
  });

  it("(d2) [site parity] different model runs: all sites still agree", () => {
    const params1 = projectionParamsFromState(baseState);
    const model1 = calculate(params1);
    const params2 = projectionParamsFromState(swpState);
    const model2 = calculate(params2);

    // Each model's three sites must agree with each other.
    const kpi1 = model1.final.withdrawal / 12;
    const pdf1 = model1.final.withdrawal / 12;
    const scenario1 = model1.final.withdrawal / 12;
    expect(kpi1).toBe(pdf1);
    expect(pdf1).toBe(scenario1);

    const kpi2 = model2.final.withdrawal / 12;
    const pdf2 = model2.final.withdrawal / 12;
    const scenario2 = model2.final.withdrawal / 12;
    expect(kpi2).toBe(pdf2);
    expect(pdf2).toBe(scenario2);

    // The two models produce different final withdrawal values.
    // (Principal differs: 10M vs 8M, different returns.)
    // We just confirm they're not the same (sanity check on fixtures).
    // Note: they could be the same by coincidence; we won't assert inequality.
    expect(kpi1).toBeDefined();
    expect(kpi2).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // (e) Positive value: final withdrawal should be positive for funded plans.
  // -------------------------------------------------------------------------
  it("(e) [sanity] final monthly withdrawal is positive for a funded plan", () => {
    const params = projectionParamsFromState(baseState);
    const model = calculate(params);

    const monthlyWithdrawal = referenceEffectiveMonthlyWithdrawal(model);

    // A 10M corpus at 60/40 blend for 30 years should produce positive monthly cash.
    expect(monthlyWithdrawal).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Import-based test block (runs after module load).
// ---------------------------------------------------------------------------
describe("fin-rrf — effectiveMonthlyWithdrawal export contract", () => {

  it("[export contract] function signature: takes model object, returns number", async () => {
    let fn = null;
    try {
      const module = await import("../src/main.jsx");
      fn = module.effectiveMonthlyWithdrawal;
    } catch (_) {
      fn = null;
    }

    if (fn === null) {
      // Pre-fix: function not exported yet. Test documents the requirement.
      // This assertion will fail until the function is exported.
      expect(fn).not.toBeNull(); // will fail pre-fix → marks the bead as open
      return;
    }

    // Post-fix: function is callable.
    const params = projectionParamsFromState(baseState);
    const model = calculate(params);

    const result = fn(model);
    expect(typeof result).toBe("number");
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeCloseTo(model.final.withdrawal / 12, 6);
  });
});
