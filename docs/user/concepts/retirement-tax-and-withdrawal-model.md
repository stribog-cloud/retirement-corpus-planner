---
title: "Retirement Tax and Withdrawal Model"
created: 2026-05-12
updated: 2026-07-06
type: project/user-doc
status: published
version: "2.2.0"
revision: 7
last_updated: 2026-07-06
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

## 11. Capital-Loss Carry-Forward

A capital loss realised during the projection window is now carried forward automatically across projection years inside the SWP and Interest cash engines. A loss is held for up to 8 assessment years and applied against future gains in the order the law requires — short-term losses against short-term gains first, then against any remaining long-term gains; long-term losses only against long-term gains. There is no on/off toggle: this corrects a previously unmodelled tax benefit rather than adding an optional feature. A plan that never realises a capital loss during the projection window is unaffected; a plan that does realise a loss may now show a lower projected tax and a higher closing corpus than before this change. The IDCW engine does not participate, because IDCW distributions do not realise capital gains or losses.

## 12. Tax-Aware Rebalancing (Opt-in)

By default, the SWP engine's annual equity/debt rebalancing moves value between buckets without realising any gain or loss — a simplification, since a real-world rebalance in India is a sale followed by a repurchase that can realise capital gains or losses. Turning on tax-aware rebalancing switches the selling leg of that annual rebalance to a real lot sale: it realises a capital gain or loss, pays tax out of the sale proceeds before the remaining value moves to the other bucket, and nets against the same year's withdrawal gains and the capital-loss carry-forward pool described above. Leave this off to keep the simpler, tax-free rebalancing behaviour used in prior releases; turn it on for a more realistic, and typically slightly less favourable, tax picture.

## 13. Dynamic Withdrawal Rules

By default, the yearly cash need is a fixed target that grows with inflation every year — unchanged from prior releases. Two optional rules change how that target is resolved instead:

- **Guardrails** — a simplified version of the well-known Guyton-Klinger rule. If the withdrawal rate drifts more than 20% above the rate the plan started with, spending is cut by 10%; if it drifts more than 20% below, spending is raised by 10%; otherwise, in a year that follows a market loss, that year's inflation increase is held flat instead of applied.
- **% of corpus** — the yearly target is recomputed as a fixed percentage of that year's opening corpus, every year, with no smoothing. This ignores inflation escalation entirely, so the cash target can move with the market from one year to the next.

Both rules respect an optional spending floor (in today's rupees) so the resolved target never falls below a minimum you set, and both leave planned lump-sum goals untouched — goals are added on top of the resolved recurring target in their own year, never scaled by a cut, raise, or percentage recompute.

## 14. Professional Review

Use Trust Center before acting on tax or risk numbers. Use the Adviser / CA Pack when a Chartered Accountant or adviser needs the active tax-law ruleset, assumptions JSON, CSV ledger, scenario comparison, risk method, and caveats alongside the PDF report.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.2.0 | 7 | 2026-07-06 | Added capital-loss carry-forward (§11), opt-in tax-aware rebalancing (§12), and dynamic withdrawal rules (§13) explanations for v2.0.0; renumbered Professional Review to §14. |
| 2.1.0 | 6 | 2026-05-18 | Rewrote §7 Section 87A to reflect CBDT Oct-2024 conservative position (rebate on slab income only; not on special-rate gains) and added implementation caveat for users with mixed income (audit round 3, Q-Q10-B decision). |
| 2.0.0 | 5 | 2026-05-15 | Expanded tax and withdrawal explanation with cash-engine comparison, slab/special-rate separation, relief assumptions, household offsets, and review boundary. |
| 1.2.0 | 4 | 2026-05-14 | Added Trust Center and Adviser / CA Pack guidance for professional review. |
| 1.1.0 | 3 | 2026-05-13 | Added PMVVY household offset and NRI withholding timing explanation. |
| 1.0.1 | 2 | 2026-05-13 | Added Section 80TTB and conservative mixed-income Section 87A treatment notes. |
| 1.0.0 | 1 | 2026-05-12 | Added withdrawal and tax concept explanation. |
