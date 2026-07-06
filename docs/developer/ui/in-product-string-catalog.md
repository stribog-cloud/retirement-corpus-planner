---
title: "Retirement Planner In-Product String Catalog"
created: 2026-05-12
updated: 2026-07-06
type: project/ui-reference
status: governing-reference
version: "1.6.0"
revision: 7
last_updated: 2026-07-06
tags: [ui, microcopy, help]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# In-Product String Catalog

## Voice

The dashboard should sound like a calm retirement planner: clear, specific, and action-oriented. It should avoid marketing filler and avoid implying certainty where tax, market, or personal suitability judgment is required.

## Core Topics

- Guided product tour - first-run and callable tutorial.
- Trust Center - local data, model limits, tax provenance, risk method, export sensitivity, and human-review guidance.
- Retiree Guided Mode - household reality, safe starting cash range, income floor, tax caution, crash response, and annual review checklist.
- Tax Assumptions & Scenarios - retiree tax profile, Section 87A, special-rate gains, SWP cost recovery.
- Local Data & Privacy - browser storage, first-run consent, clear-data control, exports, and no telemetry.
- Saved Scenario Timeline - named snapshots, decision notes, fingerprints, restore/export/delete actions, and what changed since the latest saved version.
- Scenario Library - base, conservative, higher-income, lower-return, tax-optimised SWP, and crash-first-decade cases with apply/save/export actions.
- Recommended Strategy Shortlist - goal-driven allocation and cash bucket guidance.
- Withdrawal Policy & Trust Plan - operating rules for retirement cash.
- Sensitivity Heatmap - color semantics based on real purchasing power.
- End Target Chance - sample count, seed, 95% band, and "planning sensitivity, not prediction" language.
- Tax Law Studio - review badge, diff confirmation, source metadata safeguards, and CA-review language.
- Dynamic Withdrawal Rules - Fixed / Guardrails / % of corpus choice, guardrail band and adjustment, spending floor, and the honest planning-grade caveat.
- Planned Lump-Sum Goals - up to 10 named one-time goals with amount, year, and per-goal inflation toggle.
- Historical Backtest Lab - rolling India FY cohort success, worst/best cohort callouts, P10/P50/P90 final-year bands, historical-inflation toggle, and the "approximate history, not audited returns" caveat.

## Error and Warning Style

Warnings must name the consequence and the next useful action. For example: "Monthly target is not sustainable" is paired with the supported monthly cash, required corpus, or required return.

Export and trust strings must travel with downloaded artifacts. CSV/PDF/review-pack copy should include "planning estimate," an assumptions fingerprint, active tax-law version/source, risk method/sample/seed, and a sensitive-data warning.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.6.0 | 7 | 2026-07-06 | fin-8fb F4 UI pass 2 — Historical Backtest Lab card, its `backtestEnabled`/`backtestUseHistoricalInflation` controls, `MODEL_DEBUG_API` exposure, and the new `historicalBacktest` help topic (fin-8fb.8). |
| 1.5.0 | 6 | 2026-07-06 | fin-8fb F2/F3 UI pass — withdrawal-rule controls, planned lump-sum goals editor, goal timeline markers, and their help-topic/aria strings (fin-8fb.8). |
| 1.4.0 | 5 | 2026-05-20 | R4.9.5b — Decision Workspace tooltip copy and verdict variant rewrites (fin-62w). |
| 1.3.0 | 4 | 2026-05-14 | Added Trust Center, Retiree Guided Mode, Scenario Library, and Adviser / CA Pack string contracts. |
| 1.2.0 | 3 | 2026-05-14 | Added scenario timeline, End Target Chance, Tax Law Studio safeguard, and export trust-framing string contracts. |
| 1.1.0 | 2 | 2026-05-13 | Added privacy consent and clear-data copy contract. |
| 1.0.0 | 1 | 2026-05-12 | Added in-product string catalog. |

---

## R4.9.5b — Decision Workspace Tooltips and Verdict Variants

Phase: R4.9.5b (fin-62w). Eco discipline. Hilbert+Raman own component structure; Eco owns copy only.

### Scope note

