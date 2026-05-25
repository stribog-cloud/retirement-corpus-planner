/**
 * help-drawer-coverage.mjs — Puppeteer E2E coverage gate for the HelpDrawer.
 *
 * Bead: fin-eia  |  Epic: fin-c96  |  Persona: Eco  |  Round: R4.9.5f
 * Phase: R4.9.5f — Help System Expansion
 *
 * What this test does:
 * 1. Launches the built single-file HTML via a local HTTP server (same pattern as
 *    dashboard-regression.mjs — no dev server required at runtime).
 * 2. Opens the help drawer.
 * 3. Iterates every category in canonical order (getting-started, metrics,
 *    concepts, tax, trust) and every topic within each category.
 * 4. For each topic, asserts:
 *    a. Summary is non-empty (stripped whitespace, length > 0).
 *    b. No eyewash markers in summary, steps, or sections (case-insensitive:
 *       "lorem ipsum", "TODO", "FIXME", "XXX", "TBD", "???").
 *    c. All `related` cross-refs resolve to existing topic keys (no dangling).
 *    d. Drawer remains scrollable (scrollHeight > clientHeight) OR within
 *       viewport bounds after topic expansion.
 *    e. axe-core finds zero serious/critical violations after expansion.
 * 5. Pass threshold: 69/69 topics verified. Reports topic key + assertion + axe
 *    violation on any failure.
 *
 * Usage:
 *   node tests/e2e/help-drawer-coverage.mjs
 *   node tests/e2e/help-drawer-coverage.mjs --base-url http://localhost:5173
 *
 * Integration:
 *   Wired into package.json test:e2e chain (listed explicitly because test:e2e
 *   uses explicit listing rather than a glob pattern).
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { withBrowser } from "./_browser-helper.mjs";
import axe from "axe-core";

// ── Constants ───────────────────────────────────────────────────────────────────

const root = process.cwd();
const chrome = (process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const MIME = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

/** Total topic count expected per R4.9.5f manifest. */
const EXPECTED_TOPIC_COUNT = 69;

/** Eyewash markers — case-insensitive search. */
const EYEWASH_PATTERNS = [
  "lorem ipsum",
  "TODO",
  "FIXME",
  "XXX",
  "TBD",
  "???"
];

/** Canonical category iteration order. */
const CATEGORY_ORDER = [
  "getting-started",
  "metrics",
  "concepts",
  "tax",
  "trust"
];

// ── CLI arg parsing (--base-url, --port) ────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let baseUrl = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base-url" && args[i + 1]) {
      baseUrl = args[i + 1];
      i++;
    } else if (args[i] === "--port" && args[i + 1]) {
      baseUrl = `http://127.0.0.1:${args[i + 1]}/index.html?finTestApi=1`;
      i++;
    }
  }
  return { externalBaseUrl: baseUrl };
}

// ── Assertion helper ────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAIL: ${message}`);
}

// ── HTTP server (same pattern as dashboard-regression.mjs) ─────────────────────

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html?finTestApi=1" : url.pathname;
      const file = join(root, pathname.replace(/^\/+/, ""));
      const body = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
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

// ── Page helpers ────────────────────────────────────────────────────────────────

async function waitForModelIdle(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const stack = document.querySelector(".main-stack");
    if (!stack) return false;
    if (stack.classList.contains("model-pending")) return false;
    if (stack.dataset.analyticsPending === "true") return false;
    return true;
  }, { timeout });
}

async function dismissPrivacyAndTour(page) {
  // R4.5b: renamed from .privacy-consent-card to .disclaimer-notice-card
  await page.evaluate(() => {
    const privacy =
      document.querySelector(".disclaimer-notice-card") ||
      document.querySelector(".privacy-consent-card");
    if (!privacy) return;
    const btn = [...privacy.querySelectorAll("button")].find((b) =>
      /understand/i.test(b.textContent)
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 80));
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    const btn = [...tour.querySelectorAll("button")].find((b) =>
      /skip|start planning|finish/i.test(b.textContent)
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 80));
}

// ── axe-core runner (scoped to drawer subtree) ──────────────────────────────────

