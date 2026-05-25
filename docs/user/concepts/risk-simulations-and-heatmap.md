---
title: "Risk, Simulations, and Heatmap Colours"
created: 2026-05-15
updated: 2026-05-15
type: project/user-doc
status: published
version: "1.0.0"
revision: 1
last_updated: 2026-05-15
tags: [user-docs, concepts, risk, monte-carlo, heatmap]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, evaluator]
---

# Risk, Simulations, and Heatmap Colours

> Understand why a plan can look strong in the base case and still fail under stress.

Retirement planning is sensitive to sequence of returns, inflation, taxes, and withdrawal timing. The planner uses risk tools to expose that sensitivity.

## 1. End Target Chance

End Target Chance estimates how often sampled return paths end above the target corpus. It depends on the active cash engine, taxes, allocation, volatility, sample count, seed, and target basis.

Use it as a planning signal. It is not a forecast.

## 2. P10, P50, P90

| Path | Meaning |
|------|---------|
| P10 | A weak path; useful for downside planning |
| P50 | A middle path; not enough by itself for a retirement decision |
| P90 | A strong path; useful for seeing upside but not for safety |
| Worst | A diagnostic path from the sampled set |

If P50 works and P10 fails badly, the plan depends on favourable returns.

## 3. Fat-tail Regime

The risk engine supports a fat-tail regime so bad years are not treated as smooth normal noise. Use this mode when testing whether cash buckets and withdrawal policies can survive early market stress.

## 4. Heatmap Colours

The heatmap compares return and withdrawal assumptions under the current tax, inflation, corpus, and top-up settings. The colour says whether a cell protects the plan, not whether the nominal number is large.

| Label | Planning Meaning |
|-------|------------------|
| Below start | Real or nominal outcome is weaker than the starting baseline |
| Target short | Target corpus is not reached |
| Real target hit | Target is reached, but purchasing power needs review |
| 20%+ buffer | Target and real-corpus guardrails are stronger |

## 5. Inflation Basis

Real values are shown in today's rupees. A nominal future corpus can be high while real purchasing power is weak.

## 6. Review Rule

When a plan is close to the target, increase risk samples, compare standard scenarios, inspect the ledger, and export the review pack before acting.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.0 | 1 | 2026-05-15 | Added explanation for risk paths, End Target Chance, fat-tail sampling, and heatmap colour meaning. |
