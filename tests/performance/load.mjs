/**
 * Tesla perf harness: Cold load → first interactive paint.
 * Metric: cold FCP/TTI measured via Performance API navigation entry.
 * Threshold: ≤ 1500 ms on Mac Studio M3 Ultra (audit/CLAUDE.md §4).
 * Trials: 7 cold loads (fresh page, cleared cache per trial).
 * Output: JSON to stdout.
 */
import { startServer, launchBrowser, CHROME } from "./shared.mjs";
import { readFile } from "node:fs/promises";

const TRIALS = 7;

function stats(arr) {
  if (!arr.length) return { p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (frac) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * frac))];
  return { p50: p(0.5), p95: p(0.95), min: sorted[0], max: sorted[sorted.length - 1] };
}

const server = await startServer();
const port = server.address().port;

const loadTimes = [];
const inputToPaintTimes = [];
const domContentLoadedTimes = [];

for (let i = 0; i < TRIALS; i++) {
  // Fresh browser per trial = true cold load
  const browser = await (await import("puppeteer-core")).default.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--disk-cache-size=0", "--aggressive-cache-discard"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/index.html?finTestApi=1`, { waitUntil: "networkidle0", timeout: 30000 });

  // dismiss tour
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")]
      .find((b) => /skip|start planning|finish/i.test(b.textContent))?.click();
  });
  await page.waitForSelector(".whatif-card .quick-field[data-label='Monthly cash'] input", { timeout: 15000 });

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    // FCP from paint entries
    const paintEntries = performance.getEntriesByType("paint");
    const fcp = paintEntries.find((e) => e.name === "first-contentful-paint")?.startTime || nav.loadEventEnd;
    // Interactive approximated as loadEventEnd (no LH available)
    const load = nav.loadEventEnd;
    const dcl = nav.domContentLoadedEventEnd;

    // Input-to-paint: synthetic event after load
    return new Promise((resolve) => {
      const el = document.querySelector(".whatif-card .quick-field[data-label='Monthly cash'] input");
      const before = performance.now();
      const orig = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      orig.set.call(el, "125000");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve({ load, dcl, fcp, inputToPaint: performance.now() - before });
      }));
    });
  });

  loadTimes.push(metrics.load);
  inputToPaintTimes.push(metrics.inputToPaint);
  domContentLoadedTimes.push(metrics.dcl);

  await browser.close();
}

server.close();

const result = {
  metric: "cold-load",
  threshold_ms: 1500,
  trials: TRIALS,
  load: stats(loadTimes),
  dcl: stats(domContentLoadedTimes),
  inputToPaint: stats(inputToPaintTimes),
  raw_load_ms: loadTimes.map((v) => Math.round(v * 10) / 10),
  raw_input_to_paint_ms: inputToPaintTimes.map((v) => Math.round(v * 10) / 10)
};

console.log(JSON.stringify(result, null, 2));
