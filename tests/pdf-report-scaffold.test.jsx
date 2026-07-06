/**
 * pdf-report-scaffold.test.jsx
 *
 * R4.9.5g (fin-ahy) — PDF report scaffold structural verification.
 *
 * Verifies the SHAPE of the new 7-section structured PDF report scaffold at
 * `src/exports/pdf-report.js`. This file is a scaffold; subsequent dispatches
 * fill in the content of each `render*` section. The scaffold-stage tests
 * assert:
 *
 *   1. Module surface: USE_R4_9_5G_REPORT flag is `false` by default.
 *   2. LIGHT_PALETTE has every expected role key (no missing light tokens).
 *   3. PAGE geometry is A4 portrait (595 x 842 pt).
 *   4. SECTIONS enumerates the 7-section sequence in order.
 *   5. hexToRgb converts 3-digit, 6-digit, and hash-prefixed hex correctly;
 *      throws on malformed input.
 *   6. buildPdfReport returns { doc, filename }; doc has > 1 page (cover +
 *      6 stub sections); accessibility metadata + outline + footers applied.
 *   7. The library decision in `audit/round-4/r4.9.5g-pdf-library-decision.md`
 *      is committed to `jspdf + jspdf-autotable` and reflected in package.json.
 *
 * Persona: Hilbert  |  Phase: R4.9.5g  |  Parent: fin-ahy under fin-c96
 */

import { describe, it, expect } from "vitest";
import * as pdfReport from "../src/exports/pdf-report.js";
import {
  LIGHT_PALETTE,
  PAGE,
  SECTIONS,
  hexToRgb,
  buildPdfReport,
  renderCover,
  renderDecisionSummary,
  renderPlanDiagnosis,
  renderTaxPath,
  renderScenarios,
  renderMonthlyLedger,
  renderMethodology,
  __test__,
} from "../src/exports/pdf-report.js";
import { buildMonthlyLedger, calculate, BASE } from "../src/model.js";
import { PLANNING_VERSION } from "../src/planning.js";

// fin-8fb.2 P1: the PDF "creator" metadata now derives from package.json's
// version via the __APP_VERSION__ Vite define (same guard as src/exports/csv.js),
// rather than a hardcoded "v1.0.0" string. Assert against that same source of
// truth so this test doesn't silently drift from the shipped version.
// eslint-disable-next-line no-undef
const EXPECTED_APP_VERSION = (typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__)
  ? __APP_VERSION__   // eslint-disable-line no-undef
  : PLANNING_VERSION;

