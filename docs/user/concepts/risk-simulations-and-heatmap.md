---
title: "Risk, Simulations, and Heatmap Colours"
created: 2026-05-15
updated: 2026-07-06
type: project/user-doc
status: published
version: "1.1.0"
revision: 2
last_updated: 2026-07-06
tags: [user-docs, concepts, risk, monte-carlo, heatmap, historical-backtest]
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

## 7. Historical Backtest Lab

The Historical Backtest Lab replays every rolling cohort found in the bundled, approximate India market history through the same live cash engine Monte Carlo uses — a real recorded sequence of years instead of a randomly sampled one.

| Concept | Meaning |
|---------|---------|
| Cohort | One rolling window the length of your projection horizon — a 30-year plan tests a cohort starting FY1990-91, another starting FY1991-92, and so on, until no more full windows fit inside the dataset |
| Success rate | Share of cohorts whose final closing corpus meets or exceeds your target, using the same finish line as End Target Chance |
| Worst / best cohort | The actual starting fiscal year and ending corpus for the weakest and strongest cohort tested |
| P10/P50/P90 bands | Final-year corpus percentiles across cohorts, read the same way as the Monte Carlo risk cone |

**How it differs from Monte Carlo.** Monte Carlo samples random year-by-year return shocks from your volatility and shock-model assumptions — it explores many imagined futures. The backtest instead replays real recorded fiscal years with no randomness at all, asking what would have happened across every window this specific history actually contains. Both use the identical success definition, so the two numbers are directly comparable; use them alongside each other, not as substitutes.

**Dataset provenance and caveats.** The bundled dataset is a planning-grade approximation covering India fiscal years FY1990-91 through FY2024-25: BSE Sensex-based equity returns, an RBI G-sec-based debt proxy, and MOSPI CPI-based inflation. It is not audited performance data. A long horizon tested against this fixed 35-year window produces few cohorts, so a single cohort can swing the success rate by a large step — treat the result as a reality check against one specific history, not a statistically smooth probability, and not a guarantee that future markets will resemble any cohort shown.

**Interaction with dynamic withdrawal rules.** The backtest replays your plan exactly as configured, including an active withdrawal rule (see [Retirement Tax and Withdrawal Model](retirement-tax-and-withdrawal-model.md)). If Guardrails or % of corpus is selected, each cohort resolves its own cut/raise/hold state, or its own corpus-linked target, from that cohort's own sequence of returns — the guardrail history for one starting fiscal year can differ from another even under the same rule. Turning on Historical rate additionally replaces the flat assumed inflation with each cohort's own year-by-year inflation history.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.1.0 | 2 | 2026-07-06 | Added the Historical Backtest Lab section (cohort concept, comparison with Monte Carlo, dataset provenance and caveats) and its interaction with dynamic withdrawal rules (v2.0.0). |
| 1.0.0 | 1 | 2026-05-15 | Added explanation for risk paths, End Target Chance, fat-tail sampling, and heatmap colour meaning. |
