---
title: "Stress-test a Retirement Plan"
created: 2026-05-15
updated: 2026-05-15
type: project/user-doc
status: published
version: "1.0.0"
revision: 1
last_updated: 2026-05-15
tags: [user-docs, how-to, risk, simulations, heatmap]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, evaluator]
---

# Stress-test a Retirement Plan

> Use Simulations to challenge the plan before you treat the base case as usable.

Run this after a base plan has coherent cash, tax, instrument, and inflation assumptions.

![Simulation risk workspace](../assets/simulations-risk.jpg)

## 1. Save The Base Case

Open Overview and save a named snapshot. Include the cash engine, tax profile, and any known caveat in the note. This gives you a comparison point before applying stresses.

## 2. Apply Standard Scenarios

Open Simulations and review Scenario Library. Apply one standard case at a time:

- Base.
- Conservative income floor.
- Higher income need.
- Lower return decade.
- Tax-optimised SWP.
- Crash-first-decade.
- Healthcare reserve.
- Sticky inflation.
- Spouse longevity.

After applying a case, read the Overview verdict again before changing another assumption.

## 3. Read The Risk Lab

Use Risk Lab to inspect:

- Volatility.
- Equity volatility.
- Debt volatility.
- Equity/debt correlation.
- Shock model.
- Shock year.
- Shock drawdown.
- Risk sample count.
- Risk seed.
- Glide path.
- Ending equity.

The result is a planning sensitivity, not a prediction. A narrow sample count is acceptable for interactive review; increase samples for a final planning discussion.

## 4. Read P10, P50, P90, And Worst

Use P50 as a middle path, P10 as a weak-but-not-worst path, P90 as an optimistic path, and Worst as a diagnostic sample. Do not decide from P50 alone when the plan is close to a target.

## 5. Read Heatmap Colours

Open the Return x Withdrawal Heatmap. The colour is not a ranking of nominal corpus alone. It scores the cell against today's target, inflation-adjusted corpus, and guardrails.

| Colour | Meaning |
|--------|---------|
| Below start | Nominal or real result is weak against the starting baseline |
| Target short | Target is not met under that cell |
| Real target hit | Target is reached, but real value still needs review |
| 20%+ buffer | Target and real purchasing-power guardrails are stronger |

## 6. Decide What Needs Changing

If stress paths fail, change one lever at a time:

- Reduce monthly cash.
- Increase corpus.
- Add annual top-up.
- Extend cash bucket.
- Adjust equity/debt mix.
- Use a tax-aware SWP path.
- Reduce advisory or expense drag.
- Increase target corpus if legacy or healthcare reserve matters.

Save a new scenario after each meaningful change.

## 7. Export Evidence

Use Ledger > Adviser / CA Pack when a professional should review the plan. Use CSV for the schedule trail and PDF for the decision narrative.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.0 | 1 | 2026-05-15 | Added stress-testing workflow covering Scenario Library, Risk Lab, Monte Carlo, heatmap colours, and evidence export. |
