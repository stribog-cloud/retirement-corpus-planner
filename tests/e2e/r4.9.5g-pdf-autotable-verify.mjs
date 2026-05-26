/**
 * R4.9.5g fin-c96.10 verification — re-render the §3/§4/§5 autotables and
 * assert each previously-blank page now contains the autotable header row
 * + at least 3 data rows.
 *
 * Method:
 *   1. Open the built bundle (dist/app.html) in Puppeteer. The structured
 *      R4.9.5g PDF is now the sole export path (fin-4ml cleanup, 2026-05-21);
 *      no URL toggle is required.
 *   2. Patch `HTMLAnchorElement.prototype.click` so that the jsPDF.save()
 *      generated anchor click (which targets a blob: URL) is intercepted,
 *      the linked blob is read into memory, and stashed at
 *      `window.__pdfBytes`.
 *   3. Click the "Export PDF" button.
 *   4. Read the captured bytes back to Node, parse them with pdfjs-dist,
 *      and extract text from every page.
 *   5. For each of the 5 autotables, locate the best-matching page by
 *      header text + row marker counts. Assert the best-match page
 *      contains the expected headers AND >= the required row count.
 *
 * Run with: node tests/e2e/r4.9.5g-pdf-autotable-verify.mjs
 */

import { withBrowser } from "./_browser-helper.mjs";
import { tmpFile } from "./_tmp-helper.mjs";
import { freePort } from "./_net-helper.mjs";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const DIST = resolve(ROOT, "dist", "app.html");

if (!existsSync(DIST)) {
  console.error("dist/app.html missing — run `npm run build` first.");
  process.exit(2);
}

const PORT = await freePort();
const serverProc = spawn("python3", ["-m", "http.server", String(PORT), "--directory", resolve(ROOT, "dist")], {
  stdio: ["ignore", "ignore", "ignore"],
});
await new Promise((r) => setTimeout(r, 700));

let exitCode = 0;
try {
  await withBrowser({ args: ["--disable-dev-shm-usage"] }, async ({ page }) => {
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console.error]", msg.text());
  });

  await page.evaluateOnNewDocument(() => {
    window.__pdfBytes = null;
    window.__pdfCaptureError = null;
    // jsPDF's saveAs implementation calls URL.createObjectURL(blob) on the
    // generated PDF blob, then dispatches a synthetic MouseEvent("click")
    // on an anchor — patching anchor.click() therefore misses it. We
    // intercept at the createObjectURL boundary instead, reading the blob's
    // bytes back when it looks like a PDF.
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
  console.log(`Clicked button labelled: ${JSON.stringify(clickedLabel)}`);

  const bytes = await page.waitForFunction(
    () => {
      if (window.__pdfCaptureError) {
        throw new Error("capture error: " + window.__pdfCaptureError);
      }
      return Array.isArray(window.__pdfBytes) && window.__pdfBytes.length > 1000
        ? window.__pdfBytes
        : null;
    },
    { timeout: 60000, polling: 100 }
  ).then((h) => h.jsonValue());

  if (!bytes || bytes.length < 1000) {
    throw new Error(`PDF capture failed (got ${bytes ? bytes.length : 0} bytes)`);
  }

  const pdfBuf = Buffer.from(bytes);
  const outPath = tmpFile("r4.9.5g-pdf-capture.pdf");
  writeFileSync(outPath, pdfBuf);
  console.log(`PDF captured (${pdfBuf.length} bytes) -> ${outPath}`);

  const { getDocument } = await import(resolve(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs"));
  const loadingTask = getDocument({ data: new Uint8Array(pdfBuf), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  console.log(`Page count: ${pageCount}`);

  const pageTexts = {};
  for (let i = 1; i <= pageCount; i++) {
    const p = await pdf.getPage(i);
    const tc = await p.getTextContent();
    pageTexts[i] = tc.items.map((it) => it.str).join(" ");
  }

  const checks = [
    {
      label: "§3 corpus-journey table",
      headers: ["P10 corpus", "P50 corpus", "P90 corpus"],
      rowMarker: /Year\s+\d+/g,
      minRows: 3,
    },
    {
      label: "§3 projection-summary table",
      headers: ["Opening corpus", "Total withdrawn"],
      rowMarker: /(Opening corpus|Total withdrawn|Real final balance|Nominal final balance|Effective yield|Tax drag|Tax burden|Payback ratio)/g,
      minRows: 4,
    },
    {
      label: "§4 tax-facts (§87A/§74/§115BAC) table",
      headers: ["§87A rebate", "§74 capital-loss carry-forward"],
      rowMarker: /(§87A|§115BAC|§80TTB|§74|Surcharge|Slab vs special-rate|Total Year-1 relief)/g,
      minRows: 4,
    },
    {
      label: "§4 effective-yield / tax-drag table",
      headers: ["Effective yield (modelled)", "Gross growth (cumulative)"],
      rowMarker: /(Effective yield \(modelled\)|Gross growth \(cumulative\)|Tax paid \(cumulative\)|Net growth after tax|Tax burden \(tax \/ gross growth\)|Tax-lot method|Cost capital recovered|Tax profile)/g,
      minRows: 5,
    },
    {
      label: "§5 scenarios table",
      headers: ["Final (nominal)", "Final (real-today)"],
      rowMarker: /(Active|Income|Growth|Stress)/g,
      minRows: 3,
    },
  ];

  let failures = 0;
  for (const check of checks) {
    let bestPage = -1;
    let bestScore = -1;
    let bestRowMatches = [];
    for (let p = 1; p <= pageCount; p++) {
      const t = pageTexts[p] || "";
      const headerScore = check.headers.filter((h) => t.includes(h)).length;
      const rowMatches = t.match(check.rowMarker) || [];
      const distinctRows = [...new Set(rowMatches)];
      const score = headerScore * 100 + distinctRows.length;
      if (score > bestScore) {
        bestScore = score;
        bestPage = p;
        bestRowMatches = distinctRows;
      }
    }
    const t = pageTexts[bestPage] || "";
    const haveHeaders = check.headers.filter((h) => t.includes(h));
    const headerOk = haveHeaders.length >= Math.min(2, check.headers.length);
    const rowsOk = bestRowMatches.length >= check.minRows;
    const status = (headerOk && rowsOk) ? "PASS" : "FAIL";
    console.log(`[${status}] page ${bestPage}: ${check.label}`);
    console.log(`        headers ${haveHeaders.length}/${check.headers.length}: ${JSON.stringify(haveHeaders)}`);
    console.log(`        distinct rows: ${bestRowMatches.length} (need >= ${check.minRows}) -> ${JSON.stringify(bestRowMatches.slice(0, 8))}`);
    if (status === "FAIL") {
      failures++;
      console.log(`        --- best-match page ${bestPage} text (first 800 chars) ---`);
      console.log(`        ${t.slice(0, 800)}`);
    }
  }

  if (failures > 0) {
    console.error(`\nVERIFICATION FAILED — ${failures} table(s) still blank or partial.`);
    exitCode = 1;
  } else {
    console.log("\nVERIFICATION PASSED — all 5 autotables visibly populated.");
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
