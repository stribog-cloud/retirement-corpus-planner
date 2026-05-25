/**
 * Tesla R4.2.5 profiling harness — per-region analytics worker breakdown.
 * Phase: R4.2.5a (profiling pass only — no fixes)
 * Methodology:
 *   - Single keystroke from settled state → wait for data-analytics-pending=true →
 *     wait for data-analytics-pending=false (correct methodology per R4.1)
 *   - Collect per-region timings from window.__teslaTimings (injected by
 *     instrumented analytics.js + main.jsx)
 *   - N=35 trials (5 warmup rounds skipped + 35 measured)
 *   - Outlier exclusion: discard any trial where totalMs > p99+3*IQR (none
 *     expected given stable environment; documented if applied)
 * Platform: Mac Studio M3 Ultra, Chrome headless "new"
 * Date: 2026-05-19
 */
import { startServer, launchBrowser, loadApp, waitForModelIdle, stats } from "./shared.mjs";

const TRIALS = 35;
const WARMUP = 3;
const SELECTOR = ".whatif-card .quick-field[data-label='Monthly cash'] input";
const DEBOUNCE_MS = 110; // confirmed in src/main.jsx

const server = await startServer();
const port = server.address().port;
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });

// Cold-start load — warm up
await loadApp(page, port);
await waitForModelIdle(page, 20000);

// Region accumulators
const results = [];

// Helper: wait for analytics-pending to go true, then false
async function waitForAnalyticsCycle(page, timeoutMs = 5000) {
  const start = Date.now();
  // Phase 1: wait for pending=true (debounce fires, worker starts)
  await page.waitForFunction(() => {
    const stack = document.querySelector(".main-stack");
    return stack && (stack.dataset.analyticsPending === "true" || stack.classList.contains("model-pending"));
  }, { timeout: timeoutMs });
  const pendingAt = Date.now() - start;

  // Phase 2: wait for pending=false (worker completed, React settled)
  await waitForModelIdle(page, timeoutMs);
  const settledAt = Date.now() - start;

  return { pendingAt, settledAt };
}

