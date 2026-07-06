---
title: "Historical Dataset (India Annual Returns)"
created: 2026-07-06
updated: 2026-07-06
type: project/developer-doc
status: governing-reference
version: "1.0.0"
revision: 1
last_updated: 2026-07-06
tags: [developer-docs, historical-backtest, dataset, provenance]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Historical Dataset (India Annual Returns)

> Contributor contract for `src/data/india-annual-returns.js`, the fixed fiscal-year return series backing the Historical Backtest Lab (F4).

## 0. TL;DR

`INDIA_ANNUAL_RETURNS` is a 35-entry, hand-curated approximation of India fiscal-year (Apr 1 – Mar 31) equity, debt, and inflation returns from FY1990-91 through FY2024-25. It exists to drive sequence-of-returns backtesting, not to report audited performance. Every consumer must carry the planning-grade disclaimer forward.

## 1. Shape

```js
{ fy: "1990-91", equityNominalPct: 61.4, debtNominalPct: 12.5, inflationPct: 10.3 }
```

- `fy`: fiscal year label, `"YYYY-YY"` (e.g. `"1999-00"`, `"2000-01"`), sequential and unique.
- `equityNominalPct`: approximate nominal total return for the fiscal year, rounded to 1 decimal place.
- `debtNominalPct`: approximate nominal total-return proxy for the fiscal year, rounded to 1 decimal place.
- `inflationPct`: approximate annual average CPI inflation for the fiscal year, rounded to 1 decimal place.

`DATASET_META` exposes `{ id, firstFy, lastFy, count, sources }` for provenance display and cache-busting (`id: "india-fy-annual-v1"`).

## 2. Derivation Method

| Column | Method |
|--------|--------|
| `equityNominalPct` | BSE Sensex fiscal-year price return, plus a flat 1.4 percentage-point dividend-yield add-on, approximating a total-return index. Sensex TRI was only published retroactively for part of this window, so the add-on is a constant approximation rather than a measured yield series. |
| `debtNominalPct` | A 10-year Government of India security annualized total-return proxy: the prevailing benchmark yield, smoothed with an estimated duration-driven price effect from year-over-year yield moves, blended toward a 1–3 year fixed-deposit-equivalent floor in years where G-sec yield data is thin. This reads as a "safe accrual" proxy, not a literal single-bond mark-to-market. |
| `inflationPct` | CPI-Industrial Workers (CPI-IW) annual average (fiscal-year basis) through FY2010-11, spliced to CPI-Combined (base 2012=100) annual average (fiscal-year basis) from FY2011-12 onward. The splice point is a direct join with no gap-filling or rebasing. |

## 3. Sources

- BSE historical indices archive (bseindia.com) — Sensex fiscal-year closing levels.
- RBI Handbook of Statistics on the Indian Economy — 10-year G-sec yield series.
- MOSPI CPI releases — CPI-IW and CPI-Combined annual averages.

These are named sources for the derivation method above, not machine-verified citations pinned to specific table rows. Treat every value as an approximation anchored to well-known market events (e.g. the FY1991-92 Harshad Mehta boom, the FY2008-09 global financial crisis, the FY2020-21 COVID recovery), not as audited financial data.

## 4. Known Limitations

- **Not audited data.** Figures are planning-grade approximations for sequence-risk illustration. Do not surface them as performance reporting, and do not let any export or UI copy imply CA-reviewed precision.
- **Survivorship-free but index-level.** The Sensex constituent index itself has changed composition over 35 years; this dataset does not attempt to reconstruct a fixed constituent basket, so it inherits ordinary index reconstitution effects.
- **Dividend approximation.** The 1.4 percentage-point equity dividend-yield add-on is a constant, not a per-year measured yield. Real dividend yields varied (roughly 1–2% across the window); treat total-return figures as directionally right, not exact.
- **Debt is a proxy, not a tradable instrument return.** No single 10-year G-sec is held for 35 years; the yield-plus-duration-effect approach approximates a constant-maturity roll strategy.
- **Fiscal-year alignment.** All three series are aligned to the Apr 1 – Mar 31 Indian fiscal year. Any consumer mixing this dataset with calendar-year data must convert first.
- **CPI splicing.** The CPI-IW → CPI-Combined splice at FY2010-11/FY2011-12 is a direct join. It is a reasonable approximation for planning purposes but is not a rebased, continuously-linked series.

## 5. Update Procedure For Future Fiscal Years

1. Confirm the fiscal year has closed (Mar 31) and provisional BSE/RBI/MOSPI figures are available.
2. Compute `equityNominalPct` as Sensex fiscal-year price return + 1.4, rounded to 1 decimal.
3. Compute `debtNominalPct` as the prevailing 10-year G-sec yield smoothed for the year's yield move, rounded to 1 decimal.
4. Compute `inflationPct` as the CPI-Combined fiscal-year annual average, rounded to 1 decimal.
5. Append a new entry to `INDIA_ANNUAL_RETURNS` (do not reorder or edit historical entries), update `DATASET_META.lastFy` and `DATASET_META.count`, and bump `DATASET_META.id` only if the derivation method itself changes (not for a routine year append).
6. Re-run `tests/india-annual-returns.test.mjs` — the full-window CAGR/mean range assertions must still pass. If a new year pushes an aggregate outside its documented range, treat that as a signal to re-examine the new entry's derivation before touching the test thresholds.
7. Update this doc's revision history and, if F4's consuming engine (`calculateHistoricalBacktest` in `src/model.js`) changes cohort math because of the new data point, cross-check `docs/developer/model-contract.md`.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.0 | 1 | 2026-07-06 | Added historical dataset contract for `src/data/india-annual-returns.js` (fin-8fb.6). |
