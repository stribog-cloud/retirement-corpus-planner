---
title: "Testing and Quality Gates"
created: 2026-05-15
updated: 2026-05-18
type: project/developer-doc
status: governing-reference
version: "1.5.2"
revision: 8
last_updated: 2026-05-18
tags: [developer-docs, testing, quality-gates, coverage]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Testing and Quality Gates

> How to prove a change is safe before closing a Beads issue or committing.

## 0. TL;DR

Run the narrowest useful test while developing. Run `make all` before broad closeout, release-readiness claims, or commits that affect model, UI, exports, docs, privacy, or tests.

## 1. Command Surface

| Command | Purpose |
|---------|---------|
| `make format` | Formatting drift |
| `make lint` | Static lint policy |
| `make static` | Domain/UI boundary, debug bridge, coverage list, generated-artifact safety |
| `make coverage` | Vitest unit/contract/regression coverage |
| `make build` | Vite single-file artifact build |
| `make artifact-check` | Built HTML equality, manifest, size budgets |
| `make test-smoke` | Shipped-form smoke |
| `make test-e2e` | Puppeteer functional and layout regression |
| `make test-a11y` | Axe accessibility checks |
| `make ui-tokens` | CSS token discipline |
| `make ui-contrast` | Contrast budget |
| `make ui-perf` | Interaction and bundle performance budget |
| `make doc-gate` | Documentation topology, required docs, mobile and desktop screenshots, links |
| `make secrets` | Secret scan |
| `make vulnerability` | npm audit high-severity gate |
| `make all` | Full local release gate |
| `npm run test:charter-docs` | Documentation/governance contract tests without coverage enforcement |
| `npm run test:all` | Alias for the full `npm run all` release-quality gate |
| `npm run perf:gate` | Tesla performance benchmark suite — cold load, edit latency, sustained typing, Monte Carlo N=1000, PDF export, memory growth against `audit/CLAUDE.md §4` thresholds |

## 2. Test Layers

| Layer | Location | Covers |
|-------|----------|--------|
| Unit and contract | `tests/model.test.jsx`, `tests/domain-contract.test.mjs`, `tests/tax-law-script.test.mjs`, `tests/charter-docs.test.mjs` | Model math, tax contracts, tax-law derivation contracts, governance contracts, scripts |
| Smoke | `tests/smoke-build.mjs` | Generated HTML opens and exposes expected shipped content |
| E2E functional | `tests/e2e/dashboard-regression.mjs` | Navigation, latency, persistence, exports including tax-law JSON, help, tour, model sync |
| E2E layout | `tests/e2e/ui-layout-regression.mjs` | Desktop, tablet, iPhone-sized layout, overflow, chart rendering |
| Accessibility | `scripts/accessibility-check.mjs` | Axe serious/critical defects |
| UI policy | `scripts/ui-token-gate.mjs`, `scripts/ui-contrast-gate.mjs`, `scripts/ui-performance-budget.mjs` | Tokens, contrast, responsiveness, real typing latency |
| Documentation | `scripts/doc-gate.mjs` | Required docs, links, desktop/mobile screenshots, topology |
| Performance benchmarks | `tests/performance/` (load.mjs, edit-latency.mjs, sustained-typing.mjs, mc-throughput.mjs, export.mjs, memory-growth.mjs) | Cold load p95, edit→KPI settle p95, sustained typing throughput, Monte Carlo N=1000 p95, PDF export p95, memory growth across 1000 edits — run via `npm run perf:gate` |

## 3. Coverage Rule

The project floor is 96% for statements, branches, functions, and lines. Coverage is measured on hand-maintained source under `src/`, including nested worker entries; Puppeteer E2E is not V8-instrumented but is still release-blocking through `make test-e2e`.

## 4. When To Run What

| Change Type | Minimum During Work | Before Closing |
|-------------|---------------------|----------------|
| Pure docs | `make doc-gate` | `make doc-gate`, `make all` if screenshots or generated artifacts changed |
| Model/tax/risk | `make coverage` | `make all` |
| UI layout/help/tour | `make test-e2e`, `npm run ui:perf` or `make ui-perf` | `make all` |
| Export | `make test-e2e` for PDF, CSV, scenario JSON, active/draft tax-law JSON, and review-pack JSON | `make all` |
| Persistence/privacy | `make test-e2e` | `make all` |
| Build artifact | `make build`, `make artifact-check` | `make all` |

## 5. Failure Handling

Do not close a Beads issue when a required gate is red. If a gate cannot run on the machine, keep the issue open or document the blocker in Beads with the exact command, error, and risk.

## 6. Effective-Parameter Regression Lock

Numeric reconciliation regressions must prove both model semantics and UI coherence:

1. Unit tests cover `cashMode: "monthlyTarget"` for at least three cash values and assert final corpus, real corpus, cumulative withdrawals, and risk chance move coherently.
2. Unit tests cover household-mode derivation and assert effective monthly target, target corpus, and horizon override raw inputs consistently.
3. Unit tests cover `cashMode: "interestPercent"` and assert deterministic projection KPIs remain intentionally stable while solver/goal values change.
4. E2E tests edit Monthly cash from the visible solver, verify the UI switches to Monthly target mode, and compare KPI strip, Cash Goal, End Target Chance, right rail, solver mini-metrics, and chart fingerprints across low/medium/high cash values.
5. Export tests assert CSV/PDF metadata and values come from one frozen live projection snapshot after normalization and household overrides.

## 7. Real Interaction Performance Lock

`make ui-perf` is not a bundle-size-only check. It drives a real browser, types into the Monthly Cash control with keyboard events, captures paint timing, waits for model/analytics readiness, and records long tasks under desktop and 390px older-phone CPU-throttled conditions.

The gate must fail if:

1. Text typed by the user is not visible immediately.
2. The exact model path takes too long to settle after an edit.
3. Heavy analytics create unacceptable main-thread long tasks.
4. The older-phone viewport regresses beyond the slower mobile budget.

Monte Carlo, return/corpus solvers, and optimum-strategy generation must stay off the immediate input path. If a change touches those paths, run `make ui-perf` plus `make test-e2e` before closing the Beads issue.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.5.2 | 8 | 2026-05-18 | Added `npm run perf:gate` to command surface and Performance benchmarks layer to test-layers table (Eco Phase C pass 2 — TQ-C13 MISSING_EVIDENCE). |
| 1.5.1 | 7 | 2026-05-18 | Fixed UI performance command spelling and documented tax-law JSON export coverage. |
| 1.5.0 | 6 | 2026-05-17 | Clarified `test:all`, added `test:charter-docs`, and documented nested worker coverage. |
| 1.4.0 | 5 | 2026-05-17 | Added real interaction performance lock for typing latency, model settle, analytics readiness, and mobile long-task budgets. |
| 1.3.0 | 4 | 2026-05-16 | Broadened cash-projection lock into effective-parameter reconciliation, including household overrides, export snapshots, and intentionally stable percent-withdrawal projections. |
| 1.2.0 | 3 | 2026-05-16 | Added cash-projection regression lock for monthly-cash model/UI coherence. |
| 1.0.0 | 1 | 2026-05-15 | Added testing and quality-gate guide for contributors and reviewers. |
