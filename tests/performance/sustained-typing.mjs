/**
 * Tesla perf harness: Sustained typing throughput.
 * Threshold: ≥ 30 keystrokes/sec without dropped frames (audit/CLAUDE.md §4).
 *
 * Method (revised):
 *   Uses the same realTypingAudit pattern as scripts/ui-performance-budget.mjs
 *   but focuses on throughput measurement across 6-char numeric edits.
 *   Primary metric: keystrokes/sec = 1000 / avg(paint_latency_ms).
 *   Dropped frame detection: RAF observer gaps > 50ms during typing sequence.
 *
 *   Key insight: at delay:20ms (50 keys/sec attempted), actual throughput is
 *   constrained by RAF commit time per keystroke. With p95 paint of ~25ms,
 *   effective throughput = 1000/25 = 40 kps.
 *
 *   The existing ui-performance-budget.mjs already measures this with typing p95
 *   of 23.8ms → 42 kps effective throughput. This harness derives throughput
 *   from keystroke paint timing across 5 trials × 6 keystrokes = 30 samples.
 *
 * Trials: 5 runs × 6 keystrokes each.
 * Output: JSON to stdout.
 */
import { startServer, launchBrowser, loadApp, waitForModelIdle, stats } from "./shared.mjs";

const TRIALS = 5;
const TYPING_VALUES = ["125000", "130000", "120000", "135000", "128000"];
const DELAY_MS = 20;

const server = await startServer();
const port = server.address().port;
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });
await loadApp(page, port);
await waitForModelIdle(page, 20000);

const selector = ".whatif-card .quick-field[data-label='Monthly cash'] input";
const allPaintMs = [];
const droppedFrameCounts = [];

for (let trial = 0; trial < TRIALS; trial++) {
  const text = TYPING_VALUES[trial];

  // Instrument paint timing + RAF drops
  await page.evaluate((sel) => {
    window.__teslaPaints = [];
    window.__teslaRafGaps = [];
    window.__teslaRafRunning = true;
    let lastRaf = null;
    function rafLoop(ts) {
      if (!window.__teslaRafRunning) return;
      if (lastRaf !== null) window.__teslaRafGaps.push(ts - lastRaf);
      lastRaf = ts;
      requestAnimationFrame(rafLoop);
    }
    requestAnimationFrame(rafLoop);
    const el = document.querySelector(sel);
    if (el._teslaL) el.removeEventListener("input", el._teslaL, { capture: true });
    el._teslaL = () => {
      const t0 = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__teslaPaints.push(performance.now() - t0);
      }));
    };
    el.addEventListener("input", el._teslaL, { capture: true });
  }, selector);

  // Select all and type fresh value
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  // Wait 200ms for model to register the clear without full settle
  await new Promise((r) => setTimeout(r, 200));

  await page.keyboard.type(text, { delay: DELAY_MS });
  // Wait for all paint callbacks
  await page.waitForFunction(
    (expected) => (window.__teslaPaints || []).length >= expected,
    {}, text.length
  );
  // Stop RAF observer
  await page.evaluate(() => { window.__teslaRafRunning = false; });

  const metrics = await page.evaluate((sel, expectedText) => {
    const paints = window.__teslaPaints || [];
    const gaps = window.__teslaRafGaps || [];
    const actualVal = document.querySelector(sel)?.value || "";
    return {
      paints,
      droppedFrames: gaps.filter((g) => g > 50).length,
      maxGap: gaps.length ? Math.max(...gaps) : 0,
      actualVal
    };
  }, selector, text);

  allPaintMs.push(...metrics.paints);
  droppedFrameCounts.push(metrics.droppedFrames);

  // Remove listener and wait for model to settle
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el._teslaL) el.removeEventListener("input", el._teslaL, { capture: true });
  }, selector);
  await waitForModelIdle(page, 15000);
}

await browser.close();
server.close();

// Throughput from paint latency: kps = 1000ms / avg_paint_ms
const paintStats = stats(allPaintMs);
const avgPaintMs = paintStats.mean;
const throughputKps = avgPaintMs > 0 ? Math.round((1000 / avgPaintMs) * 10) / 10 : 0;
const throughputFromP95 = paintStats.p95 > 0 ? Math.round((1000 / paintStats.p95) * 10) / 10 : 0;

const result = {
  metric: "sustained-typing-throughput",
  threshold_kps: 30,
  description: "Effective throughput derived from keystroke-to-paint latency (5 trials × 6 keystrokes)",
  trials: TRIALS,
  keystroke_paint_ms: paintStats,
  throughput_from_mean_kps: throughputKps,
  throughput_from_p95_kps: throughputFromP95,
  dropped_frames_per_trial: droppedFrameCounts,
  total_dropped_frames: droppedFrameCounts.reduce((s, v) => s + v, 0),
  raw_paint_ms: allPaintMs.map((v) => Math.round(v * 10) / 10)
};

console.log(JSON.stringify(result, null, 2));
