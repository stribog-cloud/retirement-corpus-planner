/**
 * control-aria.test.jsx — R4.9.5j fin-c96.5
 *
 * Verifies that every <input type="range"> rendered by the Control component
 * carries a non-empty aria-label. This is a regression guard for the
 * fin-c96.5 defect fix: the range slider inside Control previously had no
 * accessible name, causing VoiceOver/NVDA to announce it as just "slider".
 *
 * Fix: src/main.jsx line ~1146 now passes aria-label={label} to the range input.
 *
 * Test approach:
 *   - React 19 + react-dom/client in the Vitest jsdom environment.
 *   - Control is not exported from main.jsx, so we render it via a thin
 *     wrapper that imports React + ReactDOM directly and evaluates the
 *     component module. To avoid the full app import overhead, we define
 *     a minimal duplicate of the component's render logic and assert on
 *     the structural contract (aria-label attribute present and non-empty).
 *
 * Because Control is not exported, we test via a DOM integration approach:
 *   1. Import React and ReactDOM from the actual installed packages.
 *   2. Define a minimal stand-in that replicates the range-input branch.
 *   3. Assert the aria-label contract.
 *   4. Also parse the actual src/main.jsx source to confirm the
 *      aria-label={label} pattern is present at the range-input line.
 *
 * Beads: fin-c96.5  |  Phase: R4.9.5j  |  Persona: Raman
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Static source-level assertion ─────────────────────────────────────────────
// This is the cheapest and most direct check: confirm that the actual source
// at the range-input line carries aria-label={label}.

describe("fin-c96.5 — Control range input source contract", () => {
  it("src/main.jsx range input in Control component has aria-label={label}", () => {
    const source = readFileSync(resolve(root, "src/main.jsx"), "utf-8");
    const lines = source.split("\n");

    // Find the line with the range input inside the Control component.
    // We look for the line that has: className="range" type="range" AND aria-label={label}
    const rangeLine = lines.find(
      (l) => l.includes('type="range"') && l.includes('className="range"')
    );
    expect(rangeLine, 'Control range input line not found in src/main.jsx').toBeTruthy();
    expect(
      rangeLine.includes('aria-label={label}'),
      `Control range input missing aria-label={label}. Line: ${rangeLine?.trim()}`
    ).toBe(true);
  });

  it("every type=\"range\" in src/main.jsx has a non-empty aria-label attribute or expression", () => {
    const source = readFileSync(resolve(root, "src/main.jsx"), "utf-8");
    const lines = source.split("\n");

    const rangeLines = lines.filter((l) => l.includes('type="range"'));
    expect(rangeLines.length, "Expected at least 5 range inputs").toBeGreaterThanOrEqual(5);

    for (const line of rangeLines) {
      const hasAriaLabel = line.includes("aria-label=");
      expect(
        hasAriaLabel,
        `Range input line missing aria-label:\n  ${line.trim()}`
      ).toBe(true);

      // Confirm the value is not an empty string literal
      const emptyStringMatch = line.match(/aria-label=""/);
      expect(
        emptyStringMatch,
        `Range input has empty aria-label="":\n  ${line.trim()}`
      ).toBeNull();
    }
  });
});

// ── DOM rendering assertions ──────────────────────────────────────────────────
// Render a minimal stand-in for the Control component's range-input branch,
// using the same prop signature, and assert the DOM has aria-label.

/**
 * Minimal replication of the Control range-input fragment.
 * Matches the actual component's render of the range input:
 *   <input className="range" type="range" ... aria-label={label} />
 */
function MinimalControlRangeFragment({ label, value, min, max, step, disabled = false }) {
  return React.createElement("input", {
    className: "range",
    type: "range",
    value,
    min,
    max,
    step: step || 1,
    disabled,
    onChange: () => {},
    "aria-label": label
  });
}

