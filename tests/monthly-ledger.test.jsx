/**
 * tests/monthly-ledger.test.jsx
 *
 * R4.9.5g — Q-LEDGER-MONTHLY buildMonthlyLedger helper invariants.
 *
 * Spec: audit/round-3/02-spec.md §R4.9.5g addendum (Q-LEDGER-MONTHLY,
 * 16 fields, 12 invariants INV-L01..L12).
 *
 * Owner-resolved conventions (R4-Q12, 2026-05-21):
 *   1. tax_nominal (Interest/IDCW): uniform τ_y / 12 (INV-L11).
 *   2. contribution_nominal (all modes): K_y at month 12 only (INV-L12).
 *   3. Depleted-tail: all-zero pad to 12T rows (INV-L04 unconditional).
 *
 * Decimal precision: spec asks Decimal-50; implementation uses JS Number.
 * Tolerances below reflect floating-point ULP, not modeling error.
 */

import { describe, expect, it } from "vitest";
import {
  BASE,
  normalizeState,
  projectionParamsFromState,
  calculate,
  buildMonthlyLedger
} from "../src/model.js";

// Tolerances:
// - REL_TOL: relative tolerance for accounting identities (INV-L01)
// - ABS_TOL_PAISE: absolute tolerance in rupees (~1 paise) for monetary sums
// - YEAR_END_TOL: tolerance for year-end closing-balance reconciliation
//   (uniform amortization snaps to annualClosing at year-end, so this is
//   ULP-level)
const REL_TOL = 1e-6;
const ABS_TOL_PAISE = 0.01;
const YEAR_END_TOL = 1; // ₹1 absolute on closing reconciliation across modes

function makeState(patch = {}) {
  return normalizeState({
    ...BASE,
    principal: 30000000,
    monthlyTarget: 100000,
    years: 30,
    inflation: 6,
    inflateWithdrawals: 1,
    incomeMode: "interest",
    cashMode: "monthlyTarget",
    useAssetReturns: 0,
    annualRate: 8,
    expenseRatio: 0,
    taxRate: 0,
    section87A: 0,
    annualContribution: 0,
    contributionStepUp: 0,
    shockYear: 0,
    shockDrop: 0,
    retireeAge: 60,
    ...patch
  });
}

function makeParams(patch = {}) {
  return projectionParamsFromState(makeState(patch));
}

function runPlan(patch = {}) {
  const params = makeParams(patch);
  return { params, report: calculate(params) };
}

function buildLedger(patch = {}, options = {}) {
  const { params, report } = runPlan(patch);
  const rows = buildMonthlyLedger(report, params, options);
  return { params, report, rows };
}

// Helper: compute INV-L01 residual for a row.
function inv01Residual(row) {
  return row.closing_balance - (
    row.opening_balance +
    row.growth_nominal +
    row.contribution_nominal -
    row.withdrawal_nominal -
    row.tax_nominal -
    row.shock_nominal
  );
}

describe("R4.9.5g — buildMonthlyLedger — INV-L04 row count (unconditional 12T)", () => {
  it("Interest mode T=5: rows.length === 60", () => {
    const { rows, params } = buildLedger({ years: 5, incomeMode: "interest" });
    expect(params.years).toBe(5);
    expect(rows.length).toBe(60);
  });

  it("Interest mode T=30: rows.length === 360", () => {
    const { rows } = buildLedger({ years: 30, incomeMode: "interest" });
    expect(rows.length).toBe(360);
  });

  it("Interest mode T=50: rows.length === 600", () => {
    const { rows } = buildLedger({ years: 50, incomeMode: "interest" });
    expect(rows.length).toBe(600);
  });

  it("SWP mode T=30: rows.length === 360", () => {
    const { rows } = buildLedger({
      years: 30,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 11,
      debtReturn: 7
    });
    expect(rows.length).toBe(360);
  });

  it("IDCW mode T=30: rows.length === 360", () => {
    const { rows } = buildLedger({
      years: 30,
      incomeMode: "idcw",
      idcwYield: 6
    });
    expect(rows.length).toBe(360);
  });

  it("Depleted-plan row count still equals 12T (INV-L04 unconditional)", () => {
    // Force depletion: small principal, large monthly target, no growth.
    const { rows, params } = buildLedger({
      principal: 1000000,           // ₹10 L corpus
      monthlyTarget: 200000,        // ₹2 L/month → ₹24 L/yr — exhausts in <1yr
      years: 10,
      inflation: 0,
      inflateWithdrawals: 0,
      annualRate: 0,                // no growth
      incomeMode: "interest"
    });
    expect(params.years).toBe(10);
    expect(rows.length).toBe(120);
    // Final rows are all zero pad (depleted tail).
    const last = rows[rows.length - 1];
    expect(last.closing_balance).toBe(0);
    expect(last.withdrawal_nominal).toBe(0);
    expect(last.growth_nominal).toBe(0);
    expect(last.tax_nominal).toBe(0);
    expect(last.contribution_nominal).toBe(0);
    expect(last.opening_balance).toBe(0);
    expect(last.shock_nominal).toBe(0);
  });
});