async function runAxeOnDrawer(page, topicLabel) {
  await page.evaluate(axe.source);
  return page.evaluate(async (label) => {
    const drawer = document.querySelector(".help-drawer");
    if (!drawer) return { label, serious_critical: [{ id: "drawer-missing", impact: "critical", help: "Help drawer not found", nodes: [] }], other: [] };
    return window.axe.run(drawer, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
      rules: {
        "color-contrast": { enabled: false },
        "color-contrast-enhanced": { enabled: false }
      }
    }).then((r) => ({
      label,
      serious_critical: r.violations
        .filter((v) => ["serious", "critical"].includes(v.impact))
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" "))
        })),
      other: r.violations
        .filter((v) => !["serious", "critical"].includes(v.impact))
        .map((v) => ({ id: v.id, impact: v.impact, help: v.help }))
    }));
  }, topicLabel);
}

// ── Eyewash detection ───────────────────────────────────────────────────────────

function checkEyewash(text, topicKey, field) {
  const lower = text.toLowerCase();
  for (const marker of EYEWASH_PATTERNS) {
    if (lower.includes(marker.toLowerCase())) {
      return {
        found: true,
        marker,
        field,
        snippet: text.slice(0, 120)
      };
    }
  }
  return { found: false };
}

// ── Topic data extraction from page ────────────────────────────────────────────

/**
 * Read the topic data from the page by querying window.__FIN_DASHBOARD_TEST_API__
 * or by falling back to the rendered DOM discovery.
 *
 * The test API exposes buildHelpTopics via the finTestApi flag. Check for it first.
 * If unavailable, we enumerate the sidebar DOM (which is the source of truth
 * for what the browser actually renders).
 */
async function getTopicDataFromPage(page) {
  return page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    if (api && typeof api.buildHelpTopics === "function") {
      // buildHelpTopics is exported via test API — use it directly
      const topics = api.buildHelpTopics(api.DEFAULT_TAX_LAW);
      return { source: "api", topics };
    }
    // Fallback: enumerate from the help drawer sidebar DOM.
    // The sidebar groups topics by category; each topic has a .help-topic-trigger
    // with title in <strong> and summary in <span>.
    // We return a partial representation (title + category); content assertions
    // will be done from rendered DOM during the click-and-read pass.
    const groups = document.querySelectorAll(".help-category-group");
    const topics = {};
    let categoryId = "";
    for (const group of groups) {
      const head = group.querySelector(".help-category-head strong");
      // Map display label back to category id
      const labelToId = {
        "Getting started": "getting-started",
        "Metrics & tiles": "metrics",
        "Concepts": "concepts",
        "Tax": "tax",
        "Trust & exports": "trust"
      };
      categoryId = head ? (labelToId[head.textContent.trim()] || "concepts") : "concepts";
      const cards = group.querySelectorAll(".help-topic-card");
      for (const card of cards) {
        const trigger = card.querySelector(".help-topic-trigger");
        if (!trigger) continue;
        const titleEl = trigger.querySelector("strong");
        const summaryEl = trigger.querySelector("span");
        // Derive key from aria-controls on the trigger (aria-controls="help-topic-detail-<key>")
        const detailId = trigger.getAttribute("aria-controls") || "";
        const key = detailId.replace("help-topic-detail-", "");
        if (key) {
          topics[key] = {
            title: titleEl?.textContent.trim() || "",
            summary: summaryEl?.textContent.trim() || "",
            category: categoryId
          };
        }
      }
    }
    return { source: "dom", topics };
  });
}

// ── Topic content reading after expansion ───────────────────────────────────────

async function readExpandedTopicContent(page, topicKey) {
  return page.evaluate((key) => {
    const detail = document.getElementById(`help-topic-detail-${key}`);
    if (!detail) return { found: false, steps: [], sections: [], related: [], fullText: "" };
    const steps = [...detail.querySelectorAll(".tutorial-card ol li")].map((li) => li.textContent.trim());
    const sections = [];
    detail.querySelectorAll(".help-sections section").forEach((sec) => {
      const title = sec.querySelector("h3")?.textContent.trim() || "";
      const items = [...sec.querySelectorAll("li")].map((li) => li.textContent.trim());
      sections.push({ title, items });
    });
    // Related links rendered as buttons/spans — may not be visible in compact view;
    // we rely on the topics object for related cross-ref validation.
    return {
      found: true,
      steps,
      sections,
      fullText: detail.textContent || ""
    };
  }, topicKey);
}

