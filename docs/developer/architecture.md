---
title: "Retirement Planner Developer Architecture"
created: 2026-05-12
updated: 2026-05-18
type: project/developer-doc
status: governing-reference
version: "2.1.1"
revision: 11
last_updated: 2026-05-18
tags: [developer-docs, architecture]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Developer Architecture

> Architecture for contributors changing the retirement planner safely.

The product is a local-first React/Vite SPA that builds into self-contained HTML artifacts. It has no backend and no remote telemetry. The architecture therefore depends on strict source boundaries, local persistence discipline, and quality gates that prove generated artifacts still match source.

![Retirement planner architecture](diagrams/rendered/retirement-planner-architecture.svg)

## 0. TL;DR

`src/model.js` calculates projections, tax, solvers, risk paths, and the current optimum-strategy scoring/allocation helpers. `src/planning.js` turns model/profile/tax context into explainable planning guidance. `src/analytics.js` packages heavy Monte Carlo, solver, and strategy-bundle work for a background worker. `src/persistence.js` owns the storage helpers, with documented bootstrap/UI exceptions. `src/main.jsx` renders, orchestrates, handles exports, and currently owns guided-tour interaction state. Generated HTML is output, not source.

## 1. Source Tree

| Path | Role |
|------|------|
| `app.html` | Vite HTML entry source |
| `src/model.js` | Financial, tax, risk, solver, heatmap, optimum-strategy scoring/allocation, and formatting source of truth |
| `src/planning.js` | Explainable withdrawal policy, tax guidance, assumption audit, retiree guided planning, and household action planning |
| `src/analytics.js` | Background analytics bundle for Monte Carlo, solvers, and model-owned optimum strategies |
| `src/workers/analytics-worker.js` | Inline Vite worker entry for heavy analytics |
| `src/persistence.js` | Browser storage boundary |
| `src/scenario-library.js` | Standard scenario definitions |
| `src/main.jsx` | React application shell, views, help, guided tour, exports, and UI-local interaction state |
| `src/styles.css` | Design tokens, layout, themes, components |
| `scripts/` | Quality gates, screenshots, artifact integrity, tax derivation |
| `tests/` | Unit, contract, smoke, E2E, and layout tests |
| `docs/user` | User-facing docs and screenshot evidence |
| `docs/developer` | Contributor-facing docs and diagrams |
| `docs/internal` | Internal audits, waivers, planning references |

## 2. Data Flow

![Model data flow](diagrams/rendered/02-model-data-flow.svg)

Every editable field should flow into normalized state, then through model/planning functions, then into UI, charts, tables, Help context, and exports. Exact year-by-year projections stay on the immediate path; heavier Monte Carlo, solver, and optimum-strategy analytics run through `src/analytics.js` in an inline worker so typing and clicks are not blocked. UI-local calculations are allowed only for presentation formatting, layout, or interaction state.

## 3. Domain model

`src/model.js` owns:

- Default assumptions and presets.
- Field normalization and clamping.
- Tax-law sanitization and profile calculation.
- Interest, SWP, and IDCW plan paths.
- Monthly FIFO ledger and cost recovery.
- Monte Carlo and sequence-risk paths.
- Corpus, return, withdrawal-share, and top-up solvers.
- Heatmap logic.
- Optimum-strategy candidate definitions, scoring, allocation plans, and instrument guidance while those helpers remain model-owned.
- INR and percentage formatting.

See [Model and Planning Contract](model-contract.md) before changing model logic.

## 4. Planning Strategy

`src/planning.js` owns:

- Withdrawal policy explanations.
- Tax-optimization guidance.
- Assumption audit.
- Household action plan.
- Retiree Guided Mode interpretation.
- Planning checklists and instrument catalog presentation.

It should remain explainable. It is not a black-box optimizer and it must not imply regulated investment advice.

## 5. React shell

`src/main.jsx` owns:

- Dashboard shell.
- Overview, Guided Planner, Tax Studio, Simulations, and Ledger pages.
- Assumption Studio.
- Help and guided tour.
- Chart rendering and lazy loading.
- PDF/CSV/JSON export handlers.
- Toasts, focus handling, persistence orchestration, and mobile sheets.

The former god-sized `App()` component is split into:

