# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Historical Backtest Lab (fin-8fb F4): a new deterministic engine,
  `calculateHistoricalBacktest(params, dataset = INDIA_ANNUAL_RETURNS)`,
  replays every historical cohort window of length `params.years` found in
  the bundled 35-entry India fiscal-year return dataset through the live
  cash engine — the same `sequenceReturnOverrides` plumbing Monte Carlo uses
  for its sequence-of-returns sampling, except the per-year return comes
  from a fixed historical year instead of a random shock. No RNG; a given
  `(params, dataset)` pair always produces byte-identical output. A new
  `backtestUseHistoricalInflation` toggle (default 0, keeps the user's
  single assumed inflation rate) replaces the assumed rate with each
  cohort's own per-year historical inflation when enabled, compounding
  cumulatively year-by-year (not a full-window average) via a new helper,
  `cumulativeInflationFactor` — this required routing `calculateInterestPlan`,
  `calculateSwpPlan`, and `calculateIdcwPlan`'s δ=1 withdrawal-inflation and
  real-corpus-deflator math through the new helper; when no override is set
  (every existing caller) it degrades to the exact pre-existing `Math.pow`
  expression byte-for-byte, verified against the full pre-change test suite.
  Success is defined identically to `calculateMonteCarlo`'s
  `successProbability` (final closing corpus >= targetCorpus); per-cohort
  `depleted`/`depletionYear` are reported separately as richer diagnostics.
  A new `backtestEnabled` state field (default 1) gates a memoized `backtest`
  field on `computeSlowBundle`/`computeAnalyticsBundle` (LRU-cached like
  Monte Carlo, `null` when disabled). See `docs/developer/model-contract.md`
  §5.1 for the full contract, including the dataset-injection choice and a
  known `buildMonthlyLedger` limitation. UI integration (card, toggle,
  P10/P50/P90 chart) is phase 2 and not part of this change.

- Multi-goal planned lump sums (fin-8fb F3): a new `plannedLumpSums` array
  (up to 10 goals, each `{ id?, name, amount, year, inflate }`) replaces the
  single-goal `plannedLumpSumAmount`/`plannedLumpSumYear`/`plannedLumpSumInflate`
  triple. A dedicated sanitizer, `sanitizePlannedLumpSums`, drops invalid
  entries (garbage input, non-finite/negative amount, non-finite year) and
  clamps an out-of-range year into `[1, 80]`; a shared migration helper,
  `resolvePlannedLumpSums`, prefers a valid array and otherwise synthesizes a
  single-entry array from the legacy triple, so existing saved states keep
  working unchanged. Goals only fire under `useHouseholdPlan` — the same
  scoping the legacy single-goal field always had — and each goal escalates
  independently by its own `inflate` flag; lump sums are still added on top
  of the recurring cash target, never scaled by the dynamic-withdrawal
  multiplier (fin-8fb F2) or by `percentOfCorpus`. Default state (no goals)
  is byte-identical to pre-F3 output. See `docs/developer/model-contract.md`
  §4.2 for the full contract, including the idempotency note on why a
  legacy amount-set/year-unset goal synthesizes no entry rather than a
  `year: 0` placeholder.

- Dynamic withdrawal rules (fin-8fb F2): a new `withdrawalRule` setting
  (`fixed` / `guardrails` / `percentOfCorpus`, default `fixed`) resolves the
  recurring annual cash target at each projection year boundary instead of a
  flat inflation-escalated figure. `guardrails` implements a simplified
  Guyton-Klinger policy — a spending multiplier that cuts when the
  withdrawal rate rises too far above its initial value, raises when it
  falls too far below, and withholds one year's inflation escalation
  (permanently, not a deferred catch-up) after a portfolio loss while
  spending is still elevated; the multiplier is clamped to [0.5, 2.0].
  `percentOfCorpus` instead targets a fixed percentage of that year's
  opening corpus every year, deliberately bypassing the inflation-escalation
  setting. Both rules respect an optional monthly spending floor
  (`spendingFloorMonthly`, in today's rupees) that always escalates with
  true inflation regardless of the rule or any holdback. Planned lump sums
  are never scaled by the rule — only the recurring cash need is. Covers all
  three cash engines (SWP, Interest, IDCW); default state (`withdrawalRule:
  "fixed"`) is byte-identical to pre-F2 output by construction (the new
  helper, `resolveDynamicSpending`, short-circuits before any rule-specific
  math in fixed mode). Yearly ledger rows gain two additive fields,
  `spendingMultiplier` and `guardrailAction`. See
  `docs/developer/model-contract.md` §4.1 for the full mechanics, including
  the documented `buildMonthlyLedger` display simplification for Interest/
  IDCW under a dynamic rule, and the coverage-semantics note (`cashCoverage`
  is measured against the resolved, not original, target).

### Changed

- §74 capital-loss carry-forward is now live across projection years in
  `calculateSwpPlan` and `calculateInterestPlan` (fin-8fb F1). Previously the
  8-year FIFO pool existed and was fully correct as a single-call primitive
  (`investmentTaxProfile`/`calculateTaxProfile`) but projections never
  threaded it from one year to the next, so a realized loss was silently
  forgotten at the next year boundary. A local pool now carries forward
  automatically for every SWP/Interest run (including every Monte Carlo
  path) — there is no UI toggle, since this is a correctness fix, not an
  optional feature. **Numbers may improve (lower projected tax, higher
  closing corpus) for any plan that realizes a capital loss during the
  projection** — see `docs/developer/model-contract.md` §3 for the exact
  mechanics and scope (SWP: full lot-level coverage; Interest: pool wiring
  present but the engine's flat-ratio principal-drawdown sale cannot itself
  realize a loss today; IDCW: out of scope, no capital gains are realized by
  that engine).

## [1.0.0] - 2026-05-25

### Added

- Indian retirement corpus and income planning for AY 2026-27 / FA-2025
  tax rules, covering both the new default tax regime and the old regime.
- Tax-aware Systematic Withdrawal Plan (SWP) simulation with per-lot FIFO
  capital-gains accounting, grandfathered FMV (equity pre-2018), and
  §74 carry-forward loss pool.
- Joint-life household model: spouse monthly need, joint longevity horizon,
  contingency years, legacy corpus goal, and healthcare reserve.
- Sequence-of-returns Monte Carlo simulation (seeded, N up to 1000)
  reporting success probability with 95% confidence interval.
- Forced-colors / high-contrast accessibility support
  (`@media (forced-colors: active)` — UI-UX.R15).
- 200% and 400% browser-zoom acceptance tested via CI gate
  (UI-UX.R13, `tests/e2e/browser-zoom.mjs`).
- Per-component × per-state × per-theme visual-regression snapshot CI gate
  (`tests/e2e/visual-regression-matrix.mjs`).
- Tax Law Studio: user-editable per-AY JSON tax rules with diff preview
  before any ruleset is applied, and a CA-review script for rule derivation
  outside the browser.
- Offline-first single-file HTML distribution — open `index.html` directly
  in any modern browser; no install, no server, no build step required for
  end users.
- 100% client-side; zero outbound network requests at runtime (no telemetry,
  no analytics beacon, no backend sync).
- MIT licensed; see `LICENSE` for full copyright and permission notice.

[Unreleased]: https://github.com/stribog-cloud/retirement-corpus-planner/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/stribog-cloud/retirement-corpus-planner/releases/tag/v1.0.0
