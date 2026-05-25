/**
 * Tesla perf harness: Memory growth across 1000 edits.
 * Threshold: ≤ 30 MB growth (audit/CLAUDE.md §4).
 * Method: Puppeteer with --enable-precise-memory-info Chrome flag.
 *   1. Sample heap before edits.
 *   2. Run 1000 field edits (alternating values to force re-computation).
 *   3. Force GC via HeapProfiler CDP.
 *   4. Sample heap after GC.
 *   5. Delta = after - before.
 * Trials: 3 runs (each run does 1000 edits).
 * Output: JSON to stdout.
 */
import { startServer, launchBrowser, loadApp, waitForModelIdle } from "./shared.mjs";
import puppeteer from "puppeteer-core";
import { CHROME } from "./shared.mjs";

const TRIALS = 3;
const EDITS_PER_TRIAL = 1000;

const server = await startServer();
const port = server.address().port;

const growthMB = [];

for (let trial = 0; trial < TRIALS; trial++) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--enable-precise-memory-info", "--js-flags=--expose-gc"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 980 });
  await loadApp(page, port);
  await waitForModelIdle(page, 30000);

  const client = await page.target().createCDPSession();

  // Force GC, then sample baseline heap
  await client.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 500));
  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

  const selector = ".whatif-card .quick-field[data-label='Monthly cash'] input";

  // Run 1000 edits: alternate between two values to ensure model recomputes each time
  await page.evaluate(async (sel, edits) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("Monthly cash input not found");
    const setInputValue = (val) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
        .set.call(el, String(val));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    // Run synchronously via rAF batches to avoid stack overflow
    let i = 0;
    await new Promise((resolve) => {
      function batch() {
        const end = Math.min(i + 20, edits);
        for (; i < end; i++) {
          setInputValue(i % 2 === 0 ? 120000 + (i % 50) * 1000 : 130000 + (i % 50) * 1000);
        }
        if (i < edits) requestAnimationFrame(batch);
        else resolve();
      }
      requestAnimationFrame(batch);
    });
  }, selector, EDITS_PER_TRIAL);

  // Wait for final model settle, then force GC
  try { await waitForModelIdle(page, 30000); } catch { /* may timeout */ }
  await new Promise((r) => setTimeout(r, 1000));
  await client.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 500));
  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

  const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);
  growthMB.push(deltaMB);

  await browser.close();
}

server.close();

function stats(arr) {
  if (!arr.length) return { p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (frac) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * frac))];
  return {
    p50: Math.round(p(0.5) * 100) / 100,
    p95: Math.round(p(0.95) * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100
  };
}

const result = {
  metric: "memory-growth-1000-edits",
  threshold_mb: 30,
  description: "JS heap growth (post-GC) across 1000 field edits, alternating values",
  trials: TRIALS,
  edits_per_trial: EDITS_PER_TRIAL,
  growth_mb: stats(growthMB),
  raw_growth_mb: growthMB.map((v) => Math.round(v * 100) / 100)
};

console.log(JSON.stringify(result, null, 2));