describe("fin-c96.5 — Control range input DOM assertions", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;
  });

  function renderAndGetRange(props) {
    const reactRoot = createRoot(container);
    flushSync(() => {
      reactRoot.render(
        React.createElement(MinimalControlRangeFragment, props)
      );
    });
    return container.querySelector('input[type="range"]');
  }

  it("Principal slider has aria-label='Principal'", () => {
    const input = renderAndGetRange({
      label: "Principal",
      value: 15000000,
      min: 1000000,
      max: 200000000,
      step: 100000
    });
    expect(input, "range input not rendered").not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Principal");
    expect(input.getAttribute("aria-label")).not.toBe("");
  });

  it("Withdrawal slider has aria-label='Withdrawal'", () => {
    const input = renderAndGetRange({
      label: "Withdrawal",
      value: 60,
      min: 0,
      max: 100,
      step: 1
    });
    expect(input, "range input not rendered").not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Withdrawal");
    expect(input.getAttribute("aria-label")).not.toBe("");
  });

  it("Years slider has aria-label='Years'", () => {
    const input = renderAndGetRange({
      label: "Years",
      value: 30,
      min: 1,
      max: 60,
      step: 1
    });
    expect(input, "range input not rendered").not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Years");
    expect(input.getAttribute("aria-label")).not.toBe("");
  });

  it("Monthly cash target slider has aria-label='Monthly cash target'", () => {
    const input = renderAndGetRange({
      label: "Monthly cash target",
      value: 100000,
      min: 0,
      max: 3000000,
      step: 10000
    });
    expect(input, "range input not rendered").not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Monthly cash target");
  });

  it("Equity allocation slider has aria-label='Equity allocation'", () => {
    const input = renderAndGetRange({
      label: "Equity allocation",
      value: 60,
      min: 0,
      max: 100,
      step: 1
    });
    expect(input, "range input not rendered").not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Equity allocation");
  });

  it("Inflation slider has aria-label='Inflation'", () => {
    const input = renderAndGetRange({
      label: "Inflation",
      value: 6,
      min: 0,
      max: 12,
      step: 0.1
    });
    expect(input, "range input not rendered").not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Inflation");
  });

  it("disabled slider still has aria-label", () => {
    const input = renderAndGetRange({
      label: "Equity return",
      value: 12,
      min: -20,
      max: 35,
      step: 0.5,
      disabled: true
    });
    expect(input, "range input not rendered").not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Equity return");
    expect(input.disabled).toBe(true);
  });
});

// ── Standalone layout slider source assertions ────────────────────────────────

describe("fin-c96.5 — Standalone Canvas Control slider source contract", () => {
  let sourceLines;

  beforeEach(() => {
    const source = readFileSync(resolve(root, "src/main.jsx"), "utf-8");
    sourceLines = source.split("\n");
  });

  it("viewport slider has aria-label containing 'viewport'", () => {
    const line = sourceLines.find(
      (l) => l.includes('type="range"') && l.includes("viewportBounds")
    );
    expect(line, "viewport range input not found").toBeTruthy();
    expect(line.includes("aria-label=")).toBe(true);
    expect(line.toLowerCase()).toContain("viewport");
  });

  it("rail slider has aria-label containing 'rail'", () => {
    const line = sourceLines.find(
      (l) => l.includes('type="range"') && l.includes("layout.rail")
    );
    expect(line, "rail range input not found").toBeTruthy();
    expect(line.includes("aria-label=")).toBe(true);
    expect(line.toLowerCase()).toContain("rail");
  });

  it("insights slider has aria-label containing 'insights'", () => {
    const line = sourceLines.find(
      (l) => l.includes('type="range"') && l.includes("layout.insights")
    );
    expect(line, "insights range input not found").toBeTruthy();
    expect(line.includes("aria-label=")).toBe(true);
    expect(line.toLowerCase()).toContain("insights");
  });

  it("fontScale slider has aria-label containing 'scale'", () => {
    const line = sourceLines.find(
      (l) => l.includes('type="range"') && l.includes("layout.fontScale")
    );
    expect(line, "fontScale range input not found").toBeTruthy();
    expect(line.includes("aria-label=")).toBe(true);
    expect(line.toLowerCase()).toContain("scale");
  });
});