- `useRetirementDashboard()` for state, persistence, derived model data, export handlers, and orchestration.
- `DashboardPages()` for page rendering.
- `DashboardShell()` for chrome, navigation, resizers, right rail, mobile sheets, drawers, tour, and toasts.

`App()` remains a thin provider wrapper. `npm run static` guards this boundary.

## 6. Heavy Browser Libraries

ECharts and jsPDF are loaded lazily. The final artifact is still a single HTML file because the product requirement is a shippable file that can be opened directly. Size and responsiveness are governed through `make ui-perf`, artifact budgets, and E2E latency checks.

Heavy in-product analytics follow the same rule: the worker is bundled inline through Vite, so the shipped HTML remains self-contained while Monte Carlo paths, corpus/return solvers, and optimum strategy generation stay off the UI thread. The shell may show previous analytics or a cheap fallback while the worker catches up; export and strategy-apply actions are guarded until the analytics badge returns to ready.

## 7. Persistence Boundary

`src/persistence.js` owns local browser persistence constants, load guards, consent helpers, scenario-history helpers, and clear-data helpers. It keeps `src/model.js` free of browser APIs. The current documented exceptions are `app.html` reading consent/theme before React mounts and `src/main.jsx` directly reading/writing guided-tour completion.

See [Persistence and Privacy Contract](persistence-and-privacy.md).

## 8. Trust And Review Surfaces

The Trust Center displays assumptions fingerprint, storage posture, tax-law status, risk method, export sensitivity, and human-review guidance. It must not become a hidden policy engine. It reports current state and caveats.

The Adviser / CA Pack is an application-layer export bundle. It packages PDF/CSV guidance plus structured JSON evidence.

## 9. Scenario Library

`src/scenario-library.js` owns standard scenario definitions. Cases patch normalized state and delegate all calculations to `src/model.js`. Saved, imported, or exported scenarios must carry source, library id when applicable, tax-law version, fingerprint, and provenance.

## 10. Generated Artifacts

Generated files:

- `index.html`
- `Retirement Corpus & Income Planner.html`
- `dist/app.html`
- `dist/index.html`

Do not hand-edit them. Build from source and use artifact integrity gates.

## 11. Contributor Traps

| Trap | Correct Action |
|------|----------------|
| Adding a formula in React | Move numeric model/strategy scoring into `src/model.js`; move explanatory planning guidance into `src/planning.js` |
| Adding a persisted key without clear-data support | Update `src/persistence.js`, Help, Trust Center, tests, and docs |
| Changing UI but not screenshots | Run `make docs-screenshots` when user docs show that surface |
| Changing export shape without tests | Update E2E export assertions |
| Changing architecture without diagrams | Update D2 source and rendered SVG/PNG |
| Moving heavy analytics back into React render | Keep Monte Carlo, solvers, and model-owned strategy generation behind `src/analytics.js` / worker and rerun `make ui-perf` |

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.1.1 | 11 | 2026-05-18 | Aligned model/planning/analytics and persistence boundary text with current code placement. |
| 2.1.0 | 10 | 2026-05-17 | Added background analytics worker architecture and the immediate-vs-heavy model path. |
| 2.0.0 | 9 | 2026-05-15 | Rebuilt architecture guide with source tree, data-flow diagram, boundaries, contributor traps, and links to model/persistence contracts. |
| 1.7.0 | 8 | 2026-05-14 | Split standard scenario definitions into `src/scenario-library.js` and documented scenario import provenance. |
| 1.6.0 | 7 | 2026-05-14 | Added Trust Center, Retiree Guided Mode, Scenario Library, and Adviser / CA review pack architecture notes. |
| 1.5.0 | 6 | 2026-05-14 | Added named scenario-history persistence to the persistence boundary. |
| 1.4.0 | 5 | 2026-05-13 | Documented persistence consent and clear-data helpers as part of the app shell boundary. |
| 1.3.0 | 4 | 2026-05-13 | Documented the completed App boundary split into `useRetirementDashboard`, `DashboardPages`, `DashboardShell`, and a static guard for the thin `App()` wrapper. |
| 1.2.0 | 3 | 2026-05-13 | Documented lazy loading for ECharts/jsPDF, the single-file artifact constraint, and the honest boundary of the remaining App refactor. |
| 1.1.0 | 2 | 2026-05-12 | Documented the dedicated persistence boundary outside the domain model. |
| 1.0.0 | 1 | 2026-05-12 | Added architecture guide for contributors. |