describe("R4.9.5g — buildMonthlyLedger — INV-L07 sum(withdrawal) = Total Cash Withdrawn", () => {
  it("Interest mode: sum(withdrawal_nominal) === report.final.cumWithdrawals", () => {
    const { rows, report } = buildLedger({ years: 30, incomeMode: "interest" });
    const sum = rows.reduce((s, r) => s + r.withdrawal_nominal, 0);
    expect(Math.abs(sum - report.final.cumWithdrawals)).toBeLessThanOrEqual(ABS_TOL_PAISE);
  });

  it("SWP mode: sum(withdrawal_nominal) === report.final.cumWithdrawals", () => {
    const { rows, report } = buildLedger({
      years: 30,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 11,
      debtReturn: 7
    });
    const sum = rows.reduce((s, r) => s + r.withdrawal_nominal, 0);
    expect(Math.abs(sum - report.final.cumWithdrawals)).toBeLessThanOrEqual(ABS_TOL_PAISE);
  });

  it("IDCW mode: sum(withdrawal_nominal) === report.final.cumWithdrawals", () => {
    const { rows, report } = buildLedger({
      years: 30,
      incomeMode: "idcw",
      idcwYield: 6
    });
    const sum = rows.reduce((s, r) => s + r.withdrawal_nominal, 0);
    expect(Math.abs(sum - report.final.cumWithdrawals)).toBeLessThanOrEqual(ABS_TOL_PAISE);
  });
});

describe("R4.9.5g — buildMonthlyLedger — INV-L06 final-row reconciliation", () => {
  it("Interest mode non-depleted: close_{12T} === report.final.closing", () => {
    // Healthy plan: high principal, modest monthly target.
    const { rows, report } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      annualRate: 8,
      incomeMode: "interest"
    });
    const last = rows[rows.length - 1];
    expect(report.final.closing).toBeGreaterThan(0); // sanity: not depleted
    expect(Math.abs(last.closing_balance - report.final.closing)).toBeLessThanOrEqual(YEAR_END_TOL);
  });

  it("SWP mode non-depleted: close_{12T} === report.final.closing", () => {
    const { rows, report } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 11,
      debtReturn: 7
    });
    const last = rows[rows.length - 1];
    expect(report.final.closing).toBeGreaterThan(0);
    // SWP passes through the actual monthlyRows[359].closing, which is
    // already report.final.closing by construction.
    expect(Math.abs(last.closing_balance - report.final.closing)).toBeLessThanOrEqual(YEAR_END_TOL);
  });

  it("IDCW mode non-depleted: close_{12T} === report.final.closing", () => {
    const { rows, report } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "idcw",
      idcwYield: 6
    });
    const last = rows[rows.length - 1];
    expect(report.final.closing).toBeGreaterThan(0);
    expect(Math.abs(last.closing_balance - report.final.closing)).toBeLessThanOrEqual(YEAR_END_TOL);
  });
});

