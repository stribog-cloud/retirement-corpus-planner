// tests/e2e/_browser-helper.mjs
// R4.9.5i: Shared puppeteer-launch helper with guaranteed teardown.
//
// PROBLEM SOLVED: When a test process is killed (Ctrl-C, parent shell exit,
// timeout, unhandled exception, claude-code restart), the launched Chrome
// subprocess can outlive its parent and become an orphan zombie. Multiple
// orphans across runs accumulate, hold `puppeteer_dev_chrome_profile-*`
// temp dirs, and create lock-file collisions that cause future test runs
// to hang.
//
// USAGE — wrap your test in withBrowser(launchOpts, async ({ browser, page }) => { ... }):
//
//   import { withBrowser } from "./_browser-helper.mjs";
//
//   async function run() {
//     await withBrowser({}, async ({ browser, page }) => {
//       await page.goto("http://127.0.0.1:1234/app.html", { waitUntil: "networkidle0" });
//       // ...assertions...
//     });
//   }
//
// GUARANTEES:
//   - browser.close() runs in `finally` — survives test failures, throws,
//     uncaughtException, SIGINT, SIGTERM, normal exit
//   - Unique user-data-dir per launch (prefixed with `puppeteer_dev_chrome_profile-`
//     to match the preflight cleanup script's pattern in scripts/e2e-preflight.mjs)
//   - Single shutdown registration per process (idempotent across multiple
//     withBrowser calls)
//
// Tracking: fin-c1p R4.9.5i; deeper migration is incremental (one test at
// a time can adopt the helper without forcing a big-bang refactor).

import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Chrome executable path:
//   1. PUPPETEER_EXECUTABLE_PATH env var (CI sets this from
//      browser-actions/setup-chrome's output → /opt/hostedtoolcache/...)
//   2. Default to the standard macOS Chrome path (local dev on Mac Studio).
// This makes the same helper work on macOS audit machines and on
// ubuntu-latest GitHub Actions runners without per-environment branches.
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE_PREFIX = "puppeteer_dev_chrome_profile-";

// Track all active browsers + profile dirs for forced shutdown.
const active = new Set();
let signalsRegistered = false;

function registerShutdownHandlers() {
  if (signalsRegistered) return;
  signalsRegistered = true;
  const shutdown = (signal) => {
    // Best-effort sync cleanup: orphan Chrome SIGKILL via OS, profile rm.
    for (const entry of active) {
      try {
        entry.browser.process()?.kill("SIGKILL");
      } catch {}
      try {
        rmSync(entry.profileDir, { recursive: true, force: true });
      } catch {}
    }
    // Re-emit the signal so the default handler can finish exiting.
    if (signal === "exit") return;
    process.exit(signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("uncaughtException", (err) => {
    process.stderr.write(`uncaughtException: ${err && err.stack || err}\n`);
    shutdown("uncaughtException");
  });
  process.on("exit", () => shutdown("exit"));
}

/**
 * Launch puppeteer Chrome with guaranteed teardown.
 *
 * @param {object} launchOpts — additional puppeteer.launch options (merged
 *   with defaults: headless: "new", --disable-gpu, --no-sandbox, unique
 *   user-data-dir).
 * @param {function} testFn — async ({ browser, page }) => void
 * @returns {Promise<void>}
 */
export async function withBrowser(launchOpts, testFn) {
  registerShutdownHandlers();

  const profileDir = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  const args = [
    "--no-sandbox",
    "--disable-gpu",
    // Rendering-stability flags (R4.10 fin-1ci, public-CI Ubuntu parity):
    // these neutralize OS-level rendering differences between macOS Mac
    // Studio (audit baseline) and ubuntu-latest GitHub Actions runners.
    "--font-render-hinting=none",           // consistent text antialiasing
    "--force-device-scale-factor=1",         // no retina/HiDPI surprises
    "--hide-scrollbars",                     // scrollbars shift layout width
    "--disable-features=Translate",          // no auto-translate overlays
    "--lang=en-US",                          // explicit locale
    "--no-first-run",                        // suppress first-run UI
    "--disable-blink-features=AutomationControlled",
    `--user-data-dir=${profileDir}`,
    ...(launchOpts.args || [])
  ];

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    // Default viewport matches canonical-numeric-parity.mjs's explicit
    // setting — gives desktop apps room to lay out without wrap-driven
    // shifts. Tests that need a different viewport override via launchOpts
    // or call page.setViewport() themselves.
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    ...launchOpts,
    args
  });

  const entry = { browser, profileDir };
  active.add(entry);

  try {
    const page = await browser.newPage();
    await testFn({ browser, page });
  } finally {
    try { await browser.close(); } catch {}
    active.delete(entry);
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
}
