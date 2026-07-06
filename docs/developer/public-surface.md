---
title: "Retirement Planner Public Surface Map"
created: 2026-05-12
updated: 2026-07-06
type: project/developer-doc
status: governing-reference
version: "2.6.1"
revision: 15
last_updated: 2026-07-06
tags: [developer-docs, public-surface]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Public Surface Map

> Enumerated surfaces that users, contributors, exports, tests, and generated artifacts rely on.

This is a private local product today, but its public surface is still explicit because the dashboard may be shared as a single file and reviewed by advisers or CAs.

## 0. TL;DR

Stable user surfaces are the built HTML, visible app pages, Help, Trust Center, Assumption Studio, PDF, CSV, JSON exports, and local-storage controls. Developer-callable source exports are internal-stable for tests and UI, not a published SDK.

## 1. Generated HTML artifacts

| Artifact | Posture | Notes |
|----------|---------|-------|
| `index.html` | stable local artifact | Primary file to open or ship |
| `Retirement Corpus & Income Planner.html` | stable product-title artifact | Same built app copy, named for sharing |
| `dist/app.html` | generated build output | Source for copied artifacts |
| `dist/index.html` | generated build output | Distribution alias |

Do not hand-edit these files.

The generated artifact is a local/self-contained distribution surface, not a hosted security profile. Its CSP allows inline script/style because Vite single-file output inlines the bundle. A hosted or public web deployment must use an HTTP CSP with nonce/hash-based script/style controls, `frame-ancestors 'none'`, bounded `connect-src`, and no query-string debug bridge.

## 2. User App Surfaces

| Surface | Posture | Contract |
|---------|---------|----------|
| Overview | stable | Decision cockpit, Trust Center, monthly solver, scenario timeline |
| Guided Planner | stable | Retiree Guided Mode, strategy shortlist, household action plan |
| Tax Studio | stable | Tax profile, product classification, tax-law ruleset, SWP/IDCW facts |
| Simulations | stable | Scenario Library, risk lab, Monte Carlo paths, heatmap, Historical Backtest Lab (deterministic historical cohort replay) |
| Ledger | stable | Annual schedule, monthly FIFO trail, exports, review pack |
| Assumption Studio | stable | Full editable assumption surface and search |
| Help | stable | Guided tutorial, context coach, topic library, local data controls |
| Guided Tour | stable | First-run and replayable product walkthrough |

## 3. Download Surfaces

| Download | Posture | Stability Notes |
|----------|---------|-----------------|
| `retirement_corpus_income_planner.pdf` | stable | Branded planning report; not PDF/UA certified. v2.0.0 added an additive §3 Plan Diagnosis dynamic-spending note (active only under the guardrails withdrawal rule), a §5 Scenarios "Historical Backtest Lab" sub-section (success-rate sentence, worst/best cohort lines, cohort autotable), and a §7 Methodology assumptions sub-page (withdrawal rule/rebalancing flag, one-row-per-goal planned-goals table) — no existing section removed or renumbered |
| CSV export (multi-sheet ZIP: `overview.csv`, `monthly.csv`, `yearly.csv`, `tax.csv`, `scenarios.csv`, `metadata.csv`, plus a conditional 7th `backtest.csv`) | stable | Ledger and metadata audit trail. v2.0.0 added four additive `yearly.csv` columns (`spending_multiplier`, `guardrail_action`, `rebalance_gross_inr`, `rebalance_tax_inr`), additive `metadata.csv` withdrawal-rule/rebalance/backtest/per-goal columns, and the new conditional `backtest.csv` sheet (ships only when `backtestEnabled === 1` and the cohort replay is non-empty) carrying the full Historical Backtest Lab cohort replay. See [Export Pipeline](export-pipeline.md) §7 for the full column/section inventory |
| Scenario snapshot JSON | stable | Portable saved plan snapshot |
| Tax ruleset JSON | stable | Editable tax-law ruleset |
| Adviser / CA Pack JSON | stable | Professional review bundle |

## 4. Browser Storage Surface

