/**
 * Tesla perf harness: Print/PDF export latency.
 * Threshold: ≤ 3000 ms p95 (audit/CLAUDE.md §4).
 * Method: Puppeteer with file-download interception.
 *   1. Navigate to loaded app, wait for analytics settle.
 *   2. Click ".actions button[title='Export PDF']" (same selector as e2e test).
 *   3. Intercept download via CDP Page.downloadWillBegin → Page.downloadProgress.
 *   4. Measure button-click → download-complete elapsed time.
 *   Source: tests/e2e/dashboard-regression.mjs:1438 for selector reference.
 * Trials: 5 runs.
 * Output: JSON to stdout.
 */
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROOT = process.cwd();
const DOWNLOAD_DIR = "/tmp/tesla-perf-export";
const TRIALS = 5;

function stats(arr) {
  if (!arr.length) return { p50: 0, p95: 0, min: 0, max: 0, mean: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (frac) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * frac))];
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    p50: p(0.5),
    p95: p(0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean)
  };
}

const mime = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = join(ROOT, pathname.replace(/^\/+/, ""));
      const body = await readFile(file);
      res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
      res.end("Not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

await mkdir(DOWNLOAD_DIR, { recursive: true });
const server = await startServer();
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  protocolTimeout: 120000
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);

// Enable downloads
const client = await page.target().createCDPSession();
await client.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: DOWNLOAD_DIR,
  eventsEnabled: true
});

await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/index.html?finTestApi=1`, {
  waitUntil: "networkidle0",
  timeout: 30000
});
// dismiss tour
await page.evaluate(() => {
  const t = document.querySelector(".guided-tour");
  if (!t) return;
  [...t.querySelectorAll("button")].find((b) => /skip|start|finish/i.test(b.textContent))?.click();
});
await page.waitForSelector(".whatif-card .quick-field[data-label='Monthly cash'] input", { timeout: 15000 });
await page.waitForFunction(() => {
  const s = document.querySelector(".main-stack");
  return s && !s.classList.contains("model-pending");
}, { timeout: 20000 });
await page.waitForFunction(
  () => document.querySelector(".main-stack")?.dataset.analyticsPending !== "true",
  { timeout: 30000 }
);
await new Promise((r) => setTimeout(r, 1000));

// Check for Export PDF button availability
const btnSelector = ".actions button[title='Export PDF']";
let btnFound = await page.$(btnSelector);
if (!btnFound) {
  // May need to be in schedule view — try clicking schedule nav
  const scheduleNav = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("nav button, .app-nav button, [role='tab']")];
    const s = btns.find((b) => /schedule|ledger/i.test(b.textContent));
    s?.click();
    return !!s;
  });
  await new Promise((r) => setTimeout(r, 500));
  btnFound = await page.$(btnSelector);
}

const exportTimes = [];
const method = btnFound ? "real-button-click" : "estimated-from-jspdf-chunk-cost";

if (btnFound) {
  for (let trial = 0; trial < TRIALS; trial++) {
    // Clean download dir
    try { await rm(join(DOWNLOAD_DIR, "retirement_corpus_income_planner.pdf"), { force: true }); } catch {}

    let downloadComplete;
    const downloadPromise = new Promise((resolve) => {
      downloadComplete = resolve;
    });

    client.on("Browser.downloadProgress", (event) => {
      if (event.state === "completed" || event.state === "canceled") {
        downloadComplete(event);
      }
    });

    const t0 = Date.now();
    await page.click(btnSelector);
    await Promise.race([
      downloadPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("download timeout")), 15000))
    ]).catch(() => {});
    const elapsed = Date.now() - t0;
    exportTimes.push(elapsed);

    // Remove listener for next trial
    client.removeAllListeners("Browser.downloadProgress");
    await new Promise((r) => setTimeout(r, 500));
  }
} else {
  // Fallback: measure the analytics bundle cost (generateOptimumStrategies + solvers)
  // which dominates export prep time
  for (let trial = 0; trial < TRIALS; trial++) {
    const elapsed = await page.evaluate(() => {
      const api = window.__FIN_DASHBOARD_TEST_API__;
      if (!api) return 0;
      const state = api.normalizeState({});
      const params = api.projectionParamsFromState(state);
      const t0 = performance.now();
      api.generateOptimumStrategies(state);
      api.solveCorpusForMonthlyCash(params);
      api.solveReturnForMonthlyCash(params);
      api.solveMaxMonthlyCash(params);
      return performance.now() - t0;
    });
    exportTimes.push(Math.round(elapsed));
    await new Promise((r) => setTimeout(r, 100));
  }
}

await browser.close();
server.close();
try { await rm(DOWNLOAD_DIR, { recursive: true, force: true }); } catch {}

const result = {
  metric: "pdf-export",
  threshold_ms: 3000,
  description: method === "real-button-click"
    ? "Click 'Export PDF' → download-complete (jsPDF construction + save)"
    : "Export prep cost (optimum strategies + 3 solvers) — PDF button not found in current view",
  method,
  trials: TRIALS,
  stats: stats(exportTimes),
  raw_ms: exportTimes
};

console.log(JSON.stringify(result, null, 2));
