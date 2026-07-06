// fin-8fb.6 — Historical Backtest Lab dataset.
//
// India fiscal-year (Apr 1 – Mar 31) annual return series, FY1990-91 through
// FY2024-25 (35 entries), for equity, debt, and inflation.
//
// SOURCES
// - Equity (equityNominalPct): BSE Sensex historical fiscal-year closing
//   levels (bseindia.com historical indices archive).
// - Debt (debtNominalPct): RBI Handbook of Statistics on Indian Economy —
//   10-year Government of India security yield series.
// - Inflation (inflationPct): MOSPI CPI releases — CPI-Industrial Workers
//   (CPI-IW) annual averages pre-2011-12, spliced to CPI-Combined (base
//   2012=100) annual averages from FY2012-13 onward.
//
// APPROXIMATION METHOD
// - equityNominalPct = BSE Sensex fiscal-year price return + a flat 1.4
//   percentage-point dividend-yield add-on, approximating a total-return
//   index (Sensex TRI was only published retroactively for the full window).
//   Rounded to 1 decimal place.
// - debtNominalPct = a 10-year G-sec annualized total-return proxy: the
//   prevailing benchmark yield smoothed with an estimated duration-driven
//   price effect from year-over-year yield moves (rough constant-duration
//   roll return). Rounded to 1 decimal place. This is blended toward a
//   1-3 year FD-equivalent floor in years where G-sec yield data is thin,
//   so figures read as a "safe accrual" total-return proxy rather than a
//   literal single-bond mark-to-market.
// - inflationPct = CPI-IW annual average (FY basis) through FY2010-11,
//   CPI-Combined annual average (FY basis) from FY2011-12 onward, spliced
//   at the base-year transition without gap-filling.
//
// DISCLAIMER
// Approximate fiscal-year figures for sequence-risk illustration; not
// audited financial data; do not use for performance reporting.
//
// See docs/developer/historical-dataset.md for the full derivation write-up,
// known limitations, and the update procedure for future fiscal years.

export const INDIA_ANNUAL_RETURNS = [
  { fy: "1990-91", equityNominalPct: 61.4, debtNominalPct: 12.5, inflationPct: 10.3 },
  { fy: "1991-92", equityNominalPct: 266.4, debtNominalPct: 13.0, inflationPct: 13.5 },
  { fy: "1992-93", equityNominalPct: -44.6, debtNominalPct: 13.5, inflationPct: 11.8 },
  { fy: "1993-94", equityNominalPct: 67.4, debtNominalPct: 12.8, inflationPct: 7.5 },
  { fy: "1994-95", equityNominalPct: -12.6, debtNominalPct: 12.0, inflationPct: 10.2 },
  { fy: "1995-96", equityNominalPct: 4.4, debtNominalPct: 13.2, inflationPct: 10.0 },
  { fy: "1996-97", equityNominalPct: 1.2, debtNominalPct: 13.8, inflationPct: 9.0 },
  { fy: "1997-98", equityNominalPct: 17.3, debtNominalPct: 12.5, inflationPct: 7.2 },
  { fy: "1998-99", equityNominalPct: -2.5, debtNominalPct: 11.8, inflationPct: 13.2 },
  { fy: "1999-00", equityNominalPct: 35.1, debtNominalPct: 11.5, inflationPct: 4.8 },
  { fy: "2000-01", equityNominalPct: -26.5, debtNominalPct: 10.8, inflationPct: 4.0 },
  { fy: "2001-02", equityNominalPct: -2.3, debtNominalPct: 10.5, inflationPct: 3.8 },
  { fy: "2002-03", equityNominalPct: -10.7, debtNominalPct: 9.8, inflationPct: 4.3 },
  { fy: "2003-04", equityNominalPct: 84.8, debtNominalPct: 8.5, inflationPct: 3.9 },
  { fy: "2004-05", equityNominalPct: 17.5, debtNominalPct: 6.5, inflationPct: 5.0 },
  { fy: "2005-06", equityNominalPct: 75.1, debtNominalPct: 7.2, inflationPct: 5.4 },
  { fy: "2006-07", equityNominalPct: 17.3, debtNominalPct: 7.8, inflationPct: 6.7 },
  { fy: "2007-08", equityNominalPct: 21.1, debtNominalPct: 8.2, inflationPct: 6.2 },
  { fy: "2008-09", equityNominalPct: -36.5, debtNominalPct: 7.5, inflationPct: 8.0 },
  { fy: "2009-10", equityNominalPct: 81.9, debtNominalPct: 6.8, inflationPct: 12.3 },
  { fy: "2010-11", equityNominalPct: 12.3, debtNominalPct: 7.5, inflationPct: 9.5 },
  { fy: "2011-12", equityNominalPct: -9.1, debtNominalPct: 8.5, inflationPct: 8.9 },
  { fy: "2012-13", equityNominalPct: 9.6, debtNominalPct: 8.8, inflationPct: 9.4 },
  { fy: "2013-14", equityNominalPct: 20.3, debtNominalPct: 8.2, inflationPct: 9.5 },
  { fy: "2014-15", equityNominalPct: 26.3, debtNominalPct: 8.8, inflationPct: 6.0 },
  { fy: "2015-16", equityNominalPct: -8.0, debtNominalPct: 7.9, inflationPct: 4.9 },
  { fy: "2016-17", equityNominalPct: 18.3, debtNominalPct: 7.2, inflationPct: 4.5 },
  { fy: "2017-18", equityNominalPct: 12.7, debtNominalPct: 6.8, inflationPct: 3.6 },
  { fy: "2018-19", equityNominalPct: 18.7, debtNominalPct: 7.5, inflationPct: 3.4 },
  { fy: "2019-20", equityNominalPct: -22.4, debtNominalPct: 7.2, inflationPct: 4.8 },
  { fy: "2020-21", equityNominalPct: 69.4, debtNominalPct: 5.5, inflationPct: 6.2 },
  { fy: "2021-22", equityNominalPct: 19.7, debtNominalPct: 4.8, inflationPct: 5.5 },
  { fy: "2022-23", equityNominalPct: 2.1, debtNominalPct: 6.5, inflationPct: 6.7 },
  { fy: "2023-24", equityNominalPct: 26.2, debtNominalPct: 7.2, inflationPct: 5.4 },
  { fy: "2024-25", equityNominalPct: 5.9, debtNominalPct: 7.0, inflationPct: 4.6 }
];

export const DATASET_META = {
  id: "india-fy-annual-v1",
  firstFy: INDIA_ANNUAL_RETURNS[0].fy,
  lastFy: INDIA_ANNUAL_RETURNS[INDIA_ANNUAL_RETURNS.length - 1].fy,
  count: INDIA_ANNUAL_RETURNS.length,
  sources: [
    "BSE historical indices (bseindia.com)",
    "RBI Handbook of Statistics on Indian Economy",
    "MOSPI CPI releases (CPI-IW spliced to CPI-Combined)"
  ]
};
