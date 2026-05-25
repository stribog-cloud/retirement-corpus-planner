import { createServer } from "node:http";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { withBrowser } from "./_browser-helper.mjs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const root = process.cwd();
const chrome = (process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const mime = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// CI runners (Ubuntu 2-vCPU) are ~1.5–2x slower than the macOS dev
// baseline these thresholds were calibrated on. Apply a headroom
// multiplier under CI so genuine performance regressions still fail
// (a 3x regression still trips the budget) without false positives
// from raw runner-speed delta.
const ciSlow = (ms) => (process.env.CI ? Math.ceil(ms * 1.8) : ms);

/**
 * displayProbability — mirrors the R4.9.5b 5pp-bucket rule from
 * src/probability-display.js so the oracle computes the same bucketed
 * string the UI renders. The oracle's independent data flow is unchanged;
 * only the display formatting aligns to the product rule.
 * Beads: fin-79d (R4.9.5e oracle-alignment)
 */
function displayProbability(p) {
  const safeP = typeof p === "number" && Number.isFinite(p) ? p : 0;
  if (safeP < 0.05) return "rare (under 5%)";
  if (safeP > 0.95) return "very likely (over 95%)";
  return `${Math.round(Math.round(safeP * 20) / 20 * 100)}%`;
}

async function waitForModelIdle(page, timeout = 60000, { includeSlow = true } = {}) {
  // R4.3 fin-c96.7: also wait for slow tier (MC + optimum) via data-analytics-slow-pending.
  // R4.2.5b fast-tier clears data-analytics-pending in ~142ms; slow tier follows at ~500ms.
  // Surfaces that read mc.successProbability or optimum.strategies require both tiers settled.
  // R4.9.5c: pass includeSlow: false for paint-latency audits and render-presence checks
  // that don't assert MC values — at N=1000 (R4.9.5a default) headless Chrome's Worker is
  // structurally slower than production Chrome (production settle ~3.9s per Hilbert
  // R4.9.5b watchlist; headless can exceed test budgets).
  // CI: Ubuntu 2-vCPU runners can take 60-90s for slow-tier MC convergence after
  // a multi-input household-plan edit sequence — bump the slow-tier ceiling so
  // legitimate convergence still has room while fast-tier waits stay strict.
  const effectiveTimeout = (process.env.CI && includeSlow && timeout < 120000)
    ? 120000
    : timeout;
  await page.waitForFunction((checkSlow) => {
    const stack = document.querySelector(".main-stack");
    if (!stack) return false;
    if (stack.classList.contains("model-pending")) return false;
    if (stack.dataset.analyticsPending === "true") return false;
    if (checkSlow && stack.dataset.analyticsSlowPending === "true") return false;
    return true;
  }, { timeout: effectiveTimeout }, includeSlow);
}

async function dismissTour(page) {
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    const button = [...tour.querySelectorAll("button")].find((item) => /skip|finish|start planning/i.test(item.textContent));
    button?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html?finTestApi=1" : url.pathname;
      const file = join(root, pathname.replace(/^\/+/, ""));
      const body = await readFile(file);
      response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch (error) {
      response.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
      response.end("Not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function setInput(page, selector, value, { includeSlow = false } = {}) {
  // R4.9.5i perf: default includeSlow=false. Each setInput resets the slow-tier
  // MC (mc.simulations=0 → data-analytics-slow-pending=true), and SWP-mode MC at
  // N=1000 takes ~4s to settle. Waiting after every setInput compounds to
  // 120s+ across the test. Slow-tier values are only read by
  // captureProjectionSurface — which now waits for slow internally — and by
  // explicit slow waits at sites that read mc.successProbability from the DOM.
  // Fast-tier wait still happens so subsequent UI reads see updated state.
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.$eval(selector, (el, nextValue) => {
    el.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, String(nextValue));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
	  }, value);
  await new Promise((resolve) => setTimeout(resolve, 600));
	  await waitForModelIdle(page, 60000, { includeSlow });
}

async function setSelect(page, selector, value, { includeSlow = false } = {}) {
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.$eval(selector, (el, nextValue) => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(el, String(nextValue));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
	  }, value);
  await new Promise((resolve) => setTimeout(resolve, 600));
	  await waitForModelIdle(page, 60000, { includeSlow });
}

async function text(page, selector) {
  return page.$eval(selector, (el) => el.textContent.trim().replace(/\s+/g, " "));
}

async function captureProjectionSurface(page) {
  // R4.9.5i perf: setInput/setSelect now skip slow tier. captureProjectionSurface
  // reads endTargetChance/successProbability which require slow-tier MC settled.
  // Wait here so caller doesn't need to.
  await waitForModelIdle(page, 60000, { includeSlow: true });
  return page.evaluate(() => {
    const byCardTitle = (selector, title, valueSelector) => {
      const card = [...document.querySelectorAll(selector)].find((item) => item.innerText.toLowerCase().includes(title.toLowerCase()));
      return card?.querySelector(valueSelector)?.textContent.trim() || "";
    };
    const stat = (title) => byCardTitle(".kpi-strip .stat-card", title, ".stat-value");
    const gauge = (title) => byCardTitle(".ratio-strip .gauge-card", title, "strong");
    const statement = (title) => {
      const row = [...document.querySelectorAll(".insights-column .statement-row")].find((item) => item.innerText.toLowerCase().includes(title.toLowerCase()));
      return row?.querySelector("strong")?.textContent.trim() || "";
    };
    const mini = (title) => {
      const item = [...document.querySelectorAll(".whatif-card .mini-metric")].find((node) => node.innerText.toLowerCase().includes(title.toLowerCase()));
      return item?.querySelector("strong")?.textContent.trim() || "";
    };
    const chart = document.querySelector(".chart-pair canvas") || document.querySelector("canvas");
    return {
      mode: document.querySelector(".whatif-card .quick-field[data-label=\"Mode\"] select")?.value || "",
      note: document.querySelector(".cash-mode-note")?.innerText.replace(/\s+/g, " ").trim() || "",
      finalCorpus: stat("Final Corpus"),
      cashWithdrawn: stat("Cash Withdrawn"),
      realFinalValue: stat("Real Final Value"),
      finalMonthlyCash: stat("Final Monthly Cash"),
      // R4.9.5b-1 (fin-c0g): ratio-strip reordered to Income Cover → Plan
      // Endurance → Target Confidence. "Corpus Goal" and "Cash Goal" gauges
      // were removed (those values now live exclusively in the right-rail
      // StatementRow). "End Target Chance" gauge was renamed to "Target
      // Confidence" (same successProbability value). Read the rail values
      // for corpus/cash and the renamed gauge for end chance.
      corpusGoal: statement("Corpus Goal"),
      cashGoal: statement("Cash Goal"),
      endTargetChance: statement("End Chance"),
      railCorpusGoal: statement("Corpus Goal"),
      railCashGoal: statement("Cash Goal"),
      railEndChance: statement("End Chance"),
      filterHorizon: [...document.querySelectorAll(".filter-grid div")].find((item) => item.innerText.toLowerCase().includes("horizon"))?.querySelector("strong")?.textContent.trim() || "",
      corpusNeeded: mini("Corpus Needed"),
      returnNeeded: mini("Return Needed"),
      maxMonthlyCash: mini("Max Monthly Cash"),
      chartFingerprint: chart ? chart.toDataURL("image/png").slice(-160) : ""
    };
  });
}

async function captureExpectedProjectionSurface(page) {
  await new Promise((resolve) => setTimeout(resolve, 320));
  return page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    // R4.9.5e: mirror the 5pp-bucket display rule from src/probability-display.js.
    // Runs inside browser context so must be self-contained.
    const displayProb = (p) => {
      const sp = typeof p === "number" && Number.isFinite(p) ? p : 0;
      if (sp < 0.05) return "rare (under 5%)";
      if (sp > 0.95) return "very likely (over 95%)";
      return `${Math.round(Math.round(sp * 20) / 20 * 100)}%`;
    };
    const persisted = JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {};
    const state = api.normalizeState(persisted);
    const params = api.projectionParamsFromState(state);
    const model = api.calculate(params);
    const risk = api.calculateMonteCarlo(params, state.monteCarloSamples);
    const household = api.householdPlanProfile(state);
    const horizon = Math.max(1, Math.round(Number(params.years) || 0));
    const inflationFactor = Math.pow(1 + (Number(params.inflation) || 0) / 100, horizon);
    const targetAnnual = api.targetAnnualCashForYear(params, horizon, inflationFactor);
    const targetReal = Math.max(1, household.useHouseholdPlan ? household.targetCorpusToday : Number(state.targetCorpus) || 0);
    const clampRatio = (value) => Math.min(Math.max(value, 0), 9.99);
    return {
      finalCorpus: api.formatInr(model.final.closing),
      cashWithdrawn: api.formatInr(model.final.cumWithdrawals),
      realFinalValue: api.formatInr(model.final.realClosing),
      finalMonthlyCash: api.formatInr(model.final.withdrawal / 12),
      corpusGoal: `${Math.round(clampRatio(model.final.realClosing / targetReal) * 100)}%`,
      cashGoal: `${Math.round(clampRatio(targetAnnual > 0 ? model.final.withdrawal / targetAnnual : 1) * 100)}%`,
      endTargetChance: displayProb(risk.successProbability),
      filterHorizon: `${horizon} Years`,
      effectiveMonthlyCash: params.monthlyTarget,
      targetAnnual,
      taxDrag: api.formatInr(model.final.cumTax),
      fingerprint: api.planFingerprint(state, api.taxLawFromState(state)),
      finalRaw: model.final.closing,
      cashRaw: model.final.cumWithdrawals,
      realRaw: model.final.realClosing,
      finalMonthlyRaw: model.final.withdrawal / 12
    };
  });
}

function assertSurfaceParity(actual, expected, label) {
  for (const key of ["finalCorpus", "cashWithdrawn", "realFinalValue", "finalMonthlyCash", "corpusGoal", "cashGoal", "endTargetChance", "filterHorizon"]) {
    assert(actual[key] === expected[key], `${label}: ${key} UI/model mismatch ${JSON.stringify({ actual, expected })}`);
  }
  assert(actual.corpusGoal === actual.railCorpusGoal, `${label}: corpus goal gauge/right-rail mismatch ${JSON.stringify(actual)}`);
  assert(actual.cashGoal === actual.railCashGoal, `${label}: cash goal gauge/right-rail mismatch ${JSON.stringify(actual)}`);
  assert(actual.endTargetChance === actual.railEndChance, `${label}: end chance gauge/right-rail mismatch ${JSON.stringify(actual)}`);
}

async function openView(page, view) {
  await page.evaluate(() => document.querySelector(".drawer-backdrop.open .close-button")?.click());
  await new Promise((resolve) => setTimeout(resolve, 60));
  const selector = await page.evaluate((nextView) => {
    const tabbar = document.querySelector(`.mobile-tabbar button[data-view="${nextView}"]`);
    const sideNav = document.querySelector(`.nav-list button[data-view="${nextView}"]`);
    const isVisible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 4 && rect.height > 4;
    };
    return isVisible(tabbar) ? `.mobile-tabbar button[data-view="${nextView}"]` : `.nav-list button[data-view="${nextView}"]`;
  }, view);
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.click(selector);
  await page.waitForFunction((nextView) => document.querySelector(".main-stack")?.dataset.activeView === nextView, {}, view);
  await new Promise((resolve) => setTimeout(resolve, 160));
}