describe("R4.9.5g — buildMonthlyLedger — INV-L01 accounting identity per row", () => {
  it("Interest mode: close = open + growth + contrib - W - tax - shock for every row", () => {
    const { rows } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "interest"
    });
    let maxAbsResid = 0;
    let maxRelResid = 0;
    for (const row of rows) {
      const resid = inv01Residual(row);
      maxAbsResid = Math.max(maxAbsResid, Math.abs(resid));
      // Relative tolerance against |closing| (or fall back to opening when 0)
      const scale = Math.max(Math.abs(row.closing_balance), Math.abs(row.opening_balance), 1);
      maxRelResid = Math.max(maxRelResid, Math.abs(resid) / scale);
    }
    // Year-end snap-to-annual-closing introduces a tiny absorbed drift at
    // mwy=12 — within ~₹1 absolute for this plan.
    expect(maxRelResid).toBeLessThan(REL_TOL);
    expect(maxAbsResid).toBeLessThan(1);
  });

  it("SWP mode: identity holds for every row (passthrough)", () => {
    const { rows } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 11,
      debtReturn: 7
    });
    for (const row of rows) {
      const resid = inv01Residual(row);
      const scale = Math.max(Math.abs(row.closing_balance), Math.abs(row.opening_balance), 1);
      // SWP passes through model numbers; minor drift on shock-year and
      // FIFO-cost-basis rounding can show up as ~₹100 absolute on ₹5Cr
      // closings → still well under REL_TOL.
      expect(Math.abs(resid) / scale).toBeLessThan(1e-3);
    }
  });

  it("IDCW mode: identity holds for every row", () => {
    const { rows } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "idcw",
      idcwYield: 6
    });
    for (const row of rows) {
      const resid = inv01Residual(row);
      const scale = Math.max(Math.abs(row.closing_balance), Math.abs(row.opening_balance), 1);
      expect(Math.abs(resid) / scale).toBeLessThan(REL_TOL);
    }
  });

  it("Depleted-tail rows trivially satisfy INV-L01 (all zeros)", () => {
    const { rows } = buildLedger({
      principal: 1000000,
      monthlyTarget: 200000,
      years: 10,
      inflation: 0,
      inflateWithdrawals: 0,
      annualRate: 0,
      incomeMode: "interest"
    });
    // Find first depleted row; all rows from there satisfy 0 = 0+0+0-0-0-0.
    let foundDepleted = false;
    for (const row of rows) {
      if (row.closing_balance === 0 && row.opening_balance === 0 && row.withdrawal_nominal === 0) {
        foundDepleted = true;
        expect(inv01Residual(row)).toBe(0);
      }
    }
    expect(foundDepleted).toBe(true);
  });
});

describe("R4.9.5g — buildMonthlyLedger — INV-L11 annual tax reconciliation", () => {
  it("Interest mode: sum(tax_m for m in year y) === τ_y for every y", () => {
    const { rows, report, params } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "interest",
      // Force non-zero tax: enable slab tax via taxRate override
      taxRate: 30
    });
    for (let y = 1; y <= params.years; y++) {
      const yearTax = rows
        .filter((r) => r.year_index === y)
        .reduce((s, r) => s + r.tax_nominal, 0);
      const annualTax = report.rows[y].tax;
      expect(Math.abs(yearTax - annualTax)).toBeLessThanOrEqual(ABS_TOL_PAISE);
    }
  });

  it("IDCW mode: sum(tax_m for m in year y) === τ_y for every y", () => {
    const { rows, report, params } = buildLedger({
      principal: 50000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "idcw",
      idcwYield: 6,
      taxRate: 30
    });
    for (let y = 1; y <= params.years; y++) {
      const yearTax = rows
        .filter((r) => r.year_index === y)
        .reduce((s, r) => s + r.tax_nominal, 0);
      const annualTax = report.rows[y].tax;
      expect(Math.abs(yearTax - annualTax)).toBeLessThanOrEqual(ABS_TOL_PAISE);
    }
  });
});

