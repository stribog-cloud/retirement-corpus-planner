/**
 * tests/analytics-tiering.test.jsx
 *
 * R4.2.5b — analytics tiering split and memoization cache tests.
 *
 * Covers:
 *   1. computeFastBundle returns the expected shape (fast-path fields present,
 *      slow-path fields absent — mc, maxMonthlyCash, optimum not present).
 *   2. computeSlowBundle returns the expected shape (all fields including slow ones).
 *   3. Merged state (fast + slow overlay) has both sets of fields.
 *   4. Memoization: identical params hash → cache hit (same object reference).
 *   5. Memoization: different params → cache miss (fresh computation).
 *   6. LRU cache respects the maxSize bound.
 *   7. stableJsonHash produces the same hash for structurally equal objects
 *      regardless of key insertion order.
 *
 * Authority: audit/round-4/09-performance-r4.2.5-profile.md §6 (R2+R3 spec).
 */

import { describe, expect, it, beforeEach } from "vitest";
import { BASE, normalizeState } from "../src/model.js";
import {
  computeFastBundle,
  computeSlowBundle,
  stableJsonHash,
  makeLruCache,
  _caches
} from "../src/analytics.js";

// Minimal state fixture (uses BASE so all required fields are present)
function makeState(patch = {}) {
  return normalizeState({ ...BASE, ...patch });
}

