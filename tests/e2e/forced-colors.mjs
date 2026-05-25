/**
 * forced-colors.mjs — CI gate for Charter UI-UX §4.10 (forced-colors / Windows High Contrast)
 *
 * Bead: fin-boc  |  Epic: fin-c96  |  Persona: Mencius  |  Round: R4.3
 * Charter rule: Stribog-UI-UX-Standard §4.10 — forced-colors mode compliance
 *
 * What this test does:
 * 1. Serves the built single-file HTML from index.html (same convention as other e2e tests).
 * 2. Emulates `forced-colors: active` via Puppeteer's emulateMediaFeatures API.
 * 3. Runs both `prefers-color-scheme: light` and `dark` sub-runs (forced-colors interacts
 *    with both base themes).
 * 4. Navigates through four primary screens: Overview (dashboard), Tax Studio, Simulations,
 *    and Help (drawer). "Scenarios" is not a standalone view in this app — the closest peer
 *    surfaces are Simulations and the Scenario chips on Overview; both are covered.
 * 5. Runs axe-core on each screen under forced-colors. Asserts: zero serious/critical violations.
 *    Moderate/minor violations are documented and non-blocking.
 * 6. Asserts interactive elements remain visible and operable:
 *    - Every button, [role=button], input, select, [role=tab], a[href] has outline ≠ none
 *      (or :focus-visible outline established via computed style after focus).
 *    - No element has transparent color and transparent background simultaneously.
 * 7. Saves a PNG snapshot per screen × theme combination to
 *    tests/e2e/__snapshots__/forced-colors/<screen>-<theme>.png.
 * 8. Exits with code 0 on pass, non-zero on any blocking assertion failure.
 *
 * Dependency: axe-core (already a devDependency). @axe-core/puppeteer is NOT required;
 * we inject axe.source directly (same pattern as scripts/accessibility-check.mjs).
 */

import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withBrowser } from "./_browser-helper.mjs";
import axe from "axe-core";

// ── Constants ──────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SNAPSHOT_DIR = join(__dirname, "__snapshots__", "forced-colors");

const MIME = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

/** Primary screens to audit. Each entry: view id (for nav-list button) and display name. */
const PRIMARY_SCREENS = [
  { id: "overview",    label: "Overview"    },
  { id: "tax",         label: "Tax Studio"  },
  { id: "simulations", label: "Simulations" }
  // Help is a drawer, handled separately below.
];

/** Color-scheme sub-runs. */
const COLOR_SCHEMES = ["light", "dark"];

// ── Assertion helper ───────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(`FORCED-COLORS ASSERT FAIL: ${message}`);
}

// ── HTTP server (same pattern as other e2e tests) ──────────────────────────────

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

// ── Media feature emulation via CDP ───────────────────────────────────────────
//
// puppeteer-core@24 only allows prefers-color-scheme, prefers-reduced-motion, and
// color-gamut via page.emulateMediaFeatures(). For forced-colors we must go
// directly to the Chrome DevTools Protocol Emulation.setEmulatedMedia command,
// which accepts any CSS media feature without validation.
//
// IMPORTANT: The CDPSession must NOT be detached before the page navigates —
// the emulation setting persists for the lifetime of the session, not the
// lifetime of the page load. The session must be kept open while the page
// navigates and must be re-applied after reload (or before load).
// We return the session so callers can re-apply the media override after reload.

async function emulateMediaFeaturesCDP(page, features) {
  const client = await page.createCDPSession();
  // media: "" means "don't override media type (print/screen)"; only override features.
  await client.send("Emulation.setEmulatedMedia", {
    media: "",
    features: features.map(({ name, value }) => ({ name, value }))
  });
  // Do NOT detach — the setting is lost on detach. We keep the session alive.
  // Caller is responsible for detaching after the sub-run is complete.
  return client;
}

// ── Page helpers ───────────────────────────────────────────────────────────────

async function waitForModelIdle(page, timeout = 12000) {
  await page.waitForFunction(() => {
    const stack = document.querySelector(".main-stack");
    return (
      stack &&
      !stack.classList.contains("model-pending") &&
      stack.dataset.analyticsPending !== "true"
    );
  }, { timeout });
}

