import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import axe from "axe-core";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const chrome = (process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const mime = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

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

async function dismissTour(page) {
  await page.evaluate(() => {
    const privacy = document.querySelector(".privacy-consent-card");
    if (!privacy) return;
    [...privacy.querySelectorAll("button")].find((button) => /understand/i.test(button.textContent))?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")].find((button) => /skip|start planning|finish/i.test(button.textContent))?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function runAxe(page, label) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    rules: {
      "color-contrast": { enabled: false }
    }
  }));
  return result.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact))
    .map((violation) => ({
      label,
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(" "))
    }));
}

const server = await startServer();
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
const failures = [];

try {
  await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await dismissTour(page);
  await page.waitForSelector(".main-stack", { timeout: 10000 });

  for (const view of ["overview", "planner", "tax", "simulations", "schedule"]) {
    await page.click(`.nav-list button[data-view="${view}"]`);
    await page.waitForFunction((activeView) => document.querySelector(".main-stack")?.dataset.activeView === activeView, {}, view);
    failures.push(...await runAxe(page, view));
  }

  await page.click(".actions button[title=\"Open help\"]");
  await page.waitForSelector(".help-drawer", { timeout: 5000 });
  failures.push(...await runAxe(page, "help drawer"));
  await page.evaluate(() => document.querySelector(".help-drawer .close-button")?.click());

  await page.click(".actions button[title=\"Open assumptions\"]");
  await page.waitForSelector(".assumption-drawer", { timeout: 5000 });
  failures.push(...await runAxe(page, "assumption drawer"));

  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ ok: true, checked: "axe-core", surfaces: 7 }, null, 2));
  }
} finally {
  await browser.close();
  server.close();
}
