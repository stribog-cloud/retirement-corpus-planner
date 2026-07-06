/**
 * fin-8fb.14 (W-0002) — theme preference resolution unit tests.
 *
 * `resolveThemePreference` / `systemPrefersLightTheme` (src/main.jsx) decide
 * the initial theme when no explicit choice has been made yet: an explicit
 * stored "light"/"dark" value always wins; anything else (no stored key, an
 * invalid stored value, or a JSON parse error) falls through to the OS/
 * browser `prefers-color-scheme` preference via `window.matchMedia`.
 *
 * This mirrors app.html's inline bootstrap script exactly, so these pure
 * functions are the unit-testable half of that contract (the bootstrap
 * script itself is plain inline HTML `<script>` and is exercised by the
 * e2e/visual suite instead — see tests/e2e/_browser-helper.mjs).
 */

import { describe, expect, it, afterEach, vi } from "vitest";
import { resolveThemePreference, systemPrefersLightTheme } from "../src/main.jsx";

/** Stubs window.matchMedia so "(prefers-color-scheme: light)" resolves to `matches`. */
function stubMatchMedia(matches) {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query === "(prefers-color-scheme: light)" ? matches : false,
    media: query,
    addListener: () => {},
    removeListener: () => {}
  }));
}

describe("fin-8fb.14 — resolveThemePreference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no stored key + light system preference → light", () => {
    stubMatchMedia(true);
    expect(resolveThemePreference(null)).toBe("light");
    expect(resolveThemePreference("")).toBe("light");
  });

  it("no stored key + dark system preference → dark", () => {
    stubMatchMedia(false);
    expect(resolveThemePreference(null)).toBe("dark");
  });

  it("stored \"light\" + dark system preference → explicit choice wins (light)", () => {
    stubMatchMedia(false);
    expect(resolveThemePreference(JSON.stringify("light"))).toBe("light");
  });

  it("stored \"dark\" + light system preference → explicit choice wins (dark)", () => {
    stubMatchMedia(true);
    expect(resolveThemePreference(JSON.stringify("dark"))).toBe("dark");
  });

  it("invalid stored value (parses but is neither light nor dark) → falls through to system", () => {
    stubMatchMedia(true);
    expect(resolveThemePreference(JSON.stringify("purple"))).toBe("light");
    stubMatchMedia(false);
    expect(resolveThemePreference(JSON.stringify("purple"))).toBe("dark");
  });

  it("unparseable stored value (JSON.parse throws) → falls through to system", () => {
    stubMatchMedia(true);
    expect(resolveThemePreference("{not json")).toBe("light");
  });

  it("a raw (non-JSON-quoted) stored value is still accepted when it is exactly light/dark", () => {
    stubMatchMedia(true);
    // Some legacy/edge writers may store the bare string rather than a
    // JSON-stringified one; the inner try/catch's fallback assigns the raw
    // string as-is, so this should still resolve as an explicit choice.
    expect(resolveThemePreference("dark")).toBe("dark");
  });
});

describe("fin-8fb.14 — systemPrefersLightTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when matchMedia reports a light preference", () => {
    stubMatchMedia(true);
    expect(systemPrefersLightTheme()).toBe(true);
  });

  it("returns false when matchMedia reports a dark preference", () => {
    stubMatchMedia(false);
    expect(systemPrefersLightTheme()).toBe(false);
  });

  it("returns false (safe default) when window.matchMedia throws", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia unavailable");
    });
    expect(systemPrefersLightTheme()).toBe(false);
  });

  it("returns false (safe default) when window.matchMedia is undefined", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(systemPrefersLightTheme()).toBe(false);
  });
});
