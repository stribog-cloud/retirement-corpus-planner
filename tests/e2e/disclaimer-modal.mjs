/**
 * R4.5b — DisclaimerNotice e2e tests
 *
 * Three Puppeteer scenarios per Eco's test plan
 * (audit/round-4/in-app-disclaimer-copy.md §4):
 *
 *   Scenario 1: Fresh localStorage — modal must appear on first launch.
 *   Scenario 2: After clicking "I understand" — second load must suppress modal.
 *   Scenario 3: Legacy-flag migration — pre-set old key; reload → modal suppressed,
 *               new key written.
 *
 * Phase: R4.5b
 * Persona: Hilbert + Raman
 * Parent epic: fin-c96
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { withBrowser } from "./_browser-helper.mjs";

const root = process.cwd();
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
    } catch {
      response.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
      response.end("Not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function run() {
  const server = await startServer();
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/index.html?finTestApi=1`;

  let passed = 0;
  let failed = 0;
  const failures = [];

  async function runTest(name, fn) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (error) {
      console.error(`  FAIL  ${name}`);
      console.error(`        ${error.message}`);
      failures.push({ name, message: error.message });
      failed++;
    }
  }

  await withBrowser({}, async ({ page }) => {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // ---------------------------------------------------------------------------
  // Scenario 1: Fresh localStorage — modal must appear on first launch
  // ---------------------------------------------------------------------------
  await runTest("Scenario 1: disclaimer modal appears on first launch (empty localStorage)", async () => {
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });

    // Wait for the disclaimer card to appear
    await page.waitForSelector('[aria-label="Important notice"]', { timeout: 6000 });

    const modal = await page.$('[aria-label="Important notice"]');
    assert(modal !== null, "Disclaimer modal must be visible on first launch");

    // Verify key content is present
    const text = await page.evaluate(() =>
      document.querySelector('[aria-label="Important notice"]')?.innerText || ""
    );
    assert(/Important Notice/i.test(text), `Modal must show 'Important Notice' title: ${text.slice(0, 200)}`);
    assert(/planning and educational tool/i.test(text), `Modal must mention 'planning and educational tool': ${text.slice(0, 400)}`);
    assert(/localStorage/i.test(text), `Modal must mention localStorage: ${text.slice(0, 400)}`);
    assert(/I understand/i.test(text), `Modal must show 'I understand' button: ${text.slice(0, 400)}`);
    assert(/Clear saved data/i.test(text), `Modal must show 'Clear saved data' button: ${text.slice(0, 400)}`);

    // New flag must NOT exist yet
    const newFlag = await page.evaluate(() => localStorage.getItem("disclaimer_acknowledged_v1"));
    assert(newFlag === null, `New flag must not exist before acknowledgement, got: ${newFlag}`);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: After "I understand" click — second load must suppress modal
  // ---------------------------------------------------------------------------
  await runTest("Scenario 2: modal suppressed on second launch after acknowledgement", async () => {
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });

    // Wait for modal and click "I understand"
    await page.waitForSelector('[aria-label="Important notice"]', { timeout: 6000 });
    await page.evaluate(() => {
      const section = document.querySelector('[aria-label="Important notice"]');
      const btn = section && [...section.querySelectorAll("button")].find((b) =>
        /understand/i.test(b.textContent)
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    // Verify new flag was written
    const flagAfterAck = await page.evaluate(() => localStorage.getItem("disclaimer_acknowledged_v1"));
    assert(flagAfterAck === "true", `New flag must be 'true' after acknowledgement, got: ${flagAfterAck}`);

    // Reload — modal must NOT appear
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 500));

    const modalAfterReload = await page.$('[aria-label="Important notice"]');
    assert(modalAfterReload === null, "Disclaimer modal must NOT appear after acknowledgement on reload");
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Legacy-flag migration — set old key, reload → modal suppressed
  // ---------------------------------------------------------------------------
  await runTest("Scenario 3: legacy fin-cockpit-privacy-consent-v1 flag triggers migration (modal suppressed)", async () => {
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    // Clear all and set only the legacy flag
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "fin-cockpit-privacy-consent-v1",
        JSON.stringify({ accepted: true })
      );
    });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 500));

    // Modal must NOT appear (legacy flag was accepted)
    const modal = await page.$('[aria-label="Important notice"]');
    assert(modal === null, "Disclaimer modal must NOT appear when legacy flag is set");

    // New flag must have been written by migration
    const newFlag = await page.evaluate(() => localStorage.getItem("disclaimer_acknowledged_v1"));
    assert(newFlag === "true", `Migration must write new flag 'true', got: ${newFlag}`);
  });

  }); // withBrowser
  server.close();

  console.log("");
  console.log(`disclaimer-modal.mjs: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error("\nFailed tests:");
    for (const { name, message } of failures) {
      console.error(`  - ${name}: ${message}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
