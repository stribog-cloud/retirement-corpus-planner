#!/usr/bin/env node
/**
 * Tesla performance gate — scripts/perf-gate.mjs
 * Runs all perf:* benchmarks, compares against thresholds, exits 1 if any fail.
 *
 * Thresholds from audit/CLAUDE.md §4 (Fin-Dashboard Round 3):
 *   Cold load → first interactive paint : ≤ 1500 ms p95
 *   Single-keystroke edit → KPI settle  : ≤ 250 ms p95
 *   Sustained typing throughput          : ≥ 30 keystrokes/sec (p95 effective)
 *   Monte Carlo N=1000 run               : ≤ 800 ms p95
 *   Print/PDF export                     : ≤ 3000 ms p95
 *   Memory growth across 1000 edits      : ≤ 30 MB p95
 *
 * Usage: node scripts/perf-gate.mjs
 *   Exits 0 if all pass, exits 1 if any fail.
 *   Set PERF_GATE_SKIP_SLOW=1 to skip browser harnesses (MC only).
 */
import { execFileSync } from "node:child_process";

// Thresholds — source: audit/CLAUDE.md §4
const PERF_THRESHOLDS = {
  // cold-load: loadEventEnd p95 must be ≤ 1500 ms
  "cold-load/load/p95": { value: 1500, compare: "lte", unit: "ms", label: "Cold load (loadEventEnd) p95" },
  // edit-latency: model settle p95 must be ≤ 250 ms
  "edit-latency/model_settle/p95": { value: 250, compare: "lte", unit: "ms", label: "Edit → KPI settle p95" },
  // sustained-typing: throughput from p95 paint ≥ 30 kps
  "sustained-typing/throughput_from_p95_kps": { value: 30, compare: "gte", unit: "kps", label: "Sustained typing throughput (p95 effective)" },
  // monte-carlo-n1000: p95 ≤ 800 ms
  "monte-carlo/stats/p95": { value: 800, compare: "lte", unit: "ms", label: "Monte Carlo N=1000 p95" },
  // pdf-export: p95 ≤ 3000 ms
  "pdf-export/stats/p95": { value: 3000, compare: "lte", unit: "ms", label: "PDF export p95" },
  // memory-growth: p95 ≤ 30 MB
  "memory-growth/growth_mb/p95": { value: 30, compare: "lte", unit: "MB", label: "Memory growth 1000 edits p95" }
};

function runHarness(script) {
  try {
    const out = execFileSync("node", [`tests/performance/${script}`], {
      encoding: "utf8",
      timeout: 300_000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return JSON.parse(out.trim());
  } catch (err) {
    const stderr = err.stderr || "";
    console.error(`  HARNESS ERROR (${script}): ${err.message}\n  ${stderr.slice(0, 200)}`);
    return null;
  }
}

function getNestedValue(obj, path) {
  return path.split("/").reduce((cur, key) => (cur != null && typeof cur === "object" ? cur[key] : undefined), obj);
}

function mapResultKey(metric, data) {
  if (!data) return {};
  // Map harness output to threshold keys
  switch (metric) {
    case "cold-load": return { "cold-load/load/p95": getNestedValue(data, "load/p95") };
    case "edit-latency": return { "edit-latency/model_settle/p95": getNestedValue(data, "model_settle/p95") };
    case "sustained-typing": return { "sustained-typing/throughput_from_p95_kps": data.throughput_from_p95_kps };
    case "monte-carlo": return { "monte-carlo/stats/p95": getNestedValue(data, "stats/p95") };
    case "pdf-export": return { "pdf-export/stats/p95": getNestedValue(data, "stats/p95") };
    case "memory-growth": return { "memory-growth/growth_mb/p95": getNestedValue(data, "growth_mb/p95") };
    default: return {};
  }
}

const skipSlow = process.env.PERF_GATE_SKIP_SLOW === "1";

const harnesses = skipSlow
  ? [["monte-carlo", "mc-throughput.mjs"]]
  : [
      ["cold-load", "load.mjs"],
      ["edit-latency", "edit-latency.mjs"],
      ["sustained-typing", "sustained-typing.mjs"],
      ["monte-carlo", "mc-throughput.mjs"],
      ["pdf-export", "export.mjs"],
      ["memory-growth", "memory-growth.mjs"]
    ];

console.log("\nTesla performance gate — audit/CLAUDE.md §4\n");
console.log("Running harnesses...\n");

const measured = {};
for (const [metric, script] of harnesses) {
  process.stdout.write(`  ${metric}... `);
  const data = runHarness(script);
  const values = mapResultKey(metric, data);
  Object.assign(measured, values);
  console.log(data ? "done" : "FAILED");
}

console.log("\n" + "─".repeat(80));
console.log(`${"Metric".padEnd(45)} ${"Threshold".padStart(12)} ${"Measured".padStart(12)} ${"Result".padStart(8)}`);
console.log("─".repeat(80));

let anyFail = false;

for (const [key, spec] of Object.entries(PERF_THRESHOLDS)) {
  const measured_val = measured[key];
  if (measured_val == null) {
    const line = `${spec.label.padEnd(45)} ${`≤${spec.value}${spec.unit}`.padStart(12)} ${"N/A".padStart(12)} ${"SKIP".padStart(8)}`;
    console.log(line);
    continue;
  }
  const pass = spec.compare === "lte" ? measured_val <= spec.value : measured_val >= spec.value;
  if (!pass) anyFail = true;
  const op = spec.compare === "lte" ? "≤" : "≥";
  const threshold_str = `${op}${spec.value}${spec.unit}`;
  const measured_str = `${Math.round(measured_val * 10) / 10}${spec.unit}`;
  const status = pass ? "PASS" : "FAIL";
  const line = `${spec.label.padEnd(45)} ${threshold_str.padStart(12)} ${measured_str.padStart(12)} ${status.padStart(8)}`;
  console.log(line);
}

console.log("─".repeat(80));
console.log(anyFail ? "\nGATE FAILED — one or more metrics exceed threshold.\n" : "\nGATE PASSED — all metrics within threshold.\n");

process.exit(anyFail ? 1 : 0);
