---
title: "Compare Cash Engines"
created: 2026-05-15
updated: 2026-05-16
type: project/user-doc
status: published
version: "1.1.0"
revision: 2
last_updated: 2026-05-16
tags: [user-docs, how-to, swp, idcw, interest, tax]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, chartered-accountant]
---

# Compare Cash Engines

> Decide whether Interest, SWP, or IDCW is the better planning engine for a retirement income case.

Use this guide after the core plan has a realistic monthly cash need, corpus, time horizon, inflation rate, tax profile, and product mix.

## 1. Save The Starting Case

Open Overview and save a named snapshot in Saved Scenario Timeline. Use a name such as `Base - Interest engine` and add a note describing the current tax profile and cash need.

## 2. Read The Current Engine

Open Monthly Cash Solver on Overview and confirm:

- Monthly cash need.
- Corpus today.
- Target corpus today.
- Years.
- Cash engine.
- Mode: `% interest` or `Monthly target`.
- Inflation and withdrawal share.

If household mode is active, confirm whether pension, rent, annuity, or other income is reducing the portfolio-funded cash need.

When you type a new Monthly cash amount, the planner switches to `Monthly target` mode because the cash amount is now the live income requirement. If you manually switch back to `% interest`, the withdrawal percentage drives the cash path and Monthly cash becomes a benchmark for the Cash Goal and solvers.

## 3. Test Interest

Choose Interest when the planning question is: "How much cash can the portfolio generate without selling units?"

Read these outputs:

- Final monthly cash.
- Cash goal.
- Tax drag.
- Real final value.
- Tax Studio slab-income treatment.

Interest-like income can be simple to explain, but it may carry slab tax and may not protect purchasing power if the after-tax income is low.

## 4. Test SWP

Choose SWP when the planning question is: "Can I redeem units in a tax-aware sequence while preserving enough corpus?"

Read these outputs:

- Monthly FIFO ledger.
- Recovered capital.
- Realised gain.
- LTCG exemption used.
- Product-level tax rule.
- Corpus depletion warning, if shown.

SWP can be tax-efficient when old units carry recoverable cost capital or eligible LTCG exemption, but it can still fail if the withdrawal rate is too high or poor-return years arrive early.

![Ledger evidence workspace](../assets/ledger-evidence.jpg)

## 5. Test IDCW

Choose IDCW when the planning question is: "What happens if I treat fund distributions as income?"

Read these outputs:

- IDCW payout yield.
- Tax Studio IDCW caution.
- NAV drag.
- Real corpus trend.
- Cash stability against the target.

IDCW is modelled as taxable distribution income and NAV drag. It is not treated as guaranteed retirement cash.

## 6. Compare The Three Cases

For each engine, save a scenario snapshot. Compare:

| Signal | Use It To Decide |
|--------|------------------|
| Cash goal | Whether the plan funds the required monthly cash |
| Real final value | Whether future corpus keeps purchasing power |
| Tax drag | Whether the cash engine creates avoidable tax leakage |
| End Target Chance | Whether sampled paths still reach the target often enough |
| Ledger evidence | Whether the tax path can be reviewed by a CA |
| Warnings | Whether the plan depends on assumptions that need human review |

## 7. Choose The Review Path

Use Interest when income stability matters more than corpus growth and the slab-tax result is acceptable. Use SWP when the ledger shows tax-aware cash generation and the withdrawal rate is survivable. Use IDCW only when the distribution assumption is intentionally being tested and the NAV/tax caveat is acceptable.

Export the Adviser / CA Pack when the choice depends on tax treatment, old units, grandfathering, or family-level income offsets.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.1.0 | 2 | 2026-05-16 | Documented the monthly-cash driver contract and percent-mode benchmark behavior. |
| 1.0.0 | 1 | 2026-05-15 | Added cash-engine comparison workflow for Interest, SWP, and IDCW. |