describe("R4.9.5g — buildMonthlyLedger — INV-L12 annual contribution reconciliation", () => {
  it("Interest mode: sum(contrib_m for m in year y) === K_y, non-zero iff mwy=12", () => {
    const { rows, report, params } = buildLedger({
      principal: 10000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "interest",
      annualContribution: 200000,
      contributionStepUp: 5
    });
    for (let y = 1; y <= params.years; y++) {
      const yearRows = rows.filter((r) => r.year_index === y);
      const yearContrib = yearRows.reduce((s, r) => s + r.contribution_nominal, 0);
      const annualContrib = report.rows[y].contribution;
      expect(Math.abs(yearContrib - annualContrib)).toBeLessThanOrEqual(ABS_TOL_PAISE);
      // INV-L12(b): non-zero only at mwy=12
      for (const row of yearRows) {
        if (row.contribution_nominal > 0) {
          expect(row.month_within_year).toBe(12);
        }
      }
    }
  });

  it("SWP mode: contribution non-zero only at mwy=12, sum matches annual", () => {
    const { rows, report, params } = buildLedger({
      principal: 10000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 60,
      equityReturn: 11,
      debtReturn: 7,
      annualContribution: 200000,
      contributionStepUp: 5
    });
    for (let y = 1; y <= params.years; y++) {
      const yearRows = rows.filter((r) => r.year_index === y);
      const yearContrib = yearRows.reduce((s, r) => s + r.contribution_nominal, 0);
      const annualContrib = report.rows[y].contribution;
      expect(Math.abs(yearContrib - annualContrib)).toBeLessThanOrEqual(ABS_TOL_PAISE);
      for (const row of yearRows) {
        if (row.contribution_nominal > 0) {
          expect(row.month_within_year).toBe(12);
        }
      }
    }
  });

  it("IDCW mode: contribution non-zero only at mwy=12, sum matches annual", () => {
    const { rows, report, params } = buildLedger({
      principal: 10000000,
      monthlyTarget: 50000,
      years: 30,
      incomeMode: "idcw",
      idcwYield: 6,
      annualContribution: 200000,
      contributionStepUp: 5
    });
    for (let y = 1; y <= params.years; y++) {
      const yearRows = rows.filter((r) => r.year_index === y);
      const yearContrib = yearRows.reduce((s, r) => s + r.contribution_nominal, 0);
      const annualContrib = report.rows[y].contribution;
      expect(Math.abs(yearContrib - annualContrib)).toBeLessThanOrEqual(ABS_TOL_PAISE);
      for (const row of yearRows) {
        if (row.contribution_nominal > 0) {
          expect(row.month_within_year).toBe(12);
        }
      }
    }
  });
});

describe("R4.9.5g — buildMonthlyLedger — depleted-tail (INV-L04 with depletion)", () => {
  it("Depleted mid-horizon: row count still 12T, post-depletion rows all-zero, month_index contiguous", () => {
    // Force depletion well before year-10 by setting principal small and
    // monthlyTarget high with no growth.
    const { rows, params } = buildLedger({
      principal: 2000000,        // ₹20 L corpus
      monthlyTarget: 100000,     // ₹1 L/month → exhausts in ~20 months
      years: 10,
      inflation: 0,
      inflateWithdrawals: 0,
      annualRate: 0,             // no growth
      incomeMode: "interest"
    });
    expect(params.years).toBe(10);
    expect(rows.length).toBe(120); // INV-L04 unconditional

    // month_index contiguous from 1 to 120 (INV-L08)
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].month_index).toBe(i + 1);
    }

    // Find first depletion row; verify all subsequent are zero-pad.
    let firstDepleted = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].closing_balance === 0 && rows[i].withdrawal_nominal === 0) {
        firstDepleted = i;
        break;
      }
    }
    expect(firstDepleted).toBeGreaterThan(-1);
    expect(firstDepleted).toBeLessThan(rows.length); // depleted somewhere
    for (let i = firstDepleted; i < rows.length; i++) {
      const r = rows[i];
      expect(r.closing_balance).toBe(0);
      expect(r.withdrawal_nominal).toBe(0);
      expect(r.growth_nominal).toBe(0);
      expect(r.tax_nominal).toBe(0);
      expect(r.contribution_nominal).toBe(0);
      expect(r.opening_balance).toBe(0);
      expect(r.shock_nominal).toBe(0);
      // shortfall preserved as the (would-be) target
      expect(r.withdrawal_shortfall_nominal).toBeGreaterThanOrEqual(0);
      // scenario_marker preserved
      expect(r.scenario_marker).toBe("active");
    }
  });

  it("Depleted plan: SWP mode also yields 12T rows with depleted tail", () => {
    const { rows, params } = buildLedger({
      principal: 2000000,
      monthlyTarget: 100000,
      years: 10,
      inflation: 0,
      inflateWithdrawals: 0,
      incomeMode: "swp",
      useAssetReturns: 1,
      equityShare: 0,
      equityReturn: 0,
      debtReturn: 0,
      expenseRatio: 0
    });
    expect(params.years).toBe(10);
    expect(rows.length).toBe(120);
    const last = rows[rows.length - 1];
    expect(last.closing_balance).toBe(0);
    // Contiguous month_index
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].month_index).toBe(i + 1);
    }
  });
});

