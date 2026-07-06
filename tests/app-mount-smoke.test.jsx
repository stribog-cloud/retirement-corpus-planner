/**
 * App mount smoke — regression guard for render-time ReferenceErrors.
 *
 * src/main.jsx auto-mounts <App /> into #root as an import side effect
 * (main.jsx:7650-7652), but every other test imports named exports without
 * a #root element present, so the full component tree is never actually
 * rendered under the unit suite. A scope bug (an identifier declared in one
 * component but referenced in another) therefore compiles, type-checks, and
 * passes every jsdom component test while crashing the real app on mount —
 * exactly the class of defect that shipped mobileInsightsRef in the wrong
 * function scope (fin-8fb.8 follow-up).
 *
 * This test drives that auto-mount path with a #root present and the handful
 * of browser globals the shell touches stubbed, then asserts the first-launch
 * disclaimer dialog renders. If any component references an out-of-scope
 * identifier, React throws synchronously during the initial render and this
 * fails loudly.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";

describe("App mounts without a render-time crash", () => {
  beforeAll(() => {
    // Minimal browser globals the full shell reaches for. jsdom omits these;
    // resolveThemePreference already tolerates a missing matchMedia, but the
    // chart/worker layers reference these during the initial render.
    if (!window.matchMedia) {
      window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return false; }
      });
    }
    if (!global.ResizeObserver) {
      global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      window.ResizeObserver = global.ResizeObserver;
    }
    if (!global.Worker) {
      // Force the documented main-thread analytics fallback path instead of
      // a real Worker (jsdom has none); the shell degrades gracefully to it.
      global.Worker = undefined;
    }
    const proto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (proto && !proto.getContext) {
      proto.getContext = () => null;
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders the first-launch disclaimer dialog into #root", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.replaceChildren(root);
    // Importing the module triggers the createRoot(...).render(<App />) side
    // effect against the #root we just created. A scope/reference error in any
    // rendered component surfaces here as a thrown import.
    await import("../src/main.jsx");
    // React 19 renders synchronously enough that the disclaimer — shown on
    // first launch with no prior consent — is present on the next microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const disclaimer = document.querySelector(".disclaimer-notice-card");
    expect(disclaimer, "first-launch disclaimer dialog should mount").toBeTruthy();
    expect(document.querySelector("#root").children.length).toBeGreaterThan(0);
  });
});
