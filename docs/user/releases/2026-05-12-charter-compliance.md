---
title: "2026-05-12 Local-First Planner Release Notes"
created: 2026-05-12
updated: 2026-05-18
type: project/user-release-notes
status: published
version: "1.1.0"
revision: 2
last_updated: 2026-05-18
tags: [user-docs, release-notes, local-first]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, evaluator]
---

# 2026-05-12 Local-First Planner Release Notes

## What changed for users

- The first-run tour and Help system now give clearer guidance before you rely on saved assumptions, exports, or tax-sensitive results.
- The app explains local storage more directly: assumptions are remembered in your browser profile and should be treated as private financial data.
- PDF, CSV, and review-pack exports include stronger evidence about the assumptions and plan version they came from, so a family reviewer, adviser, or CA can confirm they are looking at the right case.
- The generated dashboard file records artifact integrity details in the release evidence; in user terms, this helps confirm that the local HTML file being reviewed is the intended build.
- The local dashboard build has tighter checks around keyboard use, contrast, responsive layout, and typing performance.
- The one-file dashboard remains designed for local use from the built HTML file.

## What did not change

The product remains local-first. It does not send assumptions to a server and does not emit telemetry. It is still a planning aid, not filing-grade tax advice, regulated investment advice, or a guarantee of retirement outcomes.

## Recommended action

- Reopen the latest built dashboard file before preparing new exports.
- Review Help > Local Data & Privacy before using the planner on a shared browser profile.
- Regenerate PDF, CSV, and review-pack files after changing assumptions, so the exported evidence matches the current plan.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.1.0 | 2 | 2026-05-18 | Reframed release notes around user-visible local privacy, Help, export evidence, accessibility, and performance changes. |
| 1.0.0 | 1 | 2026-05-12 | Added initial user-facing release notes for the local-first dashboard. |
