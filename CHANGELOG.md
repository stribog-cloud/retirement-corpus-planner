# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Opt-in tax-aware rebalancing (fin-8fb F5): a new `rebalanceTaxAware`
  setting (default `0`) switches `calculateSwpPlan`'s annual equity/debt
  drift correction from an in-kind, tax-free transfer to a real FIFO lot
  sale on the selling leg. The sale is routed through the same
  `previewLotSale`/`context.streams` machinery the monthly redemption loop
  and the fin-8fb F1 §74 carry-forward true-up both use — `calculateSwpPlan`
  now builds each year's tax context *before* calling the rebalance step
  (previously just after) so a rebalance-realized gain or loss nets against
  the same year's redemption activity and rolls into the carry-forward pool
  like any other sale. Convention: the transfer is sized on GROSS sale value
  (the selling bucket's value always drops by the same amount the tax-free
  path would move); tax comes out of sale proceeds, so the buying bucket
  receives the net-of-tax amount as a new lot at the current NAV, and the
  portfolio's total value after a taxed rebalance is `before - tax`. The
  alternative — grossing up the sale so the buyer receives the full pre-tax
  amount — was rejected because it oversells the leaving bucket beyond the
  target allocation. Two new additive yearly ledger fields,
  `rebalanceGross` and `rebalanceTax`, report the rebalance leg's own sale
  size and tax (both `0` in default mode); the leg's tax/gain components are
  folded into the year's existing tax/gain totals but deliberately excluded
  from `grossRedemption` (a rebalance is an internal transfer, not a cash
  withdrawal). Default mode (`rebalanceTaxAware = 0`) runs the pre-F5
  tax-free branch unchanged, so default-state output stays byte-identical.
  See `docs/developer/model-contract.md` §3.2 for the full contract. New
  export: `rebalanceBucketsToShare`.

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

- Adviser-pack exports now surface the full v2.0 model surface (fin-8fb.9) —
  previously CSV and PDF spoke only to the pre-v2 model, so plans using any
  of the F2-F5 features exported incomplete evidence. `yearly.csv` gains four
  additive columns, `spending_multiplier`, `guardrail_action`,
  `rebalance_gross_inr`, `rebalance_tax_inr`, populated straight from the
  matching yearly-row fields (`rebalance_*` render empty outside
  `calculateSwpPlan`, matching F5's SWP-only scope). `metadata.csv` gains
  `withdrawal_rule` (always) plus only the params relevant to the active
  rule (`guardrail_band_pct`/`guardrail_adjust_pct` or
  `percent_of_corpus_rate_pct`, plus `spending_floor_monthly_inr` for either
  dynamic rule), `rebalance_tax_aware`, `backtest_enabled`,
  `backtest_use_historical_inflation`, and one-line-per-goal
  `goal_N_name`/`goal_N_amount_inr`/`goal_N_year`/`goal_N_inflation_indexed`
  rows behind a `goals_count` header — the goals listing is new surface
  entirely, since exports previously rendered no household/lump-sum fields
  at all. A new conditional 7th CSV sheet, `backtest.csv`, ships the full
  Historical Backtest Lab cohort replay (dataset id/window, cohort count,
  success rate, worst/best cohort, and one row per cohort) whenever
  `backtestEnabled === 1` and the replay is non-empty; the CSV re-runs
  `calculateHistoricalBacktest` against the live export params, mirroring
  how the scenario sheet already re-runs Monte Carlo per scenario. The PDF
  report gains a compact "Dynamic spending" note on §3 Plan Diagnosis when
  guardrails are active (latest year's resolved action + multiplier), a new
  "Historical Backtest Lab" sub-section on §5 Scenarios (success-rate
  sentence, worst/best cohort lines, and a cohort autotable — no chart is
  rendered, the table is the fully accessible rendering), and a new §7
  Methodology assumptions sub-page (dynamic withdrawal rule + tax-aware
  rebalancing flag, plus a one-line-per-goal "Planned goals" table). See
  `docs/developer/export-pipeline.md` for the updated sheet/section
  inventory and `docs/developer/model-contract.md` §3.2/§4.1/§4.2/§5.1 for
  the underlying model contracts.

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

### Fixed

- **§74 carry-forward silently dropped a short-term capital loss whenever a
  long-term loss also went unabsorbed in the same year** (fin-8fb.11
  BLOCKER-A). `netCapitalGainStreams`'s residual-STCL calculation was
  conditioned on the residual-LTCL calculation (`newStcl = longSetoff
  .remaining > 0 ? 0 : shortSetoff.remaining`), zeroing a real, unabsorbed
  short-term loss whenever any long-term loss also remained that year — but
  §70/§71/§74 track STCL and LTCL as independent pools with no such
  dependency. Now computed unconditionally
  (`newStcl = shortSetoff.remaining`), symmetric with the already-correct
  `newLtcl`. Plans with a mixed-type crash year may now show a lower
  projected tax in a later recovery year than before this fix, since the
  previously-dropped STCL is now correctly available to offset a future
  STCG. See `docs/developer/model-contract.md` §3.1.

- **Guardrails withdrawal rule ratcheted a "raise" forever on a fully
  depleted ($0) portfolio** (fin-8fb.11 BLOCKER-B). `resolveDynamicSpending`
  fell back to `currentRate = 0` when `openingCorpus` was `0`, which always
  reads as below the guardrails' lower band ("under-spending"), so a
  depleted portfolio's `spendingMultiplier` was raised every subsequent year
  with no natural ceiling other than the `[0.5, 2.0]` clamp — even though
  actual withdrawals stayed `0` throughout (nothing left to withdraw). The
  guardrails band/inflation-hold evaluation now additionally requires
  `openingCorpus > 0`; once depleted, the multiplier freezes at its last
  value and `guardrailAction` reports `"none"`. See
  `docs/developer/model-contract.md` §4.1.

### Security

- **Editable tax-law JSON (`taxLawJson`) had no cap on array length or
  object key count** (fin-8fb.11 MAJOR, rt-security #2, §4.2). A
  user-pasted tax-law ruleset with an arbitrarily long slab/surcharge array
  inflated iteration cost on `slabTaxBeforeCess`, a hot path called once per
  Monte Carlo sample-year. `sanitizeTaxLaw`'s slab arrays (`newRegimeSlabs`
  and each old-regime band) are now capped at 64 entries, `surchargeBands`
  at 32 entries, `productTaxRules` at 64 processed keys per call, and its
  free-text fields (`version`, `source`, `sourceUrl`, `updatedOn`,
  `debtMfTaxation`, `notes`) at 2000 characters. These caps sit far above
  any real ruleset (`DEFAULT_TAX_LAW`'s largest array is 7 entries) and do
  not change behavior for a legitimate tax-law edit. See
  `docs/developer/model-contract.md` §3.3.

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
