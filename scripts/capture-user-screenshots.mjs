import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { CHROME as chrome } from "../tests/e2e/_browser-helper.mjs";

const root = process.cwd();
const outDir = "docs/user/assets";
const screenshotMetadata = {
  "guided-tour": { viewport: "desktop 1440x920", sourcePage: "first-run guided tour" },
  "overview-cockpit": { viewport: "desktop 1440x920", sourcePage: "Overview" },
  "guided-planner": { viewport: "desktop 1440x920", sourcePage: "Guided Planner" },
  "tax-studio": { viewport: "desktop 1440x920", sourcePage: "Tax Studio" },
  "simulations-risk": { viewport: "desktop 1440x920", sourcePage: "Simulations" },
  "ledger-evidence": { viewport: "desktop 1440x920", sourcePage: "Ledger" },
  "assumption-studio": { viewport: "desktop 1440x920", sourcePage: "Assumption Studio drawer" },
  "help-system": { viewport: "desktop 1440x920", sourcePage: "Help drawer" },
  "mobile-overview": { viewport: "iPhone-class 390x844", sourcePage: "Mobile Overview" },
  "mobile-topbar-actions": { viewport: "iPhone-class 390x844", sourcePage: "Mobile top action dock" },
  "mobile-topbar-more-menu": { viewport: "iPhone-class 390x844", sourcePage: "Mobile more actions menu" },
  "mobile-guided-planner": { viewport: "iPhone-class 390x844", sourcePage: "Mobile Guided Planner" },
  "mobile-tax-studio": { viewport: "iPhone-class 390x844", sourcePage: "Mobile Tax Studio" },
  "mobile-simulations-risk": { viewport: "iPhone-class 390x844", sourcePage: "Mobile Simulations" },
  "mobile-ledger-evidence": { viewport: "iPhone-class 390x844", sourcePage: "Mobile Ledger" },
  "mobile-assumption-studio": { viewport: "iPhone-class 390x844", sourcePage: "Mobile Assumption Studio" },
  "mobile-help-system": { viewport: "iPhone-class 390x844", sourcePage: "Mobile Help drawer" },
  "android-mobile-overview": { viewport: "Android-class 412x915", sourcePage: "Android Overview" },
  "android-mobile-guided-planner": { viewport: "Android-class 412x915", sourcePage: "Android Guided Planner" },
  "android-mobile-tax-studio": { viewport: "Android-class 412x915", sourcePage: "Android Tax Studio" },
  "android-mobile-simulations-risk": { viewport: "Android-class 412x915", sourcePage: "Android Simulations" },
  "android-mobile-ledger-evidence": { viewport: "Android-class 412x915", sourcePage: "Android Ledger" }
};
const mime = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".svg": "image/svg+xml;charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = join(root, pathname.replace(/^\/+/, ""));
      response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
      response.end(await readFile(file));
    } catch (error) {
      response.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
      response.end("Not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function dismissTour(page) {
  await page.evaluate(() => {
    localStorage.setItem("fin-cockpit-guided-tour-v1", "done");
    localStorage.setItem("fin-cockpit-privacy-consent-v1", JSON.stringify({ accepted: true, acceptedAt: "screenshot-capture" }));
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    const button = [...tour.querySelectorAll("button")].find((item) => /skip|finish|start planning/i.test(item.textContent || ""));
    button?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
}

async function openView(page, view) {
  const navSelector = page.viewport().width <= 430
    ? `.mobile-tabbar button[data-view="${view}"]`
    : `.nav-list button[data-view="${view}"]`;
  await page.waitForSelector(navSelector, { timeout: 8000 });
  await page.click(navSelector);
  await page.waitForFunction((nextView) => document.querySelector(".main-stack")?.dataset.activeView === nextView, {}, view);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function openAssumptionStudio(page) {
  if (page.viewport().width <= 430) {
    await page.waitForSelector(".topbar .actions button[title='Open assumptions']", { timeout: 8000 });
    await page.click(".topbar .actions button[title='Open assumptions']");
    await page.waitForSelector(".assumption-drawer", { timeout: 8000 });
    return;
  }
  await page.waitForSelector(".studio-button", { timeout: 8000 });
  await page.evaluate(() => {
    const visibleButton = [...document.querySelectorAll(".studio-button")]
      .find((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      });
    visibleButton?.click();
  });
  await page.waitForSelector(".assumption-drawer", { timeout: 8000 });
}

async function screenshot(page, name) {
  await page.evaluate(() => {
    if (document.getElementById("docs-screenshot-transient-style")) return;
    const style = document.createElement("style");
    style.id = "docs-screenshot-transient-style";
    style.textContent = ".toast { display: none !important; }";
    document.head.appendChild(style);
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.screenshot({
    path: `${outDir}/${name}.jpg`,
    type: "jpeg",
    quality: 86,
    fullPage: false
  });
}

async function screenshotElement(page, selector, name) {
  await page.evaluate(() => {
    if (document.getElementById("docs-screenshot-transient-style")) return;
    const style = document.createElement("style");
    style.id = "docs-screenshot-transient-style";
    style.textContent = ".toast { display: none !important; }";
    document.head.appendChild(style);
  });
  await page.waitForSelector(selector, { visible: true, timeout: 8000 });
  const element = await page.$(selector);
  await element.screenshot({
    path: `${outDir}/${name}.jpg`,
    type: "jpeg",
    quality: 88
  });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeScreenshotManifest(names) {
  const artifact = await readFile("index.html");
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const screenshots = [];
  for (const name of names) {
    const path = `${outDir}/${name}.jpg`;
    const buffer = await readFile(path);
    const info = await stat(path);
    screenshots.push({
      path,
      ...screenshotMetadata[name],
      bytes: info.size,
      sha256: sha256(buffer)
    });
  }
  await writeFile(`${outDir}/manifest.json`, `${JSON.stringify({
    version: "1.0.0",
    last_updated: new Date().toISOString().slice(0, 10),
    productVersion: packageJson.version,
    artifact: "index.html",
    artifactSha256: sha256(artifact),
    capturedOn: new Date().toISOString(),
    screenshots
  }, null, 2)}\n`);
}

async function acceptPrivacyForTour(page) {
  await page.waitForSelector(".privacy-consent-card", { timeout: 8000 });
  await page.evaluate(() => {
    const buttons = Array.from(document.getElementsByTagName("button"));
    const accept = buttons.find((button) => /understand/i.test(button.textContent || ""));
    accept?.click();
  });
  await page.waitForSelector(".guided-tour.is-anchored .tour-spotlight", { timeout: 8000 });
  await page.waitForFunction(() => Boolean(document.getElementsByClassName("tour-highlight")[0]), { timeout: 3000 });
}

const server = await startServer();
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  defaultViewport: { width: 1440, height: 920, deviceScaleFactor: 1 }
});

try {
  await mkdir(outDir, { recursive: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle0" });
  await acceptPrivacyForTour(page);
  await screenshot(page, "guided-tour");
  await dismissTour(page);
  await screenshot(page, "overview-cockpit");

  await openView(page, "planner");
  await screenshot(page, "guided-planner");

  await openView(page, "tax");
  await screenshot(page, "tax-studio");

  await openView(page, "simulations");
  await screenshot(page, "simulations-risk");

  await openView(page, "schedule");
  await screenshot(page, "ledger-evidence");

  await openView(page, "overview");
  await openAssumptionStudio(page);
  await new Promise((resolve) => setTimeout(resolve, 260));
  await screenshot(page, "assumption-studio");
  await page.click(".assumption-drawer .close-button");

  await page.evaluate(() => {
    const helpButton = [...document.querySelectorAll("button")].find((button) => /^Help$/i.test(button.textContent.trim()));
    helpButton?.click();
  });
  await page.waitForSelector(".help-drawer", { timeout: 8000 });
  await screenshot(page, "help-system");

  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle0" });
  await dismissTour(page);
  await screenshot(page, "mobile-overview");
  await screenshotElement(page, ".topbar", "mobile-topbar-actions");
  await page.evaluate(() => document.querySelector(".topbar .mobile-action-menu > summary")?.click());
  await new Promise((resolve) => setTimeout(resolve, 180));
  await screenshotElement(page, ".topbar .mobile-action-menu > div", "mobile-topbar-more-menu");
  await page.evaluate(() => document.querySelector(".topbar .mobile-action-menu[open] > summary")?.click());
  await openView(page, "planner");
  await screenshot(page, "mobile-guided-planner");
  await openView(page, "tax");
  await screenshot(page, "mobile-tax-studio");
  await openView(page, "simulations");
  await screenshot(page, "mobile-simulations-risk");
  await openView(page, "schedule");
  await screenshot(page, "mobile-ledger-evidence");
  await openView(page, "overview");
  await openAssumptionStudio(page);
  await screenshot(page, "mobile-assumption-studio");
  await page.click(".assumption-drawer .close-button");
  await page.click(".topbar .actions button[title='Open help']");
  await page.waitForSelector(".help-drawer", { timeout: 8000 });
  await screenshot(page, "mobile-help-system");
  await page.click(".help-drawer .close-button");

  await page.setViewport({ width: 412, height: 915, isMobile: true, deviceScaleFactor: 2.625 });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle0" });
  await dismissTour(page);
  await screenshot(page, "android-mobile-overview");
  await openView(page, "planner");
  await screenshot(page, "android-mobile-guided-planner");
  await openView(page, "tax");
  await screenshot(page, "android-mobile-tax-studio");
  await openView(page, "simulations");
  await screenshot(page, "android-mobile-simulations-risk");
  await openView(page, "schedule");
  await screenshot(page, "android-mobile-ledger-evidence");

  const screenshots = [
    "guided-tour",
    "overview-cockpit",
    "guided-planner",
    "tax-studio",
    "simulations-risk",
    "ledger-evidence",
    "assumption-studio",
    "help-system",
    "mobile-overview",
    "mobile-topbar-actions",
    "mobile-topbar-more-menu",
    "mobile-guided-planner",
    "mobile-tax-studio",
    "mobile-simulations-risk",
    "mobile-ledger-evidence",
    "mobile-assumption-studio",
    "mobile-help-system",
    "android-mobile-overview",
    "android-mobile-guided-planner",
    "android-mobile-tax-studio",
    "android-mobile-simulations-risk",
    "android-mobile-ledger-evidence"
  ];
  await writeScreenshotManifest(screenshots);

  console.log(JSON.stringify({
    ok: true,
    output: outDir,
    manifest: `${outDir}/manifest.json`,
    screenshots: screenshots.map((name) => `${name}.jpg`)
  }, null, 2));
} finally {
  await browser.close();
  server.close();
}
