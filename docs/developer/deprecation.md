---
title: "Retirement Planner Deprecation Register"
created: 2026-05-13
updated: 2026-05-14
type: project/developer-doc
status: governing-reference
version: "1.1.0"
revision: 2
last_updated: 2026-05-14
tags: [developer-docs, deprecations]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Deprecation Register

No active deprecations.

This singular path is the canonical developer documentation surface for public-surface deprecations. The plural `docs/developer/deprecations.md` path is retained as a compatibility alias for existing tooling and audit references. Update this file first; then mirror only the canonical-path note in the plural alias when tooling or audits still reference it.

Future public surface deprecations must name the surface, replacement, first affected version, removal horizon, owner, approval evidence, and migration guidance.

## Required Fields

| Field | Meaning |
|-------|---------|
| Surface | UI, export, model, storage key, file artifact, or documentation surface being deprecated |
| Replacement | New surface or behavior |
| First affected version | First release or local milestone where users see the change |
| Removal horizon | Earliest allowed removal point |
| Owner | Person accountable for the deprecation |
| Migration guidance | Exact user/developer action required |
| Approval evidence | Beads id, release note, or owner decision |

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.1.0 | 2 | 2026-05-14 | Clarified singular canonical path and plural alias update rule. |
| 1.0.0 | 1 | 2026-05-13 | Added canonical singular deprecation register with compatibility note. |