Storage keys are declared in `src/persistence.js` and surfaced through Trust Center, Help, and clear-data controls. Keys are internal implementation details, but the existence of remembered assumptions, layout, theme, tour state, scenario history, tax-law edits, and consent is user-visible.

## 5. Developer Source Exports

| Source | Posture | Consumer |
|--------|---------|----------|
| `src/model.js` exports | internal-stable | UI and tests |
| `src/planning.js` exports | internal-stable | UI and tests |
| `src/persistence.js` exports | internal-stable | UI and tests |
| `src/scenario-library.js` exports | internal-stable | UI and tests |
| `src/main.jsx` exports | internal-stable | Tests and debug bridge |

These are not a public SDK. Breaking changes require tests, docs, and Beads trace; public/shared distribution would require a formal API reference and compatibility policy.

The browser test bridge `window.__FIN_DASHBOARD_TEST_API__` is not a user or public API. It may be exposed only in development or on a local test host when the Puppeteer harness loads `?finTestApi=1`. It must not be available from a shared file or hosted production URL by query string alone.

## 6. Command Surface

The Makefile exposes the contributor command surface. See [Testing and Quality Gates](testing-and-quality-gates.md) for command meaning and closure expectations.

## 7. Deprecation Rule

Use [Deprecation Register](deprecation.md) for any future removal or incompatible change to a stable surface. Deprecations need owner, replacement, first affected version, removal horizon, approval evidence, and migration guidance.

## 8. Public Release Rule

The repository has been genuinely public on GitHub since 2026-05-25 (`v1.0.0` tag, commit `0fefabd`, signed) under ADR-0002 Option 1: `docs/internal/` is gitignored and excluded from the public tree, while the approved included set — `docs/user/`, `docs/developer/` (including this map), `src/`, `tests/`, `scripts/`, and the public trust/contributor files — carries no dependency on excluded `docs/internal/` content. This is the live, ongoing posture, not a hypothetical future gate; it governs the in-progress `v2.0.0` cycle the same way it governed `v1.0.0`.

Public release is no longer a one-time pre-launch decision to clear. Each subsequent release owes its own readiness check: `docs/internal/PUBLIC-RELEASE-READINESS.md` tracks that release's open blockers in its Decision Log, and the public GitHub Actions workflows (`ci.yml`, `release.yml`) must stay green on every push, PR, and tagged release — mirroring what `make all` checks locally. See `docs/internal/CHARTER-COMPLIANCE-ANNEX.md` §2.3.1 for the full owner-approval record, the approved included/excluded set, and the cross-reference attestation.

