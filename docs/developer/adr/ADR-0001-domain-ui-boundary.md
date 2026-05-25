---
title: "ADR-0001: Domain Model and UI Shell Boundary"
created: 2026-05-11
updated: 2026-05-11
type: project/adr
status: governing-reference
adr_status: accepted
version: "1.0.0"
revision: 1
last_updated: 2026-05-11
tags: [adr, architecture, charter, fin-dashboard]
aliases: ["ADR 0001 Domain UI Boundary"]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# ADR-0001: Domain Model and UI Shell Boundary

> The retirement planning model will live behind a shared domain contract, and the React UI shell will render that model instead of owning business logic.

---

## 0. Status

| Field | Value |
|-------|-------|
| `status` | governing-reference |
| `adr_status` | accepted |
| Decided on | 2026-05-11 |
| Decided by | msambare, via Charter-directed refactor |
| Supersedes | None |
| Superseded by | None |

## 1. Context

The current implementation grew from a single-file dashboard requirement into a React SPA with retirement modeling, tax treatment, risk surfaces, help content, exports, and UI controls. Much of that logic is concentrated in `src/main.jsx`.

That shape is now too risky. User-reported defects already show state and model drift: Assumption Studio changes do not always propagate both ways, heatmaps can stale, success probability has been confusing, monthly target mode can appear broken, and typing latency can make the interface feel unusable.

### 1.1 Forces

- Correctness: financial and tax outputs must be consistent everywhere.
- UI polish: page redesigns should not require rewriting model math.
- Testability: model contracts must be importable without rendering React.
- Shipping: root HTML artifacts must keep building as self-contained files.

### 1.2 Assumptions

1. The product remains browser-only in the current phase.
2. Vite and React remain acceptable UI tooling.
3. Financial model correctness is higher priority than preserving file layout.

## 2. Decision

The codebase will use a shared domain model module for retirement calculations, tax rules, solvers, risk calculations, formatting, and strategy inputs. React components will be a UI shell over that model.

`src/main.jsx` may temporarily re-export domain functions for compatibility while tests and imports migrate.

## 3. Consequences

### 3.1 Positive

- Model behavior can be tested without browser rendering.
- UI pages can be redesigned with lower risk.
- Exports, help text, dashboard tiles, and charts can consume one source of truth.
- Future tax-law and strategy engines have a clear extension point.

### 3.2 Negative

- The first refactor touches broad import/export surfaces.
- Temporary compatibility exports may obscure the final boundary until cleanup.
- Coverage thresholds may need focused test additions around extracted branches.

### 3.3 Risks and Open Questions

- ECharts and PDF code must stay out of pure model modules.
- The model API needs naming discipline to avoid becoming a second monolith.
- TypeScript may become valuable later, but this ADR does not require it.

## 4. Alternatives Considered

### 4.1 Keep the monolith

Rejected because it has already produced state drift, responsiveness issues, and testability limits.

### 4.2 Rewrite the entire app first

Rejected because a design rewrite before model extraction would preserve the same underlying correctness risk.

### 4.3 Introduce a full framework migration first

Rejected for this phase. React/Vite are adequate; the immediate defect is boundary discipline, not framework capability.

## 5. Implementation Notes

- Extract pure functions into a domain module before large UI changes.
- Keep compatibility exports from `src/main.jsx` until tests and UI imports migrate.
- Add a contract test that imports the domain module directly.
- Keep chart, PDF, DOM, and browser persistence logic in UI/application layers.

## 6. Verification

- `tests/model.test.jsx` continues to pass.
- New domain contract tests import model functions without mounting React.
- `npm run build` produces the same shipping files.
- UI e2e tests pass after the split.

## 7. Related ADRs and References

- `docs/internal/MASTER-REFERENCE.md` - architecture overview.
- `docs/internal/TESTING-STRATEGY.md` - test layers and coverage expectations.
- `docs/internal/CHARTER-COMPLIANCE-ANNEX.md` - governing Charter pins.

## 8. Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.0 | 1 | 2026-05-11 | Accepted initial domain/UI boundary decision. |
