#!/usr/bin/env node
// scripts/e2e-preflight.mjs
// R4.9.5i: Permanent fix for the recurring "e2e hangs on stale Chrome zombie"
// pattern (orphan puppeteer_dev_chrome_profile-* processes + temp dirs holding
// state across runs / claude-code restarts). Runs at the head of the
// `test:e2e` chain in package.json and before any individual e2e script
// invoked manually.
//
// Two responsibilities:
//   1. Kill any lingering puppeteer-launched Chrome processes (identified by
//      the `puppeteer_dev_chrome_profile-` prefix in their --user-data-dir
//      argument — puppeteer's default).
//   2. Delete the abandoned profile temp dirs so future launches don't
//      collide on shared sqlite locks / preferences files.
//
// Safe to run multiple times. Safe to run when no orphans exist. Exit 0
// always (warnings emit to stderr but never gate-block — preflight is a
// best-effort cleanup, not an assertion).
//
// Tracking: fin-c1p (R4.9.5i parent) + R5 fin-c96.N (deeper test-infra migration)

import { execSync, spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROFILE_PREFIX = "puppeteer_dev_chrome_profile-";

function killOrphanChromeProcesses() {
  // macOS / Linux: pgrep -f matches command line including args. Match
  // processes whose argv contains `puppeteer_dev_chrome_profile-` (the
  // puppeteer-default user-data-dir prefix).
  const pgrep = spawnSync("pgrep", ["-f", PROFILE_PREFIX], { encoding: "utf8" });
  const pids = (pgrep.stdout || "").trim().split("\n").filter(Boolean);
  if (pids.length === 0) {
    return { killed: 0, pids: [] };
  }
  // SIGKILL — orphan Chrome doesn't respond to SIGTERM reliably.
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch (err) {
      if (err.code !== "ESRCH") {
        process.stderr.write(`preflight: failed to kill pid ${pid}: ${err.message}\n`);
      }
    }
  }
  // Give the OS a moment to reap.
  spawnSync("sleep", ["1"]);
  return { killed: pids.length, pids };
}

function cleanupAbandonedProfiles() {
  const dir = tmpdir();
  let removed = 0;
  let failed = 0;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    process.stderr.write(`preflight: readdir ${dir} failed: ${err.message}\n`);
    return { removed: 0, failed: 0 };
  }
  for (const name of entries) {
    if (!name.startsWith(PROFILE_PREFIX)) continue;
    const path = join(dir, name);
    try {
      rmSync(path, { recursive: true, force: true });
      removed += 1;
    } catch (err) {
      failed += 1;
      process.stderr.write(`preflight: rm ${path} failed: ${err.message}\n`);
    }
  }
  return { removed, failed };
}

function main() {
  const proc = killOrphanChromeProcesses();
  const dirs = cleanupAbandonedProfiles();
  const summary = {
    ok: true,
    checked: "e2e-preflight",
    orphanProcessesKilled: proc.killed,
    abandonedProfilesRemoved: dirs.removed,
    abandonedProfileCleanupFailures: dirs.failed
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  // Always exit 0 — preflight is best-effort.
  process.exit(0);
}

main();
