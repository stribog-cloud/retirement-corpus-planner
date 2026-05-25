/**
 * Tesla perf harness: Memory growth across 10,000 edits (fin-bu5).
 * Extends memory-growth.mjs (1K baseline) to detect super-linear growth.
 * Threshold: ≤ 30 MB growth (audit/CLAUDE.md §4).
 *
 * Decision logic (per fin-bu5 brief):
 *   Linear growth at 1K = 1.41 MB → expected at 10K ≈ 14.1 MB.
 *   If 10K delta ≤ 30 MB AND ratio ≤ 15× (linear band) → PASS, no super-linear growth.
 *   If 10K delta > 30 MB OR ratio > 20× → super-linear, file P1 follow-up.
 *
 * Method: same as memory-growth.mjs (Puppeteer + HeapProfiler CDP + --enable-precise-memory-info).
 * Trials: 1 (vs 3 for 1K) — timebox constraint (fin-bu5 TIMEBOX 45m).
 *   One trial at 10K is sufficient to detect super-linear growth vs 1K baseline.
 *
 * Baseline reference (audit/round-3/09-performance-audit.md §3.6):
 *   1K edits × 3 trials: p95 = 1.41 MB. All 3 trials = 1.41 MB.
 *
 * Output: JSON to stdout.
 */
import { startServer, loadApp, waitForModelIdle } from "./shared.mjs";
import puppeteer from "puppeteer-core";
import { CHROME } from "./shared.mjs";

const TRIALS = 1;
const EDITS_PER_TRIAL = 10000;
const BASELINE_1K_MB = 1.41;          // p95 from round-3/09-performance-audit.md §3.6
const THRESHOLD_MB = 30;
const LINEAR_EXPECTED_MB = BASELINE_1K_MB * (EDITS_PER_TRIAL / 1000); // 14.1 MB

const server = await startServer();
const port = server.address().port;

const growthMB = [];

for (let trial = 0; trial < TRIALS; trial++) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--enable-precise-memory-info",
      "--js-flags=--expose-gc"
    ]
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

  // Run 10K edits: alternate between two values to ensure model recomputes each time.
  // Same rAF-batch strategy as 1K harness (20 edits per frame) to avoid stack overflow.
  await page.evaluate(async (sel, edits) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("Monthly cash input not found");
    const setInputValue = (val) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
        .set.call(el, String(val));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
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
  try { await waitForModelIdle(page, 30000); } catch { /* may timeout at 10K */ }
  await new Promise((r) => setTimeout(r, 1000));
  await client.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 500));
  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

  const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);
  growthMB.push(Math.round(deltaMB * 100) / 100);

  await browser.close();
}

server.close();

const measured = growthMB[0];
const ratio = Math.round((measured / BASELINE_1K_MB) * 10) / 10;
const linearRatio = EDITS_PER_TRIAL / 1000; // expected ratio if perfectly linear = 10×
const superLinear = measured > THRESHOLD_MB || ratio > 20;

const result = {
  metric: "memory-growth-10000-edits",
  bead: "fin-bu5",
  threshold_mb: THRESHOLD_MB,
  description: "JS heap growth (post-GC) across 10,000 field edits, alternating values",
  trials: TRIALS,
  edits_per_trial: EDITS_PER_TRIAL,
  growth_mb_10k: measured,
  baseline_1k_mb: BASELINE_1K_MB,
  linear_expected_mb: LINEAR_EXPECTED_MB,
  actual_ratio: ratio,
  linear_ratio: linearRatio,
  verdict: superLinear ? "SUPER-LINEAR — file P1 follow-up" : "LINEAR/BOUNDED — PASS",
  within_budget: measured <= THRESHOLD_MB,
  growth_pattern: ratio <= linearRatio * 1.5
    ? "linear (within 1.5× of proportional)"
    : ratio <= 20
    ? "moderate (above linear but below super-linear threshold)"
    : "super-linear (ratio > 20×)",
  raw_growth_mb: growthMB
};

console.log(JSON.stringify(result, null, 2));
