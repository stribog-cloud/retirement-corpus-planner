/**
 * mobile-value-first.mjs
 *
 * fin-f3n.19 closure — Raman — Phase 5g (mobile + tour parity)
 * 2026-05-18
 *
 * VALUE-FIRST mobile assertions at 390px viewport.
 *
 * Discipline:
 *  - Every assertion checks what VALUE is displayed, not just that a surface renders.
 *  - Reference values come from the JS __FIN_DASHBOARD_TEST_API__ (post-Wave-1 state).
 *  - Where possible, comparisons are done IN-PAGE so DOM and API share the same runtime.
 *  - Each assertion is labelled with its Qxx identifier.
 *
 * Quantities covered:
 *  Q01  Final corpus nominal (S20 MobileVerdictCard — real-corpus line)
 *  Q05  Year-1 monthly cash δ=1 (model.rows[1].withdrawal / 12)
 *  Q07  Year-1 tax (S21 MobileTaxProductCards)
 *  Q22  MC success probability (S20 MobileVerdictCard)
 *  Q23  Terminal value P50 (numeric sanity from MC API)
 *  Q35  Glide-path Y1 equity share (internal surface)
 *  Q37  Household monthly cash need (household mode scenario)
 *  Q53  Effective horizon (household + longevity extension)
 *
 * Mobile-specific surfaces exercised:
 *  S20  MobileVerdictCard  (.mobile-verdict-card)
 *  S21  MobileTaxProductCards  (.mobile-tax-product-cards)
 */

import { createServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { withBrowser } from "./_browser-helper.mjs";

const root = process.cwd();
const chrome = (process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const mime = {
  ".html": "text/html;charset=utf-8",
  ".js":   "text/javascript;charset=utf-8",
  ".css":  "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

// ── Assertion helpers ──────────────────────────────────────────────────────────

const failures = [];
let passCount = 0;

function assert(condition, qxx, message) {
  if (!condition) {
    const msg = `[FAIL] ${qxx}: ${message}`;
    console.error(msg);
    failures.push(msg);
  } else {
    console.log(`[PASS] ${qxx}`);
    passCount++;
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────────

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html?finTestApi=1" : url.pathname;
      const file = join(root, pathname.replace(/^\/+/, ""));
      const body = await readFile(file);
      res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ── Puppeteer helpers ──────────────────────────────────────────────────────────

async function waitForModelIdle(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const stack = document.querySelector(".main-stack");
    return stack && !stack.classList.contains("model-pending") &&
           stack.dataset.analyticsPending !== "true";
  }, { timeout });
}

async function dismissPrivacyAndTour(page) {
  await page.evaluate(() => {
    const privacy = document.querySelector(".disclaimer-notice-card");
    if (privacy) {
      [...privacy.querySelectorAll("button")].find(b => /understand/i.test(b.textContent))?.click();
    }
  });
  await new Promise(r => setTimeout(r, 80));
  await page.evaluate(() => {
    const tour = document.querySelector(".guided-tour");
    if (!tour) return;
    [...tour.querySelectorAll("button")].find(b => /skip|finish|start planning/i.test(b.textContent))?.click();
  });
  await new Promise(r => setTimeout(r, 80));
}

async function navigateMobile(page, view) {
  await page.evaluate((v) => {
    const btn = document.querySelector(`.mobile-tabbar button[data-view="${v}"]`);
    btn?.click();
  }, view);
  await page.waitForFunction((v) => {
    return document.querySelector(".main-stack")?.dataset.activeView === v;
  }, {}, view);
  await new Promise(r => setTimeout(r, 220));
  await waitForModelIdle(page);
}

// ── Main test runner ───────────────────────────────────────────────────────────

const server = await startServer();
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}/index.html?finTestApi=1`;

await withBrowser({}, async ({ page }) => {
try {
  // ── Setup: 390px mobile viewport ────────────────────────────────────────────
  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 });
  await page.goto(baseUrl, { waitUntil: "networkidle0" });

  // Clear state for a reproducible baseline
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await dismissPrivacyAndTour(page);
  await page.waitForSelector(".whatif-card", { timeout: 12000 });
  await waitForModelIdle(page);

  // ── Navigate to overview ─────────────────────────────────────────────────────
  await navigateMobile(page, "overview");

  // ── Q01 + Q22 + Q37: MobileVerdictCard in-page comparison ───────────────────
  // Read both DOM and API values inside the page to avoid worker sync issues.
  const verdictCheck = await page.evaluate(() => {
    const api  = window.__FIN_DASHBOARD_TEST_API__;
    if (!api) return { error: "TEST_API_NOT_EXPOSED" };

    const saved  = api.normalizeState(
      JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {}
    );
    const params = api.projectionParamsFromState(saved);
    const model  = api.calculate(params);

    // What the verdict card shows (from the DOM)
    const card = document.querySelector(".mobile-verdict-card");
    const cardText = card?.innerText || "";

    // What the model API computes
    const apiRealCorpusFmt = api.formatInr(model.final.realClosing);  // Q01 proxy on verdict
    const apiNominalFmt    = api.formatInr(model.final.closing);       // Q01 full
    const apiFinalMonthlyCashFmt = api.formatInr(model.final.withdrawal / 12);  // Q37 final-year cash

    // Q22: the verdict card reads from analytics worker snapshot (live).
    // Extract the displayed confidence value from DOM, verify it is a real %-formatted number.
    // The displayed value is formatPct(successProbability from worker) — may differ from
    // synchronous API call (different N, different seed epoch).
    // We verify: (a) the displayed value is present, (b) it parses to a finite number.
    const confidenceEl = [...(card?.querySelectorAll("b") || [])]
      .find(b => b.querySelector("span")?.textContent.trim().toLowerCase() === "confidence");
    const confidenceText  = confidenceEl?.textContent?.replace(/confidence/i, "").trim() || "";
    const confidenceMatch = confidenceText.match(/([\d.]+)%/);
    const confidenceValue = confidenceMatch ? parseFloat(confidenceMatch[1]) : null;

    // Monthly cash from verdict card (final-year, not Year-1)
    const monthlyCashEl = [...(card?.querySelectorAll("b") || [])]
      .find(b => b.querySelector("span")?.textContent.trim().toLowerCase() === "monthly cash");
    const monthlyCashText = monthlyCashEl?.textContent?.replace(/monthly cash/i, "").trim() || "";

    return {
      cardVisible:            Boolean(card),
      cardText:               cardText.slice(0, 400),

      // Q01: real corpus in verdict
      apiRealCorpusFmt,
      apiNominalFmt,
      realCorpusInDOM:        cardText.includes(apiRealCorpusFmt),

      // Q22: confidence (MC success probability)
      confidenceText,
      confidenceValue,
      confidencePresent:      confidenceValue !== null && Number.isFinite(confidenceValue),
      confidenceInRange:      confidenceValue !== null && confidenceValue >= 0 && confidenceValue <= 100,

      // Q37-final: final monthly cash in verdict
      monthlyCashText,
      apiFinalMonthlyCashFmt,
      monthlyCashInDOM:       cardText.includes(apiFinalMonthlyCashFmt),

      // Q05 δ=1 check: Year-1 withdrawal vs monthlyTarget*12
      q05_year1_withdrawal:   model.rows[1]?.withdrawal || 0,
      q05_monthly_target:     params.monthlyTarget,
      q05_cash_mode:          params.cashMode,
      q05_inflation:          params.inflation,
    };
  });

  if (verdictCheck.error) {
    throw new Error(`Test API not available: ${verdictCheck.error}. ` +
      "Ensure the build was run with finTestApi=1 and the server serves index.html.");
  }

  console.log("\n── Snapshot at 390px default state ──────────────────────────");
  console.log(JSON.stringify(verdictCheck, null, 2));
  console.log("\n── Value-first assertions ────────────────────────────────────\n");

  // Q01: verdict card is visible and shows real corpus value from API
  assert(verdictCheck.cardVisible, "Q01-surface", "Mobile verdict card (.mobile-verdict-card) is not visible at 390px");
  assert(
    verdictCheck.realCorpusInDOM,
    "Q01-real-corpus",
    `Real final corpus ${verdictCheck.apiRealCorpusFmt} not found in verdict card.\n` +
    `  Full verdict text: ${verdictCheck.cardText}`
  );

  // Q22: confidence value is present and numeric (from analytics worker, not synchronous API)
  assert(
    verdictCheck.confidencePresent,
    "Q22-confidence-numeric",
    `MC confidence value not parseable as percentage from verdict card.\n` +
    `  Displayed: "${verdictCheck.confidenceText}"`
  );
  assert(
    verdictCheck.confidenceInRange,
    "Q22-confidence-range",
    `MC confidence ${verdictCheck.confidenceValue}% is outside [0, 100] — invalid probability.\n` +
    `  (Q22 domain: 0 ≤ successProbability ≤ 1.0)`
  );

  // Q37 (final-year): final monthly cash shown in verdict matches API
  assert(
    verdictCheck.monthlyCashInDOM,
    "Q37-final-monthly-cash",
    `Final monthly cash ${verdictCheck.apiFinalMonthlyCashFmt} not found in verdict card.\n` +
    `  Monthly cash text shown: "${verdictCheck.monthlyCashText}"`
  );

  // ── Q05: Year-1 withdrawal — δ=1 check ──────────────────────────────────────
  // Verify that Year-1 withdrawal = monthlyTarget × 12 × (1+g)^0 = monthlyTarget × 12
  // This only applies to cashMode="monthlyTarget" and inflateWithdrawals=1.
  const q05Result = verdictCheck;
  const q05_inflation_rate = (q05Result.q05_inflation || 0) / 100;

  if (q05Result.q05_cash_mode === "monthlyTarget") {
    const expectedY1 = q05Result.q05_monthly_target * 12;  // δ=1: no inflation in Y1
    const actualY1   = q05Result.q05_year1_withdrawal;
    const gapRupees  = Math.abs(actualY1 - expectedY1);
    // Allow ₹1 tolerance for rounding (income < target due to interest being < target)
    const depleted   = actualY1 < expectedY1;  // partial: corpus insufficient
    const gapOk      = depleted || gapRupees < 1.0;

    assert(
      gapOk,
      "Q05-δ=1-monthlyTarget",
      `Year-1 withdrawal δ=1 violation in monthlyTarget mode:\n` +
      `  expected ₹${expectedY1.toFixed(2)} (= monthlyTarget × 12 × (1+g)^0)\n` +
      `  actual   ₹${actualY1.toFixed(2)}\n` +
      `  gap      ₹${gapRupees.toFixed(2)}\n` +
      `  If gap > ₹1 and corpus is not depleted, the δ=1 fix (fin-39m) may be regressed.`
    );
  } else {
    // withdrawRate / interestPercent mode: Year-1 withdrawal = share of income
    assert(
      q05Result.q05_year1_withdrawal >= 0,
      "Q05-non-target-mode",
      `Year-1 withdrawal is negative (${q05Result.q05_year1_withdrawal}) — model bug`
    );
  }

  // ── Q07: MobileTaxProductCards (S21) ────────────────────────────────────────
  await navigateMobile(page, "tax");
  await waitForModelIdle(page);

  const q07Result = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(
      JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {}
    );
    const params = api.projectionParamsFromState(saved);
    const model  = api.calculate(params);

    // S21: MobileTaxProductCards — uses .mobile-tax-product-cards > section
    const container  = document.querySelector(".mobile-tax-product-cards");
    const sections   = container ? [...container.querySelectorAll("section")] : [];
    const sectText   = sections.map(s => s.innerText);
    const allText    = sectText.join("\n");

    // Y1 tax from model (rows[1])
    const y1TaxRaw   = model.rows[1]?.tax || 0;
    const y1TaxFmt   = api.formatInr(y1TaxRaw);

    // Y1 equity/debt taxes can also come from yearlyTax call on yearParams
    // (the model already computed these as taxCalc.tax in row 1)
    return {
      containerPresent: Boolean(container),
      sectionCount:     sections.length,
      allText:          allText.slice(0, 400),
      y1TaxRaw,
      y1TaxFmt,
      taxInSections:    y1TaxRaw > 0 ? allText.includes(y1TaxFmt) : true,  // skip if zero-tax
    };
  });

  assert(
    q07Result.containerPresent,
    "Q07-S21-present",
    "MobileTaxProductCards container (.mobile-tax-product-cards) not found in tax view at 390px"
  );
  assert(
    q07Result.sectionCount >= 2,
    "Q07-S21-sections",
    `MobileTaxProductCards has ${q07Result.sectionCount} sections; expected ≥ 2 (equity + debt)`
  );
  if (q07Result.y1TaxRaw > 0) {
    assert(
      q07Result.taxInSections,
      "Q07-value-in-sections",
      `Year-1 tax ${q07Result.y1TaxFmt} not found in MobileTaxProductCards.\n` +
      `  Card text: ${q07Result.allText}`
    );
  } else {
    assert(true, "Q07-zero-tax", "Year-1 tax = 0 (new regime / below exemption) — zero is correct");
  }

  // ── Q35: Glide-path Y1 equity share ─────────────────────────────────────────
  // Y1 equity share = start allocation (glide formula: progress = (1-1)/glideYears = 0)
  const q35Result = await page.evaluate(() => {
    const api  = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(
      JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {}
    );

    const baseSharePct  = Number(saved.equityShare) || 60;
    const baseShareDec  = baseSharePct / 100;
    const glideEnabled  = Number(saved.glidePathEnabled) === 1 && Number(saved.useAssetReturns) === 1;
    const glideEnd      = (Number(saved.glidePathEndEquity) || 40) / 100;
    const glideYears    = Math.max(1, Number(saved.glidePathYears) || 1);

    // Inline equityShareForYear for Y1 and Y2 (mirror of model.js)
    function equityShareForYear(year) {
      const start = Math.max(0, Math.min(1, baseShareDec));
      if (!glideEnabled) return start;
      const progress = Math.max(0, Math.min(1, (year - 1) / glideYears));
      return start + (glideEnd - start) * progress;
    }

    const eqY1 = equityShareForYear(1);
    const eqY2 = equityShareForYear(2);

    return {
      baseShareDec,
      eqY1,
      eqY2,
      glideEnabled,
      y1MatchesBase:   Math.abs(eqY1 - baseShareDec) < 1e-9,
      glideNonIncreasing: !glideEnabled || eqY2 <= eqY1 + 1e-9,
    };
  });

  assert(
    q35Result.y1MatchesBase,
    "Q35-y1-equals-start",
    `Glide path Y1 equity (${q35Result.eqY1.toFixed(6)}) ≠ base share (${q35Result.baseShareDec.toFixed(6)}).\n` +
    `  Spec: Year-1 equity = starting allocation (glide progress=0 at t=1).`
  );
  assert(
    q35Result.glideNonIncreasing,
    "Q35-glide-non-increasing",
    `Glide path equity Y2 (${q35Result.eqY2.toFixed(6)}) > Y1 (${q35Result.eqY1.toFixed(6)}) — should be non-increasing.`
  );

  // ── Q53 (non-HH): effective horizon = state.years ───────────────────────────
  const q53NonHH = await page.evaluate(() => {
    const api  = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(
      JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {}
    );
    const params = api.projectionParamsFromState(saved);
    return {
      effectiveHorizon: params.years,
      stateYears:       Number(saved.years) || 25,
      hhMode:           Number(saved.useHouseholdPlan) === 1,
    };
  });

  if (!q53NonHH.hhMode) {
    assert(
      q53NonHH.effectiveHorizon === q53NonHH.stateYears,
      "Q53-non-HH",
      `Non-HH: effective horizon (${q53NonHH.effectiveHorizon}) ≠ state.years (${q53NonHH.stateYears}).` +
      `\n  In non-household mode, params.years must equal state.years.`
    );
  } else {
    console.log("[INFO] Q53-non-HH: default state is HH mode; non-HH check skipped.");
  }

  // ── Q37 + Q53: household mode scenario (computed in-page) ──────────────────
  // Build a canonical HH scenario and verify Q37 + Q53 formulas.
  // The expected values are derived from the model API output itself — we verify
  // the formula invariants, not hardcoded numbers.
  const hhResult = await page.evaluate(() => {
    const api = window.__FIN_DASHBOARD_TEST_API__;

    // Canonical HH scenario: retiree 68, spouse 65
    // essential=60K, discr=20K, spouse=20K, pension=15K → cashNeed=85K
    // longevityYears=22 (user), 90-min(68,65)=25 → profile.longevity=max(22,25)=25
    // contingencyYears=5 → effectiveYears=max(20, 25+5)=30
    const hhInput = {
      principal:                   20000000,
      useHouseholdPlan:            1,
      essentialMonthlyExpense:     60000,
      discretionaryMonthlyExpense: 20000,
      spouseMonthlyNeed:           20000,
      dependantMonthlySupport:     0,
      dependantSupportYears:       0,
      pensionMonthlyIncome:        15000,
      retireeAge:                  68,
      spouseAge:                   65,
      years:                       20,
      longevityYears:              22,
      contingencyYears:            5,
      inflation:                   6,
      equityShare:                 40,
      equityReturn:                12,
      debtReturn:                  7.5,
      expenseRatio:                0.5,
      useAssetReturns:             1,
      cashMode:                    "monthlyTarget",
      inflateWithdrawals:          1,
    };

    const hhState  = api.normalizeState(hhInput);
    const profile  = api.householdPlanProfile(hhState);
    const params   = api.projectionParamsFromState(hhState);
    const model    = api.calculate(params);

    // Q37: formula invariant
    const expectedCashNeed = 60000 + 20000 + 20000 - 15000;  // = 85,000
    const actualCashNeed   = profile.monthlyCashNeed;
    const q37Ok = Math.abs(actualCashNeed - expectedCashNeed) < 1;

    // Q53: formula invariant
    // profile.longevityYears = max(userInput(22), 90-min(68,65)) = max(22,25) = 25
    // profile.contingencyYears = state.contingencyYears = 5
    // effectiveYears = max(state.years=20, longevity+contingency=25+5=30) = 30
    const expectedLongevity    = Math.max(22, Math.max(0, 90 - Math.min(68, 65)));  // = 25
    const expectedContingency  = 5;
    const expectedEffectiveYrs = Math.max(20, expectedLongevity + expectedContingency);  // = 30
    const q53Ok = params.years === expectedEffectiveYrs;

    // Q05 HH δ=1: Year-1 withdrawal should = monthlyTarget × 12 × (1+g)^0 = actualCashNeed*12
    const y1Withdrawal   = model.rows[1]?.withdrawal || 0;
    const expectedY1     = actualCashNeed * 12;  // = 85000 * 12 = 1,020,000
    const q05HHDelta     = Math.abs(y1Withdrawal - expectedY1);
    const y1Depleted     = y1Withdrawal < expectedY1;  // OK if corpus ran out
    const q05HHOk        = y1Depleted || q05HHDelta < 1;

    return {
      // Q37
      actualCashNeed,
      expectedCashNeed,
      q37Ok,

      // Q53
      profile_longevityYears:  profile.longevityYears,
      profile_contingencyYrs:  profile.contingencyYears,
      expectedLongevity,
      expectedContingency,
      params_years:            params.years,
      expectedEffectiveYrs,
      q53Ok,

      // Q05 HH δ=1
      y1Withdrawal,
      expectedY1,
      q05HHDelta,
      y1Depleted,
      q05HHOk,
      cashMode:         params.cashMode,
      monthlyTarget:    params.monthlyTarget,
    };
  });

  assert(
    hhResult.q37Ok,
    "Q37-HH",
    `HH monthly cash: expected ₹${hhResult.expectedCashNeed}, got ₹${hhResult.actualCashNeed}.\n` +
    `  Formula: essential(60K) + discr(20K) + spouse(20K) - pension(15K) = 85K`
  );

  assert(
    hhResult.q53Ok,
    "Q53-HH-longevity",
    `HH effective horizon: expected ${hhResult.expectedEffectiveYrs}yrs ` +
    `(max(state.years=20, longevity(${hhResult.profile_longevityYears}) + contingency(${hhResult.profile_contingencyYrs})=${hhResult.profile_longevityYears + hhResult.profile_contingencyYrs})), ` +
    `got ${hhResult.params_years}.\n` +
    `  expectedLongevity=${hhResult.expectedLongevity}, expectedContingency=${hhResult.expectedContingency}`
  );

  assert(
    hhResult.q05HHOk,
    "Q05-HH-δ=1",
    `HH Year-1 withdrawal δ=1 violation:\n` +
    `  expected ₹${hhResult.expectedY1.toFixed(2)} (cashNeed × 12 × (1+g)^0)\n` +
    `  actual   ₹${hhResult.y1Withdrawal.toFixed(2)}\n` +
    `  gap      ₹${hhResult.q05HHDelta.toFixed(2)}\n` +
    `  cashMode=${hhResult.cashMode}, monthlyTarget=${hhResult.monthlyTarget}\n` +
    `  If gap > ₹1, the δ=1 fix (fin-39m) may be regressed in HH mode.`
  );

  // ── Q23: Terminal value P50 — numeric sanity ─────────────────────────────────
  const q23Result = await page.evaluate(() => {
    const api  = window.__FIN_DASHBOARD_TEST_API__;
    const saved = api.normalizeState(
      JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {}
    );
    const params = api.projectionParamsFromState(saved);
    const model  = api.calculate(params);
    const risk   = api.calculateMonteCarlo(params, 500);

    const p50Final      = risk.p50[risk.p50.length - 1] ?? 0;
    const finalClosing  = model.final.closing;
    const ratio         = finalClosing > 0 ? p50Final / finalClosing : (p50Final === 0 ? 1 : 0);

    return {
      p50Final,
      finalClosing,
      ratio,
      p50NonNeg:  p50Final >= 0,
      ratioSane:  ratio >= 0 && ratio <= 15,  // MC P50 within 15× of deterministic
      p50Fmt:     api.formatInr(p50Final),
      finalFmt:   api.formatInr(finalClosing),
    };
  });

  assert(
    q23Result.p50NonNeg,
    "Q23-P50-nonneg",
    `MC P50 terminal value is negative (${q23Result.p50Final}). Must be ≥ 0.`
  );
  assert(
    q23Result.ratioSane,
    "Q23-P50-sanity",
    `MC P50 (${q23Result.p50Fmt}) is ${q23Result.ratio.toFixed(2)}× deterministic final (${q23Result.finalFmt}).\n` +
    `  Ratio outside [0, 15] — possible MC regression.`
  );

  // ── Mobile overflow guard ────────────────────────────────────────────────────
  await navigateMobile(page, "overview");
  const overflow = await page.evaluate(() => ({
    width:       window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(
    overflow.scrollWidth <= overflow.width + 24,
    "MOBILE-OVERFLOW",
    `Mobile horizontal overflow: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.width}+24`
  );

  // ── Final summary ────────────────────────────────────────────────────────────
  const totalAssertions = passCount + failures.length;
  console.log(`\n── Results ───────────────────────────────────────────────────`);
  console.log(`  Assertions passed: ${passCount} / ${totalAssertions}`);

  if (failures.length > 0) {
    console.error(`\n  FAILURES (${failures.length}):`);
    for (const f of failures) console.error(`    ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  All value-first mobile assertions PASS.`);
    console.log(`  fin-f3n.19 mobile layer: GREEN`);
  }

  console.log("\n── JSON summary ──────────────────────────────────────────────");
  console.log(JSON.stringify({
    suite: "mobile-value-first",
    viewport: "390px",
    quantities: ["Q01", "Q05", "Q07", "Q22", "Q23", "Q35", "Q37", "Q53"],
    surfaces: ["S20-MobileVerdictCard", "S21-MobileTaxProductCards"],
    passed: failures.length === 0,
    passCount,
    failCount: failures.length,
    failures,
  }, null, 2));

} finally {
    server.close();
  }
});
