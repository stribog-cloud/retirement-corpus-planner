/**
 * Shared utilities for Tesla performance harnesses.
 * audit/round-3/09-performance-audit.md — Phase A baseline.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import puppeteer from "puppeteer-core";
import { CHROME } from "../e2e/_browser-helper.mjs";

export { CHROME };
export const ROOT = process.cwd();

const mime = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

export function startServer() {
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

export async function launchBrowser(opts = {}) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", ...(opts.extraArgs || [])]
  });
}

export async function loadApp(page, port, opts = {}) {
  const qs = opts.testApi !== false ? "?finTestApi=1" : "";
  await page.goto(`http://127.0.0.1:${port}/index.html${qs}`, { waitUntil: "networkidle0", timeout: 30000 });
  // dismiss tour if present
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")]
      .find((b) => /skip|start planning|finish/i.test(b.textContent))?.click();
  });
  await page.waitForSelector(".whatif-card .quick-field[data-label='Monthly cash'] input", { timeout: 15000 });
}

export async function waitForModelIdle(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const stack = document.querySelector(".main-stack");
    return stack && !stack.classList.contains("model-pending") && stack.dataset.analyticsPending !== "true";
  }, { timeout });
}

export function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

export function stats(arr) {
  if (!arr.length) return { p50: 0, p95: 0, min: 0, max: 0, mean: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean * 10) / 10
  };
}
