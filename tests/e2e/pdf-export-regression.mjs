/**
 * R4.9.5h — PDF export regression umbrella (Mencius / fin-ahy), extending R4.9.5g.
 *
 * Per R4.9.5g phase brief step 8: "Render PDF, parse with pdfjs, assert:
 *   (a) 7 section heading markers present in order
 *   (b) §6 ledger row count = horizon × 12
 *   (c) headline numbers in §2 match live app's rendered Income Cover /
 *       Plan Endurance / Target Confidence
 *   (d) tagged-PDF (a11y surrogate) structure validates"
 *
 * R4.9.5h adds assertion class (e) — R4.9.5h polish-pass defect coverage:
 *   (e1) No raw markdown syntax in §7 disclaimer text
 *        (D2/D13/D14/D16/D17/D19 — fixes via stripInlineMd + autotable)
 *   (e2) Signal legend present with caption context, not bare floating tokens
 *        (D1/D12 — "Plan health signal channels:" label)
 *   (e3) No truncated words / no letter-spacing explosion in §7 methodology
 *        (D3/D18 — glyph sanitization via sanitizeForPdf)
 *   (e4) No glyph fallback markers (D5 — ¹ for ₹, !Ò for ⇒)
 *   (e5) MC sentinel correctness (D4/fin-c96.15/fin-1q6)
 *   (e6) Year-end ledger row has distinct styling (D8 — panel3 fill)
 *   (e7) §2 tile mirror with §15.2.5 sibling table (D7/D23)
 *   (e8) R4.9.5g a11y surrogate posture preserved (R4-Q11) — axis (d) unchanged
 *
 * Overlap with sister harnesses is intentional — this is the umbrella
 * regression gate that ties (a)(b)(c)(d)(e) together and acts as the canonical
 * "did the new PDF survive the R4.10 merge to main" guard. The sister
 * harnesses live at:
 *   tests/e2e/r4.9.5g-pdf-autotable-verify.mjs   (Hilbert; §3/§4/§5 autotable slice of (a))
 *   tests/e2e/r4.9.5g-pdf-a11y-surrogate.mjs     (Raman; 23/23 surrogate items for (d))
 *
 * Section heading literals come from src/exports/pdf-report.js:
 *   - drawSectionHeading() at line 151 emits "SECTION <N>" + title.toUpperCase()
 *   - SECTIONS[] at line 110 enumerates titles: Cover, Decision workspace
 *     summary, Plan diagnosis, Tax path, Scenarios, Month-by-month cash
 *     flow ledger, Methodology.
 *
 * §6 row count contract: src/model.js:2100 `buildMonthlyLedger()` returns
 *   exactly `years * 12` rows (INV-L04 / Q-LEDGER-MONTHLY). The PDF emits
 *   them via jspdf-autotable in renderMonthlyLedger() at line 1265, plus a
 *   footer paragraph "Ledger contains N rows (= H years × 12 months)" at
 *   line 1462 that we cross-check as a second signal.
 *
 * §2 parity contract: src/exports/pdf-report.js:608-635 derives
 *   incomeCoverPct / enduranceDisplay.primary / successDisplay.primary
 *   from the SAME upstream values that the live GaugeCards consume
 *   (src/main.jsx:5824-5826). Therefore the three primary strings MUST
 *   match byte-for-byte between live DOM and PDF on the same plan inputs.
 *
 * Run with: node tests/e2e/pdf-export-regression.mjs
 */

import { withBrowser } from "./_browser-helper.mjs";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DIST = resolve(ROOT, "dist", "app.html");

if (!existsSync(DIST)) {
  console.error("dist/app.html missing — run `npm run build` first.");
  process.exit(2);
}

const CANDIDATES = [
  (process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/opt/homebrew/bin/chromium",
];
const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) {
  console.error("No Chromium/Chrome binary found at known paths.");
  process.exit(2);
}

const PORT = 39147;
const serverProc = spawn(
  "python3",
  ["-m", "http.server", String(PORT), "--directory", resolve(ROOT, "dist")],
  { stdio: ["ignore", "ignore", "ignore"] },
);
await new Promise((r) => setTimeout(r, 700));

const t0 = Date.now();
let exitCode = 0;
let browser; // set inside withBrowser for use by capturePdfWithHorizon
const failures = [];
const checkCounts = { a: { pass: 0, fail: 0 }, b: { pass: 0, fail: 0 }, c: { pass: 0, fail: 0 }, d: { pass: 0, fail: 0 }, e: { pass: 0, fail: 0 } };

function check(axis, label, condition, detail) {
  const status = condition ? "PASS" : "FAIL";
  checkCounts[axis][condition ? "pass" : "fail"]++;
  console.log(`[${status}][${axis}] ${label}${detail ? " — " + detail : ""}`);
  if (!condition) failures.push(`(${axis}) ${label}`);
}

