---
title: "ADR-0003: Local-Only Quality Gates Before CI"
created: 2026-05-13
updated: 2026-05-18
type: project/adr
status: governing-reference
adr_status: accepted
version: "1.0.1"
revision: 2
last_updated: 2026-05-18
tags: [adr, ci, quality-gates, charter]
aliases: ["ADR 0003 Local Only Quality Gates"]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# ADR-0003: Local-Only Quality Gates Before CI

> `make all` is the canonical private-repo quality gate until a public/shared CI mirror exists.

---

## 0. Status

| Field | Value |
|-------|-------|
| `status` | governing-reference |
| `adr_status` | accepted |
| Decided on | 2026-05-13 |
| Decided by | msambare, via local-only git and quality-gate posture |
| Supersedes | None |
| Superseded by | None |

## 1. Context

The project is currently a private, local-only repository. The owner has explicitly required local Git and no push unless requested. The Charter prefers shift-left automation and CI mirrors for shared/public work, but this repo is not currently pushed to a shared remote.

## 2. Decision

For the private local phase, `make all` is the canonical quality gate and must be run before commits that claim a green state. A CI mirror is deferred until the project becomes public, shared with external collaborators, or hosted.

No public repository launch or public pull-request workflow is permitted without adding a CI mirror equivalent to the local gate surface.

## 3. Consequences

- Local development remains fast and aligned with the owner's local-only git workflow.
- Release confidence depends on the developer actually running `make all`; audit reports must not imply CI exists.
- Public/shared development has a clear blocker: add CI or obtain an explicit owner-approved release exception.

## 4. Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.1 | 2 | 2026-05-18 | Normalized ADR metadata to separate document status from ADR decision status. |
| 1.0.0 | 1 | 2026-05-13 | Accepted local-only quality-gate posture and public-release CI blocker for Charter C-007. |
