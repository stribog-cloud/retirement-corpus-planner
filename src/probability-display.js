/**
 * probability-display.js
 *
 * Utility for formatting Monte Carlo probability values per the R4-Q10
 * rounding rule (R4.9.5b item 4). Used exclusively for the Plan Endurance
 * and Target Confidence tiles in the Decision Workspace.
 *
 * Rounding convention for the 5pp-bucket path:
 *   Math.round(p * 20) / 20 × 100 uses standard JS half-up rounding.
 *   Example: 0.475 × 20 = 9.5 → Math.round(9.5) = 10 → 10/20 = 0.5 → "50%".
 *   This means the midpoint between two 5pp buckets rounds UP (0.475 → 50%).
 *   This choice is documented here so reviewers do not need to derive it.
 *
 * Beads: fin-5g3  |  Phase: R4.9.5b-2  |  Persona: Hilbert
 */

/**
 * Format a probability for display per R4-Q10 rounding rule.
 *
 * @param {number} p - probability in [0, 1]
 * @param {number} [margin] - CI95 half-width in [0, 1] (optional). If provided
 *   and > 0.02, returned object includes a `marginText` "±Xpp" string.
 * @returns {{ primary: string, marginText: string | null, rare: boolean, veryLikely: boolean }}
 */
export function formatProbabilityForDisplay(p, margin) {
  const safeP = typeof p === "number" && Number.isFinite(p) ? p : 0;

  let primary;
  let rare = false;
  let veryLikely = false;

  if (safeP < 0.05) {
    primary = "rare (under 5%)";
    rare = true;
  } else if (safeP > 0.95) {
    primary = "very likely (over 95%)";
    veryLikely = true;
  } else {
    // Round to nearest 5pp.
    // Multiply by 20 (= 100/5), round to nearest integer, divide by 20, multiply by 100.
    // e.g. 0.1042 × 20 = 2.084 → 2 → 2/20 × 100 = 10%
    // e.g. 0.4267 × 20 = 8.534 → 9 → 9/20 × 100 = 45%
    // e.g. 0.475  × 20 = 9.5   → 10 (half-up) → 50%
    const rounded = Math.round(safeP * 20) / 20;
    primary = `${Math.round(rounded * 100)}%`;
  }

  let marginText = null;
  const safeMargin = typeof margin === "number" && Number.isFinite(margin) ? margin : 0;
  if (safeMargin > 0.02) {
    // Round margin to nearest 1pp.
    marginText = `±${Math.round(safeMargin * 100)}pp`;
  }

  return { primary, marginText, rare, veryLikely };
}