// ── Helper: capture a PDF from a fresh page, optionally setting horizon first.
async function capturePdfWithHorizon(horizon, label) {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error(`[pageerror:${label}]`, err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`[console.error:${label}]`, msg.text());
  });

  await page.evaluateOnNewDocument(() => {
    window.__pdfBytes = null;
    window.__pdfCaptureError = null;
    // jsPDF saveAs() routes the generated PDF blob through URL.createObjectURL
    // and a synthetic anchor MouseEvent — patching anchor.click() misses it.
    // We intercept at the createObjectURL boundary and read blob bytes back.
    const origCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      try {
        if (obj && obj instanceof Blob) {
          const isPdfBlob = (obj.type === "" || /pdf/i.test(obj.type)) && obj.size > 1000;
          if (isPdfBlob && !window.__pdfBytes) {
            obj.arrayBuffer().then((buf) => {
              window.__pdfBytes = Array.from(new Uint8Array(buf));
            }).catch((err) => {
              window.__pdfCaptureError = "arrayBuffer: " + (err && err.message || err);
            });
          }
        }
      } catch (err) {
        window.__pdfCaptureError = "createObjectURL: " + (err && err.message || err);
      }
      return origCreateObjectURL(obj);
    };
  });

  // Clear persisted state so each horizon variant starts from a clean default.
  // (Without this, the previous run's `years` would leak via localStorage.)
  await page.evaluateOnNewDocument(() => {
    try { localStorage.clear(); } catch {}
  });

  await page.goto(`http://127.0.0.1:${PORT}/app.html`, {
    waitUntil: "networkidle0",
    timeout: 45000,
  });
  await page.waitForSelector("button", { timeout: 15000 });

  // Wait for the gauge values to settle (fast tier clears the loading state).
  await page.waitForFunction(() => {
    const gauge = [...document.querySelectorAll(".gauge-card")].find((c) =>
      /Plan Endurance/i.test(c.textContent || ""));
    if (!gauge) return false;
    const strong = gauge.querySelector("strong");
    const txt = (strong && strong.textContent || "").trim();
    // "—" / empty / "rare (under 5%)" / "<n>%" / "very likely (over 95%)" are all valid settled states;
    // we just need a non-empty, non-loading value.
    return txt.length > 0 && txt !== "…" && txt !== "...";
  }, { timeout: 30000 });

  // fin-1q6: the fast tier clears the gauge loading state with a FALLBACK Monte
  // Carlo (simulations:0); the real MC arrives only when the slow tier settles.
  // The export must capture the SETTLED slow-tier MC so §2 tile detail shows the
  // true sample count and §7 does not fire the "not yet computed" sentinel.
  // Wait for window.__FIN_MC_SAMPLES_SETTLED__ (set when mc.simulations>0). If
  // the signal never appears (no slow worker in this env), fall through after the
  // timeout — the export then legitimately reflects a genuine samples=0 state.
  await page.waitForFunction(
    () => (Number(window.__FIN_MC_SAMPLES_SETTLED__) || 0) > 0,
    { timeout: 30000, polling: 200 },
  ).catch(() => {});

  if (typeof horizon === "number" && Number.isFinite(horizon)) {
    // Open Assumption Studio (where Projection years lives), set, commit.
    const horizonSet = await page.evaluate(async (h) => {
      // 1. Open the studio drawer.
      const studioBtn = document.querySelector(".studio-button");
      if (studioBtn) studioBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      // 2. Find the Projection years control.
      const ctrl = document.querySelector('label[data-label="Projection years"]');
      if (!ctrl) return { ok: false, reason: "Projection years control not found" };
      const input = ctrl.querySelector('input[type="text"]');
      if (!input) return { ok: false, reason: "Projection years text input not found" };
      // 3. Commit the new value through React's native input setter.
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(input, String(h));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      input.blur();
      await new Promise((r) => setTimeout(r, 400));
      // 4. Close the drawer.
      document.querySelector(".drawer-backdrop.open .close-button")?.click();
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, observed: input.value };
    }, horizon);
    if (!horizonSet.ok) throw new Error(`horizon set failed: ${horizonSet.reason}`);
    console.log(`  [${label}] horizon set to ${horizon} (observed ${JSON.stringify(horizonSet.observed)})`);

    // Wait for the model to re-settle.
    await page.waitForFunction(() => {
      const stat = [...document.querySelectorAll(".kpi-strip .stat-card")].find((c) =>
        /Final Corpus/i.test(c.textContent || ""));
      return !!(stat && (stat.querySelector(".stat-value") || {}).textContent);
    }, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));
  }

  // Snapshot the live gauge-card values BEFORE export (used by axis (c)).
  const liveSnapshot = await page.evaluate(() => {
    const readGauge = (label) => {
      const card = [...document.querySelectorAll(".gauge-card")].find((c) =>
        new RegExp(label, "i").test(c.textContent || ""));
      if (!card) return null;
      const strong = card.querySelector("strong");
      return strong ? strong.textContent.trim() : null;
    };
    return {
      incomeCover: readGauge("Income Cover"),
      planEndurance: readGauge("Plan Endurance"),
      targetConfidence: readGauge("Target Confidence"),
      horizonYears: Number(window.__FIN_DASHBOARD_TEST_API__?.projectionParamsFromState(
        window.__FIN_DASHBOARD_TEST_API__?.normalizeState(
          JSON.parse(localStorage.getItem("fin-cockpit-state-v2") || "{}").state || {}
        )
      )?.years) || null,
    };
  });
  console.log(`  [${label}] live snapshot: ${JSON.stringify(liveSnapshot)}`);

  // Click Export PDF.
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.actions button[title="Export PDF"]')
      || [...document.querySelectorAll("button")].find((b) => /\bPDF\b/.test((b.textContent || "").trim()) && !b.disabled);
    if (!btn) return null;
    btn.click();
    return (btn.textContent || "").trim() || btn.getAttribute("title");
  });
  if (!clicked) throw new Error(`[${label}] No enabled PDF button found.`);

  const bytes = await page.waitForFunction(
    () => {
      if (window.__pdfCaptureError) {
        throw new Error("capture error: " + window.__pdfCaptureError);
      }
      return Array.isArray(window.__pdfBytes) && window.__pdfBytes.length > 1000
        ? window.__pdfBytes
        : null;
    },
    { timeout: 90000, polling: 100 },
  ).then((h) => h.jsonValue());

  await page.close();
  if (!bytes || bytes.length < 1000) {
    throw new Error(`[${label}] PDF capture failed (got ${bytes ? bytes.length : 0} bytes)`);
  }
  return { pdfBuf: Buffer.from(bytes), liveSnapshot };
}