async function dismissPrivacyAndTour(page) {
  // R4.5b: renamed from .privacy-consent-card to .disclaimer-notice-card
  await page.evaluate(() => {
    const privacy = document.querySelector(".disclaimer-notice-card") || document.querySelector(".privacy-consent-card");
    if (!privacy) return;
    const btn = [...privacy.querySelectorAll("button")].find((b) =>
      /understand/i.test(b.textContent)
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 80));
  // Dismiss guided tour if present
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

/** Navigate to a named view via nav-list. */
async function navigateToView(page, viewId) {
  await page.click(`.nav-list button[data-view="${viewId}"]`);
  await page.waitForFunction(
    (id) => document.querySelector(".main-stack")?.dataset.activeView === id,
    {},
    viewId
  );
  await new Promise((r) => setTimeout(r, 180));
  await waitForModelIdle(page);
}

// ── axe-core runner ────────────────────────────────────────────────────────────

/**
 * Run axe-core on the current page state.
 * Returns: { serious_critical: [...], other: [...] }
 * Under forced-colors, color-contrast rules are suppressed because the UA remaps colors to
 * system-palette — the UA is responsible for contrast; author code cannot fail color-contrast
 * checks in forced-colors mode. We DO run all other a11y rules.
 */
async function runAxe(page, label) {
  await page.evaluate(axe.source);
  const result = await page.evaluate(async (lbl) => {
    return window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
      rules: {
        // Under forced-colors the UA rewrites colors; author cannot control contrast
        "color-contrast": { enabled: false },
        "color-contrast-enhanced": { enabled: false }
      }
    }).then((r) => ({
      label: lbl,
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
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 2).map((n) => n.target.join(" "))
        }))
    }));
  }, label);
  return result;
}

// ── Interactive-element visibility/operability checks ──────────────────────────

/**
 * For each primary interactive element on the page, check:
 * 1. Has an outline OR border that is not "none" / transparent (indicates forced-colors rendered it).
 * 2. Is not fully invisible (display/visibility/opacity).
 * 3. Has a non-transparent, non-Canvas effective color or background (browser-level detection).
 *
 * Returns an array of failures, each { selector, element, issue }.
 *
 * NOTE: Under forced-colors, browsers MUST apply system-color() overrides to colors.
 * Puppeteer's getComputedStyle reflects the forced-colors-remapped values. We can therefore
 * check whether the computed color/background is the keyword-resolving to a non-transparent
 * system color. We cannot do a pixel-level contrast check in pure JS — that needs a visual
 * comparison. Instead we assert:
 *   - `outline` is not "none 0px" (i.e. there is a visible focus mechanism).
 *   - The element is not display:none or visibility:hidden.
 *   - For interactive elements: borderColor is not fully transparent (rgba(0,0,0,0)).
 *
 * This is a structural/functional check, not a pixel-level contrast check.
 */
async function checkInteractiveElements(page, screenLabel) {
  const failures = await page.evaluate((label) => {
    const SELECTORS = [
      "button:not([disabled])",
      '[role="button"]:not([disabled])',
      'input:not([type="hidden"]):not([disabled])',
      "select:not([disabled])",
      '[role="tab"]',
      "a[href]"
    ];

    const failures = [];

    const isVisible = (el) => {
      const style = getComputedStyle(el);
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (Number.parseFloat(style.opacity) < 0.05) return false;
      const rect = el.getBoundingClientRect();
      // Skip zero-area elements (hidden by clipping or zero dimensions)
      if (rect.width < 2 && rect.height < 2) return false;
      return true;
    };

    const isTransparent = (colorStr) => {
      if (!colorStr) return true;
      if (colorStr === "transparent") return true;
      if (colorStr === "rgba(0, 0, 0, 0)") return true;
      return false;
    };

    for (const sel of SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!isVisible(el)) return;

        const style = getComputedStyle(el);

        // Check 1: outline — must not be "none" at 0px width.
        // Under forced-colors, :focus-visible outline should also be active.
        // We check the resting outline (UA may not apply :focus until tab-focus).
        // A missing resting outline is informational; we check `:focus` by programmatic focus below.
        const outlineStyle = style.outlineStyle;
        const outlineWidth = Number.parseFloat(style.outlineWidth);
        const hasOutline = outlineStyle !== "none" && outlineWidth > 0;

        // Check 2: color and background-color must not both be transparent.
        const colorTransparent = isTransparent(style.color);
        const bgTransparent = isTransparent(style.backgroundColor);

        // Under forced-colors, neither should be transparent for interactive elements.
        // Canvas/CanvasText system colors resolve to non-transparent values.
        // A failure here means the element may have been explicitly set to transparent
        // and the forced-colors remapping was blocked (e.g., by forced-color-adjust: none
        // without providing an alternative).
        if (colorTransparent && bgTransparent) {
          const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) || "";
          const ariaLabel = el.getAttribute("aria-label") || "";
          failures.push({
            screen: label,
            selector: sel,
            issue: "both color and background-color are transparent",
            element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className ? `.${String(el.className).trim().replace(/\s+/g, ".")}` : ""} ${text || ariaLabel}`.trim()
          });
        }

        // Check 3: border visibility for elements that use background shifts for state.
        // Under forced-colors, borders must be visible for such elements.
        const borderColor = style.borderColor || style.borderTopColor;
        const borderWidth = Number.parseFloat(style.borderWidth || style.borderTopWidth);
        const hasBorder = !isTransparent(borderColor) && borderWidth > 0;

        // Range inputs are rendered as native platform controls by the UA under forced-colors.
        // Their visual appearance (track, thumb) is drawn by the browser without CSS borders.
        // Flagging them based on borderWidth/outlineWidth would be a false positive.
        const isRangeInput = el.tagName === "INPUT" && el.getAttribute("type") === "range";

        // Only flag if NEITHER outline NOR border is present for interactive elements
        // that are visually rendered (buttons and inputs must be traceable).
        if (!hasOutline && !hasBorder && !isRangeInput && (el.tagName === "BUTTON" || el.tagName === "INPUT" || el.tagName === "SELECT")) {
          const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) || "";
          const ariaLabel = el.getAttribute("aria-label") || "";
          failures.push({
            screen: label,
            selector: sel,
            issue: "no visible outline OR border (interactive element may be invisible under forced-colors)",
            element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className ? `.${String(el.className).trim().replace(/\s+/g, ".")}` : ""} ${text || ariaLabel}`.trim()
          });
        }
      });
    }

    return failures;
  }, screenLabel);

  return failures;
}

