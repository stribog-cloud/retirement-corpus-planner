---
title: "ADR-0002: Public Release Treatment For Internal Docs"
created: 2026-05-13
updated: 2026-05-18
type: project/adr
status: governing-reference
adr_status: accepted
version: "1.0.1"
revision: 2
last_updated: 2026-05-18
tags: [adr, public-readiness, documentation, security]
aliases: ["ADR 0002 Public Release Internal Docs"]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# ADR-0002: Public Release Treatment For Internal Docs

> Internal documentation remains tracked in the private repository, with a required public-readiness pass before any public release.

---

## 0. Status

| Field | Value |
|-------|-------|
| `status` | governing-reference |
| `adr_status` | accepted |
| Decided on | 2026-05-13 |
| Decided by | msambare, via Charter-directed public-readiness posture |
| Supersedes | None |
| Superseded by | None |

## 1. Context

The repository is private today, but it may become public later. The `docs/internal/` tree contains governance notes, audit findings, waiver rationale, test gap analysis, and working closeout records. Some content is safe for maintainers but not necessarily appropriate for a public repository without review.

The current Charter and doc gates require `docs/internal/` to exist while this repo is private because it is the project control plane.

## 2. Decision

Keep `docs/internal/` tracked in the private repository.

Before any public release, run a public-readiness pass that does one of the following:

1. Move curated public-safe material into `docs/developer/` or `docs/user/`, then add `docs/internal/` to `.gitignore` before publishing.
2. Keep selected internal documents public only after explicit owner approval and a secret/privacy review.

No public release is permitted while `docs/internal/` is blindly published.

## 3. Consequences

- Private development keeps the full audit and governance trail available.
- The public release path is explicit and testable.
- Public documentation must not depend on internal-only links that would break after `docs/internal/` is ignored.

## 4. Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.1 | 2 | 2026-05-18 | Normalized ADR metadata to separate document status from ADR decision status. |
| 1.0.0 | 1 | 2026-05-13 | Accepted public-release decision for `docs/internal/`. |
