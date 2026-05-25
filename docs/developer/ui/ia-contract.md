---
title: "Retirement Planner IA Contract"
created: 2026-05-12
updated: 2026-05-15
type: project/ui-reference
status: governing-reference
version: "2.0.0"
revision: 3
last_updated: 2026-05-15
tags: [ui, information-architecture]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# IA Contract

> Information architecture contract for pages, drawers, exports, and adjacent surfaces.

## 0. TL;DR

The app is a single-file SPA. It does not use URL routes yet; the route contract is `activeView` plus persisted active page. Each page must answer a distinct user question and include context, interactivity, Help, and evidence.

## 1. Route contract

`activeView` is the route state. It must remain valid across reloads, persistence, mobile navigation, and E2E tests. If URL routing is introduced later, add an ADR and preserve backwards-compatible state restoration.

## 2. Top-level Pages

| Page | User Question | Required Surface |
|------|---------------|------------------|
| Overview | Is this plan usable? | Verdict, trust guardrail, cash solver, scenario timeline, KPI evidence |
| Guided Planner | What strategy fits this retiree? | Household questions, strategy shortlist, withdrawal policy, action plan |
| Tax Studio | Can I trust the tax number? | Tax profile, ruleset provenance, product treatment, SWP/IDCW evidence |
| Simulations | What breaks the plan? | Scenario Library, Risk Lab, Monte Carlo, heatmap, downside explanation |
| Ledger | Can this be reviewed? | Annual and monthly evidence, exports, review pack, reconciliation |

## 3. Adjacent Surfaces

| Surface | Type | Rule |
|---------|------|------|
| Assumption Studio | Modal configuration | Full model edit surface, searchable, visually polished, syncs both ways |
| Help | Modal documentation | Opens Guided Tutorial by default; topic library expands in place |
| Trust Center | Modal/inline trust | Explains privacy, tax provenance, risk limits, exports, review needs |
| Guided Tour | Overlay coach | Moves around highlighted areas and never teaches a hidden or obscured target |
| PDF | Adjacent output | Same voice and caveats as app |
| CSV | Adjacent output | Machine-readable evidence and metadata |
| JSON packs | Adjacent output | Portable assumptions, tax rules, review evidence |
| Print | Adjacent output | Current visual state, readable hierarchy |

## 4. Navigation Rules

- Left rail groups product pages and scenarios.
- Right rail carries contextual verdict, insights, gap solver, Help, and canvas controls.
- Mobile uses sheets and compressed review cards.
- Header actions are global: theme, Help, Trust, Model, reset, exports, print.

## 5. Page Acceptance

A page is incomplete if it is only charts and numbers. Each page needs:

- Plain-language context.
- Primary action or decision.
- Interactive controls.
- Local Help affordance.
- Trust or caveat language where the result could be misused.
- Responsive layout proof.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.0.0 | 3 | 2026-05-15 | Rebuilt IA contract with page questions, adjacent surfaces, navigation rules, and page acceptance criteria. |
| 1.1.0 | 2 | 2026-05-14 | Added Trust Center, Retiree Guided Mode, Scenario Library, and Adviser / CA Pack to the IA contract. |
| 1.0.0 | 1 | 2026-05-12 | Added IA contract for the SPA. |
