---
title: "Tune a Retirement Plan"
created: 2026-05-12
updated: 2026-07-06
type: project/user-doc
status: published
version: "2.2.0"
revision: 6
last_updated: 2026-07-06
tags: [user-docs, how-to, retirement-planning]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, evaluator]
---

# Tune a Retirement Plan

> Change assumptions safely when the initial result is weak, confusing, or too optimistic.

Tune a retirement plan by saving a baseline, changing one assumption group, and checking the live verdict before moving to the next lever.

Tune one assumption group at a time and check that Overview, Guided Planner, Tax Studio, Simulations, Ledger, Help context, and exports tell the same story.

![Assumption Studio workflow](../assets/assumption-studio.jpg)

## 1. Save A Baseline

Open Overview and save a named scenario snapshot before changing major assumptions. Use a decision note such as `Base before reducing monthly cash` or `After CA tax profile review`.

## 2. Confirm The Starting Point

Read the current plan in this order:

1. Overview verdict.
2. Trust Center.
3. Monthly Cash Solver.
4. Tax Studio.
5. Guided Planner.
6. Simulations.
7. Ledger.

If the plan already has a warning, decide whether you are fixing that warning or exploring a separate what-if.

## 3. Tune Core Inputs

Open Assumption Studio or Monthly Cash Solver and confirm:

- Starting principal.
- Monthly cash target.
- Target corpus today.
- Projection years.
- Inflation.
- Cash strategy.
- Cash target mode.
- Allow corpus drawdown.

After changing any of these, read the solver message and KPI strip again.

Important cash-mode rule: typing a new Monthly cash amount means "make this the live retirement income need." The dashboard therefore switches to `Monthly target` mode automatically so Final Corpus, Cash Withdrawn, Real Final Value, Final Monthly Cash, charts, rail, ledger, and exports recalculate together. Choose `% interest` only when you intentionally want the withdrawal percentage to drive cash and the monthly amount to act as a comparison target.

## 4. Tune Return And Allocation

Confirm:

- Return source.
- Equity/debt allocation.
- Equity return.
- Debt return.
- Expense/advisory drag.
- Compounding.

Do not use return changes to hide a cash-flow problem. If the starting withdrawal rate is high, solve corpus, spend, or top-up first.

## 5. Tune Tax Profile

Open Tax Studio and confirm:

- Tax model.
- Regime.
- Age band.
- Residency.
- Other taxable income.
- Standard deduction.
- Section 87A setting.
- Section 80TTB eligibility, if relevant.
- Product classes.
- SWP redemption order.
- Tax-law ruleset source.

Tax changes should update Tax Studio, Ledger, Overview tax drag, CSV, PDF, and review-pack JSON.

## 6. Tune Household Reality

Use Guided Planner when the plan is for a household rather than a single number. Confirm essential spend, discretionary spend, pension/rent/annuity income, healthcare reserve, dependants, spouse longevity, legacy goal, and risk comfort.

## 7. Stress The Result

Open Simulations and apply relevant Scenario Library cases. Then inspect Risk Lab, P10/P50/P90, heatmap colours, and downside warnings.

## 8. Export After The Model Settles

Export only after the live values settle and warnings are understood. Use CSV for ledger audit, PDF for a planning narrative, and Adviser / CA Pack for professional review.

## 9. When The Plan Looks Bad

Change one lever at a time:

- Lower monthly cash.
- Increase corpus.
- Add annual top-ups.
- Reduce target corpus only if goals allow it.
- Increase cash bucket.
- Move from interest-only to tax-aware SWP if ledger evidence supports it.
- Reduce drag.
- Recheck tax profile.

Save a snapshot after each meaningful version.

## 10. Tune The Withdrawal Rule

Open Assumption Studio, then Risk & Goals, to change how the yearly cash need is resolved. Fixed (the default) keeps today's inflation-indexed target unchanged — no cuts, no raises, no corpus-linked recompute. Guardrails cuts spending when the withdrawal rate drifts too far above the rate the plan started with, raises it when it drifts too far below, and otherwise holds a year's inflation increase flat after a market loss. % of corpus recomputes the target as a fixed percentage of that year's opening corpus every year, with no inflation escalation. Set a spending floor if either dynamic rule should never push the cash need below a minimum. Read the Withdrawal Rule line in the insights rail after switching rules — it shows the latest cut/raise/hold state alongside End Target Chance.

## 11. Tune Planned Lump-Sum Goals

Switch on Use household plan, then open the household tab's Planned lump-sum goals editor to add up to 10 named one-time cash needs — a car, a wedding, a renovation — each with its own amount in today's rupees, landing year, and optional inflation indexing. Goals are added on top of the recurring cash need only in their own year; they are never scaled together or by a Guardrails cut/raise. If you tuned a single planned lump sum before this release, it now shows as one entry in this editor — no action is needed, existing plans migrate automatically.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.2.0 | 6 | 2026-07-06 | Added withdrawal-rule tuning guidance (Fixed/Guardrails/% of corpus) and the multi-goal planned lump-sum editor workflow for v2.0.0. |
| 2.1.0 | 5 | 2026-05-16 | Added the monthly-cash mode rule so users know when the value drives withdrawals versus acts as a benchmark. |
| 2.0.0 | 4 | 2026-05-15 | Rebuilt tuning guide into a step-by-step workflow spanning baseline, core inputs, returns, tax, household planning, stress testing, and exports. |
| 1.2.0 | 3 | 2026-05-14 | Added retiree guided tuning, Trust Center review, Scenario Library comparison, and Adviser / CA Pack handoff guidance. |
| 1.1.0 | 2 | 2026-05-14 | Added Assumption Studio search/warning workflow and saved scenario snapshot guidance. |
| 1.0.0 | 1 | 2026-05-12 | Added tuning how-to for the Assumption Studio workflow. |
