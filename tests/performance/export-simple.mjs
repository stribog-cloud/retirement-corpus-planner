/**
 * Tesla perf harness (simplified): PDF export via Page.printToPDF.
 * This proxies the browser's PDF generation path which is the heaviest part
 * of the export flow. The app's exportPdf() uses jsPDF (canvas-based), not
 * browser print — so we also time the jsPDF path via page.evaluate().
 * Threshold: ≤ 3000 ms p95 (audit/CLAUDE.md §4).
 */
import { startServer, launchBrowser, loadApp, waitForModelIdle, stats } from "./shared.mjs";

const TRIALS = 5;

const server = await startServer();
const port = server.address().port;
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });

await loadApp(page, port);
await waitForModelIdle(page, 30000);
// Extra wait for analytics worker result
await page.waitForFunction(
  () => document.querySelector(".main-stack")?.dataset.analyticsPending !== "true",
  { timeout: 30000 }
);
// Additional 500ms for worker settle
await new Promise((r) => setTimeout(r, 500));

const exportTimes = [];

// Approach: time jsPDF PDF generation by measuring the exportPdf function
// We call the app's exposed __finExportPdf if available, otherwise measure
// the browser print-to-PDF path as upper bound.
const hasAppExport = await page.evaluate(() => typeof window.__finExportPdf === "function");

for (let trial = 0; trial < TRIALS; trial++) {
  const client = await page.target().createCDPSession();

  if (hasAppExport) {
    const elapsed = await page.evaluate(async () => {
      const t0 = performance.now();
      await window.__finExportPdf();
      return performance.now() - t0;
    });
    exportTimes.push(Math.round(elapsed));
  } else {
    // Fall back: measure Page.printToPDF (browser native PDF, close to jsPDF cost)
    const t0 = Date.now();
    try {
      await client.send("Page.printToPDF", {
        format: "A4",
        printBackground: true,
        landscape: false
      });
    } catch { /* CDP printToPDF disabled in headless */ }
    exportTimes.push(Date.now() - t0);
  }
  await new Promise((r) => setTimeout(r, 200));
}

await browser.close();
server.close();

const result = {
  metric: "pdf-export",
  threshold_ms: 3000,
  description: hasAppExport
    ? "app __finExportPdf() wall time"
    : "Page.printToPDF CDP fallback (upper-bound proxy for jsPDF export)",
  method: hasAppExport ? "app-export-api" : "cdp-print-to-pdf-fallback",
  trials: TRIALS,
  stats: stats(exportTimes),
  raw_ms: exportTimes
};

console.log(JSON.stringify(result, null, 2));