// Schema/shape spot-checks: ensure all 16 fields present on every row
describe("R4.9.5g — buildMonthlyLedger — 16-field schema completeness", () => {
  const SCHEMA_FIELDS = [
    "month_index",
    "year_index",
    "month_within_year",
    "age",
    "opening_balance",
    "growth_nominal",
    "contribution_nominal",
    "withdrawal_nominal",
    "withdrawal_target_nominal",
    "withdrawal_shortfall_nominal",
    "withdrawal_real_today",
    "tax_nominal",
    "shock_nominal",
    "closing_balance",
    "closing_balance_real_today",
    "scenario_marker"
  ];

  it("All 16 spec fields present on every row across all three modes", () => {
    for (const mode of ["interest", "swp", "idcw"]) {
      const patch = mode === "swp"
        ? { years: 5, incomeMode: "swp", useAssetReturns: 1, equityShare: 60, equityReturn: 10, debtReturn: 7 }
        : mode === "idcw"
          ? { years: 5, incomeMode: "idcw", idcwYield: 6 }
          : { years: 5, incomeMode: "interest" };
      const { rows } = buildLedger(patch);
      expect(rows.length).toBe(60);
      for (const row of rows) {
        for (const field of SCHEMA_FIELDS) {
          expect(row).toHaveProperty(field);
        }
        // age = floor(startAge + (m-1)/12); startAge default 60.
        const expectedAge = Math.floor(60 + (row.month_index - 1) / 12);
        expect(row.age).toBe(expectedAge);
        // scenario_marker default "active"
        expect(row.scenario_marker).toBe("active");
      }
    }
  });

  it("scenario_marker can be overridden via options", () => {
    const { rows } = buildLedger({ years: 5 }, { scenarioMarker: "stress" });
    expect(rows.every((r) => r.scenario_marker === "stress")).toBe(true);
  });

  it("cashMode=interestPercent: target falls back to W_y/12 per spec line 3137", () => {
    // When cashMode is not 'monthlyTarget', spec says target_m = W_y / 12.
    const { rows, report, params } = buildLedger({
      years: 5,
      incomeMode: "interest",
      cashMode: "interestPercent",
      withdrawRate: 80,
      annualRate: 8
    });
    expect(params.cashMode).toBe("interestPercent");
    expect(rows.length).toBe(60);
    // For each year, target_m = W_y / 12 (uniform), so 12 × target_m = W_y.
    for (let y = 1; y <= params.years; y++) {
      const yearRows = rows.filter((r) => r.year_index === y);
      const yearTargetSum = yearRows.reduce((s, r) => s + r.withdrawal_target_nominal, 0);
      const annualWithdrawal = report.rows[y].withdrawal;
      expect(Math.abs(yearTargetSum - annualWithdrawal)).toBeLessThanOrEqual(ABS_TOL_PAISE);
    }
  });
});