async function openAssumptionStudio(page) {
  await page.evaluate(() => document.querySelector(".drawer-backdrop.open .close-button")?.click());
  await new Promise((resolve) => setTimeout(resolve, 60));
  await page.click(".studio-button");
  await page.waitForSelector(".assumption-drawer", { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

function percentFrom(textValue) {
  const match = textValue.match(/(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : NaN;
}

async function waitForFile(path, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const info = await stat(path);
      if (info.size > 1000) return info;
    } catch (error) {}
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function extractPdfText(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || "").join(" "));
  }
  return pages.join("\n");
}

async function interactionLatencyAudit(page) {
  return page.evaluate(async () => {
    const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const closeDrawer = () => {
      document.querySelector(".drawer-backdrop.open .close-button")?.click();
    };
    const measure = async (label, selector, verify, cleanup = () => {}) => {
      const element = document.querySelector(selector);
      if (!element) return { label, ok: false, missing: true, ms: Number.POSITIVE_INFINITY };
      const started = performance.now();
      element.click();
      await nextPaint();
      const ms = performance.now() - started;
      const ok = Boolean(verify());
      cleanup();
      await nextPaint();
      return { label, ok, ms: Number(ms.toFixed(1)) };
    };

    return [
      await measure(
        "help drawer",
        ".actions button[title=\"Open help\"]",
        () => document.querySelector(".drawer-backdrop.open .help-drawer"),
        closeDrawer
      ),
      await measure(
        "model drawer",
        ".actions button[title=\"Open assumptions\"]",
        () => document.querySelector(".drawer-backdrop.open .assumption-drawer"),
        closeDrawer
      ),
      await measure(
        "planner view",
        ".nav-list button[data-view=\"planner\"]",
        () => document.querySelector(".main-stack")?.dataset.activeView === "planner"
      ),
      await measure(
        "guided planner choice",
        ".choice-group[data-label=\"Risk comfort\"] button:nth-child(3)",
        () => document.querySelector(".choice-group[data-label=\"Risk comfort\"] button:nth-child(3)")?.classList.contains("active")
      )
    ];
  });
}

async function inputLatencyAudit(page) {
  return page.evaluate(async () => {
    const element = document.querySelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input");
    if (!element) return { label: "monthly cash input", ok: false, missing: true, ms: Number.POSITIVE_INFINITY };
    const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const started = performance.now();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, "125000");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await nextPaint();
    return {
      label: "monthly cash input",
      ok: element.value === "125000",
      ms: Number((performance.now() - started).toFixed(1))
    };
  });
}

async function sustainedTypingAudit(page) {
  const selector = ".whatif-card .quick-field[data-label=\"Monthly cash\"] input";
  // Paint-latency audit doesn't read MC values; skip slow-tier wait per R4.9.5c
  await waitForModelIdle(page, 12000, { includeSlow: false });
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.click(selector);
  await page.keyboard.down("Meta");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Meta");
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.$eval(selector, (el) => {
    if (el.value !== "") {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const started = Date.now();
  await page.keyboard.type("125000", { delay: 18 });
  const typedMs = Date.now() - started;
  const visibleDuringTyping = await page.$eval(selector, (el) => el.value);
  await page.keyboard.press("Tab");
  // Post-typing wait — slow MC at N=1000 may exceed test budget in headless;
  // syncedValue assertion reads input.value only, not MC fields
  await waitForModelIdle(page, 12000, { includeSlow: false });
  const syncedValue = await page.$eval(selector, (el) => el.value);
  return {
    label: "sustained monthly cash typing",
    ok: visibleDuringTyping === "125000" && syncedValue === "125000",
    visibleDuringTyping,
    syncedValue,
    ms: typedMs
  };
}

async function plannerTileLatencyAudit(page) {
  // Wait for the optimizer-generated strategy cards (positions 2-3) to
  // render. On slower CI runners (Ubuntu 2-vCPU), waitForModelIdle
  // returns before the optimizer's secondary render pass finishes
  // regenerating cards 2 and 3 after value changes — leading the audit
  // to find only cards 1 and 4 and report cards 2/3 as missing.
  try {
    await page.waitForFunction(
      () => document.querySelectorAll(".strategy-card").length >= 4,
      { timeout: 5000 }
    );
  } catch {
    // Fall through — existing audit logic will report missing cards
    // with its descriptive error message if they genuinely never render.
  }
  return page.evaluate(async () => {
    const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const measure = async (label, selector, verify) => {
      const element = document.querySelector(selector);
      if (!element) return { label, ok: false, missing: true, ms: Number.POSITIVE_INFINITY };
      const started = performance.now();
      element.click();
      await nextPaint();
      return { label, ok: Boolean(verify()), ms: Number((performance.now() - started).toFixed(1)) };
    };
    return [
      await measure(
        "strategy card 2",
        ".strategy-card:nth-child(2) .strategy-actions button:last-child",
        () => document.querySelector(".strategy-card:nth-child(2)")?.classList.contains("selected-now")
          || document.querySelector(".filter-grid strong")?.textContent.includes("Custom Plan")
      ),
      await measure(
        "strategy card 3",
        ".strategy-card:nth-child(3) .strategy-actions button:last-child",
        () => document.querySelector(".strategy-card:nth-child(3)")?.classList.contains("selected-now")
          || document.querySelector(".filter-grid strong")?.textContent.includes("Custom Plan")
      ),
      await measure(
        "cash reserve choice",
        ".choice-group[data-label=\"Cash reserve\"] button:nth-child(3)",
        () => document.querySelector(".choice-group[data-label=\"Cash reserve\"] button:nth-child(3)")?.classList.contains("active")
      )
    ];
  });
}

async function modelSettleLatencyAudit(page) {
  const pollBudget = process.env.CI ? 2200 : 1200;
  return page.evaluate(async (pollMs) => {
    const element = document.querySelector(".whatif-card .quick-field[data-label=\"Monthly cash\"] input");
    const pending = document.querySelector(".main-stack");
    if (!element || !pending) return { label: "model settle after change", ok: false, missing: true, ms: Number.POSITIVE_INFINITY };
    const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const started = performance.now();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, "135000");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await nextPaint();
    while (pending.classList.contains("model-pending") && performance.now() - started < pollMs) {
      await nextPaint();
    }
    const ms = performance.now() - started;
    return {
      label: "model settle after change",
      ok: !pending.classList.contains("model-pending") && element.value === "135000",
      ms: Number(ms.toFixed(1))
    };
  }, pollBudget);
}

const server = await startServer();
const port = server.address().port;
const downloadDir = "/tmp/fin-dashboard-e2e-downloads";
const __T0 = Date.now();
const __T = (label) => process.stderr.write(`[T+${((Date.now()-__T0)/1000).toFixed(1)}s] ${label}\n`);
await withBrowser({}, async ({ page }) => {
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
try {
  __T("BEGIN");
  await rm(downloadDir, { recursive: true, force: true });
  await mkdir(downloadDir, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });

  await page.setViewport({ width: 1680, height: 1100, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle0" });
  const productionDebugGlobal = await page.evaluate(() => ({
    modelGlobal: Boolean(window.__FIN_DASHBOARD_MODEL__),
    testGlobal: Boolean(window.__FIN_DASHBOARD_TEST_API__)
  }));
  assert(!productionDebugGlobal.modelGlobal, "production build leaked __FIN_DASHBOARD_MODEL__");
  assert(!productionDebugGlobal.testGlobal, "test API should require explicit finTestApi query in production");
  await page.goto(`http://127.0.0.1:${port}/index.html?finTestApi=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  // R4.5b: renamed from .privacy-consent-card to .disclaimer-notice-card (aria-label "Important notice")
  await page.waitForSelector(".disclaimer-notice-card", { timeout: 5000 });
  __T("before preConsentAudit");
  const preConsentAudit = await page.evaluate(() => ({
    // R4.5b: renamed class selector
    privacyVisible: Boolean(document.querySelector(".disclaimer-notice-card")),
    tourVisible: Boolean(document.querySelector(".guided-tour")),
    keys: Object.keys(localStorage).sort(),
    state: localStorage.getItem("fin-cockpit-state-v2"),
    layout: localStorage.getItem("fin-cockpit-layout-v2"),
    scenario: localStorage.getItem("fin-cockpit-scenario-history-v1"),
    theme: localStorage.getItem("fin-cockpit-theme"),
    tour: localStorage.getItem("fin-cockpit-guided-tour-v1"),
    // R4.5b: check both new and legacy keys — neither should be set before acknowledgement
    disclaimerNew: localStorage.getItem("disclaimer_acknowledged_v1"),
    disclaimerLegacy: localStorage.getItem("fin-cockpit-privacy-consent-v1")
  }));
  assert(preConsentAudit.privacyVisible, `disclaimer card must lead first launch: ${JSON.stringify(preConsentAudit)}`);
  assert(!preConsentAudit.tourVisible, `tour opened before disclaimer consent: ${JSON.stringify(preConsentAudit)}`);
  assert(preConsentAudit.state === null, `state persisted before consent: ${JSON.stringify(preConsentAudit)}`);
  assert(preConsentAudit.layout === null, `layout persisted before consent: ${JSON.stringify(preConsentAudit)}`);
  assert(preConsentAudit.scenario === null, `scenario history persisted before consent: ${JSON.stringify(preConsentAudit)}`);
  assert(preConsentAudit.theme === null, `theme persisted before consent: ${JSON.stringify(preConsentAudit)}`);
  assert(preConsentAudit.tour === null, `tour completion persisted before consent: ${JSON.stringify(preConsentAudit)}`);
  assert(preConsentAudit.disclaimerNew === null, `new disclaimer key should not exist before acknowledgement: ${JSON.stringify(preConsentAudit)}`);
  assert(preConsentAudit.disclaimerLegacy === null, `legacy consent key should not exist before acknowledgement: ${JSON.stringify(preConsentAudit)}`);
  // R4.5b: renamed class selector; updated text assertions to match new copy
  const privacyConsent = await page.evaluate(() => ({
    visible: Boolean(document.querySelector(".disclaimer-notice-card")),
    text: document.querySelector(".disclaimer-notice-card")?.innerText || "",
    disclaimerKey: localStorage.getItem("disclaimer_acknowledged_v1")
  }));
  assert(privacyConsent.visible, `first-run disclaimer notice missing: ${JSON.stringify(privacyConsent)}`);
  assert(/localStorage/i.test(privacyConsent.text), "disclaimer modal must mention localStorage");
  assert(/planning and educational tool/i.test(privacyConsent.text), "disclaimer modal must mention 'planning and educational tool'");
  assert(/Clear saved data/i.test(privacyConsent.text), "disclaimer modal must expose clear-data path");
  await page.evaluate(() => [...document.querySelectorAll(".disclaimer-notice-card button")].find((button) => /understand/i.test(button.textContent))?.click());
  await page.waitForSelector(".guided-tour", { timeout: 5000 });
  await page.waitForSelector(".tour-spotlight", { timeout: 5000 });
  await page.waitForFunction(() => Boolean(document.querySelector(".decision-verdict.tour-highlight")), { timeout: 2000 });
  __T("before firstLaunchTour");
  const firstLaunchTour = await page.evaluate(() => ({
    title: document.querySelector(".guided-tour h2")?.textContent.trim() || "",
    steps: document.querySelectorAll(".tour-step-pill").length,
    canReopenHint: document.querySelector(".guided-tour")?.innerText.includes("reopen") || document.querySelector(".guided-tour")?.innerText.includes("Help"),
    spotlightText: document.querySelector(".tour-target")?.textContent || "",
    backdropFilter: getComputedStyle(document.querySelector(".tour-backdrop")).backdropFilter || "",
    spotlightBoxShadow: getComputedStyle(document.querySelector(".tour-spotlight")).boxShadow || "",
    progressMeta: document.querySelector(".tour-progress-meta")?.textContent || "",
    cardWidth: document.querySelector(".tour-card")?.getBoundingClientRect().width || 0,
    stepRailHeight: document.querySelector(".tour-step-row")?.getBoundingClientRect().height || 0,
    visibleStepLabels: [...document.querySelectorAll(".tour-step-pill strong")].filter((label) => {
      const style = getComputedStyle(label);
      return style.position !== "absolute" && style.display !== "none";
    }).length
  }));
  assert(firstLaunchTour.title.toLowerCase().includes("guided"), `first-launch tour title missing: ${JSON.stringify(firstLaunchTour)}`);
  assert(firstLaunchTour.steps >= 5, `first-launch tour needs a full product path: ${JSON.stringify(firstLaunchTour)}`);
  assert(firstLaunchTour.canReopenHint, "first-launch tour must explain how to revisit it");
  assert(firstLaunchTour.spotlightText.includes("Spotlighting"), `guided tour should use explicit spatial spotlight copy: ${JSON.stringify(firstLaunchTour)}`);
  assert(!/blur\((?:[1-9]|\d{2})/i.test(firstLaunchTour.backdropFilter), `tour backdrop should not erase product context with heavy blur: ${JSON.stringify(firstLaunchTour)}`);
  assert(firstLaunchTour.spotlightBoxShadow.includes("9999px"), `tour spotlight should visibly dim outside the target: ${JSON.stringify(firstLaunchTour)}`);
  assert(/Step 1 of 7/i.test(firstLaunchTour.progressMeta), `guided tour needs compact step context: ${JSON.stringify(firstLaunchTour)}`);
  assert(firstLaunchTour.cardWidth >= 600, `desktop guided tour card is too narrow/cramped: ${JSON.stringify(firstLaunchTour)}`);
  assert(firstLaunchTour.stepRailHeight <= 46, `guided tour step rail regressed to cramped label cards: ${JSON.stringify(firstLaunchTour)}`);
  assert(firstLaunchTour.visibleStepLabels === 0, `guided tour step labels should be accessible but visually compact: ${JSON.stringify(firstLaunchTour)}`);
  const firstTourGeometry = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const areaOverlap = (a, b) => {
      if (!a || !b) return 0;
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return x * y;
    };
    const target = rect(".decision-verdict");
    const spotlight = rect(".tour-spotlight");
    const card = rect(".tour-card");
    const targetArea = Math.max(1, (target?.width || 0) * (target?.height || 0));
    return {
      target,
      spotlight,
      card,
      targetSpotlightOverlapRatio: areaOverlap(target, spotlight) / targetArea,
      cardTargetOverlapRatio: areaOverlap(card, target) / targetArea
    };
  });
  assert(firstTourGeometry.targetSpotlightOverlapRatio > 0.65, `guided tour spotlight is not anchored to active target: ${JSON.stringify(firstTourGeometry)}`);
  assert(firstTourGeometry.cardTargetOverlapRatio < 0.20, `guided tour card covers the thing it teaches: ${JSON.stringify(firstTourGeometry)}`);
  const tourWalk = await page.evaluate(async (stepSettleMs) => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const areaOverlap = (a, b) => {
      if (!a || !b) return 0;
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return x * y;
    };
    // After a step advance, scroll-into-view and spotlight reposition race
    // each other on the slower CI runner — the spotlight box can be read
    // mid-transition when its target rect hasn't yet been remeasured. Force
    // the highlighted target into view, give the app a frame to reposition
    // the spotlight, then poll the overlap until it stabilises for two
    // consecutive frames before snapshotting (capped at ~stepSettleMs).
    const waitForSpotlightSettle = async (budgetMs) => {
      const highlighted = document.querySelector(".tour-highlight");
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      }
      await nextFrame();
      await nextFrame();
      const deadline = performance.now() + budgetMs;
      let prev = -1;
      while (performance.now() < deadline) {
        const target = rect(".tour-highlight");
        const spot = rect(".tour-spotlight");
        const targetArea = Math.max(1, (target?.width || 0) * (target?.height || 0));
        const overlap = areaOverlap(target, spot) / targetArea;
        if (overlap >= 0.65 && Math.abs(overlap - prev) < 0.005) return overlap;
        prev = overlap;
        await nextFrame();
      }
      return prev;
    };
    const visited = [];
    for (let guard = 0; guard < 8; guard++) {
      const tour = document.querySelector(".guided-tour");
      if (!tour) break;
      await waitForSpotlightSettle(stepSettleMs);
      const highlighted = document.querySelector(".tour-highlight");
      const spotlight = document.querySelector(".tour-spotlight");
      const card = rect(".tour-card");
      const target = highlighted ? rect(".tour-highlight") : null;
      const spot = spotlight ? rect(".tour-spotlight") : null;
      const spotArea = Math.max(1, (spot?.width || 0) * (spot?.height || 0));
      const targetArea = Math.max(1, (target?.width || 0) * (target?.height || 0));
      const stepNumber = Number((tour.querySelector(".tour-progress-meta span")?.textContent || "").match(/Step\\s+(\\d+)/i)?.[1] || visited.length + 1);
      visited.push({
        title: tour.querySelector("h2")?.textContent.trim() || "",
        stepNumber,
        activeView: document.querySelector(".main-stack")?.dataset.activeView || "",
        highlighted: highlighted?.className || "",
        hasSpotlight: Boolean(spotlight),
        placement: tour.querySelector(".tour-card")?.dataset.placement || "",
        cardInViewport: Boolean(card && card.left >= 0 && card.top >= 0 && card.right <= window.innerWidth && card.bottom <= window.innerHeight),
        cardSpotOverlapRatio: areaOverlap(card, spot) / spotArea,
        targetSpotlightOverlapRatio: areaOverlap(target, spot) / targetArea,
        bottomClearance: card ? window.innerHeight - card.bottom : -1
      });
      const primary = [...tour.querySelectorAll(".tour-actions button")].find((button) => /next|start planning/i.test(button.textContent || ""));
      primary?.click();
      await nextFrame();
      await new Promise((resolve) => setTimeout(resolve, stepSettleMs * 0.75));
    }
    return { visited, closed: !document.querySelector(".guided-tour") };
  }, process.env.CI ? 2000 : 800);
  assert(tourWalk.visited.length >= 5, `guided tour did not walk enough steps: ${JSON.stringify(tourWalk)}`);
  assert(tourWalk.closed, `guided tour did not close on final step: ${JSON.stringify(tourWalk)}`);
  assert(new Set(tourWalk.visited.map((step) => step.activeView)).size >= 3, `guided tour did not switch product pages: ${JSON.stringify(tourWalk)}`);
  assert(tourWalk.visited.every((item) => item.highlighted && item.hasSpotlight), `guided tour lost target highlight during walkthrough: ${JSON.stringify(tourWalk)}`);
  assert(tourWalk.visited.every((item) => item.cardInViewport), `guided tour card left the viewport: ${JSON.stringify(tourWalk)}`);
  assert(tourWalk.visited.every((item) => item.targetSpotlightOverlapRatio > 0.65), `guided tour spotlight drifted away from its target: ${JSON.stringify(tourWalk)}`);
  assert(tourWalk.visited.every((item) => item.cardSpotOverlapRatio < 0.08), `guided tour card obscures the highlighted area: ${JSON.stringify(tourWalk)}`);
  const placementCriticalSteps = tourWalk.visited.filter((item) => item.stepNumber >= 3 && item.stepNumber <= 6);
  assert(placementCriticalSteps.every((item) => item.bottomClearance >= 64), `guided tour steps 3-6 are too close to the bottom edge: ${JSON.stringify(placementCriticalSteps)}`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  // R4.5b: renamed class and localStorage key
  const privacyStored = await page.evaluate(() => ({
    visible: Boolean(document.querySelector(".disclaimer-notice-card")),
    disclaimerFlag: localStorage.getItem("disclaimer_acknowledged_v1")
  }));
  assert(!privacyStored.visible, `disclaimer notice did not dismiss: ${JSON.stringify(privacyStored)}`);
  assert(privacyStored.disclaimerFlag === "true", `disclaimer acknowledgement not remembered: ${JSON.stringify(privacyStored)}`);
  await openView(page, "overview");
  await page.waitForSelector(".whatif-card .quick-field[data-label=\"Corpus today\"] input", { timeout: 10000 });
  await page.evaluate(() => {
    const themeButton = [...document.querySelectorAll(".actions button")].find((button) => /Light|Dark/i.test(button.textContent || ""));
    if (document.documentElement.dataset.theme !== "light") themeButton?.click();
  });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light" && JSON.parse(localStorage.getItem("fin-cockpit-theme") || "\"\"") === "light", { timeout: 2500 });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".whatif-card .quick-field[data-label=\"Corpus today\"] input", { timeout: 10000 });
  const lightThemeReload = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem("fin-cockpit-theme")
  }));
  assert(lightThemeReload.theme === "light", `light theme did not survive reload: ${JSON.stringify(lightThemeReload)}`);
  await page.evaluate(() => {
    const themeButton = [...document.querySelectorAll(".actions button")].find((button) => /Light|Dark/i.test(button.textContent || ""));
    if (document.documentElement.dataset.theme !== "dark") themeButton?.click();
  });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark" && JSON.parse(localStorage.getItem("fin-cockpit-theme") || "\"\"") === "dark", { timeout: 2500 });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".whatif-card .quick-field[data-label=\"Corpus today\"] input", { timeout: 10000 });
  const darkThemeReload = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem("fin-cockpit-theme")
  }));
  assert(darkThemeReload.theme === "dark", `dark theme did not survive reload: ${JSON.stringify(darkThemeReload)}`);

  await page.evaluate(() => {
    localStorage.setItem("fin-cockpit-state-v2", "{bad");
    localStorage.setItem("fin-cockpit-layout-v2", "{bad");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".whatif-card .quick-field[data-label=\"Corpus today\"] input", { timeout: 10000 });
  const corruptionRecovery = await page.evaluate(() => ({
    activeView: document.querySelector(".main-stack")?.dataset.activeView || "",
    corpus: document.querySelector(".whatif-card .quick-field[data-label=\"Corpus today\"] input")?.value || "",
    viewportMode: document.querySelector(".layout-console")?.innerText.includes("Auto") || false
  }));
  assert(corruptionRecovery.activeView === "overview", `corrupt saved state did not recover to overview: ${JSON.stringify(corruptionRecovery)}`);
  assert(corruptionRecovery.corpus === "30000000", `corrupt saved state did not recover to base corpus: ${JSON.stringify(corruptionRecovery)}`);
  assert(corruptionRecovery.viewportMode, `corrupt layout did not recover to auto mode: ${JSON.stringify(corruptionRecovery)}`);

  __T("before smoke");
  const smoke = await page.evaluate(() => ({
    appText: document.body.innerText.length,
    charts: document.querySelectorAll("canvas").length,
    navButtons: document.querySelectorAll(".nav-list button").length,
    activeView: document.querySelector(".main-stack")?.dataset.activeView,
    modelApi: Boolean(window.__FIN_DASHBOARD_TEST_API__?.investmentTaxProfile && window.__FIN_DASHBOARD_TEST_API__?.generateOptimumStrategies && window.__FIN_DASHBOARD_TEST_API__?.taxLawFromState && window.__FIN_DASHBOARD_TEST_API__?.buildRetirementActionPlan),
    statusBadges: document.querySelectorAll(".status-badge").length,
    overflow: document.documentElement.scrollWidth - window.innerWidth
  }));
  assert(smoke.appText > 5000, "dashboard rendered too little text");
  assert(smoke.charts >= 2, `expected at least 2 overview charts, got ${smoke.charts}`);
  assert(smoke.navButtons >= 5, `expected integrated page nav, got ${smoke.navButtons}`);
  assert(smoke.activeView === "overview", `expected overview default, got ${smoke.activeView}`);
  assert(smoke.modelApi, "model API missing on window");
  assert(smoke.statusBadges >= 6, `KPI/gauge cards need non-color status badges, found ${smoke.statusBadges}`);
  assert(smoke.overflow <= 12, `desktop overflow ${smoke.overflow}`);
  const trustAndScenarioAudit = await page.evaluate(() => ({
    trustNotices: document.querySelectorAll(".trust-notice").length,
    trustText: document.querySelector(".trust-notice")?.innerText || "",
    scenarioTimeline: Boolean(document.querySelector(".scenario-timeline-panel")),
    saveInputs: document.querySelectorAll(".scenario-save-grid input, .scenario-save-grid textarea").length
  }));
  assert(trustAndScenarioAudit.trustNotices >= 1, `overview trust notice missing: ${JSON.stringify(trustAndScenarioAudit)}`);
  assert(/planning estimate/i.test(trustAndScenarioAudit.trustText), "overview trust notice must frame outputs as planning estimates");
  assert(trustAndScenarioAudit.scenarioTimeline && trustAndScenarioAudit.saveInputs >= 2, `saved scenario timeline missing: ${JSON.stringify(trustAndScenarioAudit)}`);
  const trustCenterAudit = await page.evaluate(() => ({
    panel: document.querySelector(".trust-center-panel")?.innerText || "",
    buttons: document.querySelectorAll(".trust-center-grid button").length,
    actions: document.querySelectorAll(".trust-center-actions button").length
  }));
  assert(/Can I Trust This Plan/i.test(trustCenterAudit.panel), `trust center panel missing: ${JSON.stringify(trustCenterAudit)}`);
  assert(/Local-first/i.test(trustCenterAudit.panel) && /Human review/i.test(trustCenterAudit.panel), "trust center must cover local data and human review");
  assert(trustCenterAudit.buttons >= 6 && trustCenterAudit.actions >= 3, `trust center lacks actionable controls: ${JSON.stringify(trustCenterAudit)}`);
  await page.click(".trust-center-actions button:first-child");
  await page.waitForSelector(".help-drawer", { timeout: 5000 });
  const trustHelpAudit = await page.evaluate(() => ({
    title: document.querySelector(".help-drawer h2")?.textContent.trim() || "",
    text: document.querySelector(".help-drawer")?.innerText || ""
  }));
  assert(trustHelpAudit.title === "Trust Center", `wrong trust help topic: ${JSON.stringify(trustHelpAudit)}`);
  assert(trustHelpAudit.text.includes("assumptions fingerprint") && trustHelpAudit.text.includes("Human review"), "trust help missing core review guidance");
  await page.evaluate(() => document.querySelector(".help-drawer .close-button")?.click());
  await new Promise((resolve) => setTimeout(resolve, 120));
  await page.type(".scenario-save-grid input", "E2E base case");
  await page.type(".scenario-save-grid textarea", "Saved before planner changes");
  await page.click(".scenario-save-grid > button");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("fin-cockpit-scenario-history-v1") || "[]").length >= 1, { timeout: 2000 });
  const scenarioSaveAudit = await page.evaluate(() => ({
    timeline: document.querySelector(".scenario-timeline-list")?.innerText || "",
    stored: JSON.parse(localStorage.getItem("fin-cockpit-scenario-history-v1") || "[]")
  }));
  assert(scenarioSaveAudit.timeline.includes("E2E base case"), `scenario timeline did not render saved snapshot: ${JSON.stringify(scenarioSaveAudit)}`);
  assert(scenarioSaveAudit.stored.length === 1 && scenarioSaveAudit.stored[0].fingerprint, `scenario history not stored with fingerprint: ${JSON.stringify(scenarioSaveAudit)}`);
  await page.type(".scenario-note-editor textarea", " after family review");
  await page.waitForFunction(() => /family review/i.test(JSON.parse(localStorage.getItem("fin-cockpit-scenario-history-v1") || "[]")[0]?.notes || ""), { timeout: 2000 });
  await openView(page, "planner");
  const guidedModeAudit = await page.evaluate(() => ({
    text: document.querySelector(".retiree-guided-mode")?.innerText || "",
    controls: document.querySelectorAll(".retiree-guided-mode .quick-field").length,
    checklist: document.querySelectorAll(".guided-checklist li").length
  }));
  assert(guidedModeAudit.text.includes("From Household Reality To Action Plan"), `retiree guided mode missing: ${JSON.stringify(guidedModeAudit)}`);
  assert(/safe starting cash range/i.test(guidedModeAudit.text) && /income floor/i.test(guidedModeAudit.text), "retiree guided mode missing plan outputs");
  assert(guidedModeAudit.controls >= 10 && guidedModeAudit.checklist >= 4, `retiree guided mode is not complete enough: ${JSON.stringify(guidedModeAudit)}`);
  assert((await text(page, "#optimizer")).includes("Recommended Strategy Shortlist"), "strategy shortlist panel missing");
  assert((await text(page, "#action-plan")).includes("Withdrawal Policy & Trust Plan"), "policy advisor panel missing");

  __T("before interactionLatency");
  const interactionLatency = await interactionLatencyAudit(page);
  const slowInteractions = interactionLatency.filter((item) => !item.ok || item.ms > ciSlow(450));
  assert(!slowInteractions.length, `slow click response: ${JSON.stringify(slowInteractions)}`);

  await openView(page, "tax");
  await page.click(".studio-button");
  await page.waitForSelector(".assumption-drawer", { timeout: 5000 });
  await page.evaluate(() => {
    const lawTab = [...document.querySelectorAll(".studio-nav button")].find((button) => /tax law/i.test(button.textContent || ""));
    lawTab?.click();
  });
  await page.waitForSelector(".tax-law-editor textarea", { timeout: 5000 });
  __T("before taxLawAudit");
  const taxLawAudit = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const law = {
      ...api.DEFAULT_TAX_LAW,
      version: "E2E editable tax law",
      specialRates: { equityLtcg: 10, equityStcg: 25, listedBondLtcg: 15 },
      equityLtcgExemption: 250000,
      cess: 5
    };
    const draft = api.formatTaxLawJson(law);
    const textarea = document.querySelector(".tax-law-editor textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("Tax law textarea was not available");
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(textarea, draft);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      parsed: api.taxLawParseStatus({ taxLawJson: draft }).ok,
      stcgRate: api.taxableRate("equityStcg", { ...api.BASE, taxLawJson: draft }),
      studioText: document.querySelector(".tax-law-editor")?.textContent || ""
    };
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const diffAudit = await page.evaluate(() => ({
    hasDiff: /rule group/.test(document.querySelector(".tax-law-diff")?.textContent || ""),
    applyDisabled: document.querySelector(".tax-law-actions button")?.disabled,
    checkbox: Boolean(document.querySelector(".tax-law-diff input[type=\"checkbox\"]")),
    reviewBadge: document.querySelector(".tax-law-review-badge")?.innerText || ""
  }));
  assert(diffAudit.hasDiff, "tax-law editor did not show a review diff");
  assert(diffAudit.applyDisabled, "tax-law apply should wait for diff review confirmation");
  assert(diffAudit.checkbox, "tax-law diff review checkbox missing");
  assert(/review status/i.test(diffAudit.reviewBadge) && /ruleset/i.test(diffAudit.reviewBadge), `tax-law review badge missing: ${JSON.stringify(diffAudit)}`);
  await page.$eval(".tax-law-diff input[type=\"checkbox\"]", (input) => input.click());
  await page.waitForFunction(() => !document.querySelector(".tax-law-actions button")?.disabled, { timeout: 5000 });
  await page.evaluate(() => document.querySelector(".tax-law-actions button").click());
  await waitForModelIdle(page);
  const activeLawText = await text(page, "#tax .tax-grid");
  assert(taxLawAudit.parsed, "editable tax-law JSON did not parse");
  assert(Math.abs(taxLawAudit.stcgRate - 0.2625) < 0.00001, "model API did not use editable special-rate tax law");
  assert(taxLawAudit.studioText.includes("Tax Law Studio"), "Tax Law Studio UI missing");
  assert(activeLawText.includes("E2E editable tax law"), "applied tax law did not update dashboard metrics");
  const regimeComparisonAudit = await page.evaluate(() => ({
    text: document.querySelector(".regime-comparison")?.innerText || "",
    cards: document.querySelectorAll(".regime-card").length
  }));
  assert(regimeComparisonAudit.cards === 2, `tax regime comparison cards missing: ${JSON.stringify(regimeComparisonAudit)}`);
  assert(/new regime/i.test(regimeComparisonAudit.text) && /old regime/i.test(regimeComparisonAudit.text), "tax regime comparison missing both regimes");
  assert(regimeComparisonAudit.text.includes("87A"), "tax regime comparison missing rebate caveat");
  await page.evaluate(() => document.querySelector(".tax-law-actions button:nth-child(3)").click());
  await waitForModelIdle(page);
  const uploadDraft = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const weakSourceLaw = {
      ...api.DEFAULT_TAX_LAW,
      version: "E2E uploaded tax law",
      updatedOn: "2026-05-13",
      equityLtcgExemption: 300000
    };
    delete weakSourceLaw.sourceUrl;
    return JSON.stringify(weakSourceLaw, null, 2);
  });
  const uploadPath = `${downloadDir}/e2e-tax-law-upload.json`;
  await writeFile(uploadPath, uploadDraft, "utf8");
  const fileInput = await page.$(".tax-law-editor input[type=\"file\"]");
  assert(fileInput, "tax-law file input missing");
  await fileInput.uploadFile(uploadPath);
  await page.waitForFunction(() => document.querySelector(".tax-law-editor textarea")?.value.includes("E2E uploaded tax law"), { timeout: 5000 });
  const uploadAudit = await page.evaluate(() => ({
    hasUploadedVersion: document.querySelector(".tax-law-editor textarea")?.value.includes("E2E uploaded tax law") || false,
    hasDiff: /rule group/.test(document.querySelector(".tax-law-diff")?.textContent || ""),
    hasSafeguard: /Safeguard|source URL/i.test(document.querySelector(".tax-law-diff")?.textContent || "")
  }));
  assert(uploadAudit.hasUploadedVersion && uploadAudit.hasDiff && uploadAudit.hasSafeguard, `tax-law JSON upload did not populate review diff/safeguard: ${JSON.stringify(uploadAudit)}`);
  const expectedActiveLawExport = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {});
    return api.taxLawFromState(saved);
  });
  await rm(`${downloadDir}/retirement-tax-law-active-ruleset.json`, { force: true });
  await rm(`${downloadDir}/retirement-tax-law-draft-ruleset.json`, { force: true });
  await page.evaluate(() => [...document.querySelectorAll(".tax-law-actions button")].find((button) => /download active/i.test(button.textContent || ""))?.click());
  await page.evaluate(() => [...document.querySelectorAll(".tax-law-actions button")].find((button) => /download draft/i.test(button.textContent || ""))?.click());
  await waitForFile(`${downloadDir}/retirement-tax-law-active-ruleset.json`, 10000);
  await waitForFile(`${downloadDir}/retirement-tax-law-draft-ruleset.json`, 10000);
  const activeLawExport = JSON.parse(await readFile(`${downloadDir}/retirement-tax-law-active-ruleset.json`, "utf8"));
  const draftLawExport = JSON.parse(await readFile(`${downloadDir}/retirement-tax-law-draft-ruleset.json`, "utf8"));
  assert(activeLawExport.version === expectedActiveLawExport.version, `active tax-law export did not match active model ruleset: ${JSON.stringify({ activeLawExport, expectedActiveLawExport })}`);
  assert(activeLawExport.equityLtcgExemption === expectedActiveLawExport.equityLtcgExemption, `active tax-law export did not preserve active exemption: ${JSON.stringify({ activeLawExport, expectedActiveLawExport })}`);
  assert(activeLawExport.version !== "E2E uploaded tax law", `active tax-law export used unapplied draft: ${JSON.stringify(activeLawExport)}`);
  assert(draftLawExport.version === "E2E uploaded tax law", `draft tax-law export did not contain editor draft: ${JSON.stringify(draftLawExport)}`);

  await openView(page, "planner");
  await openAssumptionStudio(page);
  await page.evaluate(() => document.querySelector(".assumption-drawer .close-button")?.click());
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.click(".choice-group[data-label=\"Risk comfort\"] button:nth-child(3)");
  await waitForModelIdle(page);
  await page.waitForFunction(() => !document.querySelector(".optimizer-apply")?.disabled, { timeout: 5000 });
  const expectedOptimizerStrategy = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {});
    const best = api.generateOptimumStrategies(saved).best;
    return {
      equityShare: Math.round(best.equityShare),
      incomeMode: best.patch.incomeMode,
      cashMode: best.patch.cashMode,
      withdrawalPriority: best.patch.withdrawalPriority
    };
  });
  await page.click(".optimizer-apply");
	  await page.waitForFunction((expected) => {
	    const saved = JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {};
	    return Math.round(Number(saved.equityShare)) === expected.equityShare
	      && saved.incomeMode === expected.incomeMode
	      && saved.cashMode === expected.cashMode
	      && saved.withdrawalPriority === expected.withdrawalPriority;
	  }, { timeout: 5000 }, expectedOptimizerStrategy);
	  await waitForModelIdle(page);
	  await openAssumptionStudio(page);
  __T("before studioImpactAudit");
  const studioImpactAudit = await page.evaluate(() => ({
    text: document.querySelector(".studio-impact-panel")?.innerText || "",
    metrics: document.querySelectorAll(".studio-impact-panel b").length
  }));
  assert(/Live Impact/i.test(studioImpactAudit.text) && /Withdrawal rate/i.test(studioImpactAudit.text), `Assumption Studio impact preview missing: ${JSON.stringify(studioImpactAudit)}`);
  assert(studioImpactAudit.metrics >= 4, "Assumption Studio impact preview needs corpus, real, cash, and tax metrics");
  const optimizer = await page.evaluate((expected) => ({
    equity: Math.round(Number(document.querySelector(".assumption-drawer .control[data-label=\"Equity allocation\"] input")?.value || 0)),
    expectedEquity: expected.equityShare,
    engine: document.querySelector(".assumption-drawer .control[data-label=\"Cash strategy\"] select")?.value,
    expectedEngine: expected.incomeMode,
    custom: document.querySelector(".filter-grid strong")?.textContent.includes("Custom Plan"),
    cards: document.querySelectorAll(".strategy-card").length,
    lanes: document.querySelectorAll(".instrument-lanes > div").length
  }), expectedOptimizerStrategy);
  assert(optimizer.equity === optimizer.expectedEquity, `optimizer apply did not set expected equity allocation: ${JSON.stringify(optimizer)}`);
  assert(optimizer.engine === optimizer.expectedEngine, `optimizer apply did not set expected cash engine: ${JSON.stringify(optimizer)}`);
  assert(optimizer.custom, "optimizer apply did not mark Custom Plan");
  assert(optimizer.cards === 4, `expected 4 strategy cards, got ${optimizer.cards}`);
  assert(optimizer.lanes === 4, `expected 4 instrument lanes, got ${optimizer.lanes}`);
  await page.evaluate(() => document.querySelector(".assumption-drawer .close-button")?.click());
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.click(".strategy-card:nth-child(2) .strategy-actions button:first-child");
  const strategyPinAudit = await page.evaluate(() => ({
    pinnedCard: document.querySelector(".strategy-card:nth-child(2)")?.classList.contains("pinned"),
    pinnedRow: Boolean(document.querySelector(".strategy-comparison .pinned-row")),
    comparisonText: document.querySelector(".strategy-comparison")?.innerText || ""
  }));
  assert(strategyPinAudit.pinnedCard && strategyPinAudit.pinnedRow, `strategy pinning did not update comparison: ${JSON.stringify(strategyPinAudit)}`);
  assert(strategyPinAudit.comparisonText.includes("pinned"), "strategy comparison did not explain the pinned strategy");

  const inputLatency = await inputLatencyAudit(page);
  assert(inputLatency.ok && inputLatency.ms <= ciSlow(450), `slow value edit response: ${JSON.stringify(inputLatency)}`);
  await openView(page, "overview");
  const sustainedTyping = await sustainedTypingAudit(page);
  assert(sustainedTyping.ok && sustainedTyping.ms <= ciSlow(650), `slow sustained typing response: ${JSON.stringify(sustainedTyping)}`);
  const modelSettleLatency = await modelSettleLatencyAudit(page);
  assert(modelSettleLatency.ok && modelSettleLatency.ms <= ciSlow(420), `model stayed stale too long after value edit: ${JSON.stringify(modelSettleLatency)}`);

  await page.click(".whatif-card .quick-field[data-label=\"Years\"] input");
  await page.click(".page-narrative h2");
  await new Promise((resolve) => setTimeout(resolve, 80));
  __T("before focusAudit");
  const focusAudit = await page.evaluate(() => {
    const field = document.querySelector(".whatif-card .quick-field[data-label=\"Years\"]");
    const input = field.querySelector("input");
    const style = getComputedStyle(field);
    return {
      activeTag: document.activeElement?.tagName || "",
      activeLabel: document.activeElement?.getAttribute("aria-label") || "",
      focusedInside: field.matches(":focus-within"),
      boxShadow: style.boxShadow
    };
  });
  assert(!focusAudit.focusedInside && focusAudit.activeLabel !== "Years", `editable highlight stuck after outside click: ${JSON.stringify(focusAudit)}`);

	  await setInput(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", 150000);
	  await setInput(page, ".whatif-card .quick-field[data-label=\"Corpus today\"] input", 17500000);
	  await openView(page, "planner");
	  // Latency audit measures paint timing, not MC outcomes — fast tier only.
	  await waitForModelIdle(page, 60000, { includeSlow: false });
	  const plannerTileLatency = await plannerTileLatencyAudit(page);
  const slowPlannerTiles = plannerTileLatency.filter((item) => !item.ok || item.ms > ciSlow(300));
  assert(!slowPlannerTiles.length, `slow planner tile response: ${JSON.stringify(slowPlannerTiles)}`);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 35000000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Years\"] input", 20);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Inflation\"] input", 6);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Withdrawal\"] input", 50);
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Cash engine\"] select", "swp");
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Mode\"] select", "monthlyTarget");

  await openAssumptionStudio(page);
  const sync = await page.evaluate(() => ({
    principal: document.querySelector(".assumption-drawer .control[data-label=\"Starting principal\"] input")?.value,
    monthly: document.querySelector(".assumption-drawer .control[data-label=\"Monthly cash target\"] input")?.value,
    target: document.querySelector(".assumption-drawer .control[data-label=\"Target corpus today\"] input")?.value,
    years: document.querySelector(".assumption-drawer .control[data-label=\"Projection years\"] input")?.value,
    engine: document.querySelector(".assumption-drawer .control[data-label=\"Cash strategy\"] select")?.value,
    mode: document.querySelector(".assumption-drawer .control[data-label=\"Cash target mode\"] select")?.value,
    custom: document.querySelector(".filter-grid strong")?.textContent.includes("Custom Plan")
  }));
  assert(sync.principal === "17500000", "principal did not sync into Assumption Studio");
  assert(sync.monthly === "150000", "monthly target did not sync into Assumption Studio");
  assert(sync.target === "35000000", "target corpus did not sync into Assumption Studio");
  assert(sync.years === "20", "years did not sync into Assumption Studio");
  assert(sync.engine === "swp", "cash engine did not sync into Assumption Studio");
  assert(sync.mode === "monthlyTarget", "cash mode did not sync into Assumption Studio");
  assert(sync.custom, "manual edits did not mark Custom Plan");
  assert((await text(page, ".cash-stress-banner")).includes("not sustainable"), "monthly target stress banner missing");

  await setInput(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", 75000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Corpus today\"] input", "1,75,00,000");
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", "1,75,00,000");
  await setInput(page, ".whatif-card .quick-field[data-label=\"Years\"] input", 30);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Withdrawal\"] input", 50);
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Cash engine\"] select", "swp");
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Mode\"] select", "monthlyTarget");
  const userCaseConsistency = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const state = api.normalizeState({
      ...api.BASE,
      principal: 17500000,
      targetCorpus: 17500000,
      monthlyTarget: 75000,
      years: 30,
      inflation: 6,
      withdrawRate: 50,
      incomeMode: "swp",
      cashMode: "monthlyTarget"
    });
    const exact = api.calculate(api.projectionParamsFromState(state));
    const maxMonthlyCash = api.solveMaxMonthlyCash(state);
    const hasShortfall = exact.rows.slice(1).some((row) => (row.withdrawalShortfall || 0) > 1 || (row.targetCash > 0 && (row.cashCoverage || 0) < 0.995));
    return {
      hasShortfall,
      maxMonthlyCash,
      targetMonthly: state.monthlyTarget,
      banner: document.querySelector(".cash-stress-banner")?.textContent.trim().replace(/\s+/g, " ") || ""
    };
  });
  if (userCaseConsistency.hasShortfall) {
    assert(userCaseConsistency.maxMonthlyCash <= userCaseConsistency.targetMonthly + 1000, `SWP solver overstates sustainable cash: ${JSON.stringify(userCaseConsistency)}`);
    assert(userCaseConsistency.banner.includes("Monthly target is not sustainable"), `cash shortfall banner unclear: ${JSON.stringify(userCaseConsistency)}`);
  } else {
    assert(!userCaseConsistency.banner.includes("Monthly target is not sustainable"), `funded cash target shown as not sustainable: ${JSON.stringify(userCaseConsistency)}`);
  }

  await openView(page, "overview");
  await setInput(page, ".whatif-card .quick-field[data-label=\"Corpus today\"] input", 30000000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 30000000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Years\"] input", 30);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Inflation\"] input", 6);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Withdrawal\"] input", 50);
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Cash engine\"] select", "swp");
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Mode\"] select", "interestPercent");
  const percentContract = await captureProjectionSurface(page);
  assert(percentContract.mode === "interestPercent" && percentContract.note.includes("Withdrawal %"), `percent mode contract is not explicit: ${JSON.stringify(percentContract)}`);
  const monthlyCashSurfaces = [];
  for (const monthlyCash of [5000, 50000, 150000]) {
    await setInput(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", monthlyCash);
    const surface = await captureProjectionSurface(page);
    const expected = await captureExpectedProjectionSurface(page);
    monthlyCashSurfaces.push({ monthlyCash, ...surface });
    assertSurfaceParity(surface, expected, `monthly cash ${monthlyCash}`);
    assert(surface.mode === "monthlyTarget", `monthly cash edit did not switch to live monthly-target mode: ${JSON.stringify(surface)}`);
    assert(surface.note.includes("live withdrawal target"), `monthly target contract copy missing: ${JSON.stringify(surface)}`);
    assert(surface.cashGoal === surface.railCashGoal, `cash goal mismatch between gauge and rail: ${JSON.stringify(surface)}`);
    assert(surface.endTargetChance === surface.railEndChance, `end target chance mismatch between gauge and rail: ${JSON.stringify(surface)}`);
    assert(surface.finalCorpus && surface.cashWithdrawn && surface.realFinalValue && surface.finalMonthlyCash, `KPI surface missing values: ${JSON.stringify(surface)}`);
    assert(surface.corpusNeeded && surface.returnNeeded && surface.maxMonthlyCash, `solver surface missing values: ${JSON.stringify(surface)}`);
    assert(surface.chartFingerprint, `chart did not render for monthly cash ${monthlyCash}: ${JSON.stringify(surface)}`);
  }
  const monthlyTuples = new Set(monthlyCashSurfaces.map((item) => [item.finalCorpus, item.cashWithdrawn, item.realFinalValue, item.finalMonthlyCash, item.cashGoal].join("|")));
  const endChanceValues = new Set(monthlyCashSurfaces.map((item) => item.endTargetChance));
  assert(monthlyTuples.size === 3, `monthly cash changes did not produce distinct projection surfaces: ${JSON.stringify(monthlyCashSurfaces)}`);
  assert(endChanceValues.size >= 2, `end target chance did not respond to monthly cash target changes: ${JSON.stringify(monthlyCashSurfaces)}`);
  assert(monthlyCashSurfaces[0].chartFingerprint !== monthlyCashSurfaces[2].chartFingerprint, `main chart did not respond to monthly cash target changes: ${JSON.stringify(monthlyCashSurfaces)}`);
  const combinedDriverCases = [
    { label: "corpus", field: "Corpus today", selector: ".whatif-card .quick-field[data-label=\"Corpus today\"] input", value: 36000000 },
    { label: "target", field: "Target today", selector: ".whatif-card .quick-field[data-label=\"Target today\"] input", value: 42000000 },
    { label: "horizon", field: "Years", selector: ".whatif-card .quick-field[data-label=\"Years\"] input", value: 24 },
    { label: "withdrawal share", field: "Withdrawal", selector: ".whatif-card .quick-field[data-label=\"Withdrawal\"] input", value: 65 },
    { label: "inflation", field: "Inflation", selector: ".whatif-card .quick-field[data-label=\"Inflation\"] input", value: 7 }
  ];
  const combinedSurfaces = [];
  for (const item of combinedDriverCases) {
    await setInput(page, item.selector, item.value);
    const surface = await captureProjectionSurface(page);
    const expected = await captureExpectedProjectionSurface(page);
    combinedSurfaces.push({ label: item.label, ...surface });
    assertSurfaceParity(surface, expected, `combined driver ${item.label}`);
  }
  assert(new Set(combinedSurfaces.map((item) => [item.finalCorpus, item.cashWithdrawn, item.realFinalValue, item.finalMonthlyCash, item.cashGoal, item.endTargetChance].join("|"))).size >= 3, `combined driver edits did not move enough surfaces: ${JSON.stringify(combinedSurfaces)}`);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", 75000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Corpus today\"] input", 17500000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 17500000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Years\"] input", 30);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Inflation\"] input", 6);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Withdrawal\"] input", 50);
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Cash engine\"] select", "swp");
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Mode\"] select", "monthlyTarget");

  await setInput(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", 50000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Corpus today\"] input", 40000000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 30000000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Years\"] input", 30);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Inflation\"] input", 6);
  await openAssumptionStudio(page);
  await setSelect(page, ".assumption-drawer .control[data-label=\"Use household plan\"] select", "1");
  await setInput(page, ".assumption-drawer .control[data-label=\"Essential monthly expense\"] input", 200000);
  await setInput(page, ".assumption-drawer .control[data-label=\"Discretionary monthly expense\"] input", 80000);
  await setInput(page, ".assumption-drawer .control[data-label=\"Spouse / survivor monthly need\"] input", 30000);
  await setInput(page, ".assumption-drawer .control[data-label=\"Dependant monthly support\"] input", 40000);
  await setInput(page, ".assumption-drawer .control[data-label=\"Dependant support years\"] input", 5);
  await setInput(page, ".assumption-drawer .control[data-label=\"Pension monthly income\"] input", 60000);
  await setInput(page, ".assumption-drawer .control[data-label=\"Healthcare reserve\"] input", 2000000);
  await setInput(page, ".assumption-drawer .control[data-label=\"Emergency reserve months\"] input", 18);
  await setInput(page, ".assumption-drawer .control[data-label=\"Longevity horizon\"] input", 32);
  await setInput(page, ".assumption-drawer .control[data-label=\"Contingency horizon\"] input", 6);
  await setInput(page, ".assumption-drawer .control[data-label=\"Known lump-sum goal\"] input", 1000000);
  await setInput(page, ".assumption-drawer .control[data-label=\"Lump-sum year\"] input", 4);
  await page.evaluate(() => document.querySelector(".drawer-backdrop.open .close-button")?.click());
  // Transitional wait — captureProjectionSurface below waits for slow tier
  // itself; doubling the slow wait here can exceed 60s on Ubuntu 2-vCPU
  // after a 12-input household-plan edit sequence.
  await waitForModelIdle(page, 60000, { includeSlow: false });
  await openView(page, "overview");
  await page.waitForFunction(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {};
      return saved.useHouseholdPlan === 1
        && saved.principal === 40000000
        && saved.targetCorpus === 30000000
        && saved.monthlyTarget === 50000
        && saved.longevityYears === 32
        && saved.contingencyYears === 6
        && saved.healthcareReserve === 2000000;
    } catch (error) {
      return false;
    }
  }, { timeout: 5000 });
  const householdSurface = await captureProjectionSurface(page);
  const householdExpected = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    // R4.9.5e: mirror the 5pp-bucket display rule from src/probability-display.js.
    const displayProb = (p) => {
      const sp = typeof p === "number" && Number.isFinite(p) ? p : 0;
      if (sp < 0.05) return "rare (under 5%)";
      if (sp > 0.95) return "very likely (over 95%)";
      return `${Math.round(Math.round(sp * 20) / 20 * 100)}%`;
    };
    const saved = JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {};
    const state = api.normalizeState(saved);
    const params = api.projectionParamsFromState(state);
    const model = api.calculate(params);
    const risk = api.calculateMonteCarlo(params, state.monteCarloSamples);
    const targetReal = params.householdProfile.targetCorpusToday;
    const horizon = Math.max(1, Math.round(Number(params.years) || 0));
    const factor = Math.pow(1 + (Number(params.inflation) || 0) / 100, horizon);
    const targetAnnual = api.targetAnnualCashForYear(params, horizon, factor);
    const clampRatio = (value) => Math.min(Math.max(value, 0), 9.99);
    return {
      horizon: `${horizon} Years`,
      finalCorpus: api.formatInr(model.final.closing),
      realFinalValue: api.formatInr(model.final.realClosing),
      finalMonthlyCash: api.formatInr(model.final.withdrawal / 12),
      corpusGoal: `${Math.round(clampRatio(model.final.realClosing / Math.max(1, targetReal)) * 100)}%`,
      cashGoal: `${Math.round(clampRatio(targetAnnual > 0 ? model.final.withdrawal / targetAnnual : 1) * 100)}%`,
      endTargetChance: displayProb(risk.successProbability)
    };
  });
  assert(householdSurface.filterHorizon === householdExpected.horizon, `household effective horizon did not reach rail: ${JSON.stringify({ householdSurface, householdExpected })}`);
  assert(householdSurface.finalCorpus === householdExpected.finalCorpus, `household final corpus stale: ${JSON.stringify({ householdSurface, householdExpected })}`);
  assert(householdSurface.realFinalValue === householdExpected.realFinalValue, `household real final value stale: ${JSON.stringify({ householdSurface, householdExpected })}`);
  assert(householdSurface.finalMonthlyCash === householdExpected.finalMonthlyCash, `household final monthly cash stale: ${JSON.stringify({ householdSurface, householdExpected })}`);
  assert(householdSurface.corpusGoal === householdExpected.corpusGoal && householdSurface.corpusGoal === householdSurface.railCorpusGoal, `household corpus goal mismatch: ${JSON.stringify({ householdSurface, householdExpected })}`);
  assert(householdSurface.cashGoal === householdExpected.cashGoal && householdSurface.cashGoal === householdSurface.railCashGoal, `household cash goal mismatch: ${JSON.stringify({ householdSurface, householdExpected })}`);
  assert(householdSurface.endTargetChance === householdExpected.endTargetChance && householdSurface.endTargetChance === householdSurface.railEndChance, `household end chance mismatch: ${JSON.stringify({ householdSurface, householdExpected })}`);

  await openAssumptionStudio(page);
  await setSelect(page, ".assumption-drawer .control[data-label=\"Use household plan\"] select", "0");
  await page.evaluate(() => document.querySelector(".drawer-backdrop.open .close-button")?.click());
  // Transitional wait — the setInput chain below resets the slow tier
  // anyway and any downstream MC read site does its own slow wait.
  await waitForModelIdle(page, 60000, { includeSlow: false });
  await openView(page, "overview");
  await setInput(page, ".whatif-card .quick-field[data-label=\"Monthly cash\"] input", 75000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Corpus today\"] input", 17500000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 17500000);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Years\"] input", 30);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Inflation\"] input", 6);
  await setInput(page, ".whatif-card .quick-field[data-label=\"Withdrawal\"] input", 50);
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Cash engine\"] select", "swp");
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Mode\"] select", "monthlyTarget");

  await openView(page, "simulations");
  __T("before scenarioLibraryAudit");
  const scenarioLibraryAudit = await page.evaluate(() => ({
    text: document.querySelector(".scenario-library-panel")?.innerText || "",
    cards: document.querySelectorAll(".scenario-library-card").length,
    actions: document.querySelectorAll(".scenario-library-actions button").length
  }));
  assert(/Retirement Stress Case Library/i.test(scenarioLibraryAudit.text), `scenario library missing: ${JSON.stringify(scenarioLibraryAudit)}`);
  assert(scenarioLibraryAudit.cards === 9 && scenarioLibraryAudit.actions === 27, `scenario library changed: ${JSON.stringify(scenarioLibraryAudit)}`);
  await page.evaluate(() => document.querySelector(".scenario-library-card:nth-child(2) .scenario-library-actions button:nth-child(2)")?.click());
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("fin-cockpit-scenario-history-v1") || "[]").some((item) => item.source === "library" && item.exportProvenance?.exportType), { timeout: 8000 });
  const librarySnapshotAudit = await page.evaluate(() => JSON.parse(localStorage.getItem("fin-cockpit-scenario-history-v1") || "[]").find((item) => item.source === "library"));
  assert(librarySnapshotAudit?.taxLawVersion && librarySnapshotAudit?.fingerprint && librarySnapshotAudit?.libraryId, `library snapshot lacks provenance: ${JSON.stringify(librarySnapshotAudit)}`);
  assert(librarySnapshotAudit?.effectiveProjection?.effectiveMonthlyCashNeed !== undefined && librarySnapshotAudit?.effectiveProjection?.effectiveTargetCorpusNominal !== undefined, `library snapshot lacks effective projection evidence: ${JSON.stringify(librarySnapshotAudit)}`);
  await page.evaluate(() => document.querySelector(".scenario-library-card:first-child .scenario-library-actions button:nth-child(3)")?.click());
  const scenarioJsonInfo = await waitForFile(`${downloadDir}/base-retirement-plan.json`, 10000);
  const scenarioJson = JSON.parse(await readFile(`${downloadDir}/base-retirement-plan.json`, "utf8"));
  assert(scenarioJsonInfo.size > 1000 && scenarioJson.snapshot?.exportProvenance?.fingerprint, "scenario JSON export missing snapshot provenance");
  assert(scenarioJson.snapshot?.effectiveProjection?.effectiveMonthlyCashNeed !== undefined, "scenario JSON export missing effective projection evidence");
  await openView(page, "overview");
  const scenarioImportInput = await page.$("input[aria-label='Import saved plan JSON']");
  assert(scenarioImportInput, "scenario timeline import input missing");
  await scenarioImportInput.uploadFile(`${downloadDir}/base-retirement-plan.json`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("fin-cockpit-scenario-history-v1") || "[]").some((item) => item.source === "import"), { timeout: 8000 });
  const importedScenarioAudit = await page.evaluate(() => JSON.parse(localStorage.getItem("fin-cockpit-scenario-history-v1") || "[]").find((item) => item.source === "import"));
  assert(importedScenarioAudit?.fingerprint && importedScenarioAudit?.exportProvenance?.exportType, `imported scenario lacks rebuilt provenance: ${JSON.stringify(importedScenarioAudit)}`);
  assert(importedScenarioAudit?.effectiveProjection?.effectiveYears, `imported scenario lacks effective projection round-trip: ${JSON.stringify(importedScenarioAudit)}`);
  await openView(page, "simulations");
  await setInput(page, ".risk-control-grid .quick-field[data-label=\"Risk runs\"] input", 40);
  await setInput(page, ".risk-control-grid .quick-field[data-label=\"Correlation\"] input", 40);
  __T("before riskControlAudit");
  await waitForModelIdle(page, 60000, { includeSlow: true });
  const riskControlAudit = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const state = api.normalizeState({ ...api.BASE, monteCarloSamples: 40, monteCarloSeed: 2026, equityDebtCorrelation: 40 });
    const risk = api.calculateMonteCarlo(api.projectionParamsFromState(state));
    return {
      text: document.querySelector(".risk-lab")?.innerText || "",
      simulations: risk.simulations,
      seed: risk.seed,
      method: risk.method
    };
  });
  assert(riskControlAudit.text.includes("40"), "risk sample-size control did not update the risk lab");
  assert(riskControlAudit.text.includes("40%"), "risk correlation control did not update the risk lab");
  assert(riskControlAudit.simulations === 40, `risk model ignored sample size: ${JSON.stringify(riskControlAudit)}`);
  assert(riskControlAudit.seed === 2026, `risk model ignored seed: ${JSON.stringify(riskControlAudit)}`);
  assert(riskControlAudit.method.includes("40 fat-tail regime sequence"), "risk model method is not explainable");
  assert(/95% end chance band/i.test(riskControlAudit.text), "risk lab missing confidence band");
  assert(/risk model disclosure/i.test(riskControlAudit.text), "risk lab missing model disclosure");
  await waitForModelIdle(page, 60000, { includeSlow: true });
  const riskSurfaceAudit = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {});
    const risk = api.calculateMonteCarlo(api.projectionParamsFromState(saved), saved.monteCarloSamples);
    const metric = (label) => [...document.querySelectorAll(".risk-lab .mini-metric")].find((item) => item.innerText.toLowerCase().includes(label.toLowerCase()))?.querySelector("strong")?.textContent.trim() || "";
    return {
      p10: metric("P10"),
      p50: metric("P50"),
      p90: metric("P90"),
      worst: metric("Worst"),
      expectedP10: api.formatInr(api.quantile(risk.finals, 0.1)),
      expectedP50: api.formatInr(api.quantile(risk.finals, 0.5)),
      expectedP90: api.formatInr(api.quantile(risk.finals, 0.9)),
      expectedWorst: api.formatInr(risk.worst),
      text: document.querySelector(".risk-lab")?.innerText || ""
    };
  });
  assert(riskSurfaceAudit.p10 === riskSurfaceAudit.expectedP10 && riskSurfaceAudit.p50 === riskSurfaceAudit.expectedP50 && riskSurfaceAudit.p90 === riskSurfaceAudit.expectedP90 && riskSurfaceAudit.worst === riskSurfaceAudit.expectedWorst, `risk mini metrics are stale: ${JSON.stringify(riskSurfaceAudit)}`);
  await page.click(".risk-rerun-button");
  await waitForModelIdle(page);
  const rerunText = await text(page, ".risk-lab");
  assert(rerunText.includes("96"), "risk rerun did not increase sample size to at least 96");
  const initialHeat = await text(page, ".heatmap");
  await openView(page, "planner");
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 45000000);
  await openView(page, "simulations");
  const heatAfter = await text(page, ".heatmap");
  const heatCells = await page.$$eval(".heat-cell", (cells) => cells.map((cell) => cell.textContent.trim().replace(/\s+/g, " ")));
  assert(heatAfter !== initialHeat, "heatmap did not update after assumption changes");
  assert(!heatCells.every((cell) => cell.startsWith("₹0 ")), "heatmap collapsed to all zero cells");
  assert(heatCells[0] !== heatCells[24], "heatmap rows are not independent");
  const deterministicHeat = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const inr = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "N/A";
      const abs = Math.abs(numeric || 0);
      const sign = numeric < 0 ? "-" : "";
      if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(abs >= 100000000 ? 1 : 2)} Cr`;
      if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(abs >= 1000000 ? 1 : 2)} L`;
      return `${sign}₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(abs)}`;
    };
    const first = document.querySelector(".heat-cell");
    const state = api.normalizeState({
      ...api.BASE,
      principal: 17500000,
      targetCorpus: 45000000,
      monthlyTarget: 75000,
      years: 30,
      inflation: 6,
      withdrawRate: 50,
      incomeMode: "swp",
      cashMode: "interestPercent"
    });
    const params = {
      ...api.projectionParamsFromState(state),
      useAssetReturns: 0,
      annualRate: 6,
      withdrawRate: 0,
      cashMode: "interestPercent"
    };
	    const projection = api.calculate(params).final;
    const realValue = projection.closing / Math.pow(1 + state.inflation / 100, state.years);
    return {
      aria: first?.getAttribute("aria-label") || "",
      expectedFinal: inr(projection.closing),
      expectedReal: inr(realValue)
    };
  });
  assert(deterministicHeat.aria.includes(deterministicHeat.expectedFinal), `heatmap first cell final value drifted: ${JSON.stringify(deterministicHeat)}`);
  assert(deterministicHeat.aria.includes(deterministicHeat.expectedReal), `heatmap first cell real value drifted: ${JSON.stringify(deterministicHeat)}`);

  await openView(page, "planner");
  await openAssumptionStudio(page);
  await setInput(page, ".assumption-drawer .control[data-label=\"Starting principal\"] input", 22000000);
  const backSync = await page.$eval(".whatif-card .quick-field[data-label=\"Corpus today\"] input", (el) => el.value);
  assert(backSync === "22000000", "Assumption Studio edit did not sync back to dashboard");

  await openView(page, "overview");
  await setSelect(page, ".whatif-card .quick-field[data-label=\"Mode\"] select", "interestPercent");
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 17500000);
  await waitForModelIdle(page, 60000, { includeSlow: true });
  const chanceBase = percentFrom(await text(page, ".ratio-strip .gauge-card:nth-child(3)"));
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 10000000);
  await waitForModelIdle(page, 60000, { includeSlow: true });
  const chanceLowTarget = percentFrom(await text(page, ".ratio-strip .gauge-card:nth-child(3)"));
  await setInput(page, ".whatif-card .quick-field[data-label=\"Target today\"] input", 50000000);
  await waitForModelIdle(page, 60000, { includeSlow: true });
  const chanceHighTarget = percentFrom(await text(page, ".ratio-strip .gauge-card:nth-child(3)"));
  assert(chanceLowTarget > chanceBase, "End Target Chance did not rise when target dropped");
  assert(chanceHighTarget < chanceLowTarget, "End Target Chance did not fall when target rose");

  __T("before railAudit");
  const railAudit = await page.evaluate(() => {
    const col = document.querySelector(".insights-column");
    const stack = document.querySelector(".insights-scroll");
    const layout = document.querySelector(".layout-console");
    const before = layout.getBoundingClientRect().top;
    col.scrollTop = 240;
    return {
      colScrollTop: col.scrollTop,
      colOverflow: getComputedStyle(col).overflowY,
      colScrollbar: getComputedStyle(col).scrollbarWidth,
      stackOverflow: getComputedStyle(stack).overflowY,
      layoutMoved: layout.getBoundingClientRect().top < before
    };
  });
  assert(railAudit.colScrollTop > 0, "right rail did not scroll");
  assert(railAudit.colOverflow === "auto", `right rail overflow is ${railAudit.colOverflow}`);
  assert(railAudit.stackOverflow === "visible", `inner insights stack still scrolls: ${railAudit.stackOverflow}`);
  assert(railAudit.layoutMoved, "Canvas Control did not move with the right rail");

  await openView(page, "schedule");
  const reviewPackPanelAudit = await page.evaluate(() => ({
    text: document.querySelector(".review-pack-panel")?.innerText || "",
    cells: document.querySelectorAll(".review-pack-grid > div").length,
    actions: document.querySelectorAll(".review-pack-actions button").length
  }));
  assert(/Review Pack For Professional Challenge/i.test(reviewPackPanelAudit.text), `review pack panel missing: ${JSON.stringify(reviewPackPanelAudit)}`);
  assert(/tax-law json/i.test(reviewPackPanelAudit.text) && /risk method/i.test(reviewPackPanelAudit.text), "review pack panel missing required evidence labels");
  assert(reviewPackPanelAudit.cells >= 6 && reviewPackPanelAudit.actions >= 4, `review pack panel controls incomplete: ${JSON.stringify(reviewPackPanelAudit)}`);
  await page.click(".review-pack-actions .primary");
  const reviewPackPath = `${downloadDir}/retirement_adviser_ca_review_pack.json`;
  await waitForFile(reviewPackPath, 60000);
  const reviewPack = JSON.parse(await readFile(reviewPackPath, "utf8"));
  assert(reviewPack.exportType === "Adviser and CA review pack", `wrong review pack type: ${reviewPack.exportType}`);
  assert(reviewPack.provenance?.assumptionsFingerprint && reviewPack.provenance?.taxLawVersion && reviewPack.provenance?.riskSeed, "review pack missing provenance");
  assert(reviewPack.caveatPage?.some((line) => /PDF\/UA|machine-readable/i.test(line)), "review pack missing PDF accessibility limitation");
  assert(reviewPack.artifacts?.csvLedger?.includes("Review Pack Ledger"), "review pack missing embedded CSV ledger");
  assert(reviewPack.artifacts?.taxLawJson?.version && reviewPack.artifacts?.assumptionsJson?.principal, "review pack missing tax law or assumptions JSON");
  assert(reviewPack.artifacts?.scenarioComparison?.length >= 6 && reviewPack.artifacts?.riskSummary, "review pack missing scenario comparison or risk summary");
  assert(reviewPack.artifacts?.effectiveProjection?.effectiveMonthlyCashNeed !== undefined, "review pack missing effective projection evidence");
  assert(reviewPack.artifacts.scenarioComparison.every((item) => item.effectiveProjection?.effectiveYears), "scenario comparison missing effective projection evidence");
  await rm(`${downloadDir}/retirement_corpus_income_planner.csv`, { force: true });
  await rm(`${downloadDir}/retirement_corpus_income_planner.pdf`, { force: true });
  await page.evaluate(() => document.querySelector(".ledger-toolbelt button:nth-child(3)")?.click());
  await new Promise((resolve) => setTimeout(resolve, 120));
  __T("before ledgerUxAudit");
  const ledgerUxAudit = await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const headers = [...document.querySelectorAll("#schedule .table-wrap.schedule thead th")].map((item) => item.textContent.trim());
    const firstToggle = document.querySelector(".ledger-column-toggle");
    firstToggle?.click();
    await nextFrame();
    const afterHeaders = [...document.querySelectorAll("#schedule .table-wrap.schedule thead th")].map((item) => item.textContent.trim());
    const sticky = getComputedStyle(document.querySelector("#schedule .table-wrap.schedule thead th")).position;
    const jump = document.querySelector(".ledger-jump select");
    if (jump && jump.options.length > 1) {
      jump.value = jump.options[1].value;
      jump.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await nextFrame();
    return {
      headers,
      afterHeaders,
      toggles: document.querySelectorAll(".ledger-column-toggle").length,
      glossary: document.querySelector(".ledger-glossary")?.innerText || "",
      sticky,
      searchValue: document.querySelector(".ledger-filter input")?.value || "",
      exportVisible: [...document.querySelectorAll(".ledger-toolbelt button")].some((button) => /visible rows/i.test(button.textContent || ""))
    };
  });
  assert(ledgerUxAudit.toggles >= 8, `ledger column controls missing: ${JSON.stringify(ledgerUxAudit)}`);
  assert(ledgerUxAudit.afterHeaders.length < ledgerUxAudit.headers.length, "ledger column toggle did not hide a column");
  assert(ledgerUxAudit.sticky === "sticky", `ledger header is not sticky: ${JSON.stringify(ledgerUxAudit)}`);
  assert(ledgerUxAudit.searchValue, "ledger jump control did not drive row filtering");
  assert(ledgerUxAudit.glossary.includes("Cost Capital") && ledgerUxAudit.glossary.includes("Taxable Gain"), "ledger glossary missing core terms");
  assert(ledgerUxAudit.exportVisible, "ledger visible-row CSV action missing");
  await page.evaluate(() => {
    document.querySelector(".ledger-column-toggle")?.click();
    const filter = document.querySelector(".ledger-filter input");
    if (filter instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(filter, "");
      filter.dispatchEvent(new Event("input", { bubbles: true }));
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const ledgerValueAudit = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {});
    const model = api.calculate(api.projectionParamsFromState(saved));
    const firstDataRow = document.querySelector("#schedule .table-wrap.schedule tbody tr")?.innerText || "";
    const row = model.monthlyRows?.[0] || model.rows[1] || model.rows[0];
    return {
      firstDataRow,
      expectedOpening: api.formatInr(row.opening),
      expectedClosing: api.formatInr(row.closing),
      expectedCash: api.formatInr(row.withdrawal)
    };
  });
  assert(ledgerValueAudit.firstDataRow.includes(ledgerValueAudit.expectedOpening) && ledgerValueAudit.firstDataRow.includes(ledgerValueAudit.expectedClosing) && ledgerValueAudit.firstDataRow.includes(ledgerValueAudit.expectedCash), `ledger first row does not reconcile to active model: ${JSON.stringify(ledgerValueAudit)}`);

  await openView(page, "tax");
  const idcwComparisonText = await text(page, ".idcw-comparison");
  assert(idcwComparisonText.includes("IDCW reality check"), "IDCW caveat/comparison missing");
  assert(idcwComparisonText.includes("SWP net cash"), "IDCW vs SWP comparison missing");
  await page.evaluate(() => document.querySelector("#tax .panel-head button").click());
  await page.waitForSelector(".help-drawer", { timeout: 5000 });
  const help = await page.evaluate(() => {
    const drawer = document.querySelector(".help-drawer");
    return {
      title: drawer.querySelector("h2")?.textContent.trim(),
      text: drawer.innerText,
      sections: drawer.querySelectorAll(".help-sections section").length
    };
  });
  assert(help.title === "Tax Assumptions & Scenarios", `wrong tax help title ${help.title}`);
  assert(help.text.includes("Section 87A rebate framework"), "tax help missing dynamic Section 87A guidance");
  assert(help.text.includes("special-rate capital gains"), "tax help missing special-rate guidance");
  assert(help.text.includes("retiree tax profile"), "tax help missing retiree profile guidance");
  assert(!help.text.includes("does not yet automatically apply"), "tax help still describes fixed limitation");
  assert(help.sections >= 5, "tax help is missing detailed sections");

  await page.evaluate(() => [...document.querySelectorAll(".help-grid button")].find((button) => button.innerText.includes("Tax Law Studio"))?.click());
  await new Promise((resolve) => setTimeout(resolve, 120));
  const taxLawHelp = await page.evaluate(() => {
    const drawer = document.querySelector(".help-drawer");
    const expanded = drawer.querySelector(".help-topic-card.expanded");
    return {
      readerTitle: drawer.querySelector("h2")?.textContent.trim(),
      expandedTitle: expanded?.querySelector(".help-topic-trigger strong")?.textContent.trim() || "",
      text: expanded?.innerText || ""
    };
  });
  assert(taxLawHelp.readerTitle === "Tax Assumptions & Scenarios", `topic-library browsing should not replace the current reader: ${JSON.stringify(taxLawHelp)}`);
  assert(taxLawHelp.expandedTitle === "Tax Law Studio", `wrong expanded tax-law help title ${JSON.stringify(taxLawHelp)}`);
  assert(taxLawHelp.text.includes("review step"), "tax-law help missing review-first automation warning");
  assert(taxLawHelp.text.includes("Apply rules"), "tax-law help missing rules application guidance");

  await openView(page, "planner");
  await page.evaluate(() => document.querySelector("#action-plan .panel-head button").click());
  await new Promise((resolve) => setTimeout(resolve, 120));
  const policyHelp = await page.evaluate(() => {
    const drawer = document.querySelector(".help-drawer");
    return { title: drawer.querySelector("h2")?.textContent.trim(), text: drawer.innerText };
  });
  assert(policyHelp.title === "Withdrawal Policy & Trust Plan", `wrong policy help title ${policyHelp.title}`);
  assert(policyHelp.text.includes("Common Mistakes To Avoid"), "policy help missing mistakes guide");
  assert(policyHelp.text.includes("Instrument Glossary"), "policy help missing instrument glossary");

  await page.evaluate(() => document.querySelector(".help-drawer .close-button").click());
  await new Promise((resolve) => setTimeout(resolve, 120));
  await page.click(".actions button[title=\"Open help\"]");
  await page.waitForSelector(".help-drawer", { timeout: 5000 });
  const helpSystemAudit = await page.evaluate(() => ({
    readerTitle: document.querySelector(".help-reader h2")?.textContent.trim() || "",
    hasSearch: Boolean(document.querySelector(".help-search input")),
    hasTourButton: [...document.querySelectorAll(".help-drawer button")].some((button) => /tour/i.test(button.textContent)),
    hasReader: Boolean(document.querySelector(".help-reader")),
    hasTopicLibrary: Boolean(document.querySelector(".help-topic-library")),
    libraryLabel: document.querySelector(".help-library-head")?.textContent || "",
    hasGuideTabs: document.querySelectorAll(".help-topic-trigger").length,
    coachCards: document.querySelectorAll(".help-coach-panel button").length,
    coachText: document.querySelector(".help-coach-panel")?.innerText || ""
  }));
  assert(helpSystemAudit.readerTitle === "Guided Tutorial", `default help button must open the guided tutorial reader: ${JSON.stringify(helpSystemAudit)}`);
  assert(helpSystemAudit.hasSearch, "help system overhaul needs search");
  assert(helpSystemAudit.hasTourButton, "help system needs a callable product tour");
  assert(helpSystemAudit.hasReader && helpSystemAudit.hasTopicLibrary, "help system needs separated reader and topic-library surfaces");
  assert(/topic library|browse all guidance|in place/i.test(helpSystemAudit.libraryLabel), "help topic library needs a visible section label and in-place guidance");
  assert(helpSystemAudit.hasGuideTabs >= 10, "help system lost topic coverage");
  assert(helpSystemAudit.coachCards >= 4 && /number moved|trust it/i.test(helpSystemAudit.coachText), "context coach missing from help system");
  await page.evaluate(() => {
    [...document.querySelectorAll(".help-topic-trigger")].find((button) => button.innerText.includes("Why Numbers Changed"))?.click();
  });
  await page.waitForFunction(() => {
    const expanded = document.querySelector(".help-topic-card.expanded");
    return expanded && /Why Numbers Changed/.test(expanded.querySelector(".help-topic-trigger strong")?.textContent || "");
  }, { timeout: 2500 });
  __T("before helpInPlaceAudit");
  const helpInPlaceAudit = await page.evaluate(() => ({
    readerTitle: document.querySelector(".help-reader h2")?.textContent.trim() || "",
    expandedTitle: document.querySelector(".help-topic-card.expanded .help-topic-trigger strong")?.textContent || "",
    expandedText: document.querySelector(".help-topic-card.expanded .help-topic-detail")?.innerText || ""
  }));
  assert(helpInPlaceAudit.readerTitle === "Guided Tutorial", `topic-library browsing should preserve the default reader instead of yanking focus to the top: ${JSON.stringify(helpInPlaceAudit)}`);
  assert(helpInPlaceAudit.expandedTitle === "Why Numbers Changed", `help topic did not expand in place: ${JSON.stringify(helpInPlaceAudit)}`);
  assert(helpInPlaceAudit.expandedText.includes("Save a baseline"), `expanded topic missing tutorial content: ${JSON.stringify(helpInPlaceAudit)}`);
  await page.evaluate(() => [...document.querySelectorAll(".help-grid button")].find((button) => button.innerText.includes("Hindi Retirement Glossary"))?.click());
  const regionalHelpAudit = await page.evaluate(() => ({
    title: document.querySelector(".help-topic-card.expanded .help-topic-trigger strong")?.textContent || "",
    text: document.querySelector(".help-topic-card.expanded")?.innerText || ""
  }));
  assert(regionalHelpAudit.title.includes("Hindi") && regionalHelpAudit.text.includes("मासिक नकद"), `regional Hindi help pilot missing: ${JSON.stringify(regionalHelpAudit)}`);
  await page.evaluate(() => [...document.querySelectorAll(".help-grid button")].find((button) => button.innerText.includes("Local Data & Privacy"))?.click());
  const privacyHelpAudit = await page.evaluate(() => {
    const expanded = document.querySelector(".help-topic-card.expanded");
    return {
      title: expanded?.querySelector(".help-topic-trigger strong")?.textContent.trim() || "",
      hasClearControl: [...expanded.querySelectorAll("button")].some((button) => /Clear saved data/i.test(button.textContent || "")),
      text: expanded?.innerText || ""
    };
  });
  assert(privacyHelpAudit.title === "Local Data & Privacy", `wrong privacy help title: ${JSON.stringify(privacyHelpAudit)}`);
  assert(privacyHelpAudit.hasClearControl, "privacy help missing direct clear saved data control");
  // R4.5b: help drawer now lists new disclaimer_acknowledged_v1 key (legacy key also listed for migration docs)
  assert(privacyHelpAudit.text.includes("disclaimer_acknowledged_v1"), "privacy help missing new disclaimer key inventory");
  assert(privacyHelpAudit.text.includes("fin-cockpit-privacy-consent-v1"), "privacy help missing legacy consent key inventory");
  assert(privacyHelpAudit.text.includes("fin-cockpit-scenario-history-v1"), "privacy help missing scenario-history key inventory");
  assert(/downloaded exports remain/i.test(privacyHelpAudit.text), "privacy help missing export retention warning");
  await page.evaluate(() => [...document.querySelectorAll(".help-grid button")].find((button) => button.innerText.includes("Retirement Glossary"))?.click());
  const glossaryAudit = await page.evaluate(() => ({
    title: document.querySelector(".help-topic-card.expanded .help-topic-trigger strong")?.textContent.trim() || "",
    text: document.querySelector(".help-topic-card.expanded")?.innerText || ""
  }));
  assert(glossaryAudit.title === "Retirement Glossary", `wrong glossary topic expanded: ${JSON.stringify(glossaryAudit)}`);
  ["SWP", "IDCW", "FIFO", "LTCG", "STCG", "87A", "80TTB", "surcharge", "cess"].forEach((term) => {
    assert(new RegExp(term, "i").test(glossaryAudit.text), `glossary missing ${term}`);
  });
  await page.evaluate(() => [...document.querySelectorAll(".help-drawer button")].find((button) => /tour/i.test(button.textContent))?.click());
  await page.waitForSelector(".guided-tour", { timeout: 5000 });
  await page.waitForFunction(() => Boolean(document.getElementsByClassName("tour-highlight")[0]), { timeout: 1000 });
  const tourTargetAudit = await page.evaluate(() => ({
    target: document.querySelector(".tour-target")?.textContent || "",
    highlighted: Boolean(document.getElementsByClassName("tour-highlight")[0]),
    anchored: Boolean(document.querySelector(".guided-tour.is-anchored .tour-spotlight")),
    spotlightShadow: getComputedStyle(document.querySelector(".tour-spotlight")).boxShadow || "",
    backdropFilter: getComputedStyle(document.querySelector(".tour-backdrop")).backdropFilter || ""
  }));
  assert(tourTargetAudit.target.includes("Spotlighting"), `guided tour target text missing: ${JSON.stringify(tourTargetAudit)}`);
  assert(tourTargetAudit.highlighted, "guided tour did not highlight current product area");
  assert(tourTargetAudit.anchored, `guided tour did not anchor a spatial spotlight: ${JSON.stringify(tourTargetAudit)}`);
  assert(tourTargetAudit.spotlightShadow.includes("9999px"), `guided tour spotlight missing dimming geometry: ${JSON.stringify(tourTargetAudit)}`);
  assert(!/blur\((?:[1-9]|\d{2})/i.test(tourTargetAudit.backdropFilter), `guided tour backdrop is hiding the product context: ${JSON.stringify(tourTargetAudit)}`);
  await dismissTour(page);
  await page.evaluate(() => document.querySelector(".help-drawer .close-button")?.click());
  await new Promise((resolve) => setTimeout(resolve, 120));

  const exportSurface = await captureProjectionSurface(page);
  const exportExpected = await captureExpectedProjectionSurface(page);
  assertSurfaceParity(exportSurface, exportExpected, "pre-export live surface");
  // R4.9.5i: exportCsv() now emits a ZIP (retirement-plan-{fingerprint}-{date}.zip)
  // with 6 sheets per audit/round-3/02-spec.md §14. Detailed CSV schema +
  // reconciliation invariants verified by tests/e2e/csv-export-regression.mjs
  // (31 assertions, 3 axes). Smoke check here that the ZIP downloaded.
  await page.click(".actions button[title=\"Export CSV\"]");
  const zipPath = await (async () => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const files = await readdir(downloadDir).catch(() => []);
      const match = files.find((f) => /^retirement-plan-.*\.zip$/.test(f));
      if (match) {
        const info = await stat(`${downloadDir}/${match}`).catch(() => null);
        if (info && info.size > 2000) return `${downloadDir}/${match}`;
      }
      await new Promise((r) => setTimeout(r, 180));
    }
    throw new Error("Timed out waiting for retirement-plan-*.zip");
  })();
  const zipInfo = await stat(zipPath);
  assert(zipInfo.size > 2000, `CSV ZIP export unexpectedly small: ${zipInfo.size}`);

  await page.click(".actions button[title=\"Export PDF\"]");
  const pdfPath = `${downloadDir}/retirement_corpus_income_planner.pdf`;
  const pdfInfo = await waitForFile(pdfPath);
  const pdfBody = await readFile(pdfPath);
  const imageCount = (pdfBody.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length;
  const pdfText = await extractPdfText(pdfBody);
  // R4.9.5g atomic flip: the new 7-section structured report is the default
  // export. It uses jspdf-autotable for §3-§6 and emits ~3 rasterised chart
  // PNGs from §3 Plan Diagnosis. Old dark-theme PDF marker assertions
  // ("Advisor Action Plan", "Trust & Export Caveats", "Visual Evidence",
  // "Cash target", "Starting corpus", "not claimed as PDF/UA") have been
  // mapped to their equivalents in the new PDF:
  //   - "Advisor Action Plan"     → §2 CLOSING THE GAP (closing-the-gap actions)
  //   - "Trust & Export Caveats"  → §7 ACCESSIBILITY POSTURE + DISCLAIMER
  //   - "Visual Evidence"         → §3 PLAN DIAGNOSIS (charts)
  //   - "Cash target"             → §1 PLAN INPUTS (Monthly cash target row)
  //   - "Starting corpus"         → §1 PLAN INPUTS (Starting corpus row)
  //   - "not claimed as PDF/UA"   → §7 a11y honesty paragraph (preserved verbatim)
  assert(pdfInfo.size > 30_000, `PDF export unexpectedly small: ${pdfInfo.size}`);
  // Charts are rasterised inside src/exports/pdf-report.js renderPlanDiagnosis;
  // when the page renders under puppeteer (real document/canvas) we expect ≥ 3
  // images from §3. Under jsdom they are skipped — guard the assertion to the
  // real-browser path so the test stays accurate.
  assert(imageCount >= 3, `PDF export should embed at least three chart images from §3 Plan Diagnosis, found ${imageCount}`);
  for (const marker of [
    "Retirement Corpus & Income Planner",     // §1 title
    "PLAN INPUTS AT A GLANCE",                // §1 inputs strip
    "Starting corpus",                        // §1 input row (was old marker too)
    "Monthly cash target",                    // §1 input row (was "Cash target" in old PDF)
    "Tax ruleset",                            // §1 input row (preserved across PDF versions)
    "FY 2025-26",                             // §1 + §4 tax-law provenance
    "CAN THIS PLAN WORK?",                    // §2 verdict band (replaces old "Advisor Action Plan" lead)
    "CLOSING THE GAP",                        // §2 closing-the-gap consolidated tile (advisor actions)
    "PLAN DIAGNOSIS",                         // §3 (replaces "Visual Evidence" — same charts, new framing)
    "P50 corpus",                             // §3 chart-1 sibling data-table header (a11y surrogate; chart title is rasterised)
    "Projection summary",                     // §3 summary table caption
    "TAX RULESET PROVENANCE",                 // §4 provenance band
    "SCENARIOS",                              // §5 section heading
    "MONTH-BY-MONTH CASH FLOW LEDGER",        // §6 section heading
    "METHODOLOGY",                            // §7 section heading
    "DISCLAIMER",                             // §7 full disclaimer page header
    "MIT License",                            // §7 license attribution
    "not claimed as PDF/UA",                  // §7 a11y honesty (preserved verbatim from old PDF)
    "Stribog IT Solutions",                   // §7 license owner (LICENSE attribution)
    "Fingerprint:",                           // §1 cover fingerprint label
  ]) {
    assert(pdfText.includes(marker), `PDF text missing ${marker}`);
  }
  assert(/FY 2025-26|E2E uploaded tax law|E2E editable tax law/.test(pdfText), "PDF text missing tax-law provenance");
  for (const value of [exportExpected.finalCorpus, exportExpected.cashWithdrawn, exportExpected.realFinalValue, exportExpected.finalMonthlyCash].map((item) => item.replace("₹", "INR "))) {
    assert(pdfText.includes(value), `PDF export missing live value ${value}`);
  }

  const accessibility = await page.evaluate(() => {
    const unlabeledButtons = [...document.querySelectorAll("button")].filter((button) => {
      const text = button.textContent.trim();
      return !text && !button.getAttribute("aria-label") && !button.getAttribute("title");
    }).length;
    const unlabeledInputs = [...document.querySelectorAll("input,select,textarea")].filter((control) => {
      if (control.type === "hidden") return false;
      const id = control.id;
      const wrapped = Boolean(control.closest("label"));
      const labelled = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      return !wrapped && !labelled && !control.getAttribute("aria-label");
    }).length;
    return { unlabeledButtons, unlabeledInputs };
  });
  assert(accessibility.unlabeledButtons === 0, `${accessibility.unlabeledButtons} buttons lack accessible names`);
  assert(accessibility.unlabeledInputs === 0, `${accessibility.unlabeledInputs} controls lack labels`);

  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  await page.reload({ waitUntil: "networkidle0" });
  await openView(page, "overview");
  const mobile = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    charts: document.querySelectorAll("canvas").length,
    controls: document.querySelectorAll(".whatif-card .quick-field").length,
    verdictVisible: getComputedStyle(document.querySelector(".mobile-verdict-card")).display !== "none",
    verdictActions: document.querySelectorAll(".mobile-verdict-actions button").length,
    // R4.9.5b-1 (fin-c0g): "End Target Chance" renamed to "Target Confidence"; "Plan Endurance" added as primary
    endChance: [...document.querySelectorAll(".gauge-card")].some((card) => /target confidence|plan endurance/i.test(card.innerText)),
    tabbar: getComputedStyle(document.querySelector(".mobile-tabbar")).display !== "none",
    minTabbarHeight: Math.min(...[...document.querySelectorAll(".mobile-tabbar button")].map((button) => button.getBoundingClientRect().height)),
    topbarActions: [...document.querySelectorAll(".topbar .actions > button:not(.mobile-secondary), .topbar .actions > .mobile-action-menu > summary")]
      .filter((element) => getComputedStyle(element).display !== "none")
      .length,
    quickActionsHidden: getComputedStyle(document.querySelector(".mobile-quick-actions")).display === "none"
  }));
  assert(mobile.scrollWidth <= mobile.width + 24, `mobile overflow ${mobile.scrollWidth - mobile.width}`);
  assert(mobile.charts >= 2, `mobile overview charts missing ${mobile.charts}`);
  assert(mobile.controls >= 8, `mobile controls missing ${mobile.controls}`);
  assert(mobile.verdictVisible && mobile.verdictActions >= 3, `mobile verdict card missing: ${JSON.stringify(mobile)}`);
  assert(mobile.endChance, "Plan Endurance / Target Confidence missing on mobile");
  assert(mobile.tabbar && mobile.topbarActions === 5 && mobile.quickActionsHidden, `mobile navigation shell mismatch: ${JSON.stringify(mobile)}`);
  assert(mobile.minTabbarHeight >= 44, `mobile tab targets too small: ${mobile.minTabbarHeight}`);
  const mobileValueAudit = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {});
    const params = api.projectionParamsFromState(saved);
    const model = api.calculate(params);
    const risk = api.calculateMonteCarlo(params, saved.monteCarloSamples);
    const text = document.querySelector(".mobile-verdict-card")?.innerText || "";
    return {
      text,
      finalMonthlyCash: api.formatInr(model.final.withdrawal / 12),
      realFinalValue: api.formatInr(model.final.realClosing),
      taxDrag: api.formatInr(model.final.cumTax),
      // MobileVerdictCard renders formatPct(chance) (raw precision, NOT bucketed) — keep oracle aligned.
      chance: api.formatPct(risk.successProbability)
    };
  });
  for (const value of [mobileValueAudit.finalMonthlyCash, mobileValueAudit.realFinalValue, mobileValueAudit.taxDrag, mobileValueAudit.chance]) {
    assert(mobileValueAudit.text.includes(value), `mobile verdict stale or missing ${value}: ${JSON.stringify(mobileValueAudit)}`);
  }
  await page.click(".mobile-verdict-actions button:nth-child(2)");
  await page.waitForSelector(".mobile-insights-sheet.open", { timeout: 1000 });
  const mobileSheetAudit = await page.evaluate(() => ({
    text: document.querySelector(".mobile-insights-sheet.open")?.innerText || "",
    visible: Boolean(document.querySelector(".mobile-insights-sheet.open"))
  }));
  assert(mobileSheetAudit.visible && mobileSheetAudit.text.includes("Projection Statement"), "mobile insights sheet did not open with context");
  await page.evaluate(() => document.querySelector(".mobile-sheet-head button")?.click());
  await page.waitForFunction(() => !document.querySelector(".mobile-insights-sheet.open"), { timeout: 1000 });
  await openView(page, "schedule");
  const mobileLedgerAudit = await page.evaluate(() => ({
    visible: getComputedStyle(document.querySelector(".mobile-ledger-cards")).display !== "none",
    cards: document.querySelectorAll(".mobile-ledger-cards section").length,
    firstText: document.querySelector(".mobile-ledger-cards section")?.innerText || ""
  }));
  assert(mobileLedgerAudit.visible && mobileLedgerAudit.cards >= 3, `mobile card-based ledger missing: ${JSON.stringify(mobileLedgerAudit)}`);
  assert(/Opening|Closing|Cash/i.test(mobileLedgerAudit.firstText), "mobile ledger cards do not expose financial fields");

  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ ok: true, firstLaunchTour, smoke, interactionLatency, inputLatency, sustainedTyping, modelSettleLatency, focusAudit, plannerTileLatency, sync, userCaseConsistency, railAudit, helpSystemAudit, mobile }, null, 2));
} finally {
    server.close();
    await rm(downloadDir, { recursive: true, force: true });
  }
});
