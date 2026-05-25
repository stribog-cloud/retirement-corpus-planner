/**
 * range-slider-aria-regression.mjs — R4.9.5j fin-c96.5
 *
 * E2E regression gate: every <input type="range"> in the built app must carry
 * a non-empty aria-label (or aria-labelledby pointing to a non-empty element).
 *
 * Background: fin-c96.5 found that all range sliders rendered by the Control
 * component and the Canvas Control panel had no accessible name, causing
 * VoiceOver/NVDA to announce each as "slider" with no label.
 *
 * Fix (R4.9.5j): aria-label added to the range input in Control (one-site fix,
 * covers 64 sliders) and per-site on the 4 Canvas Control layout sliders.
 *
 * This test:
 *   1. Serves the built dist/app.html via a local HTTP server.
 *   2. Opens the page with Puppeteer.
 *   3. Queries document.querySelectorAll('input[type="range"]') in-page.
 *   4. Asserts every range input has a non-empty aria-label.
 *   5. Asserts at least 5 range inputs are present (the 4 Canvas Control
 *      sliders are always rendered; the Control sliders render inside
 *      the model panel which is not visible by default but still in DOM).
 *
 * Uses withBrowser() from _browser-helper.mjs for guaranteed Chrome teardown.
 *
 * Run with:
 *   node scripts/e2e-run-with-timeout.mjs 60 tests/e2e/range-slider-aria-regression.mjs
 *
 * Beads: fin-c96.5  |  Phase: R4.9.5j  |  Persona: Raman
 */

import { withBrowser } from "./_browser-helper.mjs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../..");
const DIST = resolve(ROOT, "dist", "app.html");

if (!existsSync(DIST)) {
  console.error("dist/app.html missing — run `npm run build` first.");
  process.exit(2);
}

// ── Local HTTP server ─────────────────────────────────────────────────────────

const PORT = 39149; // distinct from other e2e tests

const serverProc = spawn(
  "python3",
  ["-m", "http.server", String(PORT), "--directory", resolve(ROOT, "dist")],
  { stdio: "pipe" }
);
serverProc.on("error", (err) => {
  console.error(`HTTP server spawn error: ${err.message}`);
  process.exit(2);
});

// Give the server a moment to bind
await sleep(600);

// ── Helpers ───────────────────────────────────────────────────────────────────

const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Test ──────────────────────────────────────────────────────────────────────