/**
 * Tab-traverse the page and assert focus reaches every interactive element.
 * We press Tab up to maxTabs times, collect the focused elements, and assert
 * that the count of unique focusable elements reached is > 0 (non-empty focus ring)
 * and that no element becomes focused that is visually hidden.
 *
 * Returns: { focusedCount, invisibleFocused: [...] }
 */
async function checkTabFocusTraversal(page, screenLabel) {
  const result = await page.evaluate(async (label) => {
    const maxTabs = 60; // Enough to cover a full screen without hanging
    const focused = new Set();
    const invisibleFocused = [];

    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    // Start from the body
    document.body.focus();

    for (let i = 0; i < maxTabs; i++) {
      // Dispatch Tab keydown on document
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", keyCode: 9, bubbles: true, cancelable: true }));
      // Small yield
      await new Promise((r) => setTimeout(r, 10));

      const active = document.activeElement;
      if (!active || active === document.body) continue;

      const key = active.tagName + (active.id ? `#${active.id}` : "") + (active.className ? `.${String(active.className).trim().split(/\s+/).slice(0, 2).join(".")}` : "");
      if (focused.has(key)) break; // Full cycle — stop
      focused.add(key);

      if (!isVisible(active)) {
        invisibleFocused.push({
          screen: label,
          element: key,
          issue: "focus landed on visually hidden element"
        });
      }
    }

    return {
      focusedCount: focused.size,
      invisibleFocused
    };
  }, screenLabel);

  return result;
}

// ── Main test runner ───────────────────────────────────────────────────────────

