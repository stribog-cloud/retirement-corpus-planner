/**
 * modal-focus.test.jsx — fin-8fb.2 P4
 *
 * Verifies the shared `useModalFocus` hook (src/main.jsx) that gives GuidedTour,
 * HelpDrawer, AssumptionDrawer, and DisclaimerNotice identical open/trap/restore
 * focus behaviour (WCAG 2.4.3 focus order + 2.1.2 no keyboard trap).
 *
 * Two layers, matching the pattern in tests/help-drawer.test.jsx / control-aria.test.jsx:
 *   1. DOM rendering assertions — a minimal TestDialog stand-in exercises the
 *      REAL exported useModalFocus hook (not a re-implementation), so tab-wrap,
 *      escape, and focus-restore behaviour is verified against actual code.
 *   2. Source-level assertions — confirm each of the 4 real dialogs in
 *      src/main.jsx actually calls useModalFocus with the expected onClose
 *      wiring (present for GuidedTour/HelpDrawer/AssumptionDrawer, absent for
 *      DisclaimerNotice, which must not be Escape-dismissible).
 *
 * Beads: fin-8fb.2 | Parent: fin-8fb (EPIC) v2.0: build, certify, release
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useModalFocus } from "../src/main.jsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function dispatchKeyDown(target, key, { shiftKey = false } = {}) {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/**
 * Minimal dialog stand-in wired to the real useModalFocus hook. Mirrors the
 * shape every real dialog uses: a role="dialog" container, a close button
 * first in DOM order, some middle content, and a last focusable element.
 */
function TestDialog({ open, onClose, initialFocusRef, refocusKey, returnFocus }) {
  const containerRef = React.useRef(null);
  useModalFocus(open, containerRef, { onClose, initialFocusRef, refocusKey, returnFocus });
  if (!open) return null;
  return React.createElement(
    "div",
    { ref: containerRef, role: "dialog", "aria-modal": "true", "data-testid": "dialog" },
    React.createElement("button", { key: "close", "data-testid": "close-btn" }, "Close"),
    React.createElement("button", { key: "mid", "data-testid": "mid-btn" }, "Mid"),
    React.createElement("button", { key: "primary", "data-testid": "primary-btn" }, "Primary"),
    React.createElement("button", { key: "last", "data-testid": "last-btn" }, "Last")
  );
}

describe("useModalFocus — DOM behaviour", () => {
  let container;
  let root_;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root_ = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root_.unmount());
    document.body.removeChild(container);
    container = null;
  });

  it("opening the dialog moves focus to the first focusable element inside it", () => {
    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true, onClose: () => {} }));
    });
    const dialog = container.querySelector('[data-testid="dialog"]');
    const closeBtn = container.querySelector('[data-testid="close-btn"]');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(closeBtn);
  });

  it("honours an explicit initialFocusRef over the first-focusable default", () => {
    const primaryRef = React.createRef();
    function Wrapper({ open }) {
      const containerRef = React.useRef(null);
      useModalFocus(open, containerRef, { initialFocusRef: primaryRef });
      if (!open) return null;
      return React.createElement(
        "div",
        { ref: containerRef, role: "dialog", "aria-modal": "true" },
        React.createElement("button", { key: "close" }, "Close"),
        React.createElement("button", { key: "primary", ref: primaryRef }, "Primary")
      );
    }
    flushSync(() => {
      root_.render(React.createElement(Wrapper, { open: true }));
    });
    expect(document.activeElement).toBe(primaryRef.current);
  });

  it("Tab from the last focusable element wraps focus to the first", () => {
    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true, onClose: () => {} }));
    });
    const closeBtn = container.querySelector('[data-testid="close-btn"]');
    const lastBtn = container.querySelector('[data-testid="last-btn"]');
    lastBtn.focus();
    const event = dispatchKeyDown(lastBtn, "Tab");
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeBtn);
  });

  it("Shift+Tab from the first focusable element wraps focus to the last", () => {
    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true, onClose: () => {} }));
    });
    const closeBtn = container.querySelector('[data-testid="close-btn"]');
    const lastBtn = container.querySelector('[data-testid="last-btn"]');
    closeBtn.focus();
    const event = dispatchKeyDown(closeBtn, "Tab", { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(lastBtn);
  });

  it("Tab in the middle of the dialog is left alone (no wrap, no preventDefault)", () => {
    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true, onClose: () => {} }));
    });
    const midBtn = container.querySelector('[data-testid="mid-btn"]');
    midBtn.focus();
    const event = dispatchKeyDown(midBtn, "Tab");
    expect(event.defaultPrevented).toBe(false);
  });

  it("Escape calls the provided onClose", () => {
    let closed = false;
    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true, onClose: () => { closed = true; } }));
    });
    const closeBtn = container.querySelector('[data-testid="close-btn"]');
    dispatchKeyDown(closeBtn, "Escape");
    expect(closed).toBe(true);
  });

  it("Escape is a no-op when onClose is omitted (DisclaimerNotice contract: consent required)", () => {
    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true }));
    });
    const closeBtn = container.querySelector('[data-testid="close-btn"]');
    expect(() => dispatchKeyDown(closeBtn, "Escape")).not.toThrow();
    // Dialog must still be present — nothing dismissed it.
    expect(container.querySelector('[data-testid="dialog"]')).not.toBeNull();
  });

  it("closing the dialog restores focus to the element that had it before opening", () => {
    const outsideBtn = document.createElement("button");
    outsideBtn.textContent = "Outside trigger";
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();
    expect(document.activeElement).toBe(outsideBtn);

    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true, onClose: () => {} }));
    });
    expect(document.activeElement).not.toBe(outsideBtn);

    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: false, onClose: () => {} }));
    });
    expect(document.activeElement).toBe(outsideBtn);
    document.body.removeChild(outsideBtn);
  });

  it("returnFocus=false skips restoring focus on close", () => {
    const outsideBtn = document.createElement("button");
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();

    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: true, onClose: () => {}, returnFocus: false }));
    });
    flushSync(() => {
      root_.render(React.createElement(TestDialog, { open: false, onClose: () => {}, returnFocus: false }));
    });
    expect(document.activeElement).not.toBe(outsideBtn);
    document.body.removeChild(outsideBtn);
  });

  it("changing refocusKey while open re-applies initial focus (GuidedTour step-change contract)", () => {
    const primaryRef = React.createRef();
    function Wrapper({ step }) {
      const containerRef = React.useRef(null);
      useModalFocus(true, containerRef, { initialFocusRef: primaryRef, refocusKey: step });
      return React.createElement(
        "div",
        { ref: containerRef, role: "dialog", "aria-modal": "true" },
        React.createElement("button", { key: "close" }, "Close"),
        React.createElement("button", { key: "primary", ref: primaryRef }, `Step ${step}`)
      );
    }
    flushSync(() => {
      root_.render(React.createElement(Wrapper, { step: 0 }));
    });
    expect(document.activeElement).toBe(primaryRef.current);

    // Move focus elsewhere to prove the next render re-applies it.
    const closeBtn = container.querySelector("button");
    closeBtn.focus();
    expect(document.activeElement).not.toBe(primaryRef.current);

    flushSync(() => {
      root_.render(React.createElement(Wrapper, { step: 1 }));
    });
    expect(document.activeElement).toBe(primaryRef.current);
  });
});