try {
  await withBrowser({}, async ({ page }) => {
    const url = `http://127.0.0.1:${PORT}/app.html`;
    console.log(`Opening ${url}`);

    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

    // Wait briefly for React to hydrate
    await sleep(800);

    // Query all range inputs and their aria-label values
    const sliderInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="range"]'));
      return inputs.map((el, i) => {
        const ariaLabel = el.getAttribute("aria-label") || "";
        const ariaLabelledBy = el.getAttribute("aria-labelledby") || "";

        let labelledByText = "";
        if (ariaLabelledBy) {
          const ref = document.getElementById(ariaLabelledBy);
          labelledByText = ref ? (ref.textContent || "").trim() : "";
        }

        return {
          index: i,
          ariaLabel,
          ariaLabelledBy,
          labelledByText,
          hasAccessibleName: ariaLabel.trim().length > 0 || labelledByText.length > 0
        };
      });
    });

    console.log(`\nFound ${sliderInfo.length} range input(s).\n`);

    // Gate 1: at least 5 range inputs (4 Canvas Control + ≥1 from Control panel in DOM)
    check(
      "G1 — At least 5 range inputs present in the DOM",
      sliderInfo.length >= 5,
      `actual count: ${sliderInfo.length}`
    );

    // Gate 2: every range input has a non-empty accessible name
    for (const s of sliderInfo) {
      const detail = s.ariaLabel
        ? `aria-label="${s.ariaLabel}"`
        : s.ariaLabelledBy
          ? `aria-labelledby="${s.ariaLabelledBy}" → "${s.labelledByText}"`
          : "no aria-label and no aria-labelledby";
      check(
        `G2 — slider[${s.index}] has accessible name`,
        s.hasAccessibleName,
        detail
      );
    }

    // Gate 3: zero sliders with empty aria-label (explicit empty string is bad)
    const emptyAriaLabel = sliderInfo.filter((s) => s.ariaLabel === "");
    // Note: aria-label="" (explicit empty) would suppress the name; aria-label absent is
    // handled by Gate 2. Here we specifically flag explicit empty strings.
    const explicitEmpty = sliderInfo.filter(
      (s) => s.ariaLabel !== null && s.ariaLabel.trim() === "" && !s.ariaLabelledBy
    );
    check(
      "G3 — No slider has explicitly empty aria-label without labelledby fallback",
      explicitEmpty.length === 0,
      explicitEmpty.length > 0
        ? `${explicitEmpty.length} slider(s) have empty aria-label: indices [${explicitEmpty.map((s) => s.index).join(", ")}]`
        : ""
    );

    // Gate 4: confirm key labeled sliders are present by label
    const labels = sliderInfo.map((s) => s.ariaLabel);

    const expectedLabels = [
      "Canvas viewport width in pixels",
      "Left rail width in pixels",
      "Right insights panel width in pixels",
      "Text scale percentage"
    ];
    for (const expected of expectedLabels) {
      check(
        `G4 — Slider with aria-label="${expected}" present`,
        labels.includes(expected),
        `found labels: [${labels.join(", ")}]`
      );
    }

    // ── G5 — Chromium AX tree authoritative check ─────────────────────────────
    // page.accessibility.snapshot() queries the Chromium accessibility tree —
    // the exact same tree that VoiceOver (macOS), NVDA, JAWS, and Narrator
    // consume via platform AT APIs (AX on macOS, IA2/UIA on Windows).
    // A non-empty `name` field on a slider node means the AT WILL announce
    // that name. This is authoritative: same data path as human-driven AT
    // verification, queried programmatically.
    //
    // Note on AX count vs DOM count: Chromium correctly omits off-screen /
    // zero-layout-box elements from the AX tree. The 3 Quick-Controls sliders
    // (Principal, Withdrawal, Years) are in the DOM but invisible on desktop
    // viewport (collapsed panel, no layout box). The AX tree exposes only the
    // 4 visible Canvas Control sliders — which is exactly the set a screen
    // reader user would encounter. G5-B therefore compares AX count against
    // the *visible* DOM slider count.
    //
    // Rationale: supersedes the manual VoiceOver gate in
    // audit/round-4/r4.9.5j-fin-c96.5-voiceover-instructions.md.
    // See fin-c96.5 (R4.9.5j Wave 1) for full disposition.

    console.log("\n── G5 — Chromium AX tree authoritative check ──────────────");

    const axTree = await page.accessibility.snapshot({ interestingOnly: false });

    // Walk the AX tree recursively and collect all slider nodes.
    function collectSliders(node, acc = []) {
      if (!node) return acc;
      if (node.role === "slider") acc.push(node);
      if (Array.isArray(node.children)) {
        for (const child of node.children) collectSliders(child, acc);
      }
      return acc;
    }

    const axSliders = collectSliders(axTree);

    // Count visible DOM sliders (those with a layout box, i.e. what AT sees).
    const visibleDomSliderCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="range"]')).filter(
        (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      ).length;
    });

    console.log(`  AX-tree sliders found: ${axSliders.length}`);
    console.log(`  DOM sliders total: ${sliderInfo.length}, visible: ${visibleDomSliderCount}`);

    // G5-A: AX slider count must be at least 4 (the 4 always-visible Canvas
    //        Control sliders — viewport, left rail, right insights, text scale).
    check(
      "G5-A — AX tree reports at least 4 visible sliders",
      axSliders.length >= 4,
      `AX slider count: ${axSliders.length}`
    );

    // G5-B: AX slider count must match the visible DOM range-input count
    //        (structural consistency — every visible slider is reachable by AT).
    check(
      "G5-B — AX slider count matches visible DOM input[type=range] count",
      axSliders.length === visibleDomSliderCount,
      `AX: ${axSliders.length}, DOM visible: ${visibleDomSliderCount}`
    );

    // G5-C: Every AX slider node must have a non-empty name field.
    //        This is what VoiceOver/NVDA/JAWS will speak.
    let axAllNamed = true;
    for (let i = 0; i < axSliders.length; i++) {
      const node = axSliders[i];
      const named = typeof node.name === "string" && node.name.trim().length > 0;
      if (!named) axAllNamed = false;
      check(
        `G5-C — AX slider[${i}] has non-empty name`,
        named,
        named ? `name="${node.name}"` : "name is empty or missing"
      );
    }

    // Forensic visibility: print every AX slider name on PASS so the log
    // carries the exact strings VoiceOver/NVDA would announce.
    if (axAllNamed && axSliders.length >= 4) {
      console.log("\n  AX-tree slider names (what AT will announce):");
      axSliders.forEach((n, i) => {
        console.log(`    [${i}] "${n.name}"`);
      });
      console.log(
        `\n  AUTHORITATIVE: Chromium AX tree confirms ${axSliders.length}/${axSliders.length} visible sliders` +
        " have a non-empty accessible name.\n" +
        "  Screen readers (VoiceOver, NVDA, JAWS, Narrator) consume this same tree.\n" +
        "  Manual VoiceOver pass is optional confirmatory step only."
      );
    }

    // Summary
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Sliders found (DOM): ${sliderInfo.length}`);
    console.log(`Sliders found (AX):  ${axSliders.length}`);
    console.log(`Failures: ${failures.length}`);
    if (failures.length === 0) {
      console.log("Result: PASS — all range sliders have accessible names (DOM + AX authoritative).");
    }
  });
} finally {
  serverProc.kill();
}

if (failures.length > 0) {
  console.error("\nFailed assertions:");
  for (const f of failures) {
    console.error(`  • ${f}`);
  }
  process.exit(1);
}

process.exit(0);
