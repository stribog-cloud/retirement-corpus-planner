import { computeFastBundle, computeSlowBundle } from "../analytics.js";

self.onmessage = (event) => {
  let id;
  try {
    const data = event.data || {};
    id = data.id;
    const state = data.state;
    // tier: "fast" | "slow" (default "slow" for backward compatibility)
    const tier = data.tier || "slow";
    const result = tier === "fast" ? computeFastBundle(state) : computeSlowBundle(state);
    self.postMessage({ id, ok: true, result, tier });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
