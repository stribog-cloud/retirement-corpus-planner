---
title: "Retirement Planner Public Surface Map"
created: 2026-05-12
updated: 2026-05-17
type: project/developer-doc
status: governing-reference
version: "2.1.0"
revision: 9
last_updated: 2026-05-17
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
| Simulations | stable | Scenario Library, risk lab, Monte Carlo paths, heatmap |
| Ledger | stable | Annual schedule, monthly FIFO trail, exports, review pack |
| Assumption Studio | stable | Full editable assumption surface and search |
| Help | stable | Guided tutorial, context coach, topic library, local data controls |
| Guided Tour | stable | First-run and replayable product walkthrough |

## 3. Download Surfaces

| Download | Posture | Stability Notes |
|----------|---------|-----------------|
| `retirement_corpus_income_planner.pdf` | stable | Branded planning report; not PDF/UA certified |
| `retirement_corpus_income_planner.csv` | stable | Ledger and metadata audit trail |
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

`docs/internal/` remains tracked for the private repository. Before any public release, follow ADR-0002: move curated material into public docs and ignore `docs/internal/`, or explicitly approve selected internal documents after privacy/security review.

Public release is blocked until `docs/internal/PUBLIC-RELEASE-READINESS.md` is complete and the GitHub quality-gate workflow mirrors local `make all`.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.1.0 | 9 | 2026-05-17 | Clarified local-artifact CSP posture and the local-only test API bridge boundary. |
| 2.0.0 | 8 | 2026-05-15 | Rebuilt public surface map with generated HTML, app surfaces, downloads, storage, source exports, command surface, and release/deprecation rules. |
| 1.5.0 | 7 | 2026-05-14 | Added Trust Center, Scenario Library, and Adviser / CA review pack surfaces. |
| 1.4.0 | 6 | 2026-05-14 | Added export trust framing and scenario snapshot JSON to the public surface map. |
| 1.3.0 | 5 | 2026-05-13 | Added privacy clear-data surface and public-readiness / local-only CI release rule. |
| 1.2.0 | 4 | 2026-05-13 | Added public-release rule for `docs/internal/` linked to ADR-0002. |
| 1.1.1 | 3 | 2026-05-13 | Documented PDF export visual evidence and provenance contract. |
| 1.0.0 | 1 | 2026-05-12 | Added public surface map. |
| 1.1.0 | 2 | 2026-05-12 | Added the persistence helper boundary after the code audit refactor. |