// ── Scrollability check ─────────────────────────────────────────────────────────

async function checkDrawerScrollable(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector(".help-drawer");
    if (!drawer) return { ok: false, reason: "no drawer" };
    const scrollable = drawer.scrollHeight > drawer.clientHeight;
    const rect = drawer.getBoundingClientRect();
    const withinViewport = rect.bottom <= window.innerHeight + 2 && rect.top >= -2;
    return {
      ok: scrollable || withinViewport,
      scrollHeight: drawer.scrollHeight,
      clientHeight: drawer.clientHeight,
      scrollable,
      withinViewport
    };
  });
}

// ── Main test runner ────────────────────────────────────────────────────────────

const { externalBaseUrl } = parseArgs();

// Start local server unless an external base URL was provided
let server = null;
let baseUrl;
if (externalBaseUrl) {
  baseUrl = externalBaseUrl.endsWith("finTestApi=1") ? externalBaseUrl : `${externalBaseUrl.replace(/\?.*$/, "")}?finTestApi=1`;
  console.log(`Using external base URL: ${baseUrl}`);
} else {
  server = await startServer();
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/index.html?finTestApi=1`;
  console.log(`Local server started on port ${port}`);
}

/** Accumulated per-topic failures */
const failures = [];
/** Non-blocking axe warnings */
const axeOtherViolations = [];
const consoleErrors = [];
const startTime = Date.now();

await withBrowser({}, async ({ page }) => {
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });

page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`console-error: ${msg.text()}`);
});

try {
  // ── Navigate and initialize ────────────────────────────────────────────────
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".main-stack", { timeout: 20000 });
  await dismissPrivacyAndTour(page);
  await waitForModelIdle(page);

  // ── Open help drawer ───────────────────────────────────────────────────────
  await page.waitForSelector(".actions button[title=\"Open help\"]", { timeout: 5000 });
  await page.click(".actions button[title=\"Open help\"]");
  await page.waitForSelector(".help-drawer", { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 180));

  console.log("\n── Help drawer opened ──────────────────────────────────────────────────────");

  // ── Gather topic data from page ────────────────────────────────────────────
  const { source: topicSource, topics: topicData } = await getTopicDataFromPage(page);
  console.log(`  Topic data source: ${topicSource}`);

  const allTopicKeys = Object.keys(topicData);
  const allTopicKeySet = new Set(allTopicKeys);
  const totalTopics = allTopicKeys.length;

  console.log(`  Topics discovered: ${totalTopics} (expected ${EXPECTED_TOPIC_COUNT})`);

  if (totalTopics !== EXPECTED_TOPIC_COUNT) {
    failures.push({
      topicKey: "__count__",
      assertion: `Expected ${EXPECTED_TOPIC_COUNT} topics, found ${totalTopics}`,
      detail: `Missing or extra topics in the sidebar DOM or test API.`
    });
    console.error(`  [FAIL] Topic count mismatch: expected ${EXPECTED_TOPIC_COUNT}, found ${totalTopics}`);
  }

  // ── Ensure all categories are expanded (not collapsed) ────────────────────
  await page.evaluate((categoryIds) => {
    // Click any collapsed category heads to expand them
    for (const catId of categoryIds) {
      const head = document.querySelector(`.help-category-head[aria-controls="help-category-${catId}"]`);
      if (head && head.getAttribute("aria-expanded") === "false") {
        head.click();
      }
    }
  }, CATEGORY_ORDER);
  await new Promise((r) => setTimeout(r, 120));

  // ── Iterate topics by category ─────────────────────────────────────────────
  let passCount = 0;
  let topicIndex = 0;

  for (const categoryId of CATEGORY_ORDER) {
    // Get topic keys in this category from topicData
    const categoryTopicKeys = allTopicKeys.filter(
      (key) => (topicData[key].category || "concepts") === categoryId
    );

    console.log(`\n  Category: ${categoryId} (${categoryTopicKeys.length} topics)`);

    for (const topicKey of categoryTopicKeys) {
      topicIndex++;
      const topicInfo = topicData[topicKey];
      const topicTitle = topicInfo.title || topicKey;
      process.stdout.write(`    [${topicIndex}/${totalTopics}] ${topicKey} — ${topicTitle}: `);

      const topicFailures = [];

      // ── (1) Click the topic trigger to expand it ──────────────────────────
      // First ensure the category is expanded
      await page.evaluate((catId) => {
        const head = document.querySelector(`.help-category-head[aria-controls="help-category-${catId}"]`);
        if (head && head.getAttribute("aria-expanded") === "false") {
          head.click();
        }
      }, categoryId);
      await new Promise((r) => setTimeout(r, 80));

      // Click the topic trigger
      const triggerSelector = `button.help-topic-trigger[aria-controls="help-topic-detail-${topicKey}"]`;
      const triggerExists = await page.evaluate((sel) => Boolean(document.querySelector(sel)), triggerSelector);

      if (!triggerExists) {
        topicFailures.push({
          assertion: "DOM",
          detail: `Topic trigger button not found: ${triggerSelector}`
        });
        console.log("FAIL (trigger not found)");
        failures.push({ topicKey, assertion: "DOM: trigger button not found", detail: triggerSelector });
        continue;
      }

      await page.evaluate((sel) => {
        document.querySelector(sel)?.click();
      }, triggerSelector);
      await new Promise((r) => setTimeout(r, 150)); // allow expansion animation

      // ── (1) Summary non-empty ─────────────────────────────────────────────
      const summary = topicInfo.summary || "";
      if (summary.trim().length === 0) {
        topicFailures.push({ assertion: "Summary empty", detail: `Topic "${topicKey}" has an empty summary.` });
      }

      // ── (2) Eyewash in summary ────────────────────────────────────────────
      const summaryEyewash = checkEyewash(summary, topicKey, "summary");
      if (summaryEyewash.found) {
        topicFailures.push({
          assertion: `Eyewash in summary: "${summaryEyewash.marker}"`,
          detail: summaryEyewash.snippet
        });
      }

      // ── Read expanded content for steps/sections eyewash check ───────────
      const expandedContent = await readExpandedTopicContent(page, topicKey);

      if (expandedContent.found) {
        // Steps eyewash
        for (const step of expandedContent.steps) {
          const stepEyewash = checkEyewash(step, topicKey, "steps");
          if (stepEyewash.found) {
            topicFailures.push({
              assertion: `Eyewash in steps: "${stepEyewash.marker}"`,
              detail: stepEyewash.snippet
            });
            break; // One failure per topic per field is enough
          }
        }
        // Sections eyewash
        for (const section of expandedContent.sections) {
          for (const item of section.items) {
            const secEyewash = checkEyewash(item, topicKey, `sections["${section.title}"]`);
            if (secEyewash.found) {
              topicFailures.push({
                assertion: `Eyewash in section "${section.title}": "${secEyewash.marker}"`,
                detail: secEyewash.snippet
              });
              break;
            }
          }
        }
      }

      // ── (3) Related cross-refs resolve ────────────────────────────────────
      const topicRelated = topicInfo.related || [];
      for (const ref of topicRelated) {
        if (!allTopicKeySet.has(ref)) {
          topicFailures.push({
            assertion: `Dangling related ref: "${ref}"`,
            detail: `Topic "${topicKey}" references "${ref}" which does not exist in the topic set.`
          });
        }
      }

      // ── (4) Drawer scrollable check ───────────────────────────────────────
      const scrollCheck = await checkDrawerScrollable(page);
      if (!scrollCheck.ok) {
        topicFailures.push({
          assertion: "Drawer not scrollable and not within viewport",
          detail: JSON.stringify(scrollCheck)
        });
      }

      // ── (5) axe-core on drawer subtree ────────────────────────────────────
      const axeResult = await runAxeOnDrawer(page, topicKey);
      if (axeResult.serious_critical.length > 0) {
        for (const v of axeResult.serious_critical) {
          topicFailures.push({
            assertion: `axe ${v.impact}: ${v.id}`,
            detail: `${v.help} — nodes: ${v.nodes.join(", ")}`
          });
        }
      }
      if (axeResult.other.length > 0) {
        axeOtherViolations.push(...axeResult.other.map((v) => ({ topicKey, ...v })));
      }

      // ── Collapse this topic before moving to next ─────────────────────────
      await page.evaluate((sel) => {
        const trigger = document.querySelector(sel);
        if (trigger && trigger.getAttribute("aria-expanded") === "true") {
          trigger.click();
        }
      }, triggerSelector);
      await new Promise((r) => setTimeout(r, 80));

      // ── Result for this topic ─────────────────────────────────────────────
      if (topicFailures.length === 0) {
        passCount++;
        process.stdout.write("PASS\n");
      } else {
        console.log("FAIL");
        for (const f of topicFailures) {
          console.error(`      [FAIL] ${f.assertion}: ${f.detail}`);
          failures.push({ topicKey, ...f });
        }
      }
    }
  }

  // ── Close the drawer ───────────────────────────────────────────────────────
  await page.evaluate(() => {
    document.querySelector(".help-drawer .close-button")?.click();
  });
  await new Promise((r) => setTimeout(r, 80));

} catch (error) {
  failures.push({ topicKey: "__harness__", assertion: "Harness error", detail: error.message });
  console.error(`\n[HARNESS ERROR] ${error.message}`);
} finally {
  if (server) server.close();
}
}); // withBrowser

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const passCount = EXPECTED_TOPIC_COUNT - failures.filter((f) => !f.topicKey.startsWith("__")).length;

// ── Results summary ──────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════════════════════");
console.log("  help-drawer-coverage.mjs — RESULTS SUMMARY");
console.log("═══════════════════════════════════════════════════════════════════════════");
console.log(`  Runtime: ${elapsed}s`);
console.log(`  Topics verified: ${EXPECTED_TOPIC_COUNT}`);
console.log(`  Pass: ${passCount}  |  Fail: ${failures.length}`);

if (axeOtherViolations.length > 0) {
  console.log(`\n  Non-blocking axe violations (moderate/minor): ${axeOtherViolations.length}`);
  for (const v of axeOtherViolations) {
    console.log(`    [${v.topicKey}] ${v.id} (${v.impact}): ${v.help}`);
  }
}

if (consoleErrors.length > 0) {
  console.log(`\n  Browser console errors (informational): ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 10)) {
    console.log(`    ${e}`);
  }
}

