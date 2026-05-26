/**
 * R4.9.5g fin-c96.6 closure — PDF accessibility surrogate-bundle verification.
 *
 * Closure criterion (per R4-Q11, owner-approved 2026-05-21): jspdf cannot emit
 * a true PDF/UA structure tree, but the following surrogates are required and
 * must be present + verifiable end-to-end:
 *
 *   1. doc.setProperties(...) — Title, Subject, Author, Keywords, Creator
 *   2. doc.setLanguage("en-IN")
 *   3. 7-section PDF outline (bookmarks) — §1..§7 navigable from AT
 *   4. Sibling data tables for every §3 chart (corpus-journey, donut, statement-bar)
 *   5. §6 ledger autotable with row/column tagging (jspdf-autotable v5)
 *   6. §7 ACCESSIBILITY POSTURE panel disclosing the surrogate strategy +
 *      referencing fin-9oj (R5 deferred /StructTreeRoot work)
 *
 * Full /StructTreeRoot tagged-PDF support is deferred to R5 via fin-9oj.
 *
 * Method (mirrors r4.9.5g-pdf-autotable-verify.mjs blob-capture):
 *   1. Build the app (`npm run build` must have been run already; harness
 *      bails if dist/app.html missing).
 *   2. Patch URL.createObjectURL in Puppeteer to capture the jspdf-generated
 *      blob, ferry bytes back to Node.
 *   3. Load via pdfjs-dist; introspect via getMetadata() + getOutline() +
 *      per-page text content.
 *   4. Assert every surrogate item present. Exit 0 on PASS, 1 on FAIL.
 *
 * Run with: node tests/e2e/r4.9.5g-pdf-a11y-surrogate.mjs
 */

import { withBrowser } from "./_browser-helper.mjs";
import { tmpFile } from "./_tmp-helper.mjs";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

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

const PORT = 39146;
const serverProc = spawn(
  "python3",
  ["-m", "http.server", String(PORT), "--directory", resolve(ROOT, "dist")],
  { stdio: ["ignore", "ignore", "ignore"] },
);
await new Promise((r) => setTimeout(r, 700));

let exitCode = 0;
const failures = [];

