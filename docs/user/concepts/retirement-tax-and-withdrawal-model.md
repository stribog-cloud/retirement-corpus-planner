---
title: "Retirement Tax and Withdrawal Model"
created: 2026-05-12
updated: 2026-05-18
type: project/user-doc
status: published
version: "2.1.0"
revision: 6
last_updated: 2026-05-18
tags: [user-docs, concepts, tax, withdrawal]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, chartered-accountant, evaluator]
---

# Retirement Tax and Withdrawal Model

> Understand how the planner thinks about retirement cash, cost recovery, capital gains, slab income, rebate, and inflation.

This is a planning model, not a tax filing engine. It is designed to keep tax assumptions visible so a retiree, adviser, or Chartered Accountant can challenge the plan.

## 0. TL;DR

SWP redeems units and separates recovered cost from realised gain. IDCW is treated as taxable distribution income with NAV drag. Interest is slab-rate income. Slab-rate income and special-rate gains are handled separately. Real values are inflation-adjusted into today's rupees.

![Tax Studio with retiree tax controls](../assets/tax-studio.jpg)

## 1. Three Retirement Cash Engines

| Engine | What It Models | Main Risk |
|--------|----------------|-----------|
| Interest | After-tax portfolio income withdrawn or reinvested | Slab tax can reduce usable income |
| SWP | Unit redemptions with cost recovery and realised gains | High withdrawals can deplete corpus |
| IDCW | Distribution cash with NAV drag and tax | Distribution is not guaranteed retirement income |

## 2. SWP

SWP redeems units. The model tracks:

- Opening lot value.
- Cost capital recovered.
- Realised gain.
- Taxable gain.
- LTCG exemption used.
- Tax.
- Closing value.

Return of cost capital is cash flow, not taxable income. The realised gain portion can still be taxable depending on product class and holding period.

## 3. IDCW

IDCW is modelled as distribution income and NAV drag. The planner does not treat IDCW as guaranteed cash. Compare IDCW against SWP before using it as a retirement income plan.

## 4. Interest Income

Interest and coupon-like income enters the retiree tax profile as slab-rate income. It can benefit from basic exemption, eligible senior relief, or rebate where the active tax-law ruleset and retiree profile allow it. It can also suffer TDS timing.

## 5. Slab Income And Special-rate Gains

The tax model separates slab-rate income from special-rate capital gains. This matters because rebate or basic exemption assumptions may apply to slab income differently from equity LTCG/STCG or listed-bond gains.

## 6. Section 80TTB

For eligible resident senior and super-senior citizens using the old regime, deposit-style interest can use the Section 80TTB deduction up to the active tax-law ruleset cap. Mutual-fund gains and special-rate gains are not treated as 80TTB interest.

## 7. Section 87A

Section 87A rebate applies to tax on regular slab-rate income only. Tax on special-rate gains (equity LTCG, equity STCG, listed-bond LTCG) is not reduced by §87A under this planner's policy (CBDT Oct-2024 conservative position). This means the rebate is available on slab-rate income but is not applied to reduce tax computed on capital gains that carry a special flat rate.

Note: the current release uses an implementation that denies the §87A rebate on the entire tax (including slab-rate tax) when any special-rate capital gains are present. A corrective update to align with the precise CBDT position is tracked in the audit backlog. Until that update lands, users with both slab income and capital gains will see a more conservative (higher) tax estimate than the strict CBDT reading would produce. Use CA review for final treatment, especially in mixed-income years.

## 8. NRI Withholding

Non-resident mode disables resident-only rebate assumptions and uses the NRI withholding rate as a cash-timing estimate on modelled taxable investment income and gains. It is not treaty advice or a final filing computation.

## 9. PMVVY And Other Household Income

PMVVY-style monthly pension cash, rent, annuity, and other non-portfolio income are household offsets. They reduce the portfolio-funded cash need. They do not make the income tax-free by default.

## 10. Inflation

The dashboard shows nominal and real values. Real values are today's-rupee values after discounting by the inflation assumption. A future nominal corpus can be high while the real value is weak.

![Simulation risk workspace](../assets/simulations-risk.jpg)

## 11. Professional Review

Use Trust Center before acting on tax or risk numbers. Use the Adviser / CA Pack when a Chartered Accountant or adviser needs the active tax-law ruleset, assumptions JSON, CSV ledger, scenario comparison, risk method, and caveats alongside the PDF report.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.1.0 | 6 | 2026-05-18 | Rewrote §7 Section 87A to reflect CBDT Oct-2024 conservative position (rebate on slab income only; not on special-rate gains) and added implementation caveat for users with mixed income (audit round 3, Q-Q10-B decision). |
| 2.0.0 | 5 | 2026-05-15 | Expanded tax and withdrawal explanation with cash-engine comparison, slab/special-rate separation, relief assumptions, household offsets, and review boundary. |
| 1.2.0 | 4 | 2026-05-14 | Added Trust Center and Adviser / CA Pack guidance for professional review. |
| 1.1.0 | 3 | 2026-05-13 | Added PMVVY household offset and NRI withholding timing explanation. |
| 1.0.1 | 2 | 2026-05-13 | Added Section 80TTB and conservative mixed-income Section 87A treatment notes. |
| 1.0.0 | 1 | 2026-05-12 | Added withdrawal and tax concept explanation. |
