---
title: "Model and Planning Contract"
created: 2026-05-15
updated: 2026-07-06
type: project/developer-doc
status: governing-reference
version: "1.7.0"
revision: 9
last_updated: 2026-07-06
tags: [developer-docs, model, tax, planning, contract]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Model and Planning Contract

> Contributor contract for changing retirement, tax, risk, solver, and planning logic.

## 0. TL;DR

`src/model.js` owns numeric truth, including the current optimum-strategy scoring/allocation helpers. `src/planning.js` owns explainable planning guidance built from model/profile/tax context. `src/analytics.js` runs heavy model-owned risk, solver, and strategy bundles off the immediate UI path. `src/main.jsx` renders and orchestrates; it must not invent financial formulas. A visible number that is not derived from normalized state through the model is a defect.

## 1. Source Files

| File | Responsibility |
|------|----------------|
| `src/model.js` | State normalization, tax law, annual/monthly projection, SWP/IDCW/interest engines, risk paths, solvers, heatmap logic, optimum-strategy scoring/allocation, and formatting |
| `src/planning.js` | Withdrawal policy, tax-optimization guidance, assumption audit, retiree guided planning, instrument catalog, and household action plan |
| `src/analytics.js` | Background bundle orchestration for model-owned Monte Carlo, solvers, and optimum strategies |
| `src/scenario-library.js` | Standard scenario definitions and patch inputs |
| `src/persistence.js` | Browser storage, consent, scenario history, layout/theme persistence helpers, storage-key constants, and clear-data support |
| `src/main.jsx` | React shell, chart rendering, UI state, export handlers, help, guided tour, and current UI-local tour completion state |

## 2. State Contract

All user-editable assumptions pass through `normalizeState()` or `normalizeFieldValue()`. New numeric fields must be added to the normalization path, UI controls, Assumption Studio synchronization, persistence, exports, tests, and reference docs.

Required checks for a new assumption:

1. Default in the base state.
2. Normalization and clamp behaviour.
3. UI control and Assumption Studio control.
4. Solver or projection usage.
5. Export metadata.
6. Saved scenario history.
7. Help or reference documentation.
8. Unit and E2E coverage.

## 3. Tax Contract

Tax logic separates:

- Slab-rate income.
- Special-rate equity gains.
- Debt mutual fund treatment.
- Listed bond treatment.
- Deposit-style interest and eligible senior relief.
- IDCW distribution income.
- SWP cost recovery and realised gain.
- Rebate, cess, surcharge/relief, TDS timing, and NRI withholding timing.

Do not use a flat marginal rate path unless the user explicitly selects a legacy/manual stress mode. Retiree-profile tax must keep slab income and special-rate gains separate.

### 3.1 §74 Capital-Loss Carry-Forward — Live In Projections (fin-8fb F1)

The 8-year FIFO carry-forward pool (`applyAndUpdateCarryForwardPool` /
`netCapitalGainStreams`, §74(1)-(3)) is a correct single-call primitive:
given a `params.carryForwardPool` and a set of streams, it applies prior
losses correctly (STCL → STCG → residual LTCG; LTCL → LTCG only) and
records the residual loss for future use. Since 2026-07-06 it is also
threaded live across projection years, not just available as an isolated
primitive.