Strings marked **[HILBERT-PENDING]** are wired to new tiles created by sibling task fin-c0g
(Plan Endurance primary-tile swap). They are catalogued here now so Hilbert picks them up via
the catalog rather than writing ad hoc copy. Do not add them to `src/main.jsx` until fin-c0g
lands the tile structure.

Strings marked **[LIVE]** are already wired in `src/main.jsx` and updated as part of this phase.

---

### Tooltip copy — Decision Workspace metric tiles

All tooltips: ≤ 2 sentences, plain English, no statistical jargon. "Tap for details" is omitted
throughout — no tile in the current Decision Workspace has a wired `openHelp` handler.

#### Plan Endurance [HILBERT-PENDING]

> **Chance your money lasts the full plan.** Above 80% means you're likely fine; below 50% means
> consider reducing monthly cash or extending working years.

Component attachment: `detail` prop on the Plan Endurance tile (new tile from fin-c0g).
Source quantity: `enduranceProbability` (R4.9.5a, `src/model.js`).

#### Target Confidence [HILBERT-PENDING]

> **Chance you exit at or above your target corpus.** Below 50% doesn't mean failure — it means
> you may finish below target but still with substantial money.

Component attachment: `detail` prop on the Target Confidence tile (renamed from "End Confidence"
by fin-c0g). Source quantity: `mc.successProbability`.

Replaces: "End Confidence" label and its previous subtext (`successDetail`).

#### Income Cover [LIVE]

> **How close your final-year withdrawal comes to your inflation-adjusted target.** 100% means
> perfect coverage; less than 100% means you'll dip into reserves in the last year.

Component attachment: `detail` prop in `decisionMap` Cash Flow card (`src/main.jsx` ~line 3222).

#### Cash Flow detail line [LIVE]

> **Target = inflation-adjusted monthly cash your plan is designed to pay in the final year.**
> Actual = the monthly cash the current projection supports at that point.

Component attachment: `detail` string in `decisionMap` Cash Flow card. The detail already shows
`${formatInr(final.withdrawal / 12)} vs ${formatInr(targetAnnualFinal / 12)} final-month need` as
a data line; this tooltip description is catalogued here for completeness. The prose tooltip is
rendered via the native `title` attribute on `GaugeCard` (label + value + detail).

#### Closing the Gap [HILBERT-PENDING]

> **Three equivalent ways to close any gap between what you want and what the plan supports.**
> Try each lever to see which fits your situation best.

Component attachment: headline copy on the consolidated gap tile from Hilbert fin-c0g b1.

#### Use Safe Cash [LIVE]

> **Align spending to the maximum monthly cash this corpus and return path can sustain.**
> Reduces the monthly target to the model-safe level so the plan stops showing a shortfall.

Component attachment: `detail` field of `overviewActions[0]` (id="cash") in `src/main.jsx`
when `hasCashStress` is true. Replaces: "Align the model with the maximum sustainable monthly
cash under current corpus, tax, and return assumptions."

#### Build Strategy [LIVE]

> **Open the guided planner to create an allocation, cash bucket, and tax-posture recommendation.**
> Move here when you want to see why a strategy wins or loses against alternatives.

Component attachment: `detail` field of `overviewActions[1]` (id="strategy") in `src/main.jsx`
when `optimum.best` is absent. Replaces: "Answer the guided planner to create an allocation and
cash bucket recommendation."

When `optimum.best` is present, the existing dynamic copy (equity share + defensive months) is
retained — it is already concrete and action-oriented.

#### Scenario Cards [LIVE]

`title` attribute on each `.scenario-chip` in the overview scenario strip (`src/main.jsx` ~line 5140).

| Scenario | Tooltip |
|----------|---------|
| **Active** | Your current assumptions: return, allocation, cash, inflation, and cash engine as set. |
| **Income** | Lower equity, higher cash payout — tests whether an income-first portfolio can meet the plan. |
| **Growth** | Equity-led compounding — tests how a growth-tilted portfolio performs over the full horizon. |
| **Stress** | Lower return, higher inflation, early drawdown shock — the plan's worst-case stress test. |

Note: if `scenario.final === 0`, the chip already renders ₹0. Hilbert's fin-c0g b1 annotation
("Plan depleted at year N") is structural; Eco does not add depletion-year logic here. The
scenario `title` tooltip communicates what return regime/withdrawal pattern the scenario represents,
not the outcome.

