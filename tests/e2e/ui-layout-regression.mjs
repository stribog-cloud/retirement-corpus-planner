import { createServer } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { withBrowser } from "./_browser-helper.mjs";

const root = process.cwd();
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
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

async function auditViewport(page, viewport, view = "overview") {
  await page.setViewport(viewport);
  await page.goto(page.auditUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const privacy = document.querySelector(".disclaimer-notice-card");
    if (privacy) [...privacy.querySelectorAll("button")].find((button) => /understand/i.test(button.textContent))?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")].find((button) => /skip|start planning|finish/i.test(button.textContent))?.click();
  });
  await page.waitForSelector(".whatif-card", { timeout: 10000 });
  if (view !== "overview") {
    const navSelector = viewport.width <= 430 ? `.mobile-tabbar button[data-view="${view}"]` : `.nav-list button[data-view="${view}"]`;
    await page.click(navSelector);
    await page.waitForFunction((nextView) => document.querySelector(".main-stack")?.dataset.activeView === nextView, {}, view);
    await new Promise((resolve) => setTimeout(resolve, 180));
    // R4.9.5c: optimizer cards depend on optimum.strategies populated by
    // slow-tier MC. At N=1000 in headless Chrome the slow tier takes much
    // longer than the 180 ms post-nav grace period. Wait for slow tier idle.
    if (view === "planner") {
      await page.waitForFunction(() => {
        const stack = document.querySelector(".main-stack");
        return stack && stack.dataset.analyticsSlowPending !== "true";
      }, { timeout: 60000 }).catch(() => {});
    }
  }

  return page.evaluate((activeView) => {
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      let parent = element.parentElement;
      while (parent) {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.display === "none" || parentStyle.visibility === "hidden") return false;
        if (parent.tagName === "DETAILS" && !parent.open && element.tagName !== "SUMMARY") return false;
        parent = parent.parentElement;
      }
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 4 && rect.height > 4;
    };
    const overlap = (a, b) => {
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return x * y;
    };
    const label = (element) => {
      const text = element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60);
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : ""}${text ? `:${text}` : ""}`;
    };
    const hasMotion = (value) => value.split(",").some((part) => {
      const trimmed = part.trim();
      if (!trimmed) return false;
      return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) > 0 : Number.parseFloat(trimmed) > 0;
    });
    const overlapFailures = [];
    const overlapGroups = [
      [".kpi-strip", ".stat-card"],
      [".ratio-strip", ".gauge-card"],
      [".decision-map", ".decision-map-card"],
      [".next-action-grid", ".next-action-card"],
      [".scenario-strip", ".scenario-chip"],
      [".trust-center-grid", ".trust-center-grid button"],
      [".whatif-controls", ".quick-field"],
      [".guided-intake-grid", ".quick-field,.guided-activate"],
      ["#optimizer .advisor-summary", ".strategy-score,.advisor-diagnosis,.optimizer-apply"],
      ["#optimizer .wizard-grid", ".choice-group"],
      ["#optimizer .strategy-grid", ".strategy-card"],
      ["#optimizer .instrument-lanes", ".instrument-lanes > div"],
      ["#action-plan .policy-hero", ".policy-hero > div"],
      ["#action-plan .policy-grid", ".policy-grid > div"],
      ["#action-plan .advisor-columns", ".advisor-columns > section"],
      [".chart-pair", ".panel"],
      [".scenario-library-grid", ".scenario-library-card"],
      [".review-pack-grid", ".review-pack-grid > div"],
      [".tax-grid", ".tax-cell"],
      [".metric-row", ".mini-metric"]
    ];
    overlapGroups.forEach(([parentSelector, childSelector]) => {
      document.querySelectorAll(parentSelector).forEach((parent, parentIndex) => {
        const children = [...parent.querySelectorAll(childSelector)].filter(visible).map((element) => ({ element, rect: rectFor(element) }));
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            const area = overlap(children[i].rect, children[j].rect);
            if (area > 8) {
              overlapFailures.push(`${parentSelector}[${parentIndex}] ${label(children[i].element)} overlaps ${label(children[j].element)} by ${Math.round(area)}px`);
            }
          }
        }
      });
    });

    const clipFailures = [];
    const clipSelectors = [
      ".actions button",
      ".nav-list button",
      ".stat-head",
      ".stat-value",
      ".stat-sub",
      ".decision-verdict",
      ".decision-map-card",
      ".next-action-card",
      ".scenario-chip",
      ".trust-center-grid button",
      ".trust-center-actions button",
      ".guided-mode-hero",
      ".retiree-guided-mode .quick-field",
      ".guided-output-grid > div",
      ".scenario-library-card",
      ".review-pack-grid > div",
      ".gauge-card span",
      ".gauge-card strong",
      ".gauge-card small",
      ".quick-field",
      "#optimizer .choice-group button",
      "#optimizer .strategy-card",
      "#optimizer .instrument-lanes > div",
      "#action-plan .policy-hero > div",
      "#action-plan .policy-grid > div",
      "#action-plan .advisor-columns > section",
      ".layout-range",
      ".help-panel-button",
      ".studio-button"
    ];
    document.querySelectorAll(clipSelectors.join(",")).forEach((element) => {
      if (!visible(element)) return;
      const horizontalClip = element.scrollWidth > element.clientWidth + 3;
      const verticalClip = element.scrollHeight > element.clientHeight + 3;
      if (horizontalClip || verticalClip) {
        clipFailures.push(`${label(element)} clipped ${element.scrollWidth}x${element.scrollHeight} inside ${element.clientWidth}x${element.clientHeight}`);
      }
    });

    const canvasHealth = [...document.querySelectorAll("canvas")].map((canvas, index) => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || canvas.width < 20 || canvas.height < 20) return { index, ok: false, reason: "tiny-or-unreadable" };
      const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 3; i < sample.length; i += 1600) {
        if (sample[i] > 8) ink++;
      }
      return { index, ok: ink > 4, ink, width: canvas.width, height: canvas.height };
    });

    const requiredByView = {
      overview: [
        ".decision-cockpit",
        ".decision-hero",
        ".decision-verdict",
        ".decision-map",
        ".next-action-grid",
        ".scenario-strip",
        ".retiree-start-card",
        ".trust-center-panel",
        ".scenario-timeline-panel",
        ".kpi-strip",
        ".ratio-strip",
        ".whatif-card",
        "#cash"
      ],
      planner: [
        ".whatif-card",
        ".retiree-guided-mode",
        ".planner-journey",
        ".planner-impact-grid",
        "#optimizer",
        "#action-plan"
      ],
      tax: [
        "#tax",
        ".tax-command-center",
        ".tax-scenario-grid",
        ".tax-action-strip",
        ".tax-grid"
      ],
      simulations: [
        ".risk-lab",
        ".scenario-library-panel",
        ".risk-control-grid",
        ".risk-mitigation-grid",
        "#risk",
        ".heatmap"
      ],
      schedule: [
        ".ledger-audit-cockpit",
        ".review-pack-panel",
        ".ledger-summary-grid",
        ".ledger-filter",
        ".ledger-recon-grid",
        "#schedule",
        ".table-wrap.schedule"
      ]
    };
    const requiredSelectors = [
      ".app-shell",
      ".side-rail",
      ".topbar",
      ".insights-column",
      ".layout-console",
      ".page-narrative",
      ".page-narrative-actions",
      ".motion-orbit",
      ...(requiredByView[activeView] || requiredByView.overview)
    ];
    const missing = requiredSelectors.filter((selector) => !document.querySelector(selector));
    const appShell = document.querySelector(".app-shell");
    const appRect = appShell ? rectFor(appShell) : null;
    const mainStack = document.querySelector(".main-stack");
    const mainRect = mainStack ? rectFor(mainStack) : null;
    const mainChildren = mainStack ? [...mainStack.children].filter(visible).map(rectFor) : [];
    const contentBottom = mainChildren.length ? Math.max(...mainChildren.map((rect) => rect.bottom)) : 0;
    const usefulViewport = Math.max(1, window.innerHeight - (mainRect?.top || 0));
    const contentFillRatio = mainRect ? Math.min(1, Math.max(0, (Math.min(contentBottom, window.innerHeight) - mainRect.top) / usefulViewport)) : 0;
    const rootStyles = getComputedStyle(document.documentElement);
    const visualTokens = [
      "--success",
      "--warning",
      "--danger",
      "--income",
      "--tax",
      "--growth",
      "--risk",
      "--focus-ring",
      "--glass-edge",
      "--surface-glow"
    ];
    const missingVisualTokens = visualTokens.filter((token) => !rootStyles.getPropertyValue(token).trim());
    const actionButton = document.querySelector(".actions button");
    const statCard = document.querySelector(".stat-card");
    const panel = document.querySelector(".panel");
    const actionStyle = actionButton ? getComputedStyle(actionButton) : null;
    const statStyle = statCard ? getComputedStyle(statCard) : null;
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const productTitle = document.querySelector(".topbar h1");
    const productTitleStyle = productTitle ? getComputedStyle(productTitle) : null;
    const productTitleRect = productTitle ? rectFor(productTitle) : null;
    const productEyebrow = document.querySelector(".topbar .eyebrow");
    const productEyebrowStyle = productEyebrow ? getComputedStyle(productEyebrow) : null;

    return {
      width: window.innerWidth,
      height: window.innerHeight,
      activeView,
      scrollWidth: document.documentElement.scrollWidth,
      bodyText: document.body.innerText.length,
      missing,
      overlapFailures,
      clipFailures,
      canvasHealth,
      appRect,
      contentFillRatio,
      overviewDecision: activeView === "overview" ? {
        headline: document.querySelector(".decision-verdict")?.textContent?.trim() || "",
        actions: document.querySelectorAll(".next-action-card").length,
        scenarios: document.querySelectorAll(".scenario-strip .scenario-chip").length,
        trustNotices: document.querySelectorAll(".trust-notice").length,
        trustCenter: Boolean(document.querySelector(".trust-center-panel")),
        scenarioTimeline: Boolean(document.querySelector(".scenario-timeline-panel")),
        asksPlanQuestion: document.body.innerText.toLowerCase().includes("can this plan work?")
      } : null,
      visualSystem: activeView === "overview" ? {
        missingVisualTokens,
        actionMotion: actionStyle ? hasMotion(actionStyle.transitionDuration) : false,
        statMotion: statStyle ? hasMotion(statStyle.transitionDuration) : false,
        panelGlass: panelStyle ? `${panelStyle.backdropFilter || ""} ${panelStyle.webkitBackdropFilter || ""}`.includes("blur") : false
      } : null,
      railContext: {
        heading: document.querySelector(".rail-context-card h2")?.textContent?.trim() || "",
        actions: document.querySelectorAll(".rail-context-card button").length,
        metrics: document.querySelectorAll(".rail-context-metrics > div").length
      },
      pageNarrative: {
        text: document.querySelector(".page-narrative")?.textContent?.trim() || "",
        actions: document.querySelectorAll(".page-narrative-actions button").length,
        help: document.querySelectorAll(".context-tip").length,
        motion: getComputedStyle(document.querySelector(".motion-orbit") || document.documentElement).animationName || ""
      },
      productTitle: {
        text: productTitle?.textContent?.trim() || "",
        fontSize: Number.parseFloat(productTitleStyle?.fontSize || "0"),
        fontWeight: Number.parseFloat(productTitleStyle?.fontWeight || "0"),
        width: productTitleRect?.width || 0,
        height: productTitleRect?.height || 0,
        eyebrowVisible: Boolean(productEyebrow && visible(productEyebrow)),
        eyebrowFontSize: Number.parseFloat(productEyebrowStyle?.fontSize || "0")
      },
      mobileDesign: window.innerWidth <= 430 ? (() => {
        const sideNavHeights = [...document.querySelectorAll(".nav-list button")].filter(visible).map((element) => element.getBoundingClientRect().height);
        const tabbarHeights = [...document.querySelectorAll(".mobile-tabbar button")].filter(visible).map((element) => element.getBoundingClientRect().height);
        return {
        sideRailVisible: visible(document.querySelector(".side-rail")),
        desktopInsightsVisible: visible(document.querySelector(".insights-column")),
        scenarioVisible: [...document.querySelectorAll(".side-section")].some((element) => visible(element) && element.textContent.includes("Scenario")),
        minNavHeight: sideNavHeights.length ? Math.min(...sideNavHeights) : 44,
        visibleTopbarActions: [...document.querySelectorAll(".actions > button, .actions > details > summary")].filter(visible).map((element) => {
          const rect = element.getBoundingClientRect();
          const iconRect = element.querySelector("svg")?.getBoundingClientRect();
          return {
            text: element.textContent.trim(),
            label: element.getAttribute("title") || element.getAttribute("aria-label") || element.textContent.trim(),
            width: rect.width,
            height: rect.height,
            iconCenterDeltaX: iconRect ? Math.abs((iconRect.left + iconRect.width / 2) - (rect.left + rect.width / 2)) : 0,
            iconCenterDeltaY: iconRect ? Math.abs((iconRect.top + iconRect.height / 2) - (rect.top + rect.height / 2)) : 0
          };
        }),
        mobileTabbarVisible: visible(document.querySelector(".mobile-tabbar")),
        minTabbarHeight: tabbarHeights.length ? Math.min(...tabbarHeights) : 0,
        tabLabels: [...document.querySelectorAll(".mobile-tabbar span")].filter(visible).map((element) => element.textContent.trim()),
        quickActionsVisible: visible(document.querySelector(".mobile-quick-actions")),
        verdictVisible: activeView === "overview" ? visible(document.querySelector(".mobile-verdict-card")) : true,
        verdictBottom: document.querySelector(".mobile-verdict-card")?.getBoundingClientRect().bottom || 0,
        verdictMetricCount: document.querySelectorAll(".mobile-verdict-metrics b").length,
        verdictActionCount: document.querySelectorAll(".mobile-verdict-actions button").length,
        ledgerCards: activeView === "schedule" ? document.querySelectorAll(".mobile-ledger-cards section").length : 1,
        startCardTop: document.querySelector(".retiree-start-card")?.getBoundingClientRect().top || 9999
        };
      })() : null,
      optimizerCards: document.querySelectorAll("#optimizer .strategy-card").length,
      optimizerChoices: document.querySelectorAll("#optimizer .choice-group").length,
      retireeGuidedControls: document.querySelectorAll(".retiree-guided-mode .quick-field").length,
      scenarioLibraryCards: document.querySelectorAll(".scenario-library-card").length,
      reviewPackCells: document.querySelectorAll(".review-pack-grid > div").length,
      heatCells: document.querySelectorAll(".heat-cell").length,
      theme: document.documentElement.dataset.theme || "dark"
    };
  }, view);
}

const server = await startServer();
const port = server.address().port;
const screenshotRoot = "/tmp/fin-dashboard-ui-regression";
await rm(screenshotRoot, { recursive: true, force: true });
await mkdir(screenshotRoot, { recursive: true });
await withBrowser({}, async ({ browser, page }) => {
page.auditUrl = `http://127.0.0.1:${port}/index.html?finTestApi=1`;
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
try {
  const viewports = [
    { name: "desktop", width: 1680, height: 1100, deviceScaleFactor: 1 },
    { name: "narrow-desktop", width: 1180, height: 900, deviceScaleFactor: 1 },
    { name: "tablet", width: 768, height: 1024, deviceScaleFactor: 1 },
    { name: "android", width: 412, height: 915, isMobile: true, deviceScaleFactor: 2.625 },
    { name: "iphone", width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 }
  ];
  const views = ["overview", "planner", "tax", "simulations", "schedule"];
  const audits = [];
  for (const viewport of viewports) {
    for (const view of views) {
      const audit = await auditViewport(page, viewport, view);
      const label = `${viewport.name}/${view}`;
      const screenshotPath = join(screenshotRoot, `${viewport.name}-${view}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      audit.visualArtifact = screenshotPath;
      const overflowAllowance = viewport.width <= 430 ? 24 : 12;
      const fillFloorByView = { overview: 0.58, planner: 0.58, tax: 0.70, simulations: 0.58, schedule: 0.70 };
      const minFill = viewport.width <= 430 ? 0.48 : fillFloorByView[view] || 0.58;
      const minText = view === "tax" || view === "schedule" ? 2200 : 3200;
      const minCharts = view === "overview" ? 2 : view === "simulations" ? 3 : 0;
      assert(audit.scrollWidth <= audit.width + overflowAllowance, `${label}: horizontal overflow ${audit.scrollWidth - audit.width}`);
      assert(audit.bodyText > minText, `${label}: rendered text too small`);
      assert(audit.visualArtifact?.endsWith(".png"), `${label}: visual screenshot artifact missing`);
      assert(audit.contentFillRatio >= minFill, `${label}: first viewport under-filled (${Math.round(audit.contentFillRatio * 100)}%)`);
      assert(audit.missing.length === 0, `${label}: missing selectors ${audit.missing.join(", ")}`);
      assert(audit.railContext.heading.length >= 6, `${label}: contextual right rail missing`);
      assert(audit.railContext.actions >= 2, `${label}: contextual right rail needs at least two actions`);
      assert(audit.railContext.metrics >= 2, `${label}: contextual right rail needs focused metrics`);
      assert(audit.pageNarrative.text.length >= 240, `${label}: center workspace needs explanatory context, not only charts`);
      assert(audit.pageNarrative.actions >= 2, `${label}: center workspace needs at least two local interactive actions`);
      assert(audit.pageNarrative.help >= 2, `${label}: context-sensitive help affordances missing`);
      assert(audit.pageNarrative.motion && audit.pageNarrative.motion !== "none", `${label}: narrative motion cue missing`);
      assert(audit.productTitle.text === "Retirement Corpus & Income Planner", `${label}: product title text changed: ${audit.productTitle.text}`);
      assert(audit.productTitle.fontWeight >= 800, `${label}: product title needs product-grade weight (${audit.productTitle.fontWeight})`);
      assert(audit.productTitle.fontSize >= (viewport.width <= 430 ? 15.5 : 20), `${label}: product title too small (${audit.productTitle.fontSize}px)`);
      assert(audit.productTitle.width > 240 || viewport.width <= 430, `${label}: product title does not read as a product lockup`);
      if (viewport.width > 430) assert(audit.productTitle.eyebrowVisible && audit.productTitle.eyebrowFontSize >= 8, `${label}: product eyebrow lost visual hierarchy`);
      assert(audit.overlapFailures.length === 0, `${label}: overlaps\n${audit.overlapFailures.join("\n")}`);
      assert(audit.clipFailures.length === 0, `${label}: clipped content\n${audit.clipFailures.join("\n")}`);
      assert(audit.canvasHealth.length >= minCharts, `${label}: expected at least ${minCharts} chart canvases`);
      assert(audit.canvasHealth.every((canvas) => canvas.ok), `${label}: blank/tiny canvases ${JSON.stringify(audit.canvasHealth)}`);
      if (view === "overview") {
        assert(audit.overviewDecision?.headline.length >= 18, `${label}: overview verdict is missing or too weak`);
        assert(audit.overviewDecision.actions >= 4, `${label}: overview needs at least four next-action cards`);
        assert(audit.overviewDecision.scenarios >= 4, `${label}: overview scenario strip changed`);
        assert(audit.overviewDecision.trustNotices >= 1, `${label}: overview trust guardrail missing`);
        assert(audit.overviewDecision.scenarioTimeline, `${label}: saved scenario timeline missing`);
        assert(audit.overviewDecision.trustCenter, `${label}: trust center panel missing`);
        assert(audit.overviewDecision.asksPlanQuestion, `${label}: overview must frame the retiree decision question`);
        assert(audit.visualSystem?.missingVisualTokens.length === 0, `${label}: missing visual tokens ${audit.visualSystem?.missingVisualTokens.join(", ")}`);
        assert(audit.visualSystem?.actionMotion, `${label}: action buttons need motion feedback`);
        assert(audit.visualSystem?.statMotion, `${label}: KPI cards need motion feedback`);
        assert(audit.visualSystem?.panelGlass, `${label}: panel glass hierarchy lost blur`);
      }
      if (view === "planner") {
        assert(audit.optimizerCards === 4, `${label}: optimizer cards changed`);
        assert(audit.optimizerChoices === 6, `${label}: optimizer wizard choices changed`);
        assert(audit.retireeGuidedControls >= 10, `${label}: retiree guided mode controls missing`);
      }
      if (view === "simulations") {
        assert(audit.scenarioLibraryCards === 9, `${label}: scenario library cards changed`);
      }
      if (view === "schedule") {
        assert(audit.reviewPackCells >= 6, `${label}: review pack evidence cells missing`);
      }
      if (audit.mobileDesign) {
        assert(audit.mobileDesign.minNavHeight >= 44, `${label}: mobile nav touch targets below 44px`);
        assert(audit.mobileDesign.visibleTopbarActions.length <= 5, `${label}: mobile topbar has too many visible actions`);
        const expectedMobileActions = ["Toggle theme", "Open help", "Open Trust Center", "Open assumptions", "Open more actions"];
        const mobileActionLabels = audit.mobileDesign.visibleTopbarActions.map((action) => action.label);
        assert(JSON.stringify(mobileActionLabels) === JSON.stringify(expectedMobileActions), `${label}: mobile topbar action set changed ${JSON.stringify(mobileActionLabels)}`);
        const actionWidths = audit.mobileDesign.visibleTopbarActions.map((action) => action.width);
        assert(Math.max(...actionWidths) - Math.min(...actionWidths) <= 1.5, `${label}: mobile topbar action boxes are uneven ${JSON.stringify(audit.mobileDesign.visibleTopbarActions)}`);
        audit.mobileDesign.visibleTopbarActions.forEach((action) => {
          assert(action.width >= 44 && action.height >= 44, `${label}: mobile topbar action below 44px ${JSON.stringify(action)}`);
          assert(action.iconCenterDeltaX <= 1.5 && action.iconCenterDeltaY <= 1.5, `${label}: mobile topbar icon is not visually centered ${JSON.stringify(action)}`);
        });
        assert(audit.mobileDesign.mobileTabbarVisible, `${label}: mobile bottom navigation missing`);
        assert(audit.mobileDesign.minTabbarHeight >= 44, `${label}: mobile bottom tab targets below 44px`);
        assert(audit.mobileDesign.tabLabels.length === 5, `${label}: mobile bottom nav labels missing`);
        assert(!audit.mobileDesign.quickActionsVisible, `${label}: mobile quick actions should not float over retirement content`);
        assert(audit.mobileDesign.verdictVisible, `${label}: mobile verdict card missing`);
        assert(audit.mobileDesign.ledgerCards >= 1, `${label}: mobile ledger card table missing`);
        assert(!audit.mobileDesign.sideRailVisible, `${label}: mobile should use bottom navigation instead of the desktop side rail`);
        assert(!audit.mobileDesign.desktopInsightsVisible, `${label}: mobile should use the insights sheet instead of the desktop right rail`);
        assert(!audit.mobileDesign.scenarioVisible, `${label}: mobile scenario selector should be collapsed`);
        if (view === "overview") {
          assert(audit.mobileDesign.verdictBottom > 0 && audit.mobileDesign.verdictBottom < audit.height, `${label}: mobile verdict not visible in first viewport`);
          assert(audit.mobileDesign.verdictMetricCount >= 6, `${label}: mobile verdict needs the key retirement metrics`);
          assert(audit.mobileDesign.verdictActionCount >= 3, `${label}: mobile verdict needs next-action buttons`);
        }
      }
      if (view === "simulations") assert(audit.heatCells === 30, `${label}: heatmap cell count changed`);
      audits.push({ name: viewport.name, view, ...audit });
    }
  }

  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  await page.goto(page.auditUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const privacy = document.querySelector(".disclaimer-notice-card");
    [...privacy.querySelectorAll("button")].find((button) => /understand/i.test(button.textContent))?.click();
  });
  await page.waitForSelector(".guided-tour .tour-card", { timeout: 10000 });
  const tourAudits = [];
  for (let stepIndex = 0; stepIndex < 7; stepIndex += 1) {
    await new Promise((resolve) => setTimeout(resolve, 220));
    const audit = await page.evaluate((expectedStep) => {
      const rectFor = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      };
      const overlap = (a, b) => {
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return x * y;
      };
      const card = document.querySelector(".tour-card");
      const spotlight = document.querySelector(".tour-spotlight");
      const activePill = document.querySelector(".tour-step-pill.active span")?.textContent?.trim() || "";
      const cardRect = rectFor(card);
      const spotlightRect = rectFor(spotlight);
      const spotlightArea = Math.max(1, spotlightRect.width * spotlightRect.height);
      return {
        expectedStep,
        activePill,
        placement: card.dataset.placement || "",
        card: cardRect,
        spotlight: spotlightRect,
        overlapRatio: overlap(cardRect, spotlightRect) / spotlightArea,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    }, stepIndex + 1);
    tourAudits.push(audit);
    assert(audit.activePill === String(stepIndex + 1), `mobile tour active step mismatch: ${JSON.stringify(audit)}`);
    assert(audit.card.left >= 8 && audit.card.right <= audit.viewport.width - 8, `mobile tour card horizontally unsafe: ${JSON.stringify(audit)}`);
    assert(audit.card.top >= 8 && audit.card.bottom <= audit.viewport.height - 8, `mobile tour card vertically unsafe: ${JSON.stringify(audit)}`);
    assert(audit.overlapRatio <= 0.08, `mobile tour card overlaps spotlight too much: ${JSON.stringify(audit)}`);
    if (stepIndex < 6) {
      await page.evaluate(() => {
        [...document.querySelectorAll(".tour-actions button")].find((button) => /^next$/i.test(button.textContent.trim()))?.click();
      });
    }
  }

  await page.setViewport({ width: 1680, height: 1100, deviceScaleFactor: 1 });
  await page.goto(page.auditUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const privacy = document.querySelector(".disclaimer-notice-card");
    if (privacy) [...privacy.querySelectorAll("button")].find((button) => /understand/i.test(button.textContent))?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")].find((button) => /skip|start planning|finish/i.test(button.textContent))?.click();
  });
  await page.waitForSelector(".actions button", { timeout: 10000 });
  await page.click(".actions button");
  await new Promise((resolve) => setTimeout(resolve, 240));
  const themeAudit = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    cards: document.querySelectorAll(".stat-card").length,
    charts: document.querySelectorAll("canvas").length
  }));
  assert(themeAudit.theme === "light", `theme toggle did not switch to light: ${themeAudit.theme}`);
  assert(themeAudit.overflow <= 12, `light theme overflow ${themeAudit.overflow}`);
  assert(themeAudit.cards >= 4 && themeAudit.charts >= 2, "light theme lost overview content");

  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  await page.goto(page.auditUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const privacy = document.querySelector(".disclaimer-notice-card");
    if (privacy) [...privacy.querySelectorAll("button")].find((button) => /understand/i.test(button.textContent))?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")].find((button) => /skip|start planning|finish/i.test(button.textContent))?.click();
  });
  await page.waitForSelector(".topbar .mobile-action-menu > summary", { timeout: 10000 });
  await page.click(".topbar .mobile-action-menu > summary");
  await new Promise((resolve) => setTimeout(resolve, 160));
  const mobileMenuAudit = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 4 && rect.height > 4;
    };
    const menu = document.querySelector(".topbar .mobile-action-menu > div");
    const menuRect = menu.getBoundingClientRect();
    const tabRect = document.querySelector(".mobile-tabbar")?.getBoundingClientRect();
    const rows = [...document.querySelectorAll(".topbar .mobile-action-menu > div button")].filter(visible).map((button) => {
      const rect = button.getBoundingClientRect();
      const icon = button.querySelector("svg")?.getBoundingClientRect();
      return {
        text: button.textContent.trim(),
        width: rect.width,
        height: rect.height,
        iconLeft: icon ? icon.left - rect.left : null,
        fontSize: Number.parseFloat(getComputedStyle(button).fontSize)
      };
    });
    return {
      menu: { top: menuRect.top, bottom: menuRect.bottom, width: menuRect.width, height: menuRect.height },
      tabTop: tabRect?.top || window.innerHeight,
      rows
    };
  });
  assert(JSON.stringify(mobileMenuAudit.rows.map((row) => row.text)) === JSON.stringify(["Reset", "CSV", "PDF", "Review pack", "Print"]), `mobile more menu labels changed ${JSON.stringify(mobileMenuAudit.rows)}`);
  assert(mobileMenuAudit.menu.width >= 300, `mobile more menu is too narrow ${JSON.stringify(mobileMenuAudit.menu)}`);
  assert(mobileMenuAudit.menu.bottom <= mobileMenuAudit.tabTop - 4, `mobile more menu overlaps bottom nav ${JSON.stringify(mobileMenuAudit)}`);
  mobileMenuAudit.rows.forEach((row) => {
    assert(row.width >= 300 && row.height >= 44, `mobile more menu row too small ${JSON.stringify(row)}`);
    assert(row.fontSize >= 10, `mobile more menu row text hidden or too small ${JSON.stringify(row)}`);
    assert(row.iconLeft >= 8 && row.iconLeft <= 18, `mobile more menu icon/text alignment regressed ${JSON.stringify(row)}`);
  });
  await page.screenshot({ path: join(screenshotRoot, "iphone-topbar-more-menu.png"), fullPage: false });

  await page.evaluate(() => document.querySelector(".topbar .mobile-action-menu > div button:first-child")?.click());
  await page.waitForSelector(".toast.show", { timeout: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 260));
  const toastAudit = await page.evaluate(() => {
    const toast = document.querySelector(".toast.show");
    const icon = toast?.querySelector(".toast-icon svg");
    const copy = toast?.querySelector(".toast-copy");
    const style = toast ? getComputedStyle(toast) : null;
    const iconStyle = toast?.querySelector(".toast-icon") ? getComputedStyle(toast.querySelector(".toast-icon")) : null;
    return {
      exists: Boolean(toast),
      role: toast?.getAttribute("role") || "",
      live: toast?.getAttribute("aria-live") || "",
      label: toast?.getAttribute("aria-label") || "",
      text: toast?.textContent?.trim() || "",
      icon: Boolean(icon),
      copy: Boolean(copy),
      opacity: style ? Number.parseFloat(style.opacity) : 0,
      radius: style ? Number.parseFloat(style.borderRadius) : 0,
      backdrop: style ? `${style.backdropFilter || ""} ${style.webkitBackdropFilter || ""}` : "",
      columns: style?.gridTemplateColumns || "",
      border: style?.borderTopColor || "",
      iconColor: iconStyle?.color || "",
      background: style?.backgroundImage || style?.backgroundColor || ""
    };
  });
  assert(toastAudit.exists, "themed toast did not appear after reset");
  assert(toastAudit.role === "status" && toastAudit.live === "polite", "toast lost accessible live-region semantics");
  assert(toastAudit.label.includes("Restored: Workbook base restored"), `toast accessible label changed: ${toastAudit.label}`);
  assert(toastAudit.icon && toastAudit.copy, "toast needs a visible icon and structured copy");
  assert(toastAudit.text.includes("Workbook base restored"), `toast copy changed unexpectedly: ${toastAudit.text}`);
  assert(toastAudit.opacity > 0.95, `toast should be fully readable after entrance motion: ${toastAudit.opacity}`);
  assert(toastAudit.radius >= 10, `toast radius too blocky: ${toastAudit.radius}`);
  assert(toastAudit.backdrop.includes("blur"), "toast glass treatment lost backdrop blur");
  assert(toastAudit.columns.includes("42px") || toastAudit.columns.includes("38px"), `toast layout lost icon column: ${toastAudit.columns}`);
  assert(toastAudit.border !== toastAudit.iconColor, "toast icon and border should be themed but not flat-identical");
  assert(toastAudit.background.includes("gradient"), "toast background should use themed gradient glass, not a flat block");

  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({
    ok: true,
    viewports: audits.map((audit) => ({
      name: audit.name,
      view: audit.view,
      width: audit.width,
      scrollWidth: audit.scrollWidth,
      contentFillRatio: Number(audit.contentFillRatio.toFixed(2)),
      canvases: audit.canvasHealth.length,
      optimizerCards: audit.optimizerCards,
      heatCells: audit.heatCells
    })),
    tourAudits,
    screenshotRoot,
    themeAudit,
    toastAudit
  }, null, 2));
} finally {
    // Drain keep-alive connections before browser.close() — prevents hang.
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close();
    // Belt-and-suspenders: if browser.close() still stalls, SIGKILL after 4s.
    const _closeGuard = setTimeout(() => {
      try { browser.process()?.kill("SIGKILL"); } catch {}
    }, 4000);
    _closeGuard.unref();
  }
});