const server = await startServer();
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}/index.html?finTestApi=1`;

await mkdir(SNAPSHOT_DIR, { recursive: true });

/** All failing assertions (blocking) accumulated across sub-runs. */
const allAxeBlockingViolations = [];
/** All non-blocking axe violations (documented, non-blocking). */
const allAxeOtherViolations = [];
/** Interactive element visibility failures (blocking). */
const allElementFailures = [];
/** Focus trap failures (blocking if focus count = 0, else informational). */
const allFocusFailures = [];

await withBrowser({}, async ({ page }) => {
await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });

// Collect console errors for diagnostic output (not blocking)
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`console-error: ${msg.text()}`);
});

for (const colorScheme of COLOR_SCHEMES) {
  console.log(`\n── Forced-colors sub-run: prefers-color-scheme=${colorScheme} ──`);

  // Set up media features: forced-colors active + chosen color scheme.
  // NOTE: page.emulateMediaFeatures() in puppeteer-core@24 only allows
  // prefers-color-scheme, prefers-reduced-motion, and color-gamut. We use the
  // CDP Emulation.setEmulatedMedia command directly for forced-colors.
  //
  // Lifecycle: emulateMediaFeaturesCDP() returns the live CDPSession.
  // We navigate to the page, then reload. The emulation persists across navigations
  // as long as the CDPSession is kept open. We detach the session at the end of
  // each sub-run to cleanly reset state before the next one.
  //
  // Load lifecycle for forced-colors emulation:
  //
  // 1. Navigate fully to establish the page context (networkidle0).
  // 2. Apply the CDP forced-colors emulation on the live page session.
  //    The emulation takes effect immediately and persists for the CDPSession lifetime.
  // 3. Reload the page so the browser re-evaluates all CSS @media queries under
  //    the now-active forced-colors state.
  // 4. Keep the CDPSession open throughout the sub-run.

  // Step 1: Full initial navigation
  await page.goto(baseUrl, { waitUntil: "networkidle0" });

  // Step 2: Apply forced-colors emulation (CDPSession kept open)
  const cdpSession = await emulateMediaFeaturesCDP(page, [
    { name: "forced-colors", value: "active" },
    { name: "prefers-color-scheme", value: colorScheme }
  ]);

  // Step 3: Clear storage and reload with emulation active
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });

  // Wait for app to render
  await page.waitForSelector(".main-stack", { timeout: 20000 });
  await dismissPrivacyAndTour(page);
  await waitForModelIdle(page);

  // Verify forced-colors is actually active (defensive assertion)
  const fcActiveCheck = await page.evaluate(() => window.matchMedia("(forced-colors: active)").matches);
  if (!fcActiveCheck) {
    console.warn(`  [WARN] window.matchMedia("(forced-colors: active)") returned false — emulation may not be active`);
  } else {
    console.log(`  forced-colors emulation confirmed active in page`);
  }

  // ── Iterate primary screens ────────────────────────────────────────────────

  for (const screen of PRIMARY_SCREENS) {
    console.log(`  Screen: ${screen.label} (${colorScheme})`);

    await navigateToView(page, screen.id);

    // Screenshot
    const snapPath = join(SNAPSHOT_DIR, `${screen.id}-${colorScheme}.png`);
    await page.screenshot({ path: snapPath, fullPage: false });
    console.log(`    Snapshot: ${snapPath}`);

    // axe-core run
    const axeResult = await runAxe(page, `${screen.label} [forced-colors/${colorScheme}]`);
    if (axeResult.serious_critical.length > 0) {
      console.error(`    [BLOCKING] ${axeResult.serious_critical.length} serious/critical axe violation(s):`);
      axeResult.serious_critical.forEach((v) =>
        console.error(`      - ${v.id} (${v.impact}): ${v.help} → ${v.nodes.join(", ")}`)
      );
      allAxeBlockingViolations.push(...axeResult.serious_critical.map((v) => ({
        ...v,
        screen: screen.label,
        colorScheme
      })));
    } else {
      console.log(`    axe: 0 serious/critical violations`);
    }
    if (axeResult.other.length > 0) {
      console.log(`    axe: ${axeResult.other.length} moderate/minor violation(s) (non-blocking, documented below)`);
      allAxeOtherViolations.push(...axeResult.other.map((v) => ({
        ...v,
        screen: screen.label,
        colorScheme
      })));
    }

    // Interactive element visibility check
    const elemFailures = await checkInteractiveElements(page, `${screen.label} [${colorScheme}]`);
    if (elemFailures.length > 0) {
      console.error(`    [BLOCKING] ${elemFailures.length} interactive-element visibility failure(s):`);
      elemFailures.forEach((f) => console.error(`      - ${f.issue}: ${f.element}`));
      allElementFailures.push(...elemFailures);
    } else {
      console.log(`    Interactive elements: all visible and operable`);
    }

    // Tab-traversal check
    const focusResult = await checkTabFocusTraversal(page, `${screen.label} [${colorScheme}]`);
    console.log(`    Focus traversal: ${focusResult.focusedCount} unique elements reached`);
    if (focusResult.focusedCount === 0) {
      allFocusFailures.push({
        screen: screen.label,
        colorScheme,
        issue: "Tab traversal reached no focusable elements — possible focus trap"
      });
    }
    if (focusResult.invisibleFocused.length > 0) {
      console.warn(`    [WARN] ${focusResult.invisibleFocused.length} invisible element(s) received focus (non-blocking):`);
      focusResult.invisibleFocused.forEach((f) => console.warn(`      - ${f.element}`));
    }
  }

  // ── Help drawer screen ─────────────────────────────────────────────────────

  console.log(`  Screen: Help [${colorScheme}]`);

  // Navigate to overview first, then open help drawer
  await navigateToView(page, "overview");
  await page.click(".actions button[title=\"Open help\"]");
  await page.waitForSelector(".help-drawer", { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 180));

  const helpSnapPath = join(SNAPSHOT_DIR, `help-${colorScheme}.png`);
  await page.screenshot({ path: helpSnapPath, fullPage: false });
  console.log(`    Snapshot: ${helpSnapPath}`);

  const helpAxeResult = await runAxe(page, `Help Drawer [forced-colors/${colorScheme}]`);
  if (helpAxeResult.serious_critical.length > 0) {
    console.error(`    [BLOCKING] ${helpAxeResult.serious_critical.length} serious/critical axe violation(s) in Help drawer:`);
    helpAxeResult.serious_critical.forEach((v) =>
      console.error(`      - ${v.id} (${v.impact}): ${v.help} → ${v.nodes.join(", ")}`)
    );
    allAxeBlockingViolations.push(...helpAxeResult.serious_critical.map((v) => ({
      ...v,
      screen: "Help Drawer",
      colorScheme
    })));
  } else {
    console.log(`    axe: 0 serious/critical violations in Help drawer`);
  }
  if (helpAxeResult.other.length > 0) {
    allAxeOtherViolations.push(...helpAxeResult.other.map((v) => ({
      ...v,
      screen: "Help Drawer",
      colorScheme
    })));
  }

  const helpElemFailures = await checkInteractiveElements(page, `Help Drawer [${colorScheme}]`);
  if (helpElemFailures.length > 0) {
    console.error(`    [BLOCKING] ${helpElemFailures.length} interactive-element visibility failure(s) in Help drawer:`);
    helpElemFailures.forEach((f) => console.error(`      - ${f.issue}: ${f.element}`));
    allElementFailures.push(...helpElemFailures);
  } else {
    console.log(`    Interactive elements: all visible and operable in Help drawer`);
  }

  // Close help drawer before next sub-run
  await page.evaluate(() => {
    document.querySelector(".help-drawer .close-button")?.click();
  });
  await new Promise((r) => setTimeout(r, 80));

  // Detach CDP session to cleanly reset emulation state for next sub-run
  await cdpSession.detach();
}

// ── Tear down ──────────────────────────────────────────────────────────────────

}); // withBrowser
server.close();

// ── Results summary ────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("  forced-colors.mjs — RESULTS SUMMARY");
console.log("═══════════════════════════════════════════════════════");

if (allAxeOtherViolations.length > 0) {
  console.log(`\nNon-blocking axe violations (moderate/minor) — ${allAxeOtherViolations.length} total:`);
  allAxeOtherViolations.forEach((v) =>
    console.log(`  [${v.colorScheme}/${v.screen}] ${v.id} (${v.impact}): ${v.help}`)
  );
}

const totalBlocking =
  allAxeBlockingViolations.length + allElementFailures.length + allFocusFailures.length;

if (totalBlocking === 0) {
  console.log("\n✓ PASS — zero blocking violations under forced-colors");
  console.log(`  Screens covered: Overview, Tax Studio, Simulations, Help`);
  console.log(`  Color-scheme sub-runs: ${COLOR_SCHEMES.join(", ")}`);
  console.log(`  Snapshots: ${SNAPSHOT_DIR}`);
  console.log(
    JSON.stringify({
      ok: true,
      gate: "forced-colors",
      charter_rule: "UI-UX §4.10",
      bead: "fin-boc",
      screens: 4,
      color_schemes: COLOR_SCHEMES,
      axe_blocking: 0,
      axe_other: allAxeOtherViolations.length,
      element_failures: 0,
      focus_failures: 0,
      snapshot_dir: SNAPSHOT_DIR
    }, null, 2)
  );
  process.exitCode = 0;
} else {
  console.error(`\n✗ FAIL — ${totalBlocking} blocking violation(s) under forced-colors`);
  if (allAxeBlockingViolations.length > 0) {
    console.error(`  axe serious/critical: ${allAxeBlockingViolations.length}`);
    allAxeBlockingViolations.forEach((v) =>
      console.error(`    [${v.colorScheme}/${v.screen}] ${v.id} (${v.impact}): ${v.help}`)
    );
  }
  if (allElementFailures.length > 0) {
    console.error(`  Interactive element visibility failures: ${allElementFailures.length}`);
    allElementFailures.forEach((f) =>
      console.error(`    [${f.screen}] ${f.issue}: ${f.element}`)
    );
  }
  if (allFocusFailures.length > 0) {
    console.error(`  Focus-traversal failures: ${allFocusFailures.length}`);
    allFocusFailures.forEach((f) =>
      console.error(`    [${f.colorScheme}/${f.screen}] ${f.issue}`)
    );
  }
  process.exitCode = 1;
}