function check(label, condition, detail) {
  const status = condition ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail ? " — " + detail : ""}`);
  if (!condition) failures.push(label);
}

try {
  await withBrowser({ args: ["--disable-dev-shm-usage"] }, async ({ page }) => {
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console.error]", msg.text());
  });

  await page.evaluateOnNewDocument(() => {
    window.__pdfBytes = null;
    window.__pdfCaptureError = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      try {
        if (obj && obj instanceof Blob) {
          const isPdf = (obj.type === "" || /pdf/i.test(obj.type)) && obj.size > 1000;
          if (isPdf && !window.__pdfBytes) {
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
      return orig(obj);
    };
  });

  await page.goto(`http://127.0.0.1:${PORT}/app.html`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await page.waitForSelector("button", { timeout: 15000 });

  // R4.9.5i: R4-Q18 export gate disables PDF buttons until the slow-tier Monte
  // Carlo settles (window.__FIN_MC_SAMPLES_SETTLED__ > 0). With smaller bundles
  // post-R4.9.5i ECharts tree-shaking, networkidle0 fires before MC settles, so
  // the chain-context flake on r4.9.5g tests surfaces. Mirror pdf-export-regression's
  // settle gate. Tolerant: fall through on timeout (slow-tier may be absent).
  await page.waitForFunction(
    () => (Number(window.__FIN_MC_SAMPLES_SETTLED__) || 0) > 0,
    { timeout: 30000, polling: 200 },
  ).catch(() => {});

  const clickedLabel = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const cand = btns.find((b) => /\bPDF\b/.test((b.textContent || "").trim()) && !b.disabled);
    if (!cand) return null;
    cand.click();
    return (cand.textContent || "").trim();
  });
  if (!clickedLabel) throw new Error("No enabled PDF button found.");
  console.log(`Clicked button: ${JSON.stringify(clickedLabel)}`);

  const bytes = await page.waitForFunction(
    () => {
      if (window.__pdfCaptureError) {
        throw new Error("capture error: " + window.__pdfCaptureError);
      }
      return Array.isArray(window.__pdfBytes) && window.__pdfBytes.length > 1000
        ? window.__pdfBytes
        : null;
    },
    { timeout: 60000, polling: 100 },
  ).then((h) => h.jsonValue());

  if (!bytes || bytes.length < 1000) {
    throw new Error(`PDF capture failed (got ${bytes ? bytes.length : 0} bytes)`);
  }

  const pdfBuf = Buffer.from(bytes);
  const outPath = tmpFile("r4.9.5g-pdf-a11y-surrogate.pdf");
  writeFileSync(outPath, pdfBuf);
  console.log(`PDF captured (${pdfBuf.length} bytes) -> ${outPath}`);

  const { getDocument } = await import(
    resolve(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")
  );
  const pdf = await getDocument({ data: new Uint8Array(pdfBuf), useSystemFonts: true }).promise;
  console.log(`Page count: ${pdf.numPages}`);

  // ── Surrogate 1: doc.setProperties(...) — Title/Subject/Author/Keywords/Creator
  const meta = await pdf.getMetadata();
  const info = meta.info || {};
  check("metadata: Title present",
    typeof info.Title === "string" && info.Title.includes("Retirement Corpus"),
    `Title=${JSON.stringify(info.Title)}`);
  check("metadata: Subject present",
    typeof info.Subject === "string" && info.Subject.toLowerCase().includes("structured planning"),
    `Subject=${JSON.stringify(info.Subject)}`);
  check("metadata: Author present",
    typeof info.Author === "string" && info.Author.length > 0,
    `Author=${JSON.stringify(info.Author)}`);
  check("metadata: Keywords present",
    typeof info.Keywords === "string" && /retirement/i.test(info.Keywords),
    `Keywords=${JSON.stringify(info.Keywords)}`);
  check("metadata: Creator present",
    typeof info.Creator === "string" && /v1\.0\.0/.test(info.Creator),
    `Creator=${JSON.stringify(info.Creator)}`);

  // ── Surrogate 2: doc.setLanguage("en-IN")
  // pdfjs surfaces /Lang at the catalog level via Language field (top-level).
  // jspdf writes the catalog /Lang entry; pdfjs returns it in metadata.info.Language.
  check("metadata: Language=en-IN",
    typeof info.Language === "string" && info.Language === "en-IN",
    `Language=${JSON.stringify(info.Language)}`);

  // ── Surrogate 3: 7-section PDF outline (bookmarks)
  const outline = await pdf.getOutline();
  // Top-level: 1 root entry ("Retirement Corpus & Income Planner"); children = 7 sections.
  const outlineCount = Array.isArray(outline) ? outline.length : 0;
  check("outline: present", outlineCount > 0, `top-level entries=${outlineCount}`);
  let sectionChildren = [];
  if (outlineCount === 1 && Array.isArray(outline[0].items)) {
    sectionChildren = outline[0].items;
  } else if (outlineCount >= 7) {
    // Some PDF parsers flatten the single-root case.
    sectionChildren = outline;
  }
  check("outline: 7 section bookmarks",
    sectionChildren.length === 7,
    `children=${sectionChildren.length}`);
  const expectedSections = [
    "Cover", "Decision workspace", "Plan diagnosis",
    "Tax path", "Scenarios", "Month-by-month", "Methodology",
  ];
  const titles = sectionChildren.map((c) => c.title || "");
  expectedSections.forEach((expected) => {
    check(`outline: bookmark mentions "${expected}"`,
      titles.some((t) => t.toLowerCase().includes(expected.toLowerCase())),
      `titles=${JSON.stringify(titles)}`);
  });

  // ── Surrogate 4: Sibling data tables for every §3 chart
  // Gather per-page text content
  const pageTexts = {};
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const tc = await p.getTextContent();
    pageTexts[i] = tc.items.map((it) => it.str).join(" ");
  }

  const allText = Object.values(pageTexts).join(" ");
  check("sibling table: corpus-journey (P10/P50/P90)",
    /P10 corpus/.test(allText) && /P50 corpus/.test(allText) && /P90 corpus/.test(allText),
    "headers found");
  check("sibling table: donut composition (Starting principal / Top-ups / Reinvested growth)",
    /Donut composition/.test(allText)
      && /Starting principal/.test(allText)
      && /Top-ups/.test(allText)
      && /Reinvested growth/.test(allText),
    "all 3 donut rows + header present");
  check("sibling table: projection statement (4 bars)",
    /Projection statement/.test(allText)
      && /Corpus Goal/.test(allText)
      && /Cash Goal/.test(allText)
      && /End Chance/.test(allText)
      && /Tax Drag/.test(allText),
    "all 4 statement-bar rows + header present");

  // ── Surrogate 5: §6 ledger autotable row/column tagging
  // Tagging in jspdf-autotable v5 is implicit: the head[] array produces a
  // bold header row separated from the data rows. We verify the head row's
  // 10 column labels are all present on the same page (the first §6 page).
  const ledgerHeaders = ["Month#", "Year", "Age", "Opening", "W/d (nom)",
    "W/d (real)", "Growth", "Tax", "Closing", "Scenario"];
  const ledgerPage = Object.entries(pageTexts).find(([, t]) =>
    ledgerHeaders.every((h) => t.includes(h)),
  );
  check("ledger: §6 autotable header row (10 columns)",
    !!ledgerPage,
    ledgerPage ? `page ${ledgerPage[0]}` : "no page contains all 10 headers");

  // ── Surrogate 6: §7 ACCESSIBILITY POSTURE disclosure + fin-9oj reference
  check("§7 disclosure: ACCESSIBILITY POSTURE panel",
    /ACCESSIBILITY POSTURE/.test(allText),
    "panel banner present");
  check("§7 disclosure: 'not claimed as PDF/UA' language",
    /not claimed as PDF\/UA/i.test(allText),
    "honesty disclaimer present");
  check("§7 disclosure: fin-9oj R5 reference",
    /fin-9oj/i.test(allText),
    "deferred-bead reference present");
  check("§7 disclosure: setProperties + /Lang + outline language",
    /setProperties/i.test(allText)
      && /\/Lang=en-IN/i.test(allText)
      && /outline bookmarks/i.test(allText),
    "surrogate strategy explicitly disclosed");

  if (failures.length > 0) {
    console.error(`\nVERIFICATION FAILED — ${failures.length} surrogate item(s) missing:`);
    failures.forEach((f) => console.error(`  - ${f}`));
    exitCode = 1;
  } else {
    console.log("\nVERIFICATION PASSED — all R4-Q11 surrogate items present.");
  }
  // Kill server before withBrowser closes Chrome to avoid hung websocket.
  try { serverProc.kill(); } catch {}
  }); // withBrowser
} catch (err) {
  console.error("Verification harness error:", err);
  exitCode = 2;
} finally {
  try { serverProc.kill(); } catch {}
}

process.exit(exitCode);