if (failures.length === 0) {
  console.log(`\n✓ PASS — ${EXPECTED_TOPIC_COUNT}/${EXPECTED_TOPIC_COUNT} topics verified`);
  console.log(`  Phase: R4.9.5f  |  Bead: fin-eia  |  Epic: fin-c96`);
  console.log(
    JSON.stringify({
      ok: true,
      gate: "help-drawer-coverage",
      phase: "R4.9.5f",
      bead: "fin-eia",
      topics_verified: EXPECTED_TOPIC_COUNT,
      topics_pass: EXPECTED_TOPIC_COUNT,
      topics_fail: 0,
      axe_blocking: 0,
      axe_other: axeOtherViolations.length,
      runtime_s: Number(elapsed)
    }, null, 2)
  );
  process.exitCode = 0;
} else {
  const topicFailures = failures.filter((f) => !f.topicKey.startsWith("__"));
  const harnessFailures = failures.filter((f) => f.topicKey.startsWith("__"));

  console.error(`\n✗ FAIL — ${topicFailures.length} topic failure(s)`);

  if (harnessFailures.length > 0) {
    console.error(`\n  Harness failures:`);
    for (const f of harnessFailures) {
      console.error(`    ${f.assertion}: ${f.detail}`);
    }
  }

  if (topicFailures.length > 0) {
    console.error(`\n  Per-topic failures:`);
    const byTopic = {};
    for (const f of topicFailures) {
      if (!byTopic[f.topicKey]) byTopic[f.topicKey] = [];
      byTopic[f.topicKey].push(f);
    }
    for (const [key, topicFs] of Object.entries(byTopic)) {
      console.error(`    Topic: ${key}`);
      for (const f of topicFs) {
        console.error(`      - ${f.assertion}`);
        if (f.detail && f.detail !== f.assertion) {
          console.error(`        ${f.detail}`);
        }
      }
    }
  }

  console.error(
    JSON.stringify({
      ok: false,
      gate: "help-drawer-coverage",
      phase: "R4.9.5f",
      bead: "fin-eia",
      topics_verified: EXPECTED_TOPIC_COUNT,
      topics_pass: passCount,
      topics_fail: topicFailures.length,
      harness_failures: harnessFailures.length,
      runtime_s: Number(elapsed)
    }, null, 2)
  );

  process.exitCode = 1;
}
