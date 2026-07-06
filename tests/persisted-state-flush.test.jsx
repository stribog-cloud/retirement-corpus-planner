/**
 * persisted-state-flush.test.jsx — fin-8fb.2 P5
 *
 * Verifies the shared `useDebouncedPersist` hook (src/main.jsx) that replaced
 * four copy-pasted 250ms-debounced setTimeout persistence effects in
 * useRetirementDashboard (theme, main state bundle, layout, scenarioHistory).
 *
 * The defect being closed: previously, an edit followed by a tab close within
 * the 250ms debounce window was silently lost — nothing flushed the pending
 * write before the page went away. useDebouncedPersist flushes on
 * `pagehide`, on `visibilitychange` → "hidden", and on unmount.
 *
 * Beads: fin-8fb.2 | Parent: fin-8fb (EPIC) v2.0: build, certify, release
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useDebouncedPersist } from "../src/main.jsx";

/** Create a fresh in-memory localStorage stub (pattern from tests/disclaimer.test.jsx). */
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

function Harness({ value, delay, flushOnHide, onFlushRef }) {
  const flush = useDebouncedPersist(() => {
    localStorage.setItem("test-key", JSON.stringify(value));
  }, [value], { delay, flushOnHide });
  if (onFlushRef) onFlushRef.current = flush;
  return null;
}

describe("useDebouncedPersist", () => {
  let container;
  let root;
  let lsStub;

  beforeEach(() => {
    lsStub = makeLocalStorageStub();
    vi.stubGlobal("localStorage", lsStub);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    document.body.removeChild(container);
    container = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("persists after the debounce delay elapses", () => {
    vi.useFakeTimers();
    flushSync(() => {
      root.render(React.createElement(Harness, { value: "v1", delay: 250 }));
    });
    expect(localStorage.getItem("test-key")).toBeNull();
    vi.advanceTimersByTime(250);
    expect(localStorage.getItem("test-key")).toBe(JSON.stringify("v1"));
  });

  it("debounces rapid successive edits into a single write of the latest value", () => {
    vi.useFakeTimers();
    flushSync(() => root.render(React.createElement(Harness, { value: "v1", delay: 250 })));
    vi.advanceTimersByTime(100);
    flushSync(() => root.render(React.createElement(Harness, { value: "v2", delay: 250 })));
    vi.advanceTimersByTime(100);
    flushSync(() => root.render(React.createElement(Harness, { value: "v3", delay: 250 })));
    // Only 100ms has elapsed since the last edit — nothing written yet.
    expect(localStorage.getItem("test-key")).toBeNull();
    vi.advanceTimersByTime(250);
    expect(localStorage.getItem("test-key")).toBe(JSON.stringify("v3"));
  });

  it("edit → pagehide dispatched before the 250ms delay elapses → localStorage has the latest value", () => {
    flushSync(() => root.render(React.createElement(Harness, { value: "v1", delay: 250 })));
    // Edit again — still well inside the 250ms window in real wall-clock time.
    flushSync(() => root.render(React.createElement(Harness, { value: "v2", delay: 250 })));
    expect(localStorage.getItem("test-key")).toBeNull();

    window.dispatchEvent(new Event("pagehide"));

    expect(localStorage.getItem("test-key")).toBe(JSON.stringify("v2"));
  });

  it("edit → visibilitychange to hidden before the delay elapses → flushes the latest value", () => {
    flushSync(() => root.render(React.createElement(Harness, { value: "v1", delay: 250 })));
    expect(localStorage.getItem("test-key")).toBeNull();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(localStorage.getItem("test-key")).toBe(JSON.stringify("v1"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("visibilitychange while still visible does NOT flush", () => {
    flushSync(() => root.render(React.createElement(Harness, { value: "v1", delay: 250 })));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(localStorage.getItem("test-key")).toBeNull();
  });

  it("unmounting before the delay elapses flushes the pending write", () => {
    flushSync(() => root.render(React.createElement(Harness, { value: "v1", delay: 250 })));
    expect(localStorage.getItem("test-key")).toBeNull();
    flushSync(() => root.unmount());
    expect(localStorage.getItem("test-key")).toBe(JSON.stringify("v1"));
  });

  it("flushOnHide=false suppresses the pagehide/visibilitychange flush", () => {
    flushSync(() => root.render(React.createElement(Harness, { value: "v1", delay: 250, flushOnHide: false })));
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem("test-key")).toBeNull();
  });

  it("exposes a flush() callback that writes immediately and cancels the pending timer", () => {
    vi.useFakeTimers();
    const flushRef = React.createRef();
    flushSync(() => {
      root.render(React.createElement(Harness, { value: "v1", delay: 250, onFlushRef: flushRef }));
    });
    flushRef.current();
    expect(localStorage.getItem("test-key")).toBe(JSON.stringify("v1"));
    // Advancing past the (now-cancelled) timer must not throw or double-write.
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
  });

  it("calling flush() with nothing pending is a safe no-op", () => {
    vi.useFakeTimers();
    const flushRef = React.createRef();
    flushSync(() => {
      root.render(React.createElement(Harness, { value: "v1", delay: 250, onFlushRef: flushRef }));
    });
    vi.advanceTimersByTime(250);
    expect(localStorage.getItem("test-key")).toBe(JSON.stringify("v1"));
    lsStub.clear();
    expect(() => flushRef.current()).not.toThrow();
    // Nothing was pending (already flushed by the timer), so no re-write occurs.
    expect(localStorage.getItem("test-key")).toBeNull();
  });
});