**Mechanism — one commit per projection year, never inside the monthly hot
path.** `calculateSwpPlan` and `calculateInterestPlan` each hold a pool
(`{ stclPool: [], ltclPool: [] }`) local to that single run/path — it is
never attached to the shared `params` object, so it cannot leak between
runs, and it resets automatically for every Monte Carlo path (each path
calls `calculate()` fresh). At the end of each projection year,
`applyYearEndCarryForward(pool, yearParams, finalStreams, year)` runs
exactly once: it compares a pool-free tax profile against a pool-attached
tax profile computed on the SAME year-end aggregated streams, and the
pool-attached call is the sole point that mutates the pool (expires entries
older than 8 assessment years, consumes them against this year's gains,
then records this year's residual loss). The assessment year advances one
per projection year, anchored at AY 2026-27 for year 1
(`assessmentYearForProjectionYear`).

This one-commit-per-year design is deliberate: `previewLotSale` /
`redeemNetFromBucket` / `estimatePrincipalSaleForNet` call the tax-profile
machinery many times per month (bisection search over candidate sale
amounts, plus separate before/after profile calls) to size a single
redemption. `calculateTaxProfile` → `calculateRetireeTaxProfile` (or the
flat/override modes) → `netCapitalGainStreams` mutates whatever pool it is
given as a side effect of every call. Attaching a live pool to the params
used inside that hot path would consume and record pool entries dozens of
times over for what is logically one year's transactions — that hot path
is therefore left completely untouched (no `carryForwardPool` key on the
params it sees), preserving byte-identical monthly ledger numbers and the
existing `previewLotSale` streams-identity cache exactly as before. The
year-end true-up then feeds the resulting tax and taxable-gain adjustment
back into that year's annual row and (for SWP) the last monthly row of the
year, and reinvests the tax saved directly into the corpus buckets (SWP) or
the closing-balance formula (Interest) so later years compound correctly.

**Scope per engine:**

| Engine | Coverage |
|--------|----------|
| SWP (`calculateSwpPlan`) | Full. Lot-level NAV/cost-basis sales can realize a real gain or loss; the year-end true-up applies to the full aggregated year streams. |
| Interest (`calculateInterestPlan`) | Wired (same year-end-commit pattern), but `saleStreamsForPrincipalDrawdown` computes gain as `Math.max(0, sale - cost)` off a flat cost ratio applied to the sale amount — not NAV/lot-based — so it cannot itself realize a negative (loss) stream today. The pool therefore stays empty in practice for this engine until its sale model becomes lot/NAV-based. |
| IDCW (`calculateIdcwPlan`) | Out of scope. This engine only realizes `normalIncome` (dividend distributions); it never populates `equityLtcg`/`equityStcg`/`listedBondLtcg`, so the §74 pool has nothing to act on. |

**No UI toggle.** Carry-forward is always applied — this is a correctness
fix (a previously-forgotten loss), not an optional feature. Plans that
realize a capital loss during the projection window may show a lower
projected tax and higher closing corpus than before this change; plans that
never realize a loss (the default BASE state, and any shock-free scenario)
are numerically unaffected, since an empty pool is a no-op.

### 3.2 Opt-In Tax-Aware Rebalancing (fin-8fb F5)

`calculateSwpPlan`'s annual equity/debt drift correction
(`rebalanceBucketsToShare`, called once per projection year, before that
year's monthly loop, whenever the current equity share drifts more than
0.2% from the target) has always been tax-free: it moves value between
buckets via `transferBucketValueWithoutTax`, an in-kind transfer that
realizes no gain or loss. This is a planning-grade simplification — a real
rebalance in India is a redemption followed by a repurchase, which realizes
capital gains/losses on the selling leg — kept as the default so pre-F5
output stays byte-identical. Since 2026-07-06, setting
`params.rebalanceTaxAware = 1` (default `0`) switches the selling leg to a
real FIFO lot sale.

**Mechanism.** `rebalanceBucketsToShare` gained two optional trailing
arguments, `taxAware` and `context`. When `taxAware` is true, the selling
bucket's leg runs through a new helper, `sellBucketGrossWithTax`, which sells
lots FIFO via the existing `previewLotSale(mutate: true)` primitive — the
same primitive the monthly redemption loop (`redeemNetFromBucket`) and F1's
carry-forward true-up both use. Because `calculateSwpPlan` now constructs
that year's `context` (`{ params: yearParams, streams: emptyTaxStreams() }`)
*before* calling `rebalanceBucketsToShare` (it used to be constructed just
after), a tax-aware rebalance sale realizes its gain/loss into the exact
same `context.streams` object the monthly loop accumulates into and F1's
`applyYearEndCarryForward` reads at year end. This is what makes a
rebalance-realized loss net against the same year's redemption gains within
the year, and roll into the §74 pool for future years, exactly like a
redemption-realized loss does. The reorder is a no-op for the default
tax-free path (`transferBucketValueWithoutTax` never reads or writes
`context`), and rebalancing still fires at the same point in the loop
(year start, before the monthly loop) as before F5.

**Sizing convention: gross-sized, not grossed-up.** The transfer is sized on
GROSS sale value — the selling bucket's value always drops by exactly the
same rebalance amount the tax-free path would move (`|desiredEquity -
currentEquity|`), so tax comes out of sale proceeds and the buying bucket
receives the sale's net-of-tax proceeds (`amount - tax`) as a new
contribution lot at the current NAV (the same mechanism `addContributionLot`
already uses for SIP contributions and F1's carry-forward tax credit).
Portfolio total value after a taxed rebalance is therefore `before - tax`.
The alternative — grossing up the sale so the buyer receives the *full*
pre-tax amount — was deliberately rejected: it oversells the leaving bucket
beyond what the target allocation calls for, distorting the resulting
allocation away from the target share the caller asked for.

**Additive ledger fields.** Yearly rows gained `rebalanceGross` and
`rebalanceTax` (both `0` in default mode). They report only the rebalance
leg's own gross sale value and tax; they are deliberately **not** folded
into `grossRedemption` (which means "sold to fund a cash withdrawal" — a
rebalance trade is an internal transfer between buckets, not a cash
withdrawal, so folding it in would distort `reinvested` and
`principalDrawdown`). The rebalance leg's tax, realized gain, taxable gain,
long/short-term split, exemption/rebate usage, and capital-recovered
components **are** folded into the year's existing `tax`, `realizedGain`,
`taxableGain`, `longTermGain`, `shortTermGain`, `ltcgExemptionUsed`,
`basicExemptionUsed`, `rebateUsed`, `rebateLost`, and `capitalRecovered`
totals — the same way a redemption's contribution to those totals works —
so the year's aggregate tax/gain reporting (and `finalizeModel`'s
`effectiveTaxShare`) stays internally consistent whether the gain came from
a redemption or a rebalance.

**Scope.** Only `calculateSwpPlan` rebalances equity/debt buckets; Interest
and IDCW plans have no lot buckets to rebalance, so F5 does not touch them.
Monte Carlo and the Historical Backtest Lab both re-run `calculateSwpPlan`
per path/cohort, so tax-aware rebalancing composes automatically; MC
determinism (same seed → identical output across runs) is unaffected since
the taxed path introduces no randomness of its own.

**Default state unaffected.** `rebalanceTaxAware` defaults to `0`; the
tax-free branch is textually unchanged from before F5, so default-state
output (and `tests/v2-parity-goldens.test.jsx`) remains byte-identical.

## 4. Cash Engine Contract

| Engine | Contract |
|--------|----------|
| Interest | Uses portfolio income after tax and models reinvestment of unused income |
| SWP | Redeems lots through the selected order, separates recovered cost from realised gain, and produces monthly ledger evidence |
| IDCW | Models taxable distribution cash and NAV drag; it is not guaranteed income |

Changing one engine requires regression checks for Overview, Tax Studio, Simulations, Ledger, exports, and Help language.

### 4.1 Dynamic Withdrawal Rules — Guardrails / Percent-of-Corpus (fin-8fb F2)

`withdrawalRule` selects how the recurring annual cash need is resolved each
projection year: `"fixed"` (default — current behavior, byte-identical),
`"guardrails"` (simplified Guyton-Klinger), or `"percentOfCorpus"`. Supporting
fields: `guardrailBandPct` (default 20), `guardrailAdjustPct` (default 10),
`percentOfCorpusRate` (default 5), `spendingFloorMonthly` (default 0, in
today's rupees). `normalizeState` guards the enum, falling back to `"fixed"`
for any unrecognized value.

**Scope.** The rule operates ONLY on the recurring cash need
(`monthlyCashNeedForYear(year) x 12`, escalated per rule). Planned lump sums
are never scaled by the multiplier or by `percentOfCorpus` — every call site
adds `plannedLumpSumForYear(...)` on top of the resolved recurring target,
using the natural (un-held, un-multiplied) inflation factor, exactly as
`targetAnnualCashForYear` already did pre-F2.

**`resolveDynamicSpending`** (exported, pure) is the single per-year decision
point: `{ rule, year, openingCorpus, baseAnnualCash, inflationFactor,
heldInflationFactor, initialRate, multiplier, priorYearReturn, params } =>
{ annualCashTarget, nextMultiplier, nextInflationFactor, inflationHeld,
guardrailAction }`. Engines hold `spendingMultiplier`, a held-inflation-factor
carry, `initialRate` (established from year 1), and `priorYearReturn` as
**local variables** — never on the shared `params` object — exactly the same
discipline F1 uses for `carryForwardPool`, so state resets automatically for
every Monte Carlo path and cannot leak between runs.

**Fixed-mode parity is structural, not incidental.** `resolveDynamicSpending`
short-circuits before any rule-specific math when `rule` is `"fixed"` (or any
unrecognized string), returning `baseAnnualCash x naturalInflationFactor` —
the identical expression `targetAnnualCashForYear`/`targetMonthlyCashForMonth`
already compute, same operands, same order. `calculateSwpPlan`'s monthly loop
additionally keeps the literal pre-F2 `targetMonthlyCashForMonth(...)` call
for fixed mode (`yearDynamic` stays `null`), so default-state output is
byte-identical by construction, not by coincidental arithmetic equivalence —
confirmed by a deep-equality test between a run with `withdrawalRule` absent
and a run with `"fixed"` plus wildly different (and therefore provably
ignored) guardrail/percentOfCorpus fields.

**Guardrails**, evaluated once initialRate is set (year ≥ 2):

1. `plannedAnnual = baseAnnualCash x candidateInflationFactor x multiplier`,
   where `candidateInflationFactor` is ONE more compounding step on top of
   last year's *actually-applied* (possibly held) factor — not a fresh
   `Math.pow(1+g, year-1)` recompute. `currentRate = plannedAnnual /
   openingCorpus`.
2. Capital-preservation cut: `currentRate > initialRate x (1 + band)` →
   `multiplier x= (1 - adjust)`, `guardrailAction: "cut"`.
3. Prosperity raise: `currentRate < initialRate x (1 - band)` →
   `multiplier x= (1 + adjust)`, `guardrailAction: "raise"`.
4. Otherwise, inflation-hold: if last year's portfolio return was negative
   AND `currentRate` is still above `initialRate`, freeze this year's
   escalation (carry last year's held factor forward unchanged instead of
   advancing it) — `guardrailAction: "inflation-hold"`. **Checked only when
   neither band rule fired** — an engineered band breach always reports as
   `"cut"`/`"raise"` even in a year that follows a loss, matching the
   engineered test in `tests/dynamic-withdrawal.test.jsx`.
5. `multiplier` is always clamped to `[0.5, 2.0]`.

A frozen inflation factor is a **permanent** one-year skip, not a deferred
catch-up: later years keep compounding from the frozen level, matching
classic Guyton-Klinger, not the raw calendar exponent.

**percentOfCorpus:** `annualCashTarget = percentOfCorpusRate% x
openingCorpus`, every year — no multiplier, no band/hold state
(`spendingMultiplier` stays `1`, `guardrailAction` stays `"none"`).
`inflateWithdrawals` is bypassed by design. Converted to monthly by flat
division (`annualCashTarget / 12`), with **no** within-year continuous
escalation (unlike guardrails/fixed) — SWP's month loop special-cases this so
percentOfCorpus doesn't inherit fixed mode's continuous compounding shape.

**Floor (both dynamic rules):** `spendingFloorMonthly` is in today's rupees
and always escalates by the **natural** (un-held) inflation factor regardless
of rule or holdback — a floor is a protection level, not a target, so it
tracks true CPI even in a frozen or percent-of-corpus year. `annualCashTarget
= max(ruleResolvedTarget, floorMonthly x 12 x naturalInflationFactor)`.

**Engine coverage:**

| Engine | Coverage |
|--------|----------|
| SWP (`calculateSwpPlan`) | Full. Annual decision at the year boundary (mirroring F1's carry-forward commit point); monthly targets derive from the resolved annual figure, re-applying SWP's existing within-year continuous escalation ratio for guardrails (flat division for percentOfCorpus). Lump sums added un-scaled in month 1 only. |
| Interest (`calculateInterestPlan`) | Full. Single annual decision feeds `targetAnnual` at the same site `targetAnnualCashForYear` used pre-F2. |
| IDCW (`calculateIdcwPlan`) | Full. The gross-up bisection search (`desiredGross` sized to net `targetAnnual` after tax) integrates cleanly at the same annual-target site — no structural obstacle was found, unlike F1's carry-forward (which IDCW cannot use since it never realizes capital gains). |

**Ledger.** Yearly rows (the `rows` array returned by all three engines) gain
two additive fields: `spendingMultiplier` (number, `1` in fixed mode) and
`guardrailAction` (`"none" | "cut" | "raise" | "inflation-hold"`, `"none"` in
fixed and percentOfCorpus modes). Monthly row shapes (`monthlyRows` for SWP;
`buildMonthlyLedger`'s synthesized rows for Interest/IDCW) are unchanged.
**Known simplification:** `buildMonthlyLedger`'s per-month
`withdrawal_target_nominal` curve for Interest/IDCW is synthesized from
already-computed annual rows via the pre-F2 `targetMonthlyCashForMonth`
formula — it does not have access to the per-year guardrails state
(multiplier, held-inflation-factor carry) and so still displays the
*static* target shape for those two engines under a dynamic rule, even
though the underlying annual `withdrawal_nominal` (amortized from the
resolved dynamic annual withdrawal) is correct. SWP does not have this gap:
its `monthlyRows` are populated directly from the same per-year dynamic
state the annual row uses.

**Coverage semantics.** `cashCoverage` (on both annual and SWP monthly rows)
is always measured against the **resolved** target for that period, not
against a fixed/undiminished target. In a guardrails "cut" year the
withdrawal still tracks close to 100% coverage of the (already-reduced)
target — a cut is a change to what is being aimed for, not a shortfall
against the original aim. `planCoversMonthlyCash` / `solveCorpusForMonthlyCash`
inherit this automatically since they read `cashCoverage` off the same rows;
`solveCorpusForMonthlyCash` still converges to a finite corpus under
guardrails (verified in `tests/dynamic-withdrawal.test.jsx`), though the
resolved target it is bisecting against is itself corpus-dependent under
guardrails/percentOfCorpus, unlike the pre-F2 fixed target.

**Monte Carlo.** No extra wiring needed: `calculateSequencePath`/
`calculateMonteCarlo` call `calculate()` fresh per path, and all dynamic-rule
state is local to that single `calculate*Plan` invocation, so it resets per
path exactly like F1's carry-forward pool.

### 4.2 Multi-Goal Planned Lump Sums (fin-8fb F3)

`plannedLumpSums` replaces the single-goal `plannedLumpSumAmount` /
`plannedLumpSumYear` / `plannedLumpSumInflate` triple with an array of up to
10 goals, each `{ id?, name, amount, year, inflate }`. Goals only fire under
`useHouseholdPlan` — the same scoping the legacy single-goal fields always
had.

**Sanitizer.** `sanitizePlannedLumpSums(input)` (exported, pure) accepts
anything and returns a clean array: non-array/garbage input yields `[]`;
non-object entries and entries with a negative or non-finite `amount` are
dropped; entries with a non-finite `year` are dropped; a finite but
out-of-range `year` is **clamped** into `[1, 80]` (not dropped); `name` is
trimmed and capped at 40 characters; `inflate` coerces to strictly `0` or
`1`; the array is capped at the first 10 valid entries.

**Migration.** `resolvePlannedLumpSums(state)` (exported, pure) is the shared
resolution helper: the sanitized `state.plannedLumpSums` array wins whenever
it is non-empty (the legacy triple is then ignored entirely); otherwise, if
`plannedLumpSumAmount > 0` **and** `plannedLumpSumYear >= 1`, a single-entry
array `[{ name: "Planned lump sum", amount, year, inflate }]` is synthesized
from the legacy fields. A legacy `amount > 0` with `year <= 0` ("unset" —
the pre-F3 code's own signal that the goal never matches any projection
year) synthesizes **no** entry at all, rather than a `year: 0` placeholder —
this keeps the function idempotent. (`normalizeState` resolves once into
`state.plannedLumpSums`; `householdPlanProfile` then resolves again from
that already-resolved state. A stored `year: 0` entry re-run through
`sanitizePlannedLumpSums` would get its year clamped up to `1`, turning a
previously-inert goal into one that fires in year 1 on the very next
resolution — returning `[]` instead sidesteps that entirely.) Legacy scalar
fields remain in `NUMERIC_FIELDS` and on the normalized state for back-compat
loading only; they are otherwise inert once a valid array is present.

`normalizeState(state).plannedLumpSums` is always an array (possibly `[]`),
regardless of `useHouseholdPlan` — the household gate is applied downstream.
`householdPlanProfile(state).plannedLumpSums` is `[]` whenever
`!useHouseholdPlan`, and otherwise the resolved array (recomputed directly
from `state`, not merely copied from `state.plannedLumpSums`, so calling
`householdPlanProfile` on a raw, never-normalized state still works — several
existing tests do exactly this). The legacy scalar profile fields
(`plannedLumpSum`, `plannedLumpSumYear`, `plannedLumpSumInflate`) are left
unchanged, computed unconditionally as before, for `persistence.js`'s
`cleanEffectiveProjectionEvidence` back-compat snapshot.

**Summation.** `plannedLumpSumForYear(params, year, inflationFactor)` sums
every goal in `profile.plannedLumpSums` whose `year` matches the current
projection year, escalating each by `inflationFactor` only when that goal's
own `inflate` flag is set — goals are never scaled together or by any
dynamic-withdrawal multiplier (see §4.1). `targetAnnualCashForYear` /
`targetMonthlyCashForMonth` add this sum on top of the resolved recurring
target exactly as before F3; every call site (`calculateInterestPlan`,
`calculateSwpPlan`, `calculateIdcwPlan`) is unaffected by the internal
representation change, since they only ever call the same two helper
functions.

**Default-state parity.** BASE has no `plannedLumpSums` key and
`plannedLumpSumAmount: 0`, so `normalizeState({}).plannedLumpSums` is `[]`
and every existing engine output is byte-identical to pre-F3
(`tests/v2-parity-goldens.test.jsx`).

## 5. Risk Contract

Risk calculations must disclose sample count, seed, path regime, P10/P50/P90, worst path, and confidence band where available. Interactive defaults may remain fast, but final-review workflows must make sample-size limitations visible.

### 5.1 Historical Backtest Lab (fin-8fb F4)

`calculateHistoricalBacktest(params, dataset = INDIA_ANNUAL_RETURNS)` replays every historical cohort window of length `params.years` found in `dataset` through the live cash engine (`calculate()`), instead of Monte Carlo's random sequence-of-returns sampling. It is deterministic — no RNG — so a given `(params, dataset)` pair always produces byte-identical output.

**Dataset injection.** `src/data/india-annual-returns.js` (`INDIA_ANNUAL_RETURNS`, `DATASET_META`) is imported directly into `src/model.js`, which already imports from `src/planning.js` — it is not an import-free module, so importing a second pure, browser-free data module does not change its purity posture (verified against `tests/domain-contract.test.mjs`, which asserts `calculate()` and friends work without mounting React, not that `model.js` has zero imports). `calculateHistoricalBacktest`'s dataset argument therefore defaults to the bundled dataset with no wiring required in `src/analytics.js` beyond passing `params` through; `src/analytics.js` imports only `DATASET_META.id` for the memoization cache key (see `docs/developer/historical-dataset.md` for the dataset's own contract).

**Cohorts.** For `horizon = params.years`, every start index `i` where `i + horizon <= dataset.length` is one cohort. A dataset shorter than the requested horizon returns the documented zero-cohort shape (`{ cohortCount: 0, horizon, successRate: 0, worst: null, best: null, cohorts: [], percentileBands: { p10: [], p50: [], p90: [] } }`) rather than throwing.

**Return override plumbing.** Each cohort builds a `sequenceReturnOverrides` array — the exact mechanism `calculateSequencePath` uses for Monte Carlo (`paramsForProjectionYear` merges the per-year override into `equityReturn`/`debtReturn`/`annualRate` before every engine reads its own rate, including SWP's per-bucket `swpBucketGrowthRate`). The difference from Monte Carlo's `sampledReturnOverride` is that the override value is a fixed historical year's return (`historicalReturnOverrideForYear`), not a random shock added to the assumed return. Under `useAssetReturns === 1` the historical equity/debt rates pass straight through, so the engine's own (possibly glide-adjusted) equity/debt blend still applies; otherwise the two historical rates are pre-blended into a single `annualRate` override using the static `equityShare` (glide paths do not apply to the single-blended-rate mode, matching `equityShareForYear`'s own short-circuit).

**Historical inflation override (`backtestUseHistoricalInflation`).** Default `0` keeps the user's single assumed `inflation` rate for every cohort — a deliberate "historical returns, assumed inflation" planning-grade mixed mode. Setting it to `1` replaces the assumed rate with each cohort's own per-year `inflationPct` values via `sequenceInflationOverrides`, consumed by a new helper, `cumulativeInflationFactor(params, yearsElapsed)`, which **compounds cumulatively year-by-year** (not a full-window average) — this is the headline correctness property: Year 2's recurring cash target escalates by exactly Year 1's own historical rate, not by a blended or averaged figure. `yearsElapsed` may be fractional (SWP's monthly redemption loop and `buildMonthlyLedger`'s per-month synthesis use `(monthIndex-1)/12` style arguments); a whole year's contribution always uses that year's own override rate, and any fractional remainder compounds at the rate of the year currently in progress, so the function is continuous across year boundaries. `calculateInterestPlan`, `calculateSwpPlan`, and `calculateIdcwPlan` all route their δ=1 withdrawal-inflation-factor and real-corpus-deflator computations through `cumulativeInflationFactor` (previously a bare `Math.pow(1 + inflation, t)`); `resolveDynamicSpending`'s guardrails held-inflation-factor step routes its marginal (single-year) rate through a companion helper, `historicalInflationRateForYear`. **When `sequenceInflationOverrides` is absent — true for every existing caller (Monte Carlo, goldens, UI, default projections) — both helpers degrade to the exact pre-F4 expression byte-for-byte**, verified by the full 852-test pre-F4 suite passing unchanged after the refactor.

**Known limitation.** `buildMonthlyLedger` (the Ledger-view monthly synthesis for Interest/IDCW modes) still computes its own monthly inflation factor from the flat scalar `params.inflation` directly — it is not wired through `cumulativeInflationFactor`. `calculateHistoricalBacktest` itself never calls `buildMonthlyLedger` (only `calculate()`), so this does not affect cohort correctness; it only means a hypothetical future UI that pipes a historical-inflation-enabled cohort's report through `buildMonthlyLedger` for a monthly breakdown would show the monthly curve using the flat assumed rate while the annual totals correctly reflect the historical per-year compounding. Flagged for the UI/phase-2 agent.

**Success definition.** Mirrors `calculateMonteCarlo`'s `successProbability` numerator exactly: a cohort counts as a success when its final closing corpus is `>= targetCorpus`, nothing more (same non-strict comparator, same "always true when `targetCorpus` is 0" edge behavior). `depleted`/`depletionYear` (any row with `closing <= 0`) are reported separately per cohort as richer diagnostics for the worst-cohort callout — they are not folded into the success/fail count, so the numerator stays a literal match to Monte Carlo's.

**Output shape.** `{ cohortCount, horizon, successRate, worst: { startFy, endingCorpus, depletionYear } | null, best: { ... } | null, cohorts: [{ startFy, endingCorpus, realEndingCorpus, depleted, depletionYear }], percentileBands: { p10, p50, p90 } }`. `percentileBands` reuses Monte Carlo's `quantile()` helper across cohorts' closing values for every projection year 0..horizon (year 0 collapses to `principal` for every cohort).

**State fields.** `backtestEnabled` (NUMERIC_FIELDS, default `1` — the compute is deterministic and cheap relative to Monte Carlo) and `backtestUseHistoricalInflation` (NUMERIC_FIELDS, default `0`).

**Slow-bundle integration.** `src/analytics.js`'s `computeSlowBundle`/`computeAnalyticsBundle` add a memoized `backtest` field (`memoCalculateHistoricalBacktest`, a 16-entry LRU cache keyed on `paramsHash:DATASET_META.id`, mirroring the Monte Carlo cache), `null` when `backtestEnabled !== 1`. `buildFallbackAnalytics` adds a `pendingHistoricalBacktest(params, model)` placeholder — in the same spirit as `pendingMonteCarlo` — that reuses the already-computed exact `model` path as an immediate approximation (`cohortCount: 0` signals "not yet cohort-computed") so the UI card has something structurally valid to render before the slow bundle's real cohort replay resolves. `computeFastBundle` does not include `backtest` (same "served by the slow path" contract as `mc`/`optimum`/`maxMonthlyCash`). `src/workers/analytics-worker.js` needed no change — it already passes `computeSlowBundle`/`computeFastBundle` through unmodified.

**New exports:** `calculateHistoricalBacktest`, `historicalReturnOverrideForYear`, `cumulativeInflationFactor`, `historicalInflationRateForYear` (from `src/model.js`); `pendingHistoricalBacktest` (from `src/analytics.js`).

**UI (phase 2, not implemented here):** the "Historical Backtest Lab" card (cohort success stat, worst-cohort callout, P10/P50/P90 sparkline/chart, historical-inflation toggle) and `MODEL_DEBUG_API` exposure for e2e are out of scope for this change — `src/main.jsx` was deliberately not touched.

## 6. Solver Contract

Solvers answer planning questions:

- Corpus needed for a monthly cash target.
- Return needed for a target.
- Maximum monthly cash from a corpus.
- Withdrawal share needed.
- Additional top-up needed.

They must fail closed with a visible warning when assumptions are infeasible rather than producing a silent zero or stale result.

## 7. Effective-Parameter Reconciliation Contract

Every UI, Help, CSV, PDF, ledger, chart, KPI, rail, solver, heatmap, and risk surface that shows plan numbers must derive from one normalized live projection parameter set. Raw form state is input evidence, not display truth.

Required behaviour:

1. Normalize editable state before deriving any visible number.
2. Apply household-mode overrides before display/export math. Household mode may override raw monthly target, target corpus, and horizon from household spend, offsets, reserves, legacy goals, and longevity settings.
3. Reconcile every dependent surface against the same effective parameters.
4. Freeze exports from a single live snapshot. A PDF/CSV/export pack must not mix parameters from before and after a UI edit, async projection refresh, or household override.
5. Label intentionally stable surfaces. For example, deterministic projections in `cashMode: "interestPercent"` are driven by withdrawal percentage; editing `monthlyTarget` changes goal/solver comparisons, not the projection path.

`monthlyTarget` has two valid meanings, and UI code must not hide the difference:

- In `cashMode: "monthlyTarget"`, it is the live withdrawal target. Projection rows, KPI tiles, gauges, charts, right rail, ledger, exports, and risk paths must update from this value.
- In `cashMode: "interestPercent"`, withdrawal percentage drives the cash path. `monthlyTarget` is only the benchmark for Cash Goal and the corpus/return/max-cash solvers.

Direct user edits to Monthly cash in the Monthly Cash Solver or Assumption Studio must set `cashMode` to `monthlyTarget`. If a contributor preserves `% interest` mode, visible copy must explain that Monthly cash is a benchmark rather than a projection driver. Regression tests must cover at least low, medium, and high monthly-cash values across the visible projection surfaces.

## 8. Planning Guidance Contract

`src/planning.js` may recommend strategy categories and instrument families. It must label guidance as planning support, not regulated advice. It should explain why a strategy wins and what conditions would make another strategy more suitable.

Current boundary rule: `generateOptimumStrategies()`, strategy candidate scoring, allocation-plan construction, and strategy instrument guidance live in `src/model.js` and are executed through `src/analytics.js` for the background bundle. `src/planning.js` should consume that context to produce policy, tax, audit, and guided-mode explanations. If strategy scoring is later extracted from `src/model.js`, update this contract, architecture docs, tests, and exports in the same change.

## 9. Verification

Before closing model work, run the focused unit tests and then the broader gates named in [Testing and Quality Gates](testing-and-quality-gates.md). For UI-visible model changes, run E2E as well.

## 10. Owner-Decision Notes (Round 3 — 2026-05-18)

These notes record product-owner decisions made during the Round 3 audit that have model-wide impact. Each note cites the spec question, the decision date, and the authority. Lovelace implements these in `audit/reference/` and Faraday verifies them in the spec diff. The reference implementation and the production implementation must agree on all three conventions below.

### 10.1 Household Corpus Target Composition (Q-Q21-A)

**Formula:** `effectiveTarget = max(targetCorpus, legacyGoal) + emergencyReserve + healthcareReserve`

**Semantics:** The user's terminal corpus IS the legacy if nothing is spent down — they are the same pool, not additive obligations. A user who sets "₹2 Cr legacy goal + ₹3 Cr retirement target" is planning for ₹3 Cr (the larger absorbs the smaller, because the larger already encompasses the smaller). Emergency reserve and healthcare reserve are added on top of `max(...)` because those are genuinely separate pools with distinct purposes.

**Do not implement as:** `targetCorpus + legacyGoal` — that would double-count when a single user has both fields set.

**Decision date:** 2026-05-18
**Authority:** Mangesh (owner), Q-Q21-A in `audit/round-3/QUESTIONS-FOR-MANGESH.md` (ANSWERED).
**Spec cross-link:** Q21 (Target Corpus Real) in `audit/round-3/02-spec.md`.

### 10.2 Inflation Indexing Convention: δ=1 (Q-Q05-A / Q-Q18-A)

**Convention:** δ = 1. Year-1 cash = the base monthly target × 12 at face value (no inflation step in Year 1). Year 2 onward is inflated by `(1+g)^(t-1)` where t is the year index (t=1 for Year 1, t=2 for Year 2, …).

This is the natural convention for an Indian retiree who states "I need ₹X/month now" and expects that to grow from next year, not from this year.

**Single convention across all quantities:** Q05 (Annual Withdrawal), Q18 (Target Annual Cash), and all downstream solvers (Q28, Q29, Q30, Q32) use δ=1. Do not introduce a δ=0 path or a mixed convention. If a quantity steps by inflation from Year 1, it is a defect.

**Do not implement as:** Year-1 cash = base × (1+g) — that is δ=0 and would over-state the Year 1 withdrawal.

**Decision date:** 2026-05-18
**Authority:** Mangesh (owner), Q-Q05-A and Q-Q18-A in `audit/round-3/QUESTIONS-FOR-MANGESH.md` (both ANSWERED).
**Spec cross-link:** Q05, Q18, Q28, Q32 in `audit/round-3/02-spec.md`.

### 10.3 Basic Exemption Setoff: Regime-Aware Conservative Default (Q-Q16-A)

**Rule:**

- **Old regime (`regime: "old"`):** Setoff of unused basic exemption limit against §111A STCG and §112 / §112A LTCG is **ALLOWED**. This is settled jurisprudence; the reference implementation and production code must apply the setoff when slab income is below the basic exemption limit.

- **New regime under §115BAC (`regime: "new"`):** Setoff is **RESTRICTED to slab income only**. The embedded slab structure of §115BAC is not separately available as a "basic exemption limit" for offset against special-rate income. The §115BAC framework explicitly disallows several exemptions and deductions; setoff against §111A / §112 / §112A is one of them. Default behavior is conservative: do not apply the setoff against special-rate income in the new regime.

**Policy flag:** The reference implementation exposes an internal policy flag for the aggressive interpretation (setoff allowed in both regimes). The flag default is conservative. The aggressive path is not exposed in the production UI; it is preserved for scenario-level testing and future deliberate user opt-in. Do not remove the flag or collapse to a single path.

**Rationale for conservative default:** A planning app must not over-state savings. The CBDT position and §115BAC text support restriction; the Bombay/Madras HC stays applied only to historical FY 2023-24 filings and are not a basis for ongoing planning assumptions.

**Decision date:** 2026-05-18
**Authority:** Mangesh (owner), Q-Q16-A in `audit/round-3/QUESTIONS-FOR-MANGESH.md` (ANSWERED). See also Q-Q10-B (ANSWERED) for the complementary §87A / special-rate rebate position.
**Spec cross-link:** Q10 (Special-Rate Tax), Q11 (Total Tax), Q16 in `audit/round-3/02-spec.md`.
**Beads:** Faraday closes `fin-w2c` with the regime-aware test pair (old-regime allows, new-regime restricts).

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.7.0 | 9 | 2026-07-06 | fin-8fb F5: added §3.2 — opt-in tax-aware rebalancing (`rebalanceTaxAware`, default 0). `rebalanceBucketsToShare` gained optional `taxAware`/`context` arguments; when active, the selling leg is a real FIFO lot sale (`sellBucketGrossWithTax`) routed through `previewLotSale` into the SAME `context.streams` the monthly redemption loop and F1's year-end carry-forward true-up both read, so a rebalance-realized gain/loss participates in within-year §74 netting and the carry-forward pool. Documented the gross-sized (not grossed-up) transfer convention (`before - tax` total after a taxed rebalance), the new additive yearly ledger fields `rebalanceGross`/`rebalanceTax`, and why they are folded into the year's aggregate tax/gain totals but deliberately excluded from `grossRedemption`. Default mode (`rebalanceTaxAware = 0`) is textually unchanged and byte-identical. New export: `rebalanceBucketsToShare`. |
| 1.6.0 | 8 | 2026-07-06 | fin-8fb F4: added §5.1 — Historical Backtest Lab. `calculateHistoricalBacktest(params, dataset = INDIA_ANNUAL_RETURNS)` deterministically replays every historical cohort window through the live cash engine via the same `sequenceReturnOverrides` plumbing Monte Carlo uses (no RNG). Documented the dataset-injection choice (imported directly into `src/model.js`, which is not import-free), the historical-inflation override's cumulative per-year compounding (`cumulativeInflationFactor`, `historicalInflationRateForYear` — both degrade to the exact pre-F4 `Math.pow` expression when no override is set, verified byte-identical against the full pre-F4 suite), the success-definition parity with `calculateMonteCarlo`, the known `buildMonthlyLedger` inflation-override gap, and the new `backtestEnabled`/`backtestUseHistoricalInflation` state fields. New exports: `calculateHistoricalBacktest`, `historicalReturnOverrideForYear`, `cumulativeInflationFactor`, `historicalInflationRateForYear`. UI integration (card, toggle, `MODEL_DEBUG_API`) is phase 2 and out of scope for this change. |
| 1.5.0 | 7 | 2026-07-06 | fin-8fb F2: added §4.1 — dynamic withdrawal rules (`withdrawalRule`: `fixed`/`guardrails`/`percentOfCorpus`). New pure helper `resolveDynamicSpending` resolves the recurring annual cash target at each year boundary in `calculateSwpPlan`/`calculateInterestPlan`/`calculateIdcwPlan` (all three engines covered); fixed mode is structurally byte-identical to pre-F2 output. Documented guardrails band/adjust/clamp/inflation-hold precedence, the permanent (non-catch-up) held-inflation-factor semantics, percentOfCorpus's bypass of `inflateWithdrawals`, the nominal-escalation floor, new additive yearly ledger fields (`spendingMultiplier`, `guardrailAction`), the known `buildMonthlyLedger` static-target-curve limitation for Interest/IDCW, and that `cashCoverage` is always measured against the resolved (not original) target. New exports: `resolveDynamicSpending`. |
| 1.4.0 | 6 | 2026-07-06 | fin-8fb F1: added §3.1 — §74 capital-loss carry-forward is now threaded live across projection years in `calculateSwpPlan`/`calculateInterestPlan` via a single per-year commit (`applyYearEndCarryForward`), documented per-engine scope (SWP full, Interest wired but structurally never realizes a loss today, IDCW out of scope), and the no-UI-toggle/numbers-may-improve-in-loss-scenarios rule. New exports: `assessmentYearForProjectionYear`, `applyYearEndCarryForward`. |
| 1.3.0 | 5 | 2026-05-18 | Amendment pass (Eco): added §10 Owner-Decision Notes with three Round 3 owner decisions — §10.1 household corpus max() formula (Q-Q21-A), §10.2 δ=1 inflation convention (Q-Q05-A / Q-Q18-A), §10.3 basic-exemption setoff regime-aware conservative default (Q-Q16-A). |
| 1.2.1 | 4 | 2026-05-18 | Aligned strategy/planning ownership with current `model.js`, `planning.js`, and `analytics.js` placement. |
| 1.2.0 | 3 | 2026-05-16 | Added effective-parameter reconciliation contract for normalized projection params, household overrides, export snapshots, and intentionally stable percent-withdrawal surfaces. |
| 1.1.0 | 2 | 2026-05-16 | Added monthly-cash driver contract and required regression expectations for KPI, chart, rail, ledger, and export surfaces. |
| 1.0.0 | 1 | 2026-05-15 | Added model, tax, cash-engine, risk, solver, and planning guidance contract for contributors. |
