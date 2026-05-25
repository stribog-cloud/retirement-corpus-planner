/**
 * Tesla perf harness: Single-keystroke edit → KPI settle latency.
 * Threshold: ≤ 250 ms p95 (audit/CLAUDE.md §4).
 * Method: Puppeteer page.keyboard.type with real key events.
 *   Measures: input event → double-rAF (paint committed) for each keystroke.
 *   Also measures full model settle time (pending class disappears).
 * Trials: 5 runs × 12 keystrokes each = 60 keystroke samples.
 * Output: JSON to stdout.
 */
import { startServer, launchBrowser, loadApp, waitForModelIdle, stats } from "./shared.mjs";

const TRIALS = 5;
const TEXT = "135000";

const server = await startServer();
const port = server.address().port;
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });

// initial load — warm up
await loadApp(page, port);
await waitForModelIdle(page, 20000);

const keystrokeSamples = [];
const modelSettleSamples = [];
const selector = ".whatif-card .quick-field[data-label='Monthly cash'] input";

for (let trial = 0; trial < TRIALS; trial++) {
  // Reset field between trials
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await waitForModelIdle(page, 20000);

  // Instrument for keystroke timing
  await page.evaluate((sel) => {
    window.__teslaKeystrokePaints = [];
    window.__teslaObserverSetup = false;
    const el = document.querySelector(sel);
    // Remove previous listeners by cloning (workaround)
    el._teslaListener = (e) => {
      const t0 = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__teslaKeystrokePaints.push(performance.now() - t0);
      }));
    };
    el.addEventListener("input", el._teslaListener, { capture: true });
  }, selector);

  const modelStart = Date.now();
  await page.keyboard.type(TEXT, { delay: 40 });
  await page.waitForFunction(
    (expected) => document.querySelector(".whatif-card .quick-field[data-label='Monthly cash'] input")?.value === expected,
    {}, TEXT
  );

  // Wait for all rAF callbacks to fire
  await page.waitForFunction((expected) => (window.__teslaKeystrokePaints || []).length >= expected, {}, TEXT.length);

  // Wait for model to settle
  try {
    await waitForModelIdle(page, 20000);
  } catch {
    // timeout — model didn't settle within 20s
  }
  const modelSettle = Date.now() - modelStart;
  modelSettleSamples.push(modelSettle);

  const trialPaints = await page.evaluate(() => window.__teslaKeystrokePaints || []);
  keystrokeSamples.push(...trialPaints);

  // Clean up listener
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el._teslaListener) el.removeEventListener("input", el._teslaListener, { capture: true });
  }, selector);
}

await browser.close();
server.close();

const result = {
  metric: "edit-latency",
  threshold_ms: 250,
  description: "keystroke input event → double-rAF (paint committed), p95",
  trials: TRIALS,
  keystrokes_per_trial: TEXT.length,
  total_keystroke_samples: keystrokeSamples.length,
  keystroke_paint: stats(keystrokeSamples),
  model_settle: stats(modelSettleSamples),
  raw_keystroke_ms: keystrokeSamples.map((v) => Math.round(v * 10) / 10),
  raw_model_settle_ms: modelSettleSamples
};

console.log(JSON.stringify(result, null, 2));
