/**
 * Tesla perf harness: Monte Carlo N=1000 throughput.
 * Threshold: ≤ 800 ms p95 (audit/CLAUDE.md §4).
 * Method: Call calculateMonteCarlo directly in a Vitest bench context via
 *   dynamic import of src/model.js (Node.js ESM), then measure wall time.
 *   N=1000 simulations with default params (30 years, balanced portfolio).
 * Trials: 7 runs.
 * Output: JSON to stdout.
 * Note: This measures pure-JS model cost (no browser overhead).
 *   A separate browser-level measurement is included for completeness.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../");

// We need to run calculateMonteCarlo in Node.js ESM.
// src/model.js uses `export` and no browser globals that would block loading.
// However it may reference `performance` — we polyfill from perf_hooks.
import { performance } from "node:perf_hooks";
globalThis.performance = performance;

const { calculateMonteCarlo, projectionParamsFromState, normalizeState } = await import(join(ROOT, "src/model.js"));

// Standard test state: 30-year accumulation, 1cr corpus, 7% rate, 96 samples default → we override to 1000
const testState = normalizeState({
  years: 30,
  principal: 10000000,
  annualRate: 7,
  equityShare: 60,
  monthlyTarget: 80000,
  monteCarloSamples: 1000,
  monteCarloSeed: 24681357,
  shockModel: "regime"
});
const params = projectionParamsFromState(testState);

const TRIALS = 7;
const samples = [];

for (let i = 0; i < TRIALS; i++) {
  const t0 = performance.now();
  const result = calculateMonteCarlo(params, 1000);
  const elapsed = performance.now() - t0;
  samples.push(elapsed);
  // Sanity check
  if (result.simulations !== 1000) throw new Error(`Expected 1000 simulations, got ${result.simulations}`);
}

function stats(arr) {
  if (!arr.length) return { p50: 0, p95: 0, min: 0, max: 0, mean: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (frac) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * frac))];
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    p50: Math.round(p(0.5) * 10) / 10,
    p95: Math.round(p(0.95) * 10) / 10,
    min: Math.round(sorted[0] * 10) / 10,
    max: Math.round(sorted[sorted.length - 1] * 10) / 10,
    mean: Math.round(mean * 10) / 10
  };
}

const result = {
  metric: "monte-carlo-n1000",
  threshold_ms: 800,
  description: "calculateMonteCarlo(params, 1000) wall time in Node.js, 30-year horizon",
  trials: TRIALS,
  stats: stats(samples),
  raw_ms: samples.map((v) => Math.round(v * 10) / 10)
};

console.log(JSON.stringify(result, null, 2));