#### P10 / P50 / P90 Percentile Tiles [LIVE]

`note` prop on each `MiniMetric` in the Risk Lab (`src/main.jsx` ~line 5575–5577).

| Tile | Tooltip (`note` prop) |
|------|-----------------------|
| **P10** | Unlucky case: 10% of sampled paths land here or worse. Use this as your downside planning number. |
| **P50** | Median outcome: half the sampled paths end better than this, half end worse. |
| **P90** | Lucky case: 10% of sampled paths land here or better. Good markets, but don't count on it. |

---

### Verdict variants — "Can this plan work?"

The four `planMood` values map to five emotional registers. Copy is **[LIVE]** in
`src/main.jsx` lines ~3199–3210 (`decisionHeadline` and `decisionCopy`).

Template placeholders (`{formatInr(…)}`, `{formatPct(…)}`, `{depletionPoint}`, etc.) are
preserved from the original; only surrounding prose changes.

#### strong (cashRatio ≥ 1, corpusRatio ≥ 1, mc.successProbability ≥ 0.65)

**Headline:** `"Yes — the plan covers income, protects the corpus goal, and has room to spare."`

**Body:** `"Covering ${formatInr(effectiveMonthlyTarget)}/month from ${formatInr(targetCorpusReal)} corpus for the full horizon. Refine if you want to squeeze more out of allocation or tax."`

Design intent: celebratory, not apologetic. Acknowledges the specific monthly and corpus
numbers so the user sees their actual plan, not a generic pass message.

#### watch (cashRatio ≥ 0.9, corpusRatio ≥ 0.85)

**Headline:** `"Mostly yes — income is close, but the corpus cushion is thin."`

**Body:** `"The income path nearly reaches the target and the corpus is within range, but market turbulence or a longer life could expose the gap. One of the actions below closes it."`

Design intent: confident acknowledgment that the plan is near-passing, with a single clear
next step rather than vague "active review" language.

#### attention — corpus depletion (hasCorpusDepletion)

**Headline:** dynamic — the `stressHeadline` string already names the depletion point
(`"Target cash is funded, but corpus depletes around ${depletionPoint}"`). Eco does not
rewrite the dynamic part; the headline is already concrete.

**Body:** `"${stressDetail} Reduce monthly cash, add to corpus, or shift to a lower-drawdown strategy to extend the runway."`

Replaces: `"${stressDetail} Use the actions below to right-size cash, tax path, allocation, or funding."`

Design intent: name the concrete next step (reduce cash / add corpus / shift strategy) instead
of a generic "use the actions below."

#### attention — cash shortfall (hasCashShortfall, not depletion)

Same headline (dynamic stressHeadline names the shortfall year).

**Body:** same as depletion case above — unified body for all `hasCashStress` sub-cases so
the user always gets a concrete trio of next steps.

#### gap (not strong, not watch, not hasCashStress)

**Headline:** `"Not yet — the plan needs more corpus, lower cash, or a higher return to close the gap."`

**Body:** `"${stressDetail} Use the solver or the planner to find the lever that fits your situation."`

Replaces: `"Not yet; the plan needs a clearer funding bridge."` (headline) and
`"${stressDetail} Use the actions below to right-size cash, tax path, allocation, or funding."` (body).

Design intent: name the three concrete levers (corpus / cash / return) rather than the abstract
"funding bridge," and point to the solver/planner specifically.

---

## fin-8fb F2/F3 — Dynamic Withdrawal Rules and Planned Lump-Sum Goals

Phase: fin-8fb.8 (2026-07). UI pass surfacing the F2 (dynamic withdrawal rules) and F3
(multi-goal planned lump sums) model features landed by a sibling model task. All strings
below are **[LIVE]** in `src/main.jsx`.

### Assumption Studio — Risk & Goals tab (withdrawal rule)

Component attachment: `ChoiceGroup` + conditional `Control` rows in `AssumptionDrawer`'s
`risk` panel (`src/main.jsx`, panel `<section className={panelClass("risk")}>`).