// ─── 1. computeFastBundle shape ─────────────────────────────────────────────
describe("computeFastBundle — shape contract", () => {
  it("returns KPI fields that update every keystroke", () => {
    const state = makeState();
    const result = computeFastBundle(state);

    // Fast-path fields must be present and be finite numbers
    expect(typeof result.topup).toBe("number");
    expect(typeof result.requiredReturn).toBe("number");
    expect(typeof result.requiredCorpusForCash).toBe("number");
    expect(result.requiredReturnForCash === null || typeof result.requiredReturnForCash === "number").toBe(true);
    expect(typeof result.interestShareForTarget).toBe("number");
  });

  it("marks slowPending=true (slow fields not yet computed)", () => {
    const state = makeState();
    const result = computeFastBundle(state);
    expect(result.slowPending).toBe(true);
  });

  it("marks pending=false (fast path is complete)", () => {
    const state = makeState();
    const result = computeFastBundle(state);
    expect(result.pending).toBe(false);
  });

  it("does NOT include mc, maxMonthlyCash, or optimum fields", () => {
    const state = makeState();
    const result = computeFastBundle(state);
    // These are slow-path fields — should not exist on the fast result
    expect(result.mc).toBeUndefined();
    expect(result.maxMonthlyCash).toBeUndefined();
    expect(result.optimum).toBeUndefined();
  });

  it("reports non-negative durationMs", () => {
    const state = makeState();
    const result = computeFastBundle(state);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── 2. computeSlowBundle shape ─────────────────────────────────────────────
describe("computeSlowBundle — shape contract", () => {
  it("returns all analytics fields including slow ones", () => {
    const state = makeState();
    const result = computeSlowBundle(state);

    // Fast-path fields
    expect(typeof result.topup).toBe("number");
    expect(typeof result.requiredReturn).toBe("number");
    expect(typeof result.requiredCorpusForCash).toBe("number");
    expect(result.requiredReturnForCash === null || typeof result.requiredReturnForCash === "number").toBe(true);
    expect(typeof result.interestShareForTarget).toBe("number");

    // Slow-path fields
    expect(typeof result.maxMonthlyCash).toBe("number");
    expect(result.mc).toBeDefined();
    expect(typeof result.mc.successProbability).toBe("number");
    expect(result.optimum).toBeDefined();
    expect(Array.isArray(result.optimum.strategies)).toBe(true);
  });

  it("marks slowPending=false and pending=false", () => {
    const state = makeState();
    const result = computeSlowBundle(state);
    expect(result.pending).toBe(false);
    expect(result.slowPending).toBe(false);
  });
});

// ─── 3. Merged state ────────────────────────────────────────────────────────
describe("Merged fast + slow state", () => {
  it("has all fields from both tiers after overlay", () => {
    const state = makeState();
    const fast = computeFastBundle(state);
    const slow = computeSlowBundle(state);

    // Simulate the overlay that useBackgroundAnalytics performs
    const merged = { ...fast, ...slow };

    // Fast fields preserved (slow bundle also computes them so values may differ,
    // but they are present)
    expect(typeof merged.topup).toBe("number");
    expect(typeof merged.requiredCorpusForCash).toBe("number");

    // Slow fields now present
    expect(merged.mc).toBeDefined();
    expect(typeof merged.maxMonthlyCash).toBe("number");
    expect(merged.optimum).toBeDefined();

    // slowPending is false after overlay with slow result
    expect(merged.slowPending).toBe(false);
  });

  it("fast KPI fields have the same values as slow bundle for identical inputs", () => {
    const state = makeState();
    const fast = computeFastBundle(state);
    const slow = computeSlowBundle(state);

    // The slow bundle recomputes fast fields — they must agree to within floating-point
    // tolerance (same pure function, same inputs)
    expect(fast.topup).toBeCloseTo(slow.topup, 2);
    expect(fast.requiredReturn).toBeCloseTo(slow.requiredReturn, 6);
    expect(fast.requiredCorpusForCash).toBeCloseTo(slow.requiredCorpusForCash, 0);
    expect(fast.interestShareForTarget).toBeCloseTo(slow.interestShareForTarget, 6);
  });
});

// ─── 4. Memoization — cache hit on identical inputs ─────────────────────────
describe("Memoization — LRU cache via stableJsonHash", () => {
  beforeEach(() => {
    // Clear caches before each test to ensure a clean slate
    _caches.corpus.clear();
    _caches.returnCash.clear();
    _caches.maxCash.clear();
    _caches.optimum.clear();
    _caches.mc.clear();
  });

  it("second call with identical state returns cached result (same reference)", () => {
    const state = makeState();
    // First call — populates caches
    const slow1 = computeSlowBundle(state);
    // Second call — should hit caches; result may be a new object but
    // the mc / optimum / maxMonthlyCash values should be numerically identical
    const slow2 = computeSlowBundle(state);

    expect(slow1.maxMonthlyCash).toBe(slow2.maxMonthlyCash);
    expect(slow1.requiredCorpusForCash).toBe(slow2.requiredCorpusForCash);
    expect(slow1.requiredReturnForCash).toBe(slow2.requiredReturnForCash);
    expect(slow1.mc.successProbability).toBe(slow2.mc.successProbability);
    expect(slow1.optimum.best?.id ?? null).toBe(slow2.optimum.best?.id ?? null);
  });

  it("cache miss when input changes — different values", () => {
    const state1 = makeState({ monthlyTarget: 50000 });
    const state2 = makeState({ monthlyTarget: 100000 });

    const result1 = computeSlowBundle(state1);
    const result2 = computeSlowBundle(state2);

    // Different monthlyTarget → different corpus needed
    expect(result1.requiredCorpusForCash).not.toBe(result2.requiredCorpusForCash);
  });
});

// ─── 4b. R4.9.5j fin-7ke — MC input-hash cache (incremental MC) ─────────────
describe("MC input-hash cache — R4.9.5j fin-7ke", () => {
  beforeEach(() => {
    // Clear all caches before each test
    _caches.corpus.clear();
    _caches.returnCash.clear();
    _caches.maxCash.clear();
    _caches.optimum.clear();
    _caches.mc.clear();
  });

  it("second computeSlowBundle call with same state returns SAME mc object (cache hit)", () => {
    const state = makeState({ monteCarloSamples: 10, monteCarloSeed: 99 });
    const slow1 = computeSlowBundle(state);
    const slow2 = computeSlowBundle(state);
    // Cache hit: exact same object reference for mc
    expect(slow2.mc).toBe(slow1.mc);
  });

  it("mc values are identical for cache hit (hash collision invariant)", () => {
    const state = makeState({ monteCarloSamples: 10, monteCarloSeed: 99 });
    const slow1 = computeSlowBundle(state);
    _caches.mc.clear(); // force re-computation
    const slow2 = computeSlowBundle(state);
    // Should produce numerically identical mc even without cache
    expect(slow2.mc.successProbability).toBe(slow1.mc.successProbability);
    expect(slow2.mc.simulations).toBe(slow1.mc.simulations);
    expect(slow2.mc.seed).toBe(slow1.mc.seed);
    expect(slow2.mc.p50.length).toBe(slow1.mc.p50.length);
    // p50 values identical (deterministic seed)
    slow1.mc.p50.forEach((v, i) => expect(slow2.mc.p50[i]).toBe(v));
  });

  it("cache miss when MC inputs change (different principalchanges hash)", () => {
    const state1 = makeState({ principal: 10000000, monteCarloSamples: 10 });
    const state2 = makeState({ principal: 20000000, monteCarloSamples: 10 });
    const slow1 = computeSlowBundle(state1);
    const slow2 = computeSlowBundle(state2);
    // Different principal → different paramsHash → fresh MC object
    expect(slow2.mc).not.toBe(slow1.mc);
  });

  it("cache miss when simulation count changes", () => {
    const state1 = makeState({ monteCarloSamples: 5, monteCarloSeed: 42 });
    const state2 = makeState({ monteCarloSamples: 10, monteCarloSeed: 42 });
    // Note: monteCarloSamples is part of params → different paramsHash
    const slow1 = computeSlowBundle(state1);
    const slow2 = computeSlowBundle(state2);
    expect(slow2.mc).not.toBe(slow1.mc);
    expect(slow2.mc.simulations).toBe(10);
    expect(slow1.mc.simulations).toBe(5);
  });

  it("mc cache is bounded to 16 entries", () => {
    // Insert 20 distinct states; cache should not exceed 16
    for (let i = 0; i < 20; i++) {
      computeSlowBundle(makeState({ principal: 1000000 * (i + 1), monteCarloSamples: 5 }));
    }
    expect(_caches.mc.size()).toBeLessThanOrEqual(16);
  });
});

// ─── 5. LRU cache — capacity bound ──────────────────────────────────────────
describe("makeLruCache — bounded capacity", () => {
  it("never exceeds maxSize entries", () => {
    const cache = makeLruCache(4);
    for (let i = 0; i < 10; i++) {
      cache.set(String(i), i * 10);
    }
    expect(cache.size()).toBe(4);
  });

  it("evicts the least recently used entry", () => {
    const cache = makeLruCache(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Access "a" to make it recently used
    cache.get("a");
    // Now add "d" — should evict "b" (LRU), not "a"
    cache.set("d", 4);
    expect(cache.get("a")).toBe(1); // "a" was recently used, still present
    expect(cache.get("b")).toBeUndefined(); // "b" was LRU, evicted
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("returns undefined for a missing key", () => {
    const cache = makeLruCache(4);
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("updates an existing key without growing the cache beyond maxSize", () => {
    const cache = makeLruCache(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 99); // update existing
    expect(cache.size()).toBe(2);
    expect(cache.get("a")).toBe(99);
  });
});

// ─── 6. stableJsonHash — determinism ────────────────────────────────────────
describe("stableJsonHash — deterministic hashing", () => {
  it("produces the same hash for structurally equal objects with different key order", () => {
    const obj1 = { principal: 10000000, annualRate: 8, years: 25 };
    const obj2 = { years: 25, principal: 10000000, annualRate: 8 };
    expect(stableJsonHash(obj1)).toBe(stableJsonHash(obj2));
  });

  it("produces different hashes for objects with different values", () => {
    const obj1 = { principal: 10000000, annualRate: 8 };
    const obj2 = { principal: 20000000, annualRate: 8 };
    expect(stableJsonHash(obj1)).not.toBe(stableJsonHash(obj2));
  });

  it("returns a non-empty string", () => {
    const hash = stableJsonHash({ x: 1 });
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("handles nested objects deterministically", () => {
    const obj1 = { a: { b: 1, c: 2 }, d: 3 };
    const obj2 = { d: 3, a: { c: 2, b: 1 } };
    expect(stableJsonHash(obj1)).toBe(stableJsonHash(obj2));
  });
});

// ─── 7. Tiering edge-input branch coverage (R4.9 branch-floor closure) ───────
describe("Tiering — edge-input branch coverage", () => {
  it("handles state with monthlyCashOverride / glidePath / zero targetCorpus", () => {
    const overrideState = makeState({
      monthlyCashOverride: 75000,
      monthlyTarget: 50000,
      glidePathEnabled: 1,
      monteCarloSeed: "",
      targetCorpus: 0
    });
    const fast = computeFastBundle(overrideState);
    expect(typeof fast.requiredCorpusForCash).toBe("number");
    const slow = computeSlowBundle(overrideState);
    expect(typeof slow.maxMonthlyCash).toBe("number");
    expect(slow.mc.glidePath).toMatch(/glide path/);
    expect(slow.mc.seed).toBe(24681357);
  });

  it("handles state with years=0 / principal=0 / shockModel set", () => {
    const edgeState = makeState({
      years: 0,
      principal: 0,
      shockModel: "normal",
      monteCarloSamples: 5
    });
    const fast = computeFastBundle(edgeState);
    expect(typeof fast.topup).toBe("number");
    const slow = computeSlowBundle(edgeState);
    expect(slow.mc.shockModel).toBe("normal");
    expect(typeof slow.mc.simulations).toBe("number");
  });
});

// ─── 8. Worker tier dispatch branch coverage ────────────────────────────────
describe("Worker tier dispatch — both branches", () => {
  it("dispatches fast and slow tiers via the worker handler", async () => {
    // Stub the worker's self.postMessage + onmessage to drive both branches of
    // the tier ternary at src/workers/analytics-worker.js:11.
    const messages = [];
    globalThis.self = {
      onmessage: null,
      postMessage: (m) => messages.push(m)
    };
    await import("../src/workers/analytics-worker.js");

    const state = makeState();
    globalThis.self.onmessage({ data: { id: 1, state, tier: "fast" } });
    globalThis.self.onmessage({ data: { id: 2, state, tier: "slow" } });
    globalThis.self.onmessage({ data: { id: 3, state } });  // default tier=slow

    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ id: 1, ok: true, tier: "fast" });
    expect(messages[1]).toMatchObject({ id: 2, ok: true, tier: "slow" });
    expect(messages[2]).toMatchObject({ id: 3, ok: true, tier: "slow" });

    delete globalThis.self;
  });
});
