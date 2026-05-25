/**
 * tests/fixtures-generator.mjs
 *
 * Phase 4 (Mencius) — Cross-Check Fixture Generator
 * Generates N=10000 seeded-random input scenarios for the JS↔Python
 * parity test harness.
 *
 * Usage:
 *   node tests/fixtures-generator.mjs [--n=10000] [--seed=20260518] [--out=audit/reference/fixtures/cross-check-inputs.jsonl]
 *
 * Output format: JSONL, one JSON object per line.
 * First line: header comment "# fin-cross-check-fixtures v1 seed=<seed> n=<N> generated=<ISO date>"
 *
 * Sampling distributions per input dimension (per task specification):
 *   corpus: log-uniform in [₹10L, ₹50Cr]
 *   monthly_cash_target: log-uniform in [₹20k, ₹5L]
 *   horizon_years: uniform integer [20, 50]
 *   inflation: truncated normal mean 6%, stdev 1.5%, clipped to [3%, 10%]
 *   equity_share: uniform [0, 1]
 *   equity_return: truncated normal mean 12%, stdev 3%, clipped to [4%, 20%]
 *   debt_return: truncated normal mean 7%, stdev 1%, clipped to [3%, 11%]
 *   expense_ratio: uniform [0.001, 0.02]
 *   regime: bernoulli {NEW: 0.7, OLD: 0.3}
 *   age: uniform integer [25, 75]
 *   is_nri: bernoulli {true: 0.1, false: 0.9}
 *   glide_path: bernoulli {enabled: 0.5}; if enabled, end_equity = equity_share × uniform[0.2, 0.7]
 *   household_mode: bernoulli {true: 0.4, false: 0.6}
 *   swp_mode: bernoulli {true: 0.5}
 *   mc_runs: fixed 1000
 */

import { createWriteStream } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    n: parseInt(args.n ?? "10000", 10),
    seed: parseInt(args.seed ?? "20260518", 10),
    out: args.out ?? "audit/reference/fixtures/cross-check-inputs.jsonl",
  };
}

// ---------------------------------------------------------------------------
// Mulberry32 PRNG (same as src/model.js for reproducibility consistency)
// ---------------------------------------------------------------------------
function makePrng(seed) {
  let s = seed >>> 0;
  return function random() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Distribution helpers
// ---------------------------------------------------------------------------

/** Uniform float in [lo, hi) */
function uniform(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** Uniform integer in [lo, hi] (inclusive) */
function uniformInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Log-uniform in [lo, hi]: exp(uniform(log(lo), log(hi))) */
function logUniform(rng, lo, hi) {
  return Math.exp(uniform(rng, Math.log(lo), Math.log(hi)));
}

/**
 * Truncated normal: Box-Muller transform, then clip to [lo, hi].
 * Retries up to 20 times before falling back to mean.
 */
function truncNormal(rng, mean, stdev, lo, hi) {
  for (let i = 0; i < 20; i++) {
    const u1 = Math.max(rng(), 1e-10);
    const u2 = Math.max(rng(), 1e-10);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = mean + stdev * z;
    if (v >= lo && v <= hi) return v;
  }
  return Math.min(hi, Math.max(lo, mean));
}

/** Bernoulli: returns true with probability p */
function bernoulli(rng, p) {
  return rng() < p;
}

// ---------------------------------------------------------------------------
// Age band helper
// ---------------------------------------------------------------------------
function ageBand(age) {
  if (age >= 80) return "superSenior";
  if (age >= 60) return "senior";
  return "below60";
}

// ---------------------------------------------------------------------------
// Scenario generation
// ---------------------------------------------------------------------------
function generateScenario(rng, id) {
  // Core financial inputs
  const corpus = logUniform(rng, 1_000_000, 500_000_000);         // ₹10L to ₹50Cr
  const monthly_cash_target = logUniform(rng, 20_000, 500_000);   // ₹20k to ₹5L
  const horizon_years = uniformInt(rng, 20, 50);
  const inflation = truncNormal(rng, 0.06, 0.015, 0.03, 0.10);
  const equity_share = uniform(rng, 0, 1);
  const equity_return = truncNormal(rng, 0.12, 0.03, 0.04, 0.20);
  const debt_return = truncNormal(rng, 0.07, 0.01, 0.03, 0.11);
  const expense_ratio = uniform(rng, 0.001, 0.02);

  // Tax / regulatory inputs
  const regime = bernoulli(rng, 0.7) ? "new" : "old";
  const age = uniformInt(rng, 25, 75);
  const is_nri = bernoulli(rng, 0.1);

  // Glide path
  const glide_enabled = bernoulli(rng, 0.5);
  const glide_end_equity = glide_enabled
    ? equity_share * uniform(rng, 0.2, 0.7)
    : equity_share;
  const glide_years = glide_enabled ? uniformInt(rng, 5, Math.min(25, horizon_years)) : 0;

  // Household mode
  const household_mode = bernoulli(rng, 0.4);
  const partner_age = household_mode ? uniformInt(rng, 25, 75) : null;
  const dependant_support_years = household_mode ? uniformInt(rng, 0, 30) : 0;

  // SWP mode
  const swp_mode = bernoulli(rng, 0.5);
  const initial_nav = swp_mode ? uniform(rng, 10, 5000) : null;
  const cost_basis_pct = swp_mode ? uniform(rng, 0.3, 0.9) : null;

  // MC
  const mc_runs = 1000;

  return {
    id,
    // Corpus / portfolio
    corpus: Math.round(corpus),
    monthly_cash_target: Math.round(monthly_cash_target),
    horizon_years,
    inflation: parseFloat(inflation.toFixed(6)),
    equity_share: parseFloat(equity_share.toFixed(6)),
    equity_return: parseFloat(equity_return.toFixed(6)),
    debt_return: parseFloat(debt_return.toFixed(6)),
    expense_ratio: parseFloat(expense_ratio.toFixed(6)),
    // Tax
    regime,
    age,
    age_band: ageBand(age),
    is_nri,
    // Glide path
    glide_enabled,
    glide_end_equity: parseFloat(glide_end_equity.toFixed(6)),
    glide_years,
    // Household
    household_mode,
    partner_age,
    dependant_support_years,
    // SWP
    swp_mode,
    initial_nav: initial_nav !== null ? parseFloat(initial_nav.toFixed(4)) : null,
    cost_basis_pct: cost_basis_pct !== null ? parseFloat(cost_basis_pct.toFixed(6)) : null,
    // MC
    mc_runs,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { n, seed, out } = parseArgs(process.argv);
  const outPath = resolve(REPO_ROOT, out);

  const rng = makePrng(seed);
  const isoDate = new Date().toISOString().slice(0, 10);

  const ws = createWriteStream(outPath, { encoding: "utf8" });

  await new Promise((resolve, reject) => {
    ws.on("error", reject);
    ws.write(`# fin-cross-check-fixtures v1 seed=${seed} n=${n} generated=${isoDate}\n`, (err) => {
      if (err) reject(err);
    });

    for (let i = 0; i < n; i++) {
      const scenario = generateScenario(rng, i);
      ws.write(JSON.stringify(scenario) + "\n", (err) => {
        if (err) reject(err);
      });
    }

    ws.end(() => resolve());
  });

  console.log(`Generated ${n} scenarios to ${outPath} (seed=${seed})`);
}

main().catch((err) => {
  console.error("fixtures-generator error:", err);
  process.exit(1);
});
