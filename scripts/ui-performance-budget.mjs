import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer-core";
import { CHROME as chrome } from "../tests/e2e/_browser-helper.mjs";

const root = process.cwd();
const rawBudget = 2_800_000;
const gzipBudget = 900_000;
const inputToPaintBudget = 180;
const loadBudget = 2500;
const olderPhoneInputToPaintBudget = 420;
const olderPhoneLoadBudget = 5000;
const desktopTypingP95Budget = 80;
const desktopTypingMaxBudget = 120;
const desktopModelSettleBudget = 450;
const desktopLongTaskBudget = 50;
const olderPhoneTypingP95Budget = 180;
const olderPhoneTypingMaxBudget = 250;
const olderPhoneModelSettleBudget = 900;
const olderPhoneLongTaskBudget = 150;
const mime = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = join(root, pathname.replace(/^\/+/, ""));
      const body = await readFile(file);
      response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch (error) {
      response.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
      response.end("Not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function realTypingAudit(page, selector, text) {
  await page.evaluate((inputSelector) => {
    window.__finTypingPaints = [];
    window.__finLongTasks = [];
    window.__finLongTaskObserver?.disconnect?.();
    try {
      window.__finLongTaskObserver = new PerformanceObserver((list) => {
        window.__finLongTasks.push(...list.getEntries().map((entry) => entry.duration));
      });
      window.__finLongTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch (error) {
      window.__finLongTaskObserver = null;
    }
    const element = document.querySelector(inputSelector);
    element.addEventListener("input", () => {
      const started = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__finTypingPaints.push(performance.now() - started);
      }));
    }, { capture: true });
  }, selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 20 });
  await page.waitForFunction((expected) => (window.__finTypingPaints || []).length >= expected, {}, text.length);
  const modelStarted = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await page.waitForFunction(() => !document.querySelector(".main-stack")?.classList.contains("model-pending"), { timeout: Math.max(desktopModelSettleBudget, olderPhoneModelSettleBudget) + 1500 });
  const modelSettle = Date.now() - modelStarted;
  await new Promise((resolve) => setTimeout(resolve, 650));
  await page.waitForFunction((expected) => document.querySelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input")?.value === expected, {}, text);
  return page.evaluate((expected) => {
    const paints = [...(window.__finTypingPaints || [])].sort((a, b) => a - b);
    const longTasks = window.__finLongTasks || [];
    const percentile = (values, p) => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] : 0;
    return {
      value: document.querySelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input")?.value || "",
      expected,
      count: paints.length,
      p95: percentile(paints, 0.95),
      max: paints[paints.length - 1] || 0,
      longTaskMax: longTasks.length ? Math.max(...longTasks) : 0,
      longTaskCount: longTasks.length
    };
  }, text).then((audit) => ({ ...audit, modelSettle }));
}

const artifact = await readFile("index.html");
const artifactInfo = await stat("index.html");
const gzipBytes = gzipSync(artifact).byteLength;
assert(artifactInfo.size <= rawBudget, `index.html raw size ${artifactInfo.size} exceeds ${rawBudget}`);
assert(gzipBytes <= gzipBudget, `index.html gzip size ${gzipBytes} exceeds ${gzipBudget}`);

const server = await startServer();
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();