| Field | Label | Note copy |
|-------|-------|-----------|
| `withdrawalRule` | "Withdrawal rule" | Options: "Fixed" / "Guardrails" / "% of corpus", each with a one-line `note` ("Inflation-indexed, unchanged" / "Cuts, raises, or holds spending" / "Recomputed every year"). |
| `guardrailBandPct` | "Guardrail band" | Disabled note: "Only used by the Guardrails withdrawal rule." Active note: "Spending is cut or raised once the withdrawal rate drifts this far from the year-one rate." |
| `guardrailAdjustPct` | "Guardrail adjustment" | Active note: "Size of each cut or raise when a guardrail band is breached." |
| `percentOfCorpusRate` | "Percent of corpus rate" | Active note: "Cash target is recomputed as this share of opening corpus every year." |
| `spendingFloorMonthly` | "Spending floor" | Disabled note: "Only used by Guardrails and % of corpus." Active note: "Minimum monthly cash in today's rupees; the resolved target never falls below this." |

A `.drawer-note` tutorial button follows the same field group (matching the existing Monthly
FIFO ledger tutorial note pattern): *"Guardrails cut, raise, or briefly hold spending near the
year-one withdrawal rate; % of corpus recomputes the cash target from opening corpus every
year. Tap for the full withdrawal-rule guide."* — opens the new `withdrawalRules` help topic.

### Insights rail — Withdrawal Rule statement row

Component attachment: `StatementRow` in the desktop `.statement-card` and the mobile
`.mobile-insights-sheet` statement card, rendered only when `withdrawalRule !== "fixed"`.

Value copy pattern: `"${Cut|Raised|Held|On track} · ${multiplier%}"`, e.g. `"Cut · 90%"` or
`"On track · 100%"`. The row uses the `coral` accent only for a `"cut"` action, matching the
existing Cash Goal / Tax Drag accent convention (less-favorable metrics get the warm accent).

### Assumption Studio — Household tab (planned lump-sum goals)

Component attachment: `PlannedGoalsEditor` (new component) replacing the legacy three-field
`plannedLumpSumAmount` / `plannedLumpSumYear` / `plannedLumpSumInflate` `Control` rows in
`AssumptionDrawer`'s `household` panel.

- Field group label: "Planned lump-sum goals" (help chip opens the new `plannedGoals` topic).
- Empty state: *"No planned lump-sum goals yet. Add a car, wedding, renovation, or other
  one-time goal below."*
- Per-goal row fields: "Goal name" (text, 40-char cap), "Amount", "Year", "Inflate" (Yes/No
  select), and a trash-can remove button (`aria-label="Remove goal N: <name>"`).
- Add action: "Add goal" button, disabled at the 10-goal cap with hint *"Up to 10 planned
  goals; remove one to add another."*
- Model-normalization is the source of truth: the editor writes the whole array through
  `setField("plannedLumpSums", nextArray)` and displays whatever `normalizeState` /
  `sanitizePlannedLumpSums` returns, rather than re-validating locally.

### Saved Scenario Timeline — goal markers

Component attachment: `.goal-marker-strip` in `ScenarioTimeline`, rendered above the existing
snapshot-save form when `goals.length > 0` (goals come from `householdPlanProfile(...)
.plannedLumpSums`, so the strip only appears in household-plan mode with at least one goal).

Each marker: `title`/`aria-label` = `"${goal.name || "Planned goal"} in year ${goal.year}"`;
visible chip content is `Y<year>` plus the goal name. This is additive to `ScenarioTimeline`'s
existing DOM (new class names only) — the component is not part of the visual-regression
matrix, so no baseline snapshot is affected.

### New Help topics

- **Dynamic Withdrawal Rules** (`withdrawalRules`, category `metrics`) — explains what each
  rule does and states plainly that this is "a planning-grade simulation of a spending rule,
  not a guarantee that a retiree will actually follow it in a real bad market."
- **Planned Lump-Sum Goals** (`plannedGoals`, category `metrics`) — explains the editor, the
  household-plan gate, and the sanitizer's clamp/drop behavior in plain language.

Cross-links added: `household` → `plannedGoals`; `risk` → `withdrawalRules`; `goals` (Gap
Solver topic) → `plannedGoals`.

---

## fin-8fb.8 F4 UI — Historical Backtest Lab

