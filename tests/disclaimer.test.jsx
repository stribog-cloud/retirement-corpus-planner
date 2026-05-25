/**
 * R4.5b — DisclaimerNotice persistence unit tests
 *
 * Tests for the new `loadDisclaimerAcknowledged` / `persistDisclaimerAcknowledged`
 * functions and their legacy-migration path from `fin-cockpit-privacy-consent-v1`
 * to `disclaimer_acknowledged_v1`.
 *
 * Covers Eco's test plan (audit/round-4/in-app-disclaimer-copy.md §4):
 *   Test 1 — First-launch, no prior flags: both functions callable, returns correct booleans.
 *   Test 2 — Round-trip: persist → load returns true.
 *   Test 3 — Legacy migration A: only old key present → migrates and returns true.
 *   Test 4 — Legacy migration B: both keys present → new key wins, old key tolerated.
 *
 * Phase: R4.5b
 * Persona: Hilbert + Raman
 * Parent epic: fin-c96
 *
 * Note on localStorage stubbing: Node.js 26 provides an experimental global `localStorage`
 * without `--localstorage-file` flag; this version is incomplete (no `.clear()`). We stub
 * localStorage with `vi.stubGlobal` to get a reliable in-memory implementation, matching
 * the pattern used in `tests/model.test.jsx`.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  loadDisclaimerAcknowledged,
  persistDisclaimerAcknowledged,
} from "../src/main.jsx";

const NEW_KEY = "disclaimer_acknowledged_v1";
const LEGACY_KEY = "fin-cockpit-privacy-consent-v1";

/** Create a fresh in-memory localStorage stub. */
function makeLocalStorageStub() {
  const store = new Map();
  return {
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null
  };
}

describe("R4.5b — disclaimer localStorage helpers", () => {
  let lsStub;

  beforeEach(() => {
    lsStub = makeLocalStorageStub();
    vi.stubGlobal("localStorage", lsStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    "Test-1a: loadDisclaimerAcknowledged returns false when neither key is set",
    () => {
      expect(loadDisclaimerAcknowledged()).toBe(false);
    }
  );

  it(
    "Test-1b: persistDisclaimerAcknowledged + loadDisclaimerAcknowledged round-trips (new key only)",
    () => {
      const result = persistDisclaimerAcknowledged();
      expect(result.ok).toBe(true);
      expect(result.warning).toBe("");
      expect(loadDisclaimerAcknowledged()).toBe(true);
      expect(localStorage.getItem(NEW_KEY)).toBe("true");
    }
  );

  it(
    "Test-2a: legacy fin-cockpit-privacy-consent-v1 JSON form triggers migration to disclaimer_acknowledged_v1",
    () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ accepted: true }));
      const result = loadDisclaimerAcknowledged();
      expect(result).toBe(true);
      // Migration must write the new key:
      expect(localStorage.getItem(NEW_KEY)).toBe("true");
    }
  );

  it(
    "Test-2b: legacy 'accepted' string form also migrates",
    () => {
      localStorage.setItem(LEGACY_KEY, "accepted");
      expect(loadDisclaimerAcknowledged()).toBe(true);
      expect(localStorage.getItem(NEW_KEY)).toBe("true");
    }
  );

  it(
    "Test-3: both keys present — new key wins; old key is tolerated without error",
    () => {
      localStorage.setItem(NEW_KEY, "true");
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ accepted: true }));
      expect(loadDisclaimerAcknowledged()).toBe(true);
    }
  );

  it(
    "Test-4: new key set to 'true', legacy absent — returns true without touching legacy",
    () => {
      localStorage.setItem(NEW_KEY, "true");
      expect(loadDisclaimerAcknowledged()).toBe(true);
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    }
  );

  it(
    "Test-5: legacy JSON with accepted: false does NOT trigger migration",
    () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ accepted: false }));
      expect(loadDisclaimerAcknowledged()).toBe(false);
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
    }
  );
});