// ── Source-level wiring assertions ──────────────────────────────────────────
// Confirms the 4 real dialogs actually call useModalFocus with the expected
// onClose contract, without mounting the full (heavy) dashboard tree.

describe("useModalFocus — real dialog wiring (source contract)", () => {
  const source = readFileSync(resolve(root, "src/main.jsx"), "utf-8");

  it("GuidedTour wires useModalFocus with onClose and a refocusKey", () => {
    const guidedTourBody = source.slice(source.indexOf("function GuidedTour("), source.indexOf("function EChart("));
    expect(guidedTourBody).toMatch(/useModalFocus\(open, tourContainerRef, \{ initialFocusRef: primaryActionRef, onClose, refocusKey: step \}\)/);
  });

  it("HelpDrawer wires useModalFocus with onClose", () => {
    const helpDrawerBody = source.slice(source.indexOf("function HelpDrawer("), source.indexOf("function DisclaimerNotice("));
    expect(helpDrawerBody).toMatch(/useModalFocus\(open, drawerRef, \{ onClose \}\)/);
  });

  it("AssumptionDrawer wires useModalFocus with onClose", () => {
    const assumptionDrawerStart = source.indexOf("function AssumptionDrawer(");
    const assumptionDrawerBody = source.slice(assumptionDrawerStart, assumptionDrawerStart + 2000);
    expect(assumptionDrawerBody).toMatch(/useModalFocus\(open, drawerRef, \{ onClose \}\)/);
  });

  it("DisclaimerNotice wires useModalFocus WITHOUT onClose (Escape must not dismiss consent)", () => {
    const disclaimerBody = source.slice(source.indexOf("function DisclaimerNotice("), source.indexOf("function AssumptionDrawer("));
    const call = disclaimerBody.match(/useModalFocus\([^;]*\);/)[0];
    expect(call).toBe("useModalFocus(open, noticeRef, { initialFocusRef: primaryActionRef });");
    expect(call).not.toMatch(/onClose/);
  });

  it("DisclaimerNotice's dialog root carries role=dialog and aria-modal=true", () => {
    const disclaimerBody = source.slice(source.indexOf("function DisclaimerNotice("), source.indexOf("function AssumptionDrawer("));
    expect(disclaimerBody).toMatch(/role="dialog" aria-modal="true" aria-label="Important notice"/);
  });
});