try {
  await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  // R4.5b: dismiss the DisclaimerNotice modal (renamed from PrivacyConsentNotice)
  // before tour dismissal so the input is interactable for the typing audit.
  await page.evaluate(() => {
    const disclaimer = document.querySelector(".disclaimer-notice-card");
    if (!disclaimer) return;
    const btn = [...disclaimer.querySelectorAll("button")].find((b) => /understand|acknowledge|accept|continue/i.test(b.textContent));
    btn?.click();
  });
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")].find((button) => /skip|start planning|finish/i.test(button.textContent))?.click();
  });
  await page.waitForSelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input", { timeout: 10000 });

  const audit = await page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0];
    const element = document.querySelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input");
    const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const started = performance.now();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, "125000");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await nextPaint();
    const inputToPaint = performance.now() - started;
    const layoutShift = performance.getEntriesByType("layout-shift").reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : entry.value), 0);
    return {
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      inputToPaint,
      layoutShift,
      value: element.value
    };
  });

  assert(audit.load <= loadBudget, `load ${audit.load.toFixed(1)}ms exceeds ${loadBudget}ms`);
  assert(audit.inputToPaint <= inputToPaintBudget, `input-to-paint ${audit.inputToPaint.toFixed(1)}ms exceeds ${inputToPaintBudget}ms`);
  assert(audit.layoutShift <= 0.05, `layout shift ${audit.layoutShift.toFixed(3)} exceeds 0.05`);
  assert(audit.value === "125000", "input value did not paint immediately");
  const typingAudit = await realTypingAudit(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", "125000");
  assert(typingAudit.value === "125000", `real typing value mismatch: ${typingAudit.value}`);
  assert(typingAudit.p95 <= desktopTypingP95Budget, `desktop typing p95 ${typingAudit.p95.toFixed(1)}ms exceeds ${desktopTypingP95Budget}ms`);
  assert(typingAudit.max <= desktopTypingMaxBudget, `desktop typing max ${typingAudit.max.toFixed(1)}ms exceeds ${desktopTypingMaxBudget}ms`);
  assert(typingAudit.modelSettle <= desktopModelSettleBudget, `desktop model settle ${typingAudit.modelSettle.toFixed(1)}ms exceeds ${desktopModelSettleBudget}ms`);
  assert(typingAudit.longTaskMax <= desktopLongTaskBudget, `desktop long task ${typingAudit.longTaskMax.toFixed(1)}ms exceeds ${desktopLongTaskBudget}ms during typing`);
  const client = await page.target().createCDPSession();
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  await page.goto(`http://127.0.0.1:${port}/index.html?finTestApi=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const disclaimer = document.querySelector(".disclaimer-notice-card");
    if (!disclaimer) return;
    const btn = [...disclaimer.querySelectorAll("button")].find((b) => /understand|acknowledge|accept|continue/i.test(b.textContent));
    btn?.click();
  });
  await page.waitForSelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input", { timeout: 10000 });
  const olderPhoneAudit = await page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0];
    const element = document.querySelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input");
    const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const started = performance.now();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, "135000");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await nextPaint();
    return {
      load: nav.loadEventEnd,
      inputToPaint: performance.now() - started,
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
      value: element.value
    };
  });
  assert(olderPhoneAudit.load <= olderPhoneLoadBudget, `older-phone load ${olderPhoneAudit.load.toFixed(1)}ms exceeds ${olderPhoneLoadBudget}ms`);
  assert(olderPhoneAudit.inputToPaint <= olderPhoneInputToPaintBudget, `older-phone input-to-paint ${olderPhoneAudit.inputToPaint.toFixed(1)}ms exceeds ${olderPhoneInputToPaintBudget}ms`);
  assert(olderPhoneAudit.scrollWidth <= olderPhoneAudit.width + 1, `older-phone horizontal overflow ${olderPhoneAudit.scrollWidth} > ${olderPhoneAudit.width}`);
  assert(olderPhoneAudit.value === "135000", "older-phone input value did not paint immediately");
  const olderPhoneTypingAudit = await realTypingAudit(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", "135000");
  assert(olderPhoneTypingAudit.value === "135000", `older-phone real typing value mismatch: ${olderPhoneTypingAudit.value}`);
  assert(olderPhoneTypingAudit.p95 <= olderPhoneTypingP95Budget, `older-phone typing p95 ${olderPhoneTypingAudit.p95.toFixed(1)}ms exceeds ${olderPhoneTypingP95Budget}ms`);
  assert(olderPhoneTypingAudit.max <= olderPhoneTypingMaxBudget, `older-phone typing max ${olderPhoneTypingAudit.max.toFixed(1)}ms exceeds ${olderPhoneTypingMaxBudget}ms`);
  assert(olderPhoneTypingAudit.modelSettle <= olderPhoneModelSettleBudget, `older-phone model settle ${olderPhoneTypingAudit.modelSettle.toFixed(1)}ms exceeds ${olderPhoneModelSettleBudget}ms`);
  assert(olderPhoneTypingAudit.longTaskMax <= olderPhoneLongTaskBudget, `older-phone long task ${olderPhoneTypingAudit.longTaskMax.toFixed(1)}ms exceeds ${olderPhoneLongTaskBudget}ms during typing`);
  console.log(JSON.stringify({
    ok: true,
    checked: "ui-performance",
    rawBytes: artifactInfo.size,
    gzipBytes,
    inputToPaintMs: Number(audit.inputToPaint.toFixed(1)),
    loadMs: Number(audit.load.toFixed(1)),
    layoutShift: Number(audit.layoutShift.toFixed(3)),
    typing: {
      p95Ms: Number(typingAudit.p95.toFixed(1)),
      maxMs: Number(typingAudit.max.toFixed(1)),
      modelSettleMs: Number(typingAudit.modelSettle.toFixed(1)),
      longTaskMaxMs: Number(typingAudit.longTaskMax.toFixed(1))
    },
    olderPhone: {
      cpuThrottle: "4x",
      width: olderPhoneAudit.width,
      loadMs: Number(olderPhoneAudit.load.toFixed(1)),
      inputToPaintMs: Number(olderPhoneAudit.inputToPaint.toFixed(1)),
      typingP95Ms: Number(olderPhoneTypingAudit.p95.toFixed(1)),
      typingMaxMs: Number(olderPhoneTypingAudit.max.toFixed(1)),
      modelSettleMs: Number(olderPhoneTypingAudit.modelSettle.toFixed(1)),
      longTaskMaxMs: Number(olderPhoneTypingAudit.longTaskMax.toFixed(1))
    }
  }, null, 2));
} finally {
  await browser.close();
  server.close();
}
