/**
 * fin-jyv.2 — exportPdf reads from settled analyticsBundle (no solver re-run)
 *
 * Verifies that the values produced by computeAnalyticsBundle() are numerically
 * identical to what the four synchronous solvers return when called directly.
 * This proves that buildExportContext() can safely read from the settled bundle
 * instead of re-invoking solvers, with no numeric change to export outputs.
 *
 * What this test proves:
 *   - requiredCorpusForCash from bundle === solveCorpusForMonthlyCash(params)
 *   - requiredReturnForCash from bundle === solveReturnForMonthlyCash(params)
 *   - maxMonthlyCash from bundle === solveMaxMonthlyCash(params)
 *   - interestShareForTarget from bundle === withdrawalShareNeeded(params)
 *   - optimum from bundle has same structure as generateOptimumStrategies(state)
 *
 * Together these confirm no numeric change results from the refactor that
 * removes solver re-runs from the export path (fin-jyv.2).
 *
 * TDD: test was written BEFORE the buildExportContext change, confirmed it
 * was already green (the model is the source of truth; bundle == direct calls).
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  solveCorpusForMonthlyCash,
  solveReturnForMonthlyCash,
  solveMaxMonthlyCash,
  withdrawalShareNeeded,
  generateOptimumStrategies,
  selectExportMc,
} from "../src/main.jsx";
import { computeAnalyticsBundle, buildFallbackAnalytics } from "../src/analytics.js";

// Representative test state — 1 Cr corpus, 30-year horizon, SWP, retiree tax
const state = normalizeState({
  ...BASE,
  principal: 10_000_000,
  targetCorpus: 10_000_000,
  monthlyTarget: 40_000,
  years: 30,
  inflation: 6,
  incomeMode: "swp",
  cashMode: "monthlyTarget",
  useAssetReturns: 1,
  equityShare: 60,
  equityReturn: 12,
  debtReturn: 8,
  expenseRatio: 0.5,
  taxProfileMode: "retiree",
  taxRate: 0,
  monteCarloSamples: 32,
  monteCarloSeed: 12345678,
});

const params = projectionParamsFromState(state);
const bundle = computeAnalyticsBundle(state);

describe("fin-jyv.2 — analyticsBundle solver values match direct solver calls", () => {
  it(
    "test_bundle_requiredCorpusForCash_matches_direct_solver: " +
    "bundle.requiredCorpusForCash === solveCorpusForMonthlyCash(params)",
    () => {
      const direct = solveCorpusForMonthlyCash(params);
      expect(bundle.requiredCorpusForCash).toBe(direct);
    }
  );

  it(
    "test_bundle_requiredReturnForCash_matches_direct_solver: " +
    "bundle.requiredReturnForCash === solveReturnForMonthlyCash(params)",
    () => {
      const direct = solveReturnForMonthlyCash(params);
      // Both may be null or a number — either way must match
      expect(bundle.requiredReturnForCash).toBe(direct);
    }
  );

  it(
    "test_bundle_maxMonthlyCash_matches_direct_solver: " +
    "bundle.maxMonthlyCash === solveMaxMonthlyCash(params)",
    () => {
      const direct = solveMaxMonthlyCash(params);
      expect(bundle.maxMonthlyCash).toBe(direct);
    }
  );

  it(
    "test_bundle_interestShareForTarget_matches_direct_solver: " +
    "bundle.interestShareForTarget === withdrawalShareNeeded(params)",
    () => {
      const direct = withdrawalShareNeeded(params);
      expect(bundle.interestShareForTarget).toBe(direct);
    }
  );

  it(
    "test_bundle_optimum_structure_matches_direct_call: " +
    "bundle.optimum.best has same equityShare as generateOptimumStrategies(state).best",
    () => {
      const direct = generateOptimumStrategies(state);
      // Both should produce the same best strategy (or both null)
      if (bundle.optimum.best === null) {
        expect(direct.best).toBeNull();
      } else {
        expect(bundle.optimum.best).not.toBeNull();
        expect(direct.best).not.toBeNull();
        // The key numeric fields must match
        expect(bundle.optimum.best.equityShare).toBe(direct.best.equityShare);
        expect(bundle.optimum.best.id).toBe(direct.best.id);
      }
    }
  );

  it(
    "test_bundle_mc_present: bundle.mc has successProbability (MC ran in bundle, not separately)",
    () => {
      expect(bundle.mc).toBeDefined();
      expect(typeof bundle.mc.successProbability).toBe("number");
      expect(bundle.mc.successProbability).toBeGreaterThanOrEqual(0);
      expect(bundle.mc.successProbability).toBeLessThanOrEqual(1);
    }
  );
});

// ---------------------------------------------------------------------------
// fin-1q6 (R4-Q18 Option A) — export must read SETTLED slow-tier MC.
//
// Repro: the fast tier clears `pending` with a bundle whose `mc` is the fallback
// `pendingMonteCarlo` (simulations:0). The slow tier delivers the real MC
// (simulations:1000) later. If the export reads the bundle at the fast-tier
// moment it captures simulations:0 even though the full MC has since settled —
// the §2 tile detail then shows "0 samples" and §7 fires the "not yet computed"
// sentinel incorrectly. selectExportMc() reconciles this, keyed by fingerprint.
// ---------------------------------------------------------------------------
describe("fin-1q6 — export reads the settled slow-tier MC (not the fast-tier fallback)", () => {
  const fp = "plan-fingerprint-A";
  const params = projectionParamsFromState(state);
  // Fast-tier-as-seen-by-export: the fallback MC (simulations:0).
  const fallbackBundle = buildFallbackAnalytics(state, params, undefined);
  const fallbackMc = fallbackBundle.mc;
  // Slow-tier MC: the real Monte Carlo with the configured sample count.
  const slowMc = computeAnalyticsBundle(state).mc;

  it(
    "test_fallback_mc_has_zero_simulations: the fast-tier fallback MC reports simulations:0 (the bug source)",
    () => {
      expect(Number(fallbackMc.simulations) || 0).toBe(0);
      expect(slowMc.simulations).toBeGreaterThan(0);
    }
  );

  it(
    "test_export_picks_slow_mc_after_slow_tier_settled: " +
    "given a prior settled slow MC for the same fingerprint, an export reading a fast-tier (simulations:0) bundle MUST use the settled slow MC",
    () => {
      // 1. Slow tier settled earlier for this plan -> record it as last-good.
      const afterSlow = selectExportMc(slowMc, fp, null);
      expect(afterSlow.mc.simulations).toBe(slowMc.simulations);
      expect(afterSlow.lastGood.fingerprint).toBe(fp);

      // 2. A later render re-merges the fast tier (mc back to fallback simulations:0)
      //    for the SAME plan. Export must still surface the real slow-tier MC.
      const onExport = selectExportMc(fallbackMc, fp, afterSlow.lastGood);
      expect(onExport.mc.simulations).toBe(slowMc.simulations); // NOT 0
      expect(onExport.mc.simulations).toBeGreaterThan(0);
    }
  );

  it(
    "test_genuine_pending_keeps_sentinel: " +
    "with NO prior settled slow MC, a fast-tier (simulations:0) bundle stays simulations:0 so the §7 sentinel fires correctly",
    () => {
      const onExport = selectExportMc(fallbackMc, fp, null);
      expect(Number(onExport.mc.simulations) || 0).toBe(0);
    }
  );

  it(
    "test_stale_mc_from_different_plan_never_leaks: " +
    "a last-good MC from a DIFFERENT fingerprint must NOT be used for the current plan",
    () => {
      const lastGoodOtherPlan = { fingerprint: "plan-fingerprint-B", mc: slowMc };
      const onExport = selectExportMc(fallbackMc, fp, lastGoodOtherPlan);
      // fingerprint mismatch -> fall back to the live (pending) MC, not the stale one.
      expect(Number(onExport.mc.simulations) || 0).toBe(0);
    }
  );

  it(
    "test_live_slow_mc_always_wins: " +
    "when the live bundle already carries a real MC it is used directly and becomes the new last-good",
    () => {
      const stale = { fingerprint: fp, mc: { ...slowMc, simulations: 16 } };
      const onExport = selectExportMc(slowMc, fp, stale);
      expect(onExport.mc.simulations).toBe(slowMc.simulations);
      expect(onExport.lastGood.mc.simulations).toBe(slowMc.simulations);
    }
  );
});