Phase: fin-8fb.8 (2026-07), UI pass 2. Surfaces the F4 (Historical Backtest Lab) model feature
landed by a sibling model task (`calculateHistoricalBacktest`, commit `d670443`; see
`docs/developer/model-contract.md` §5.1). All strings below are **[LIVE]** in `src/main.jsx`.

### Simulations view — Backtest Lab card

Component attachment: new `HistoricalBacktestLab` component, rendered in the Simulations view
immediately after the Monte Carlo Risk Cone `chart-pair` and before `ScenarioLibrary`
(`.backtest-lab` class; follows the same `PanelHead` + panel + help-chip structure as its
sibling cards).

| Field | Label | Copy |
|-------|-------|------|
| `backtestEnabled` | "Backtest lab" (`ChoiceGroup`) | "Enabled" / "Disabled", notes "Replay rolling FY cohorts" / "Skip the cohort replay". |
| `backtestUseHistoricalInflation` | "Inflation replay" (`ChoiceGroup`) | "Assumed rate" / "Historical rate", notes "Flat assumed inflation for every cohort" / "Each cohort's own per-year inflation, compounded cumulatively". |

- **Enabled, cohorts available**: a `risk-assumption-grid` of `MiniMetric` tiles — Cohort
  Success (via `formatProbabilityForDisplay`, the identical 5pp-bucket/"rare"/"very likely"
  language used by the Monte Carlo end-target-chance tiles), Cohorts Tested, Dataset Window
  (`DATASET_META.firstFy`–`lastFy`), and a Worst Cohort callout (starting FY, ending corpus,
  depletion year or "never depleted"). A second `metric-row four` shows final-year P10/P50/P90
  bands with an inline `PercentileSparkline` next to each tile — reused with no prop changes
  from the Risk Cone card's own `[p10, p50, p90]` usage — plus a Best Cohort callout.
- **Disabled**: the enable/disable `ChoiceGroup` stays fully interactive; the rest of the card
  is replaced by a single muted note ("Turn the backtest lab on to replay every rolling
  N-year window of bundled India market history through this plan.") rather than showing
  grayed-out stale data.
- **Horizon exceeds dataset (`cohortCount: 0`, zero-cohort edge case)**: a muted note naming
  the current horizon, the dataset's fiscal-year window, and the longest horizon that still
  produces at least one cohort (`DATASET_META.count` years).
- **Still computing**: reuses the existing `AnalyticsPendingNotice` component (previously
  defined but unwired in the codebase) rather than inventing a new pending pattern. Gated on
  the data shape, not on `analyticsPending`/`modelPending` timing — the fast-tier fallback's
  `pendingHistoricalBacktest()` placeholder always reports `cohortCount: 0` with a *populated*
  `percentileBands` (the single model path repeated three ways); the real zero-cohort result
  reports `cohortCount: 0` with *empty* `percentileBands` arrays. That shape difference is the
  reliable "real cohorts have arrived" signal, mirroring the existing
  `immediateMcSimulations === 0` pattern used for Monte Carlo's own slow-tier settle detection.
- **Trust language**: an in-card `risk-disclosure`-styled box (reusing the Risk Cone card's own
  disclosure treatment rather than a new visual language): "Approximate index-level history;
  not audited returns. N years of bundled India FY data replayed through the exact same cash
  engine as the live projection — a planning sensitivity against real historical sequences, not
  a market forecast. Open Backtest Lab help for the full dataset provenance."

### MODEL_DEBUG_API

Added `calculateHistoricalBacktest`, `INDIA_ANNUAL_RETURNS`, and `DATASET_META` for e2e parity
testing, following the existing debug-API exposure pattern (dev-mode and `?finTestApi`-gated,
same as every other model export already on the object).

### New help topic

- **Historical Backtest Lab** (`historicalBacktest`, category `metrics`) — mechanics (rolling
  cohort windows, success definition identical to Monte Carlo's), how it differs from Monte
  Carlo (real recorded fiscal years vs. randomly sampled shocks), dataset provenance summary,
  and the same honest planning-grade caveat language used by `withdrawalRules`.

Cross-links added: `risk` → `historicalBacktest`; `understandingMC` → `historicalBacktest`;
`sequenceOfReturns` → `historicalBacktest`.