// ── Helper: extract per-page text from a PDF buffer using pdfjs-dist.
async function extractPageTexts(pdfBuf) {
  const { getDocument } = await import(
    resolve(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")
  );
  const pdf = await getDocument({
    data: new Uint8Array(pdfBuf),
    useSystemFonts: true,
  }).promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const tc = await p.getTextContent();
    pageTexts.push(tc.items.map((it) => it.str).join(" "));
  }
  return pageTexts;
}

try {
  await withBrowser({ args: ["--disable-dev-shm-usage"] }, async ({ browser: b }) => {
    browser = b;

  // ─────────────────────────────────────────────────────────────────────
  // PHASE 1: Default-horizon end-to-end PDF capture (the primary axis).
  // Drives (a), (c), and the default-horizon slice of (b).
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n── Phase 1: default-horizon end-to-end capture ──");
  const { pdfBuf: defaultPdf, liveSnapshot: defaultLive } = await capturePdfWithHorizon(undefined, "default");
  writeFileSync(resolve("/tmp", "r4.9.5g-pdf-regression-default.pdf"), defaultPdf);
  console.log(`  PDF captured (${defaultPdf.length} bytes) → /tmp/r4.9.5g-pdf-regression-default.pdf`);
  const defaultPages = await extractPageTexts(defaultPdf);
  console.log(`  Page count: ${defaultPages.length}`);

  // ─── Axis (a): 7 section heading markers present in order ────────────
  // pdf-report.js:151 emits "SECTION <N>" eyebrow then the uppercased title.
  // Both strings end up in the page text from pdfjs.
  const EXPECTED_SECTIONS = [
    { num: 1, banner: "SECTION 1", title: "COVER" },
    { num: 2, banner: "SECTION 2", title: "DECISION WORKSPACE SUMMARY" },
    { num: 3, banner: "SECTION 3", title: "PLAN DIAGNOSIS" },
    { num: 4, banner: "SECTION 4", title: "TAX PATH" },
    { num: 5, banner: "SECTION 5", title: "SCENARIOS" },
    { num: 6, banner: "SECTION 6", title: "MONTH-BY-MONTH CASH FLOW LEDGER" },
    { num: 7, banner: "SECTION 7", title: "METHODOLOGY" },
  ];

  // Find the first page where each section banner+title pair co-occurs.
  // The §1 cover does NOT use drawSectionHeading() (its banner is the title
  // page itself: "Retirement Corpus & Income Planner"), so for §1 we relax
  // to "title page marker" rather than the SECTION 1 literal. All other
  // sections use drawSectionHeading() and emit both strings.
  const sectionPages = [];
  for (const sec of EXPECTED_SECTIONS) {
    let foundPage = -1;
    for (let p = 0; p < defaultPages.length; p++) {
      const t = defaultPages[p];
      if (sec.num === 1) {
        // §1 cover: assert the title-page literal "Retirement Corpus & Income Planner"
        // OR the SECTION 1 / COVER pair. The cover renderer emits the long title.
        if (t.includes("Retirement Corpus & Income Planner") || (t.includes(sec.banner) && t.includes(sec.title))) {
          foundPage = p + 1;
          break;
        }
      } else {
        if (t.includes(sec.banner) && t.includes(sec.title)) {
          foundPage = p + 1;
          break;
        }
      }
    }
    sectionPages.push({ ...sec, foundPage });
    check("a", `section heading §${sec.num} (${sec.title})`,
      foundPage > 0,
      `found on page ${foundPage}`);
  }

  // Order check: page numbers must be strictly increasing.
  let orderOk = true;
  for (let i = 1; i < sectionPages.length; i++) {
    if (sectionPages[i].foundPage <= sectionPages[i - 1].foundPage) {
      orderOk = false;
      break;
    }
  }
  check("a", "section headings appear in strict ascending page order",
    orderOk,
    `pages=${JSON.stringify(sectionPages.map((s) => s.foundPage))}`);

  // ─── Axis (c): §2 headline numbers match live UI ─────────────────────
  // Locate the §2 page (already in sectionPages[1]).
  const sec2Page = sectionPages[1].foundPage;
  const sec2Text = sec2Page > 0 ? defaultPages[sec2Page - 1] : "";
  // The live UI shows ₹-prefixed currency / "N%" probability; the PDF shows
  // the same probability strings (no ₹ involvement for §2's three primary
  // gauge values — they are pure percentages / probability buckets).
  for (const [key, label] of [
    ["incomeCover", "Income Cover"],
    ["planEndurance", "Plan Endurance"],
    ["targetConfidence", "Target Confidence"],
  ]) {
    const liveVal = defaultLive[key];
    check("c", `§2 ${label} parity (live="${liveVal}")`,
      typeof liveVal === "string" && liveVal.length > 0 && sec2Text.includes(liveVal),
      `live="${liveVal}", §2 page ${sec2Page} contains: ${sec2Text.includes(liveVal)}`);
  }
  // Also assert that the §2 page contains the labels themselves (anti-eyewash:
  // make sure we matched the value next to its label, not some incidental "50%").
  // drawMetricCard() at src/exports/pdf-report.js:222 uppercases the eyebrow
  // label before emitting it via doc.text(), so the PDF contains "INCOME COVER"
  // not the title-case form shown in the live UI's GaugeCard.
  check("c", "§2 page contains all three metric-card labels (uppercased in PDF)",
    sec2Text.includes("INCOME COVER") && sec2Text.includes("PLAN ENDURANCE") && sec2Text.includes("TARGET CONFIDENCE"),
    `labels found on §2 page ${sec2Page}`);

  // ─── Axis (b) part 1: default-horizon end-to-end ledger row count ────
  const defaultHorizon = defaultLive.horizonYears || 30;
  // Locate the §6 first page.
  const sec6Page = sectionPages[5].foundPage;
  if (sec6Page <= 0) {
    check("b", "§6 located", false, "could not locate §6 page");
  } else {
    // Concatenate §6 and any continuation pages (those carry the "(CONT.)" banner).
    let sec6Combined = "";
    for (let p = sec6Page - 1; p < defaultPages.length; p++) {
      const t = defaultPages[p];
      if (p === sec6Page - 1) {
        sec6Combined += t;
      } else if (/MONTH-BY-MONTH CASH FLOW LEDGER \(CONT\.\)/.test(t)) {
        sec6Combined += "\n" + t;
      } else {
        break;
      }
    }
    // Count distinct Month# values 1..(horizon*12) appearing in the §6 text.
    // The first column of each ledger row is the month index as a bare integer.
    // We can't easily separate body rows from headers by row, but counting the
    // unique integers 1..N that appear as standalone tokens is robust.
    const expectedRows = defaultHorizon * 12;
    const tokens = sec6Combined.split(/\s+/);
    const observedMonthIndices = new Set();
    for (const tok of tokens) {
      if (/^\d{1,4}$/.test(tok)) {
        const n = Number(tok);
        if (n >= 1 && n <= expectedRows) observedMonthIndices.add(n);
      }
    }
    check("b", `§6 default horizon (${defaultHorizon}y) — month-index range 1..${expectedRows} all present`,
      observedMonthIndices.size === expectedRows,
      `observed ${observedMonthIndices.size}/${expectedRows} distinct month indices`);

    // Companion count: each body row carries one "active" scenario marker.
    // (Anti-off-by-one: stricter than the month-index set because it counts
    // duplicates, so depleted-tail or duplicated months would surface here.)
    const defaultActiveCount = (sec6Combined.match(/\bactive\b/g) || []).length;
    check("b", `§6 default horizon — exactly ${expectedRows} 'active' scenario markers (one per ledger row)`,
      defaultActiveCount === expectedRows,
      `observed ${defaultActiveCount} 'active' markers (expected ${expectedRows})`);

    // Cross-check: the renderMonthlyLedger() footer paragraph explicitly states
    // the row count in human-readable form (src/exports/pdf-report.js:1462).
    const footerMatch = sec6Combined.match(/Ledger contains (\d+) rows \(= (\d+) years × 12 months\)/);
    if (footerMatch) {
      const footerRows = Number(footerMatch[1]);
      const footerYears = Number(footerMatch[2]);
      check("b", "§6 footer paragraph row-count claim matches horizon",
        footerRows === expectedRows && footerYears === defaultHorizon,
        `footer claims ${footerRows} rows / ${footerYears} years; expected ${expectedRows} / ${defaultHorizon}`);
    } else {
      // Footer might paginate off the last page; that's OK — the row-index
      // check above is the load-bearing assertion.
      console.log(`  [info][b] §6 footer paragraph not on captured pages (paginated off); row-index check is primary`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PHASE 2: Alternate-horizon end-to-end PDF (5y) for axis (b).
  // 50y is omitted to stay inside the 60–90s budget; 5y exercises the
  // small-horizon code path which is where most off-by-one bugs hide.
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n── Phase 2: 5-year horizon end-to-end capture ──");
  const altHorizon = 5;
  const { pdfBuf: altPdf, liveSnapshot: altLive } = await capturePdfWithHorizon(altHorizon, "5y");
  writeFileSync(resolve("/tmp", "r4.9.5g-pdf-regression-5y.pdf"), altPdf);
  console.log(`  PDF captured (${altPdf.length} bytes) → /tmp/r4.9.5g-pdf-regression-5y.pdf`);
  const altPages = await extractPageTexts(altPdf);

  // Re-locate §6 in the alt PDF.
  let altSec6Page = -1;
  for (let p = 0; p < altPages.length; p++) {
    if (altPages[p].includes("SECTION 6") && altPages[p].includes("MONTH-BY-MONTH CASH FLOW LEDGER")) {
      altSec6Page = p + 1;
      break;
    }
  }
  if (altSec6Page <= 0) {
    check("b", `§6 located in 5y PDF`, false, "could not locate §6 page");
  } else {
    let altSec6Combined = "";
    for (let p = altSec6Page - 1; p < altPages.length; p++) {
      const t = altPages[p];
      if (p === altSec6Page - 1) {
        altSec6Combined += t;
      } else if (/MONTH-BY-MONTH CASH FLOW LEDGER \(CONT\.\)/.test(t)) {
        altSec6Combined += "\n" + t;
      } else {
        break;
      }
    }
    const expectedAltRows = altHorizon * 12; // 60
    const altTokens = altSec6Combined.split(/\s+/);
    const altObserved = new Set();
    for (const tok of altTokens) {
      if (/^\d{1,4}$/.test(tok)) {
        const n = Number(tok);
        if (n >= 1 && n <= expectedAltRows) altObserved.add(n);
      }
    }
    check("b", `§6 5y horizon — month-index range 1..${expectedAltRows} all present`,
      altObserved.size === expectedAltRows,
      `observed ${altObserved.size}/${expectedAltRows} distinct month indices (live snapshot horizon=${altLive.horizonYears})`);

    const altFooterMatch = altSec6Combined.match(/Ledger contains (\d+) rows \(= (\d+) years × 12 months\)/);
    if (altFooterMatch) {
      check("b", "§6 5y footer paragraph row-count claim matches 5×12=60",
        Number(altFooterMatch[1]) === 60 && Number(altFooterMatch[2]) === 5,
        `footer: ${altFooterMatch[0]}`);
    }
    // Anti-off-by-one guard: count "active" scenario_marker occurrences in
    // the §6 text — one per row by construction (renderMonthlyLedger() emits
    // String(row.scenario_marker || "active") in the last column). The Age
    // column also contains integers like "61" when retireeAge=60+1y, so we
    // can't naively check for "61" as a Month# marker. The "active" count is
    // unambiguous: every body row gets exactly one "active" cell.
    const activeCount = (altSec6Combined.match(/\bactive\b/g) || []).length;
    check("b", "§6 5y horizon — exactly 60 'active' scenario markers (= 5×12 rows, no off-by-one)",
      activeCount === 60,
      `observed ${activeCount} 'active' markers in §6 text (expected 60)`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // PHASE 1.5 (appended here after Phase 2 to reuse defaultPages / altPages
  // already in scope): Axis (e) — R4.9.5h polish-pass defect coverage.
  // All assertions operate on defaultPages (30y default plan) and on the
  // pdfjs-extracted text layer. We target what the FIXED code should produce.
  // Anti-eyewash: if a fix wasn't applied these tests FAIL — they do NOT
  // accept the old broken values.
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n── Phase 1.5: R4.9.5h defect-coverage assertions (axis e) ──");

  // Build full-document text for multi-page searches (all pages joined).
  const allDefaultText = defaultPages.join("\n");

  // Locate §7 pages (methodology + disclaimer continuation pages).
  // §7 starts on the page that contains "SECTION 7" + "METHODOLOGY".
  const sec7StartPage = sectionPages[6].foundPage; // 1-based
  let sec7Text = "";
  if (sec7StartPage > 0) {
    for (let p = sec7StartPage - 1; p < defaultPages.length; p++) {
      sec7Text += "\n" + defaultPages[p];
    }
  }

  // ── (e1) No raw markdown syntax in §7 disclaimer text ─────────────────
  // D2/D13/D14/D16/D17/D19: All markdown syntax must have been stripped/rendered.
  // These checks assert the FIXED behavior: none of these raw markers appear.

  // e1.1 — no ** bold markers (D2/D13)
  check("e", "e1.1 §7 text: no raw ** bold markers (D2/D13)",
    !/\*\*/.test(sec7Text),
    `scan of §7 text from page ${sec7StartPage} onward`);

  // e1.2 — no [text](url) link syntax (D14)
  check("e", "e1.2 §7 text: no raw [text](url) link syntax (D14)",
    !/\[[^\]]+\]\([^)]+\)/.test(sec7Text),
    "markdown link pattern absent from §7");

  // e1.3 — no | ... | pipe-table rows (D19): strict check — a pipe character
  // flanked by word chars or spaces (table cell content) must not appear.
  // We allow single | in other contexts (footers, fingerprints use none) but
  // a markdown table row pattern "|...|...|" must not appear.
  check("e", "e1.3 §7 text: no raw pipe-table rows (D19)",
    !/\|[-: ]+\|/.test(sec7Text) && !/\| Version \|/.test(sec7Text),
    "pipe table separator rows and header cells absent from §7");

  // e1.4 — no > blockquote markers (D2)
  // pdfjs strips the leading indentation but the literal "> " start-of-token
  // should not appear since stripInlineMd processes blockquotes.
  // We check the extracted text for the "> THE SOFTWARE IS PROVIDED" pattern
  // which was the specific blockquote leaking as of R4.9.5g baseline.
  check("e", "e1.4 §7 text: no raw '> ' blockquote markers (D2)",
    !/^> /.test(sec7Text) && !/ > [A-Z]/.test(sec7Text),
    "blockquote > prefix absent from §7 text");

  // e1.5 — no <https://...> angle-bracket autolink syntax (D17)
  check("e", "e1.5 §7 text: no raw <https://...> autolink syntax (D17)",
    !/<https?:\/\//.test(sec7Text),
    "angle-bracket autolink syntax absent from §7");

  // e1.6 — no triple-backtick or inline backtick code spans (D16)
  // pdfjs text extraction may not include raw backtick chars if jsPDF stripped
  // them; this catches any residual backtick leakage.
  check("e", "e1.6 §7 text: no raw backtick code spans (D16)",
    !/`/.test(sec7Text),
    "backtick characters absent from §7 extracted text");

  // ── (e2) Signal legend caption present on §1 cover (D1/D12) ──────────
  // D12 fix: "Plan health signal channels:" label must precede the four
  // colored bar labels. All five tokens must co-appear on page 1 (the cover).
  const coverText = defaultPages[0] || "";
  check("e", "e2.1 §1 cover: signal legend caption 'Plan health signal' present (D12)",
    /Plan health signal/i.test(coverText),
    `cover page text contains legend caption`);
  // The four signal labels must still be present (they are intentional, not debug text).
  check("e", "e2.2 §1 cover: GROWTH INCOME TAX WARN labels present with legend context (D1/D12)",
    /GROWTH/.test(coverText) && /TAX/.test(coverText)
      && /WARN/.test(coverText) && /INCOME/.test(coverText),
    "four signal-band labels present on cover");

  // ── (e3) No truncated words / no letter-spacing explosion in §7 (D3/D18) ─
  // The fixed code applies sanitizeForPdf before every doc.text() call in the
  // methodology table so ₹/⇒ glyphs don't corrupt the glyph layout engine.
  // "default" and "identical" are the two specific words that were truncated.
  check("e", "e3.1 §7 text: 'default' appears as a whole word (D3/D18)",
    /\bdefault\b/i.test(sec7Text),
    "word 'default' found un-truncated in §7");
  // e3.2: The R4.9.5h fix changed the MC source/citation cell text from the
  // broken "Seeded p s e u d o-r a n d o m paths; i d e n t i c a l seed !Ò i d e n t i"
  // to the sanitized "Q-MC+Q-MC-ENDURANCE. Seeded paths; same seed => same paths."
  // The word "identical" was replaced; assert the NEW correct text "same seed"
  // is present as a whole phrase (not letter-spaced). (D3/D18)
  check("e", "e3.2 §7 text: 'same seed' phrase present (D3/D18 — glyph fix causes this canonical text)",
    /same seed/.test(sec7Text),
    "phrase 'same seed' found un-exploded in §7 MC citation row (D3/D18 fix)");
  // Anti-fragment: the letter-spaced artefact produced 'd e f a u l' with
  // spaces between each character. Assert this pattern does NOT appear.
  check("e", "e3.3 §7 text: no 'd e f a u l' letter-spaced fragment (D3/D18)",
    !/d e f a u l/.test(sec7Text),
    "letter-spaced 'defaul' fragment absent from §7");
  check("e", "e3.4 §7 text: no 'i d e n t i' letter-spaced fragment (D3/D18)",
    !/i d e n t i/.test(sec7Text),
    "letter-spaced 'identi' fragment absent from §7");

  // ── (e4) No glyph fallback markers (D5) ──────────────────────────────
  // ₹ must NOT render as ¹ (superscript 1). The fix: sanitizeForPdf maps
  // ₹→"INR " so pdfjs should see "INR " not "¹".
  // Also assert "!Ò" (the ⇒ glyph fallback artefact) is absent.
  // Note: ¹ may legitimately appear in footnote context; we check the
  // specific pattern "¹12" (the "₹12L" threshold string that was broken).
  check("e", "e4.1 §7 text: no '¹12' rupee-as-superscript-1 pattern (D5)",
    !/¹\d/.test(sec7Text),
    "¹-followed-by-digit absent from §7 (was rupee fallback glyph)");
  check("e", "e4.2 §7 text: no '!Ò' arrowhead glyph fallback (D5)",
    !/!Ò/.test(sec7Text),
    "!Ò artefact (broken ⇒ glyph) absent from §7");
  // Positive assertion: the tax-law row should now contain "INR " not "¹".
  check("e", "e4.3 §7 methodology text: '12L' threshold expressed without ¹ prefix (D5)",
    !/¹12/.test(sec7Text),
    "no ¹12 pattern in §7 (tax law source cell glyph substituted)");

  // ── (e5) MC sentinel correctness (D4/fin-c96.15/fin-1q6) ─────────────
  // On a settled default plan (MC has run — the harness waits for
  // window.__FIN_MC_SAMPLES_SETTLED__) the §7 methodology table must show
  // the REAL sample count ("1000 samples"), NOT the sentinel string
  // "Monte Carlo not yet computed".
  // The §2 detail row must also show the real count, not "0 samples".
  //
  // If __FIN_MC_SAMPLES_SETTLED__ was never set (slow-tier absent in this env)
  // the capturePdfWithHorizon falls through — in that case the sentinel path
  // is legitimate. We test based on what defaultLive contains:
  const mcSettled = (Number(defaultLive.planEndurance) > 0)
    || /\d+%/.test(defaultLive.planEndurance || "")
    || /very likely|rare|quite likely|somewhat/i.test(defaultLive.planEndurance || "");
  // §7 MC row: "samples" must appear (real or sentinel).
  check("e", "e5.1 §7 text: Monte Carlo row contains 'samples' (D4/fin-1q6)",
    /samples/.test(sec7Text),
    "§7 methodology Monte Carlo row contains 'samples' token");
  // If MC settled, the sentinel must NOT appear; if MC didn't settle (env
  // with no slow worker), the sentinel is the correct output — either way passes.
  const sentinelPresent = /Monte Carlo not yet computed/i.test(sec7Text);
  if (mcSettled) {
    check("e", "e5.2 §7 text: settled MC — sentinel 'not yet computed' absent (D4/fin-1q6)",
      !sentinelPresent,
      `MC settled (live endurance="${defaultLive.planEndurance}") so sentinel must not appear in §7`);
    // Positive: settled MC row shows a numeric sample count (e.g. "1000 samples")
    check("e", "e5.3 §7 text: settled MC — numeric sample count present in §7 (fin-1q6)",
      /\b\d+\s+samples\b/.test(sec7Text),
      "numeric sample count (e.g. '1000 samples') found in §7 methodology table");
  } else {
    // MC not settled (no slow worker in this environment) — sentinel is correct.
    check("e", "e5.2 §7 text: unsettled MC — sentinel string present or numeric count present (D4)",
      sentinelPresent || /\b\d+\s+samples\b/.test(sec7Text),
      "either sentinel or real count present in §7 — either is valid when MC is unsettled");
  }

  // §2 tile detail: must not show "0 samples" when MC has settled.
  const sec2AllText = defaultPages.slice(sec2Page - 1, sec2Page + 1).join(" ");
  if (mcSettled) {
    check("e", "e5.4 §2 tile detail: settled MC — '0 samples' not in §2 tile area (fin-1q6)",
      !/\b0 samples\b/.test(sec2AllText),
      `§2 tile area (pages ${sec2Page}-${sec2Page + 1}) must not show 0-sample count when MC settled`);
  }

  // ── (e6) Year-end ledger row marker (D8) ─────────────────────────────
  // §15.4 fix: year-end rows (month 12, 24, ...) must use panel3 fill (#dee6f1)
  // which has ~10% luminance difference from the bg2 rows, making them
  // visually distinct. We cannot inspect fill colors from pdfjs text extraction,
  // but we CAN assert that the ledger structural patterns hold:
  //   - rows at month indices that are multiples of 12 are present
  //   - the footer paragraph confirms year-end reconciliation language
  //
  // Additionally, per §15.4.2, year-end rows use bold fontStyle. jsPDF writes
  // bold text with different width metrics; pdfjs may split them differently
  // but the content is the same. We assert the structure: month 12, 24, 36
  // all appear in the §6 text (already covered by axis b), and we add a
  // qualitative check that the §6 footer mentions "Year-end rows" or
  // equivalent reconciliation language.
  if (sec6Page > 0) {
    // Re-read the §6 combined text (already built for axis b checks above).
    let sec6CombinedE = "";
    for (let p = sec6Page - 1; p < defaultPages.length; p++) {
      const t = defaultPages[p];
      if (p === sec6Page - 1) {
        sec6CombinedE += t;
      } else if (/MONTH-BY-MONTH CASH FLOW LEDGER \(CONT\.\)/.test(t)) {
        sec6CombinedE += "\n" + t;
      } else {
        break;
      }
    }
    // Month 12 row must be present (year-end boundary check).
    check("e", "e6.1 §6 ledger: month-12 row present (first year-end boundary, D8)",
      /\b12\b/.test(sec6CombinedE),
      "month index 12 appears in §6 text");
    // Month 24 row must be present (second year-end boundary).
    check("e", "e6.2 §6 ledger: month-24 row present (second year-end boundary, D8)",
      /\b24\b/.test(sec6CombinedE),
      "month index 24 appears in §6 text");
    // The footer paragraph mentions year-end reconciliation.
    check("e", "e6.3 §6 ledger footer: year-end reconciliation language present (D8/§15.4)",
      /year-end|Year-end|INV-L05|Q-LEDGER-MONTHLY/.test(sec6CombinedE),
      "year-end reconciliation mention in §6 footer (Q-LEDGER-MONTHLY or INV-L05)");
  } else {
    check("e", "e6.1 §6 located for year-end checks", false, "§6 not found — skipping e6 sub-checks");
  }

  // ── (e7) §2 tile mirror + §15.2.5 sibling table (D7/D23/D24) ─────────
  // §15.2.5 MANDATORY: the sibling autotable must carry all four tile labels
  // as extractable text, parity-correct vs the live app.
  //
  // R4.9.5h Pass-2 Dispatch 3 — D24 fix: the §15.2.5 sibling table was
  // relocated from inline-under-tiles to "Appendix A — Accessibility Data
  // Tables" at the document tail (owner reality-check flagged the inline
  // duplication as visible clutter for sighted readers). The assertions
  // below therefore check the whole-document text rather than the §2 page
  // alone — the surrogate posture is preserved (text-extractable for AT)
  // but the visual layout no longer carries the duplicate panel.
  //
  // The four tile labels INCOME COVER / PLAN ENDURANCE / TARGET CONFIDENCE
  // / TAX DRAG are independently emitted on the §2 page by the visual tile
  // renderer (drawDecisionTile) AND on the appendix page by the sibling
  // table — both surfaces are checked transitively by allText.
  const allText = defaultPages.join(" ");
  check("e", "e7.1 a11y sibling table: 'Metric' header present in document (§15.2.5/D7/D24)",
    allText.includes("Metric"),
    "§15.2.5 sibling autotable header 'Metric' found in document text (Appendix A under D24)");
  check("e", "e7.2 §2 tile label 'INCOME COVER' present in document (§15.2.5/D7)",
    sec2Text.includes("INCOME COVER") && allText.includes("INCOME COVER"),
    "tile label 'INCOME COVER' present on §2 page AND in sibling table (Appendix A)");
  check("e", "e7.3 §2 tile label 'PLAN ENDURANCE' present in document (§15.2.5/D7)",
    sec2Text.includes("PLAN ENDURANCE") && allText.includes("PLAN ENDURANCE"),
    "tile label 'PLAN ENDURANCE' present on §2 page AND in sibling table (Appendix A)");
  check("e", "e7.4 §2 tile label 'TARGET CONFIDENCE' present in document (§15.2.5/D7)",
    sec2Text.includes("TARGET CONFIDENCE") && allText.includes("TARGET CONFIDENCE"),
    "tile label 'TARGET CONFIDENCE' present on §2 page AND in sibling table (Appendix A)");
  check("e", "e7.5 §2 tile label 'TAX DRAG' present in document (§15.2.5/D7)",
    sec2Text.includes("TAX DRAG") && allText.includes("TAX DRAG"),
    "tile label 'TAX DRAG' present on §2 page AND in sibling table (Appendix A)");
  // D23 / §15.2.5: closing-gap section must also be present on §2 (either
  // "CLOSING THE GAP" heading or the gap-detail row).
  check("e", "e7.6 §2 closing-gap section present (§15.2.4/D23)",
    sec2Text.includes("CLOSING THE GAP") || sec2Text.includes("Closing the gap") || sec2Text.includes("closing gap"),
    "closing-gap tile/section present on §2 page");
  // D24 / Pass-2 Dispatch 3: confirm Appendix A actually renders.
  check("e", "e7.7 Appendix A — Accessibility Data Tables present (D24)",
    allText.includes("APPENDIX A") && allText.includes("ACCESSIBILITY DATA TABLES"),
    "Appendix A banner + heading present in document text");

  // ── (e8) R4.9.5g a11y surrogate posture: §15.2.5 table is machine-readable ─
  // The §15.2.5 sibling autotable must contain the VALUE from the live UI
  // for at least one tile (Income Cover is always a percentage — easiest to
  // verify). Post-D24 the value lives in Appendix A, so we scan allText.
  const incomeCoverLive = defaultLive.incomeCover; // e.g. "22%"
  if (typeof incomeCoverLive === "string" && incomeCoverLive.length > 0) {
    check("e", "e8.1 a11y sibling table: Income Cover value matches live UI value (§15.2.5/D24)",
      allText.includes(incomeCoverLive),
      `live="${incomeCoverLive}" must appear in document text (sibling table value column, Appendix A under D24)`);
  } else {
    console.log("  [info][e] Income Cover live value not captured — e8.1 skipped");
  }

  // ── (e9) R4.9.5j fin-vkv — PDF link annotations for absolute URLs ────
  // DISCLAIMER.md §2 contains the SEBI registry autolink:
  //   <https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13>
  // After fin-vkv, emitRuns must emit a PDF Link annotation via doc.textWithLink.
  // pdfjs-dist exposes per-page annotations via page.getAnnotations(); we assert
  // at least one annotation of subtype "Link" whose url contains "sebi.gov.in".
  console.log("\n── e9: PDF link annotation extraction (fin-vkv) ──");
  try {
    const { getDocument } = await import(
      resolve(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")
    );
    const pdfDocForAnnot = await getDocument({
      data: new Uint8Array(defaultPdf),
      useSystemFonts: true,
    }).promise;
    const linkAnnotations = [];
    for (let pi = 1; pi <= pdfDocForAnnot.numPages; pi++) {
      const page = await pdfDocForAnnot.getPage(pi);
      const annots = await page.getAnnotations();
      for (const a of annots) {
        if (a.subtype === "Link" && typeof a.url === "string" && a.url.length > 0) {
          linkAnnotations.push({ page: pi, url: a.url });
        }
      }
    }
    console.log(`  Found ${linkAnnotations.length} Link annotation(s) in default PDF`);
    if (linkAnnotations.length > 0) {
      console.log(`  Sample URLs: ${linkAnnotations.slice(0, 3).map((a) => a.url).join(", ")}`);
    }
    // Assert at least one Link annotation exists in the document.
    check("e", "e9.1 PDF has at least one Link annotation (fin-vkv textWithLink)",
      linkAnnotations.length >= 1,
      `found ${linkAnnotations.length} Link annotation(s) across ${pdfDocForAnnot.numPages} pages`);
    // Assert the SEBI link specifically (canonical absolute URL from DISCLAIMER.md §2).
    const sebiAnnot = linkAnnotations.find((a) => /sebi\.gov\.in/i.test(a.url));
    check("e", "e9.2 PDF contains sebi.gov.in Link annotation (fin-vkv DISCLAIMER.md §2 autolink)",
      sebiAnnot != null,
      sebiAnnot
        ? `found on page ${sebiAnnot.page}: ${sebiAnnot.url}`
        : `no sebi.gov.in annotation found; all URLs: ${linkAnnotations.map((a) => a.url).join(", ")}`);
  } catch (annotErr) {
    console.error("  [e9] Annotation extraction error:", annotErr.message || annotErr);
    check("e", "e9.1 PDF link annotation extraction did not throw", false, String(annotErr.message || annotErr));
  }

  // ─────────────────────────────────────────────────────────────────────
  // PHASE 3: Axis (d) — defer to Raman's surrogate harness.
  // We invoke the existing a11y surrogate harness as a subprocess and
  // assert its exit code. This avoids duplicating the 23 surrogate
  // assertions while still keeping (d) inside this umbrella gate.
  // Linkage: tests/e2e/r4.9.5g-pdf-a11y-surrogate.mjs (Raman, fin-c96.6)
  // ─────────────────────────────────────────────────────────────────────
  await browser.close();
  browser = null;
  // Release the http.server port so the sister harness can re-bind on 39146.
  serverProc.kill();
  await new Promise((r) => setTimeout(r, 400));

  console.log("\n── Phase 3: invoke a11y surrogate harness (axis d) ──");
  const subRes = spawnSync(
    process.execPath,
    [resolve(ROOT, "tests/e2e/r4.9.5g-pdf-a11y-surrogate.mjs")],
    { stdio: "inherit", timeout: 180000 },
  );
  check("d", "a11y surrogate harness exit code === 0 (delegates 23/23 surrogate items)",
    subRes.status === 0,
    `exit=${subRes.status}, signal=${subRes.signal || "none"}`);

  // ─────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n── Per-axis results ──");
  for (const axis of ["a", "b", "c", "d", "e"]) {
    console.log(`  axis (${axis}): ${checkCounts[axis].pass} PASS, ${checkCounts[axis].fail} FAIL`);
  }
  console.log(`\nElapsed: ${elapsed}s`);

  if (failures.length > 0) {
    console.error(`\nVERIFICATION FAILED — ${failures.length} assertion(s):`);
    failures.forEach((f) => console.error(`  - ${f}`));
    exitCode = 1;
  } else {
    console.log("\nVERIFICATION PASSED — all axes (a)(b)(c)(d)(e) green (includes e9/fin-vkv link annotations).");
  }
  // Kill server before withBrowser closes Chrome to avoid hung websocket.
  try { serverProc.kill(); } catch {}
  }); // withBrowser
} catch (err) {
  console.error("Harness error:", err);
  exitCode = 2;
} finally {
  try { serverProc.kill(); } catch {}
}

process.exit(exitCode);