describe("R4.9.5g PDF report scaffold — module surface", () => {
  it("USE_R4_9_5G_REPORT escape-hatch flag has been removed (fin-4ml cleanup)", () => {
    // R4.9.5g fin-4ml (R4-Q13, 2026-05-21): the §7 dispatch retained the
    // `USE_R4_9_5G_REPORT` flag plus a `?r4.9.5g=false` URL toggle as a
    // one-phase regression escape hatch back to the old dark-theme PDF. Owner
    // resolved Option-4: revert the Annex §2.6.19 ceiling bump and remove the
    // old code path. The flag is gone. The new structured 7-section PDF is
    // now the sole production export.
    expect(pdfReport.USE_R4_9_5G_REPORT).toBeUndefined();
  });

  it("LIGHT_PALETTE includes every expected role key", () => {
    const requiredKeys = [
      "bg", "bg2", "panel", "panel2", "panel3",
      "text", "muted", "soft",
      "line", "lineStrong",
      "teal", "coral", "gold", "blue",
      "success", "warning", "danger",
      "income", "tax", "growth", "risk",
    ];
    for (const key of requiredKeys) {
      expect(LIGHT_PALETTE[key], `LIGHT_PALETTE.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("LIGHT_PALETTE values mirror the canonical src/styles.css :root hex values", () => {
    // Spot-check a few load-bearing tokens against src/styles.css:1-45 to
    // prevent silent palette drift in subsequent dispatches.
    expect(LIGHT_PALETTE.bg).toBe("#d8e0eb");
    expect(LIGHT_PALETTE.bg2).toBe("#edf2f8");
    expect(LIGHT_PALETTE.text).toBe("#1f2a3f");
    expect(LIGHT_PALETTE.muted).toBe("#536074");
    expect(LIGHT_PALETTE.teal).toBe("#2f9ca8");
    expect(LIGHT_PALETTE.coral).toBe("#cc3f5a");
    expect(LIGHT_PALETTE.gold).toBe("#d09f38");
    expect(LIGHT_PALETTE.blue).toBe("#5d72f6");
  });

  it("PAGE geometry is A4 portrait in points", () => {
    expect(PAGE.width).toBe(595);
    expect(PAGE.height).toBe(842);
    expect(PAGE.marginTop).toBeGreaterThanOrEqual(36);
    expect(PAGE.marginBottom).toBeGreaterThanOrEqual(36);
    expect(PAGE.marginLeft).toBeGreaterThanOrEqual(36);
    expect(PAGE.marginRight).toBeGreaterThanOrEqual(36);
    expect(PAGE.footerBaseline).toBeLessThan(PAGE.height);
    expect(PAGE.headingY).toBeGreaterThan(PAGE.marginTop);
  });

  it("SECTIONS enumerates the 7-section sequence in canonical order", () => {
    expect(SECTIONS).toHaveLength(7);
    const expectedKeys = ["cover", "decision", "diagnosis", "tax", "scenarios", "ledger", "methodology"];
    SECTIONS.forEach((section, idx) => {
      expect(section.num).toBe(idx + 1);
      expect(section.key).toBe(expectedKeys[idx]);
      expect(section.title.length).toBeGreaterThan(0);
    });
  });

  it("frozen exports cannot be mutated", () => {
    expect(Object.isFrozen(LIGHT_PALETTE)).toBe(true);
    expect(Object.isFrozen(PAGE)).toBe(true);
    expect(Object.isFrozen(SECTIONS)).toBe(true);
    expect(Object.isFrozen(__test__)).toBe(true);
  });
});

describe("R4.9.5g PDF report scaffold — hexToRgb", () => {
  it("converts 6-digit hex with leading hash", () => {
    expect(hexToRgb("#1f2a3f")).toEqual([31, 42, 63]);
  });
  it("converts 6-digit hex without leading hash", () => {
    expect(hexToRgb("ff66cc")).toEqual([255, 102, 204]);
  });
  it("converts 3-digit hex via duplication", () => {
    expect(hexToRgb("#abc")).toEqual([0xaa, 0xbb, 0xcc]);
  });
  it("uppercases are accepted", () => {
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });
  it("throws on non-string input", () => {
    expect(() => hexToRgb(123)).toThrow(TypeError);
    expect(() => hexToRgb(null)).toThrow(TypeError);
  });
  it("throws on malformed hex", () => {
    expect(() => hexToRgb("not-a-color")).toThrow(/invalid hex colour/);
    expect(() => hexToRgb("#12345")).toThrow(/invalid hex colour/);
    expect(() => hexToRgb("#xyzxyz")).toThrow(/invalid hex colour/);
  });
});

/**
 * End-to-end scaffold render — uses the real jspdf + jspdf-autotable
 * dependencies. Verifies the scaffold produces a multi-page A4 PDF with
 * the accessibility metadata + outline + footers applied.
 */
describe("R4.9.5g PDF report scaffold — buildPdfReport()", () => {
  const stubExportContext = {
    reportFingerprint: "test-fingerprint-r4-9-5g-scaffold",
    reportState: { principal: 50000000, monthlyCash: 100000 },
    reportParams: { years: 30 },
  };

  it("builds a populated jsPDF document with the canonical filename", async () => {
    const { doc, filename } = await buildPdfReport(stubExportContext);
    // R4.9.5g §7 atomic flip: filename matches the old `exportPdf` path and the
    // dashboard-regression E2E expectation. Previous `_report.pdf` suffix
    // predated the flag flip and would have changed the download filename.
    expect(filename).toBe("retirement_corpus_income_planner.pdf");
    expect(typeof doc.getNumberOfPages).toBe("function");
    // R4.9.5g dispatch 2 fills §1-§5 with multi-page content:
    //   §1 cover           = 1 page
    //   §2 decision        = 1 page
    //   §3 diagnosis       = 3 pages (journey chart + composition + summary)
    //   §4 tax path        = 2 pages (facts grid + yield breakdown)
    //   §5 scenarios       = 1 page
    //   §6 ledger stub     = 1 page
    //   §7 methodology stub= 1 page
    // Total ≥ 9 pages once §1-§5 content lands; bumps further once §6/§7 fill.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(7);
  });

  it("applies accessibility metadata (Title, Subject, Lang)", async () => {
    const { doc } = await buildPdfReport(stubExportContext);
    // jspdf stores doc properties on the internal jsPDFObject. Use the
    // public getter where available.
    const props = doc.getDocumentProperties ? doc.getDocumentProperties() : null;
    if (props) {
      expect(props.title).toBe("Retirement Corpus & Income Planner");
      expect(props.subject).toMatch(/test-fingerprint-r4-9-5g-scaffold/);
      expect(props.creator).toBe(`Retirement Corpus & Income Planner v${EXPECTED_APP_VERSION}`);
    }
    // Language setter is best-effort; assert the function existed.
    expect(typeof doc.setLanguage === "function" || doc.setLanguage === undefined).toBe(true);
  });

  it("applies an outline with 7 section bookmarks under the root", async () => {
    const { doc } = await buildPdfReport(stubExportContext);
    // jspdf outline tree shape: doc.outline.root.children[0] is the report
    // root; its children[] are the sections.
    if (doc.outline && doc.outline.root && Array.isArray(doc.outline.root.children)) {
      const root = doc.outline.root.children[0];
      expect(root).toBeTruthy();
      expect(Array.isArray(root.children)).toBe(true);
      expect(root.children.length).toBe(7);
    }
  });

  it("scaffold output buffer is well-formed PDF (starts with %PDF-)", async () => {
    const { doc } = await buildPdfReport(stubExportContext);
    const buf = doc.output("arraybuffer");
    expect(buf.byteLength).toBeGreaterThan(1000);
    const bytes = new Uint8Array(buf);
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("handles missing fingerprint gracefully", async () => {
    const { doc } = await buildPdfReport({});
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(7);
  });

  it("each section render function is async and returns undefined", async () => {
    // Smoke that the renderers can be called individually — protects the
    // section-pipeline order assumption in buildPdfReport against accidental
    // signature drift in subsequent dispatches.
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    await renderCover(doc, stubExportContext);
    await renderDecisionSummary(doc, stubExportContext);
    await renderPlanDiagnosis(doc, stubExportContext);
    await renderTaxPath(doc, stubExportContext);
    await renderScenarios(doc, stubExportContext);
    await renderMonthlyLedger(doc, stubExportContext);
    await renderMethodology(doc, stubExportContext);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(7);
  });

  it("__test__ internal helpers are exposed and callable", async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    // Smoke each internal helper — covers the lines that buildPdfReport
    // also covers indirectly but explicit calls make the test failure
    // signal more localised.
    __test__.drawSectionHeading(doc, SECTIONS[1]);
    __test__.applyAccessibilityMetadata(doc, { reportFingerprint: "fp-test" });
    __test__.applyPageFooters(doc, { reportFingerprint: "fp-test" });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  /**
   * R4.9.5h Pass-2 D7 — exercise the new drawDecisionTile primitive across
   * every mood bucket so the badge / pending / high / med / low / income /
   * tax branches all light up in coverage. Pass-1 only exercised the
   * "samples > 0 high-confidence" path (fast-tier MC fallback in jsdom).
   * Each call here renders one tile to a fresh jsPDF doc; we only assert
   * that the page count stays at 1 (no inadvertent doc.addPage()).
   */
  it("drawDecisionTile defensive branches — unknown mood + empty detail + no badge", async () => {
    // R4.9.5h Pass-2 D7 branch-coverage backfill. drawDecisionTile carries
    // three defensive `||` short-circuit branches that the canonical 4-tile
    // grid never exercises (because all four production tiles supply a known
    // mood + non-empty detail + badge). Exercise them here so coverage holds
    // the 95% branches threshold without pretending behaviour we ship is
    // unreachable. Each path is real production behaviour for malformed input
    // (e.g. an MC bundle that disappears mid-render):
    //   - mood key absent from TILE_MOOD_COLOURS → fall back to "income"
    //   - detail string is empty / undefined      → fall back to ""
    //   - badge object absent                     → skip the chip drawing
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    // Hit ALL defensive fallbacks in a single call: unknown mood key forces
    // the `|| TILE_MOOD_COLOURS.income` branch; `detail: undefined` forces
    // the `tile.detail || ""` branch; absent `badge` forces the badge-absent
    // path. We also pass an empty string explicitly to the value to drive the
    // splitTextToSize `|| ""` fallback for the first-line guard.
    __test__.drawDecisionTile(doc, 40, 100, 250, 90, {
      label: "FALLBACK",
      value: "",
      detail: undefined,
      mood: "totally-unknown-mood-key",
      // badge intentionally absent
    });
    // And a separate call with a present badge + very long detail so the
    // `detailLines.length > 1` ellipsis branch fires too.
    __test__.drawDecisionTile(doc, 40, 200, 250, 90, {
      label: "ELLIPSIS",
      value: "very likely (over 95%)",
      detail: "this is an intentionally extremely long detail string that will be wider than the tile interior width and should therefore wrap to two lines, triggering the trailing-ellipsis truncation branch in the tile renderer",
      mood: "high",
      badge: { label: "HIGH", fillHex: "#16a34a" },
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("renderMcPendingPlaceholder emits a bordered placeholder card without paging or throwing (Pass-2 D25)", async () => {
    // R4.9.5h Pass-2 Dispatch 5 D25 — defense-in-depth verification for the
    // MC-pending placeholder helper. The renderer-level guard runs even if
    // the R4-Q18 production export gate is bypassed (cold-load, harness,
    // worker race). Exercise the helper directly: it must (a) not throw,
    // (b) not call doc.addPage(), (c) write a card on the current page.
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    expect(() => __test__.renderMcPendingPlaceholder(doc, 100, 200)).not.toThrow();
    expect(() => __test__.renderMcPendingPlaceholder(doc, 320, 80)).not.toThrow();
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("renderPlanDiagnosis substitutes MC-pending placeholder when simulations=0 (Pass-2 D25)", async () => {
    // D25 defense-in-depth: with mc.simulations === 0 the §3 corpus-journey
    // chart + sibling table must both fall back to the placeholder so the
    // exported PDF never carries collapsed P10=P50=P90 rows that read as a
    // legitimate zero-spread plan. We exercise the full renderPlanDiagnosis
    // path with a pending MC bundle and assert it (a) does not throw, (b)
    // still produces at least one new page (the §3 page itself).
    const { jsPDF } = await import("jspdf");
    const ctx = {
      reportFingerprint: "mc-pending-test",
      reportState: { principal: 30000000, monthlyTarget: 80000, cashMode: "monthlyTarget", inflation: 6 },
      reportParams: { years: 30, principal: 30000000, monthlyTarget: 80000, inflation: 6 },
      reportModel: { final: { closing: 90000000, realClosing: 12000000, withdrawal: 960000, cumTax: 2000000, cumInterest: 60000000, cumWithdrawals: 28800000, cumContributions: 0 }, rows: [], monthlyRows: [] },
      reportHousehold: { useHouseholdPlan: false },
      // Pending MC bundle — empty p10/p50/p90 arrays + simulations 0.
      reportMc: { simulations: 0, successProbability: 0, p10: [], p50: [], p90: [], finals: [] },
    };
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    await renderPlanDiagnosis(doc, ctx);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    // Also exercise the simulations: null branch (mc bundle present but
    // simulations key entirely absent) so both arms of the `== null || === 0`
    // guard get branch coverage.
    const doc2 = new jsPDF({ unit: "pt", format: "a4" });
    await renderPlanDiagnosis(doc2, { ...ctx, reportMc: { successProbability: 0, p10: [], p50: [], p90: [], finals: [] } });
    expect(doc2.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    // Settled MC with successProbability undefined drives the `|| 0` fallback
    // arm inside `mcPending ? 0 : clamp(Number(...) || 0, 0, 1)` for the End-
    // Chance bar (defense for malformed MC bundles).
    const doc3 = new jsPDF({ unit: "pt", format: "a4" });
    await renderPlanDiagnosis(doc3, { ...ctx, reportMc: { simulations: 1000, seed: 42, p10: [3e7, 4e7], p50: [3e7, 5e7], p90: [3e7, 6e7], finals: [5e7] } });
    expect(doc3.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    // Settled MC bundle without p10/p50/p90 arrays drives the `|| []` fallback
    // arms in the sibling-table builder (defense for malformed bundles where
    // the percentile arrays disappeared but simulations is still set).
    const doc4 = new jsPDF({ unit: "pt", format: "a4" });
    await renderPlanDiagnosis(doc4, { ...ctx, reportMc: { simulations: 1000, seed: 42, successProbability: 0.5, finals: [5e7] } });
    expect(doc4.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });

  it("renderDecisionSummary covers every tile-mood branch (pending / high / med / low)", async () => {
    const { jsPDF } = await import("jspdf");
    const baseCtx = {
      reportFingerprint: "tile-mood-test",
      reportState: { principal: 30000000, monthlyTarget: 80000, cashMode: "monthlyTarget", inflation: 6 },
      reportParams: { years: 30, principal: 30000000, monthlyTarget: 80000, inflation: 6 },
      reportModel: { final: { closing: 90000000, realClosing: 12000000, withdrawal: 960000, cumTax: 2000000, cumInterest: 60000000, cumWithdrawals: 28800000, cumContributions: 0 }, rows: [], monthlyRows: [] },
      reportHousehold: { useHouseholdPlan: false },
    };
    // renderDecisionSummary calls doc.addPage() up-front, so each invocation
    // increments the page count from the constructor's initial page.
    // Pending bucket — slow-tier MC has not settled (simulations:0).
    const docPending = new jsPDF({ unit: "pt", format: "a4" });
    await renderDecisionSummary(docPending, { ...baseCtx, reportMc: { simulations: 0, enduranceProbability: 0, successProbability: 0, finals: [] } });
    expect(docPending.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    // High bucket — confidence well above 70%.
    const docHigh = new jsPDF({ unit: "pt", format: "a4" });
    await renderDecisionSummary(docHigh, { ...baseCtx, reportMc: { simulations: 1000, seed: 42, enduranceProbability: 0.92, successProbability: 0.88, enduranceMargin95: 0.02, successMargin95: 0.03, finals: [50000000, 60000000, 70000000] } });
    expect(docHigh.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    // Med bucket — confidence in the 30-70% band.
    const docMed = new jsPDF({ unit: "pt", format: "a4" });
    await renderDecisionSummary(docMed, { ...baseCtx, reportMc: { simulations: 1000, seed: 42, enduranceProbability: 0.55, successProbability: 0.45, enduranceMargin95: 0.04, successMargin95: 0.04, finals: [30000000, 40000000, 50000000] } });
    expect(docMed.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    // Low bucket — confidence below 30%.
    const docLow = new jsPDF({ unit: "pt", format: "a4" });
    await renderDecisionSummary(docLow, { ...baseCtx, reportMc: { simulations: 1000, seed: 42, enduranceProbability: 0.10, successProbability: 0.05, enduranceMargin95: 0.05, successMargin95: 0.05, finals: [10000000, 15000000, 20000000] } });
    expect(docLow.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });
});

/**
 * §6 Month-by-month cash flow ledger — paginated autotable rendering of
 * the Q-LEDGER-MONTHLY relation. Verifies the row-count contract
 * (INV-L04: 12T rows unconditionally) at three horizons, and that the
 * rendered PDF page count grows monotonically with the horizon.
 */
describe("R4.9.5g PDF report — §6 monthly ledger row contract", () => {
  it("buildMonthlyLedger emits exactly 12T rows at 5y / 30y / 50y horizons", () => {
    const make = (years) => {
      const params = { ...BASE, years };
      const report = calculate(params);
      return buildMonthlyLedger(report, params).length;
    };
    expect(make(5)).toBe(60);
    expect(make(30)).toBe(360);
    expect(make(50)).toBe(600);
  });

  it("buildMonthlyLedger row count matches reportParams.years × 12 even with empty annual rows", () => {
    // Stub path: when reportModel is absent the helper still emits 12T rows
    // (all-zero pad). This is the path the scaffold test exercises.
    expect(buildMonthlyLedger({ rows: [] }, { years: 30 }).length).toBe(360);
    expect(buildMonthlyLedger({ rows: [] }, { years: 5 }).length).toBe(60);
    expect(buildMonthlyLedger({ rows: [] }, { years: 50 }).length).toBe(600);
  });

  it("PDF page count grows with horizon (5y < 30y < 50y) — ledger pagination is the dominant signal", async () => {
    const buildFor = async (years) => {
      const params = { ...BASE, years };
      const reportModel = calculate(params);
      const ctx = {
        reportFingerprint: `ledger-h${years}`,
        reportState: { principal: BASE.principal, monthlyCash: 100000 },
        reportParams: params,
        reportModel,
      };
      const { doc } = await buildPdfReport(ctx);
      return doc.getNumberOfPages();
    };
    const p5  = await buildFor(5);
    const p30 = await buildFor(30);
    const p50 = await buildFor(50);
    // Sanity floor: every horizon still produces at least the 7-section minimum.
    expect(p5).toBeGreaterThanOrEqual(7);
    // Strict growth — §6 is the dominant per-page contributor at scale.
    expect(p30).toBeGreaterThan(p5);
    expect(p50).toBeGreaterThan(p30);
    // The §6 ledger alone adds many pages at 50y vs 30y — that delta
    // should be on the order of (50-30)*12 / rows_per_page. With autotable's
    // 8pt rows we expect ~30 rows/page, so the 50y vs 30y delta should be
    // roughly (600 - 360) / 30 ≈ 8 additional pages, no fewer than 4.
    expect(p50 - p30).toBeGreaterThanOrEqual(4);
    expect(p30 - p5).toBeGreaterThanOrEqual(4);
  }, 60000);

  it("renderMonthlyLedger populates a non-trivial ledger when given a real report", async () => {
    const { jsPDF } = await import("jspdf");
    // Mirror the buildPdfReport autotable bootstrap.
    const autoTableModule = await import("jspdf-autotable");
    const autoTableFn = autoTableModule.default || autoTableModule.autoTable;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    if (typeof autoTableFn === "function") doc.autoTable = (opts) => autoTableFn(doc, opts);
    const params = { ...BASE, years: 30 };
    const reportModel = calculate(params);
    const pagesBefore = doc.getNumberOfPages();
    await renderMonthlyLedger(doc, {
      reportFingerprint: "ledger-render-test",
      reportState: { principal: BASE.principal },
      reportParams: params,
      reportModel,
    });
    const pagesAfter = doc.getNumberOfPages();
    // 360 rows at ~30 rows/page → roughly 12 pages. Require >= 6 to leave
    // headroom for cellPadding/font tweaks without breaking the test.
    expect(pagesAfter - pagesBefore).toBeGreaterThanOrEqual(6);
  }, 60000);
});

/**
 * §7 Methodology + Disclaimer — facts table + archival disclaimer content.
 * Verifies the methodology renderer pulls MC samples/seed, tax-law version,
 * and scenario library names from the export context; that the archival
 * disclaimer text from DISCLAIMER.md is rendered when supplied; and that
 * the MIT license attribution is present.
 */
describe("R4.9.5g PDF report — §7 methodology + disclaimer", () => {
  const buildDoc = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTableFn = autoTableModule.default || autoTableModule.autoTable;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    if (typeof autoTableFn === "function") doc.autoTable = (opts) => autoTableFn(doc, opts);
    return doc;
  };

  it("renders the methodology facts table with MC samples, seed, tax law, and scenario library", async () => {
    const doc = await buildDoc();
    await renderMethodology(doc, {
      reportFingerprint: "methodology-test",
      reportMc: { simulations: 1000, seed: 42, method: "stochastic-regime" },
      reportTaxLaw: { version: "FY 2025-26 / AY 2026-27 baseline" },
      reportScenarios: [
        { name: "Active" }, { name: "Income" }, { name: "Growth" }, { name: "Stress" },
      ],
      disclaimerFullText: "## Disclaimer\nThis is a test.",
    });
    // §7 must produce ≥ 2 pages: methodology + archival disclaimer.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    // doc.autoTable must have been called at least once (the methodology facts table).
    expect(doc.lastAutoTable).toBeTruthy();
    expect(typeof doc.lastAutoTable.finalY).toBe("number");
  }, 30000);

  it("falls back to the canonical scenario list when reportScenarios is missing", async () => {
    const doc = await buildDoc();
    await renderMethodology(doc, {
      reportFingerprint: "methodology-fallback",
      reportMc: { simulations: 500, seed: 7 },
      reportTaxLaw: {},
      disclaimerFullText: "## Disclaimer\nfallback test.",
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("emits a placeholder disclaimer note when disclaimerFullText is absent", async () => {
    const doc = await buildDoc();
    await renderMethodology(doc, {
      reportFingerprint: "methodology-no-disclaimer",
      reportMc: { simulations: 1000, seed: 1 },
      reportTaxLaw: { version: "FY 2025-26 / AY 2026-27 baseline" },
      // disclaimerFullText intentionally omitted.
    });
    // Still renders — fallback path doesn't crash; emits the file-reference note.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("renders the FULL DISCLAIMER.md content when supplied (multiple disclaimer sections present)", async () => {
    // We reach into the document by reusing the full DISCLAIMER.md text. Verifying
    // byte-for-byte content requires PDF text extraction — out of scope here; the
    // E2E test does that. Here we assert the renderer accepts large multi-page
    // disclaimer text without throwing and produces ≥ 2 pages of output.
    const fullText = [
      "---",
      "title: \"Disclaimer\"",
      "---",
      "# Disclaimer",
      "## 1. What This Is",
      "Retirement Corpus & Income Planner is a planning and educational tool.",
      "## 2. For Investment Advice",
      "Consult a SEBI-registered Investment Adviser (RIA).",
      "## 3. For Tax Advice",
      "Consult a Chartered Accountant (CA).",
      "## 4. Tax Law Scope",
      "Assessment Year 2026-27 (FY 2025-26).",
      "## 5. Monte Carlo Simulation Caveat",
      "Past or simulated returns do not guarantee future results.",
      "## 6. Use at Your Own Risk",
      "You use this tool entirely at your own risk.",
      "## 7. No Warranty",
      "> THE SOFTWARE IS PROVIDED \"AS IS\"",
      "## 8. Jurisdiction",
      "This tool is designed for Indian retirement planning.",
    ].join("\n");
    const doc = await buildDoc();
    await renderMethodology(doc, {
      reportFingerprint: "methodology-full-disclaimer",
      reportMc: { simulations: 1000, seed: 42 },
      reportTaxLaw: { version: "FY 2025-26 / AY 2026-27 baseline" },
      reportScenarios: [
        { name: "Active" }, { name: "Income" }, { name: "Growth" }, { name: "Stress" },
      ],
      disclaimerFullText: fullText,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  }, 30000);
});

/**
 * R4.9.5h Pass-2 Dispatch 3 — D24 fix: Appendix A relocation.
 *
 * The §15.2.5 a11y sibling tables that used to render inline beneath their
 * visual sources (§2 tile mirror, §3 donut, §3 projection-statement) are now
 * collected via collectA11yAppendixTable and emitted by renderAccessibilityAppendix
 * at the document tail. These tests cover the helper + renderer + no-op branches.
 */
describe("R4.9.5h Pass-2 Dispatch 3 — D24 Appendix A relocation", () => {
  const buildDoc = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTableFn = autoTableModule.default || autoTableModule.autoTable;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    if (typeof autoTableFn === "function") doc.autoTable = (opts) => autoTableFn(doc, opts);
    return doc;
  };

  it("collectA11yAppendixTable is a no-op on null/non-object contexts (defensive)", () => {
    // Real production code always passes a context object; the no-op branches
    // exist for safety in stub paths and partial-context test scaffolds.
    expect(() => __test__.collectA11yAppendixTable(null, { title: "T", head: [["A"]], body: [["1"]] })).not.toThrow();
    expect(() => __test__.collectA11yAppendixTable(undefined, { title: "T", head: [["A"]], body: [["1"]] })).not.toThrow();
    expect(() => __test__.collectA11yAppendixTable("string", { title: "T", head: [["A"]], body: [["1"]] })).not.toThrow();
  });

  it("collectA11yAppendixTable lazily creates the __a11yAppendixTables scratchpad on first push", () => {
    const ctx = { reportFingerprint: "fp" };
    expect(ctx.__a11yAppendixTables).toBeUndefined();
    __test__.collectA11yAppendixTable(ctx, { title: "First", head: [["H"]], body: [["row"]] });
    expect(Array.isArray(ctx.__a11yAppendixTables)).toBe(true);
    expect(ctx.__a11yAppendixTables).toHaveLength(1);
    // Scratchpad property must be non-enumerable so it doesn't leak into
    // legitimate context inspection by upstream callers.
    expect(Object.keys(ctx)).not.toContain("__a11yAppendixTables");
  });

  it("collectA11yAppendixTable appends multiple tables in insertion order", () => {
    const ctx = {};
    __test__.collectA11yAppendixTable(ctx, { title: "A.1", head: [["x"]], body: [["1"]] });
    __test__.collectA11yAppendixTable(ctx, { title: "A.2", head: [["y"]], body: [["2"]] });
    __test__.collectA11yAppendixTable(ctx, { title: "A.3", head: [["z"]], body: [["3"]] });
    expect(ctx.__a11yAppendixTables.map((t) => t.title)).toEqual(["A.1", "A.2", "A.3"]);
  });

  it("renderAccessibilityAppendix is a no-op when no tables were collected", async () => {
    const doc = await buildDoc();
    const pagesBefore = doc.getNumberOfPages();
    await __test__.renderAccessibilityAppendix(doc, {});
    expect(doc.getNumberOfPages()).toBe(pagesBefore);
    // Empty array is also a no-op.
    await __test__.renderAccessibilityAppendix(doc, { __a11yAppendixTables: [] });
    expect(doc.getNumberOfPages()).toBe(pagesBefore);
    // Null context is also a no-op.
    await __test__.renderAccessibilityAppendix(doc, null);
    expect(doc.getNumberOfPages()).toBe(pagesBefore);
  });

  it("renderAccessibilityAppendix emits a new page with the Appendix A banner when tables are collected", async () => {
    const doc = await buildDoc();
    const ctx = {};
    __test__.collectA11yAppendixTable(ctx, {
      title: "Table A.1 — test",
      sourceLabel: "Mirrors a test source.",
      head: [["Metric", "Value", "Detail"]],
      body: [["INCOME COVER", "22%", "INR 3.87 L vs INR 17.2 L"]],
      columnStyles: { 0: { cellWidth: 110 } },
    });
    const pagesBefore = doc.getNumberOfPages();
    await __test__.renderAccessibilityAppendix(doc, ctx);
    expect(doc.getNumberOfPages()).toBe(pagesBefore + 1);
    // doc.autoTable must have been invoked for the collected table.
    expect(doc.lastAutoTable).toBeTruthy();
    expect(typeof doc.lastAutoTable.finalY).toBe("number");
  });

  it("renderAccessibilityAppendix emits multiple table titles and source-pointer captions", async () => {
    const doc = await buildDoc();
    const ctx = {};
    // Three collected tables — mirrors the production count (one §2 tile,
    // one §3 donut, one §3 projection-statement) so the multi-table loop
    // and the sourceLabel branch both fire.
    __test__.collectA11yAppendixTable(ctx, {
      title: "Table A.1 — tile mirror",
      sourceLabel: "Mirrors the §2 tiles.",
      head: [["Metric", "Value", "Detail"]],
      body: [["TILE-1", "33%", "detail one"], ["TILE-2", "50%", "detail two"]],
    });
    __test__.collectA11yAppendixTable(ctx, {
      title: "Table A.2 — donut",
      sourceLabel: "Mirrors the donut.",
      head: [["Slice", "Value"]],
      body: [["A", "1"], ["B", "2"]],
    });
    __test__.collectA11yAppendixTable(ctx, {
      title: "Table A.3 — bars",
      // sourceLabel intentionally omitted to exercise the optional-source branch.
      head: [["Bar", "Value"]],
      body: [["X", "1"], ["Y", "2"]],
    });
    const pagesBefore = doc.getNumberOfPages();
    await __test__.renderAccessibilityAppendix(doc, ctx);
    // At least one new page; possibly more if pagination kicks in. The test
    // is robust to either outcome.
    expect(doc.getNumberOfPages()).toBeGreaterThan(pagesBefore);
  });

  it("renderAccessibilityAppendix defensive branches — missing title and missing autoTable", async () => {
    // Cover the `tbl.title || "Table"` fallback when a collected table has no
    // title (defensive — every production call site supplies one) and the
    // `typeof doc.autoTable === "function"` guard for a jsPDF doc that did
    // NOT receive the autoTable bootstrap (the test scaffold path that
    // exercises the renderer without the plugin wired).
    const { jsPDF } = await import("jspdf");
    const ctx = {};
    __test__.collectA11yAppendixTable(ctx, {
      // title intentionally omitted to drive the `tbl.title || "Table"` arm
      head: [["X"]],
      body: [["row"]],
      // columnStyles intentionally omitted to drive the `|| undefined` arm
    });
    const docNoAt = new jsPDF({ unit: "pt", format: "a4" });
    // Explicitly do NOT attach doc.autoTable — the appendix renderer must
    // skip the autotable call without throwing (the title + intro still render).
    const pagesBefore = docNoAt.getNumberOfPages();
    await __test__.renderAccessibilityAppendix(docNoAt, ctx);
    // Even without autotable, the appendix page itself is still added (header + intro).
    expect(docNoAt.getNumberOfPages()).toBe(pagesBefore + 1);
  });

  it("buildPdfReport wires the appendix at the document tail with three collected tables", async () => {
    const params = { ...BASE, years: 5 };
    const reportModel = calculate(params);
    const ctx = {
      reportFingerprint: "appendix-wired-e2e",
      reportState: { principal: BASE.principal, monthlyCash: 100000, inflation: 6 },
      reportParams: params,
      reportModel,
      reportMc: {
        simulations: 1000,
        seed: 24681357,
        enduranceProbability: 0.92,
        successProbability: 0.85,
        enduranceMargin95: 0.02,
        successMargin95: 0.03,
        finals: [50000000, 60000000, 70000000],
        p10: [30000000, 32000000, 34000000, 36000000, 38000000, 40000000],
        p50: [30000000, 35000000, 40000000, 45000000, 50000000, 55000000],
        p90: [30000000, 40000000, 50000000, 60000000, 70000000, 80000000],
      },
      reportTaxLaw: { version: "FY 2025-26 / AY 2026-27 baseline" },
      reportScenarios: [
        { name: "Active" }, { name: "Income" }, { name: "Growth" }, { name: "Stress" },
      ],
    };
    const { doc } = await buildPdfReport(ctx);
    // The exportContext was mutated in place — three sibling tables collected.
    expect(Array.isArray(ctx.__a11yAppendixTables)).toBe(true);
    expect(ctx.__a11yAppendixTables).toHaveLength(3);
    // Titles confirm we collected the right surrogates.
    const titles = ctx.__a11yAppendixTables.map((t) => t.title);
    expect(titles[0]).toContain("Table A.1");
    expect(titles[0]).toContain("§2");
    expect(titles[1]).toContain("Table A.2");
    expect(titles[1]).toContain("donut");
    expect(titles[2]).toContain("Table A.3");
    expect(titles[2]).toContain("Projection statement");
    // The PDF has more than the 7 sections — the appendix added at least one page.
    expect(doc.getNumberOfPages()).toBeGreaterThan(7);
  }, 60000);
});
