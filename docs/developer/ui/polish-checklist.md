---
title: "Retirement Planner Visual Polish Checklist"
created: 2026-05-12
updated: 2026-05-14
type: project/ui-checklist
status: governing-reference
version: "1.1.0"
revision: 2
last_updated: 2026-05-14
tags: [ui, visual-polish, qa]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Visual Polish Checklist

## Visual polish

- Each page has a context panel, primary action, and at least two Help affordances.
- Layout uses space without becoming sparse; no page is only charts and numbers.
- Cards align to a consistent rhythm and do not nest visual cards inside decorative cards.
- KPI values, table values, and chart labels use compact finance-friendly sizing.
- Light and dark themes preserve hierarchy.
- Guided-tour cards point to a visible live target, leave the target readable, and avoid heavy global blur that makes the app look blank.

## Motion

- Buttons, strategy tiles, toasts, guided tour, model status, and hover states provide visible feedback.
- Reduced-motion users still receive non-motion feedback.

## Manual design QA

Before public release, review desktop, narrow desktop, tablet, and iPhone screenshots for spacing, clipping, contrast, focus, and chart legibility. Record the review in an audit closeout.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.1.0 | 2 | 2026-05-14 | Added guided-tour spatial polish checks after manual-audit defect. |
| 1.0.0 | 1 | 2026-05-12 | Added polish checklist for Charter v1.2 UI/UX compliance. |
