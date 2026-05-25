#!/usr/bin/env node
// scripts/e2e-run-with-timeout.mjs
// R4.9.5i stringent-timeout runner. Wraps a node-invoked e2e test script
// with a HARD-KILL timeout. If the test exceeds its budget, the entire
// process tree (including puppeteer-launched Chrome workers) is SIGKILLed
// and the runner exits non-zero with a clear diagnostic.
//
// Usage:
//   node scripts/e2e-run-with-timeout.mjs <timeoutSec> <node-args...>
//
// Examples:
//   node scripts/e2e-run-with-timeout.mjs 180 tests/e2e/dashboard-regression.mjs
//   node scripts/e2e-run-with-timeout.mjs 90 tests/e2e/csv-export-regression.mjs
//
// Behavior:
//   - Spawns `node <node-args...>` as a child with its own process group
//     (detached: true). This isolates the child + its puppeteer Chrome
//     descendants so killpg can take down the whole subtree.
//   - On timeout: SIGKILL the entire process group, then run preflight
//     cleanup (kills any orphan puppeteer Chrome procs by --user-data-dir
//     prefix), exit 124 (standard `timeout` exit code).
//   - On clean child exit: pass through child exit code.
//   - On SIGINT/SIGTERM to runner: forward signal to child group, then
//     run preflight cleanup before exiting.
//
// Tracking: fin-c1p R4.9.5i (permanent e2e infra)

import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const root = resolve(here, "../..");

const [, , timeoutArg, ...nodeArgs] = process.argv;
const timeoutSec = Number(timeoutArg);
if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
  process.stderr.write(`usage: node ${here} <timeoutSec> <node-args...>\n`);
  process.exit(2);
}
if (nodeArgs.length === 0) {
  process.stderr.write(`usage: node ${here} <timeoutSec> <node-args...>\n`);
  process.exit(2);
}

const label = nodeArgs[0];
const startedAt = Date.now();

const child = spawn("node", nodeArgs, {
  stdio: "inherit",
  detached: true, // own process group so killpg(-pid) takes the whole tree
  cwd: root
});

let killedByTimeout = false;
let killedBySignal = null;

function killGroupAndCleanup(reason) {
  try {
    // negative pid = process group on POSIX
    process.kill(-child.pid, "SIGKILL");
  } catch (err) {
    if (err.code !== "ESRCH") {
      process.stderr.write(`e2e-run-with-timeout: killpg failed: ${err.message}\n`);
    }
  }
  // Belt-and-suspenders: invoke the preflight cleanup script to sweep any
  // puppeteer Chrome that survived (e.g. detached deep child processes).
  const preflight = spawnSync("node", [resolve(root, "scripts/e2e-preflight.mjs")], {
    stdio: "inherit",
    cwd: root
  });
  if (preflight.status !== 0) {
    process.stderr.write(`e2e-run-with-timeout: preflight cleanup returned ${preflight.status}\n`);
  }
  process.stderr.write(`e2e-run-with-timeout: ${reason}\n`);
}

const timer = setTimeout(() => {
  killedByTimeout = true;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  killGroupAndCleanup(
    `HARD TIMEOUT: ${label} exceeded ${timeoutSec}s budget (elapsed ${elapsed}s). ` +
    `Process tree SIGKILLed. Exit 124.`
  );
}, timeoutSec * 1000);

function forwardSignal(signal) {
  killedBySignal = signal;
  clearTimeout(timer);
  killGroupAndCleanup(`runner received ${signal}; forwarded SIGKILL to child group`);
  process.exit(signal === "SIGINT" ? 130 : 143);
}
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("error", (err) => {
  clearTimeout(timer);
  process.stderr.write(`e2e-run-with-timeout: child spawn error: ${err.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (killedByTimeout) {
    process.exit(124);
  }
  if (killedBySignal) {
    return; // already handled in forwardSignal
  }
  if (signal) {
    process.stderr.write(`e2e-run-with-timeout: ${label} killed by signal ${signal} after ${elapsed}s\n`);
    process.exit(1);
  }
  // Normal exit
  const exit = code ?? 0;
  if (exit === 0) {
    process.stdout.write(`e2e-run-with-timeout: ${label} passed in ${elapsed}s (budget ${timeoutSec}s)\n`);
  } else {
    process.stderr.write(`e2e-run-with-timeout: ${label} failed (exit ${exit}) after ${elapsed}s\n`);
  }
  process.exit(exit);
});