**No public export removed or renamed in v2.0.0.** Every v2.0.0 addition to `src/model.js` — `calculateHistoricalBacktest`, `historicalReturnOverrideForYear`, `cumulativeInflationFactor`, `historicalInflationRateForYear`, `resolveDynamicSpending`, `sanitizePlannedLumpSums`, `resolvePlannedLumpSums`, `assessmentYearForProjectionYear`, `applyYearEndCarryForward`, and `rebalanceBucketsToShare` — is a net-new export or an additive/signature-compatible change to an existing one (`rebalanceBucketsToShare` gained two optional trailing arguments with backward-compatible defaults; see the Revision History rows below for each feature). The CSV and PDF additions in §3 above are additive sections/columns only. No existing export, state field, CSV column, PDF section, or UI page was removed or renamed, so no migration document under §2.5 Developer-Facing Documentation is required for this release.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.6.1 | 15 | 2026-07-06 | fin-8fb docs refresh: §2 Simulations now names the Historical Backtest Lab card; §3 Download Surfaces renamed the CSV row to reflect the actual multi-sheet ZIP (`overview.csv`/`monthly.csv`/`yearly.csv`/`tax.csv`/`scenarios.csv`/`metadata.csv` plus conditional `backtest.csv`) and named the v2.0.0 PDF §3/§5/§7 additions; §8 Public Release Rule reworded from a future/hypothetical pre-launch gate to the actual ongoing public-GitHub posture (mirrors the `docs/internal/PUBLIC-RELEASE-READINESS.md` 2026-07-06 reconciliation) and now states explicitly that no public export was removed or renamed in v2.0.0, so no migration document is required. |
| 2.6.0 | 14 | 2026-07-06 | fin-8fb F5: `src/model.js` gained one new internal-stable export, `rebalanceBucketsToShare`, supporting the opt-in tax-aware rebalancing change (see model-contract.md §3.2). Normalized state gained an additive `rebalanceTaxAware` field (default 0). Yearly ledger rows from `calculateSwpPlan` gained two additive fields, `rebalanceGross` and `rebalanceTax` — additive only, both 0 in default mode, no existing field removed or renamed. No change to the exports-as-one-bucket posture. |
| 2.5.0 | 13 | 2026-07-06 | fin-8fb F4: `src/model.js` gained four new internal-stable exports — `calculateHistoricalBacktest`, `historicalReturnOverrideForYear`, `cumulativeInflationFactor`, `historicalInflationRateForYear` — supporting the Historical Backtest Lab engine (see model-contract.md §5.1); `src/analytics.js` gained one new internal-stable export, `pendingHistoricalBacktest`. Normalized state gained two additive fields, `backtestEnabled` (default 1) and `backtestUseHistoricalInflation` (default 0). `computeSlowBundle`/`computeAnalyticsBundle` gained an additive `backtest` field (`null` when disabled). No existing field removed or renamed; no change to the exports-as-one-bucket posture. The UI card, toggle, and `MODEL_DEBUG_API` exposure are phase 2 and not yet part of the public surface. |
| 2.4.0 | 12 | 2026-07-06 | fin-8fb F3: `src/model.js` gained two new internal-stable exports, `sanitizePlannedLumpSums` and `resolvePlannedLumpSums`, supporting the multi-goal planned lump sums change (see model-contract.md §4.2). Normalized state gained an additive `plannedLumpSums` array field (legacy `plannedLumpSumAmount`/`plannedLumpSumYear`/`plannedLumpSumInflate` fields remain, unchanged, for back-compat loading); `householdPlanProfile` gained an additive `plannedLumpSums` field, scoped to `useHouseholdPlan` same as the legacy triple. No existing field removed or renamed; no change to the exports-as-one-bucket posture. |
| 2.3.0 | 11 | 2026-07-06 | fin-8fb F2: `src/model.js` gained one new internal-stable export, `resolveDynamicSpending`, supporting the dynamic withdrawal rules change (see model-contract.md §4.1). Yearly ledger rows from `calculateSwpPlan`/`calculateInterestPlan`/`calculateIdcwPlan` gained two additive fields, `spendingMultiplier` and `guardrailAction` — additive only, no existing field removed or renamed. No change to the exports-as-one-bucket posture. |
| 2.2.0 | 10 | 2026-07-06 | fin-8fb F1: `src/model.js` gained two new internal-stable exports, `assessmentYearForProjectionYear` and `applyYearEndCarryForward`, supporting the §74 carry-forward-live-in-projections change (see model-contract.md §3.1). No change to the exports-as-one-bucket posture. |
| 2.1.0 | 9 | 2026-05-17 | Clarified local-artifact CSP posture and the local-only test API bridge boundary. |
| 2.0.0 | 8 | 2026-05-15 | Rebuilt public surface map with generated HTML, app surfaces, downloads, storage, source exports, command surface, and release/deprecation rules. |
| 1.5.0 | 7 | 2026-05-14 | Added Trust Center, Scenario Library, and Adviser / CA review pack surfaces. |
| 1.4.0 | 6 | 2026-05-14 | Added export trust framing and scenario snapshot JSON to the public surface map. |
| 1.3.0 | 5 | 2026-05-13 | Added privacy clear-data surface and public-readiness / local-only CI release rule. |
| 1.2.0 | 4 | 2026-05-13 | Added public-release rule for `docs/internal/` linked to ADR-0002. |
| 1.1.1 | 3 | 2026-05-13 | Documented PDF export visual evidence and provenance contract. |
| 1.0.0 | 1 | 2026-05-12 | Added public surface map. |
| 1.1.0 | 2 | 2026-05-12 | Added the persistence helper boundary after the code audit refactor. |