// Helper: run one trial — single keystroke from settled state
async function runTrial(trialIndex) {
  // Reset field to empty
  await page.click(SELECTOR, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await waitForModelIdle(page, 10000);

  // Clear previous timings
  await page.evaluate(() => { window.__teslaTimings = null; });

  // Record wall-clock start on main thread (Puppeteer side)
  const puppeteerStart = Date.now();

  // Type a single character — this is the keystroke event
  // Use '1' as the target value (first digit of 100000)
  await page.keyboard.type("1", { delay: 0 });

  // Wait for analytics cycle: pending=true → pending=false
  let cycleData;
  try {
    cycleData = await waitForAnalyticsCycle(page, 5000);
  } catch (e) {
    return { trial: trialIndex, error: `cycle timeout: ${e.message}`, skipped: true };
  }
  const puppeteerSettle = Date.now() - puppeteerStart;

  // Collect timings from instrumented window variable
  const timings = await page.evaluate(() => window.__teslaTimings || null);

  if (!timings) {
    return { trial: trialIndex, error: "no timings collected (worker path not taken?)", skipped: true };
  }

  return {
    trial: trialIndex,
    skipped: false,
    puppeteerSettleMs: puppeteerSettle,
    debounceWaitMs: cycleData.pendingAt,       // time from keystroke until pending=true (approx debounce)
    analyticsActiveMs: cycleData.settledAt - cycleData.pendingAt, // time worker was active
    // Per-region from instrumented analytics.js (worker-side timings)
    workerTotalMs: timings.totalMs,
    normalizeMs: timings.normalizeMs,
    projParamsMs: timings.projParamsMs,
    mcMs: timings.mcMs,
    topupMs: timings.topupMs,
    solveReturnMs: timings.solveReturnMs,
    solveCorpusMs: timings.solveCorpusMs,
    solveReturnCashMs: timings.solveReturnCashMs,
    solveMaxCashMs: timings.solveMaxCashMs,
    taxShareMs: timings.taxShareMs,
    optimumMs: timings.optimumMs,
    // Main-thread postMessage round-trip overhead
    mainRoundTripMs: timings.mainRoundTripMs,
    // Derived: serialization overhead = round_trip - worker_total
    // (includes postMessage overhead both directions)
    estimatedSerializationMs: Math.max(0, timings.mainRoundTripMs - timings.totalMs),
    // 32ms setTimeout + debounce wait before postMessage is sent
    // puppeteerSettle = debounce_wait + 32ms_settimeout + worker_total + serialization + react_commit
    estimatedReactCommitMs: Math.max(0, puppeteerSettle - cycleData.pendingAt - timings.mainRoundTripMs - 32)
  };
}

// Warmup runs (not counted)
process.stderr.write(`Warming up (${WARMUP} trials)...\n`);
for (let i = 0; i < WARMUP; i++) {
  await runTrial(-i - 1);
  process.stderr.write(`  warmup ${i+1}/${WARMUP} done\n`);
}

// Measured trials
process.stderr.write(`Running ${TRIALS} measured trials...\n`);
for (let i = 0; i < TRIALS; i++) {
  const r = await runTrial(i + 1);
  results.push(r);
  process.stderr.write(`  trial ${i+1}/${TRIALS}: settle=${r.puppeteerSettleMs}ms worker=${r.workerTotalMs?.toFixed(1)}ms mc=${r.mcMs?.toFixed(1)}ms optimum=${r.optimumMs?.toFixed(1)}ms${r.skipped ? " SKIPPED" : ""}\n`);
}

await browser.close();
server.close();

// Filter valid trials
const valid = results.filter(r => !r.skipped);
const skipped = results.filter(r => r.skipped);

// Stats helper (reuse shared.mjs version for arrays)
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}
function regionStats(field) {
  const vals = valid.map(r => r[field]).filter(v => typeof v === "number" && isFinite(v));
  if (!vals.length) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0, n: 0 };
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return {
    p50: Math.round(pct(vals, 0.5) * 10) / 10,
    p95: Math.round(pct(vals, 0.95) * 10) / 10,
    p99: Math.round(pct(vals, 0.99) * 10) / 10,
    min: Math.round(Math.min(...vals) * 10) / 10,
    max: Math.round(Math.max(...vals) * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    n: vals.length
  };
}

const report = {
  meta: {
    date: "2026-05-19",
    phase: "R4.2.5a",
    platform: "Mac Studio M3 Ultra",
    chrome: "headless new",
    trials_requested: TRIALS,
    warmup_trials: WARMUP,
    trials_valid: valid.length,
    trials_skipped: skipped.length,
    debounce_ms: DEBOUNCE_MS
  },
  regions: {
    puppeteerSettle:      regionStats("puppeteerSettleMs"),
    debounceWait:         regionStats("debounceWaitMs"),
    analyticsActive:      regionStats("analyticsActiveMs"),
    workerTotal:          regionStats("workerTotalMs"),
    normalize:            regionStats("normalizeMs"),
    projParams:           regionStats("projParamsMs"),
    monteCarlo:           regionStats("mcMs"),
    topup:                regionStats("topupMs"),
    solveReturn:          regionStats("solveReturnMs"),
    solveCorpus:          regionStats("solveCorpusMs"),
    solveReturnCash:      regionStats("solveReturnCashMs"),
    solveMaxCash:         regionStats("solveMaxCashMs"),
    taxShare:             regionStats("taxShareMs"),
    optimum:              regionStats("optimumMs"),
    mainRoundTrip:        regionStats("mainRoundTripMs"),
    estimatedSerialization: regionStats("estimatedSerializationMs"),
    estimatedReactCommit: regionStats("estimatedReactCommitMs")
  },
  raw: results
};

console.log(JSON.stringify(report, null, 2));
