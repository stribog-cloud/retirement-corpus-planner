import { withBrowser } from "./_browser-helper.mjs";
import path from "node:path";

const distIndex = path.resolve("dist/index.html");
const url = `file://${distIndex}`;
const outPath = "audit/round-4/r4.9.5k-footer-alignment.png";

await withBrowser({}, async ({ page }) => {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await page.evaluate(() => {
    const f = document.querySelector("footer.app-footer");
    if (f) f.scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 500));

  const probe = await page.evaluate(() => {
    const f = document.querySelector("footer.app-footer");
    const ms = document.querySelector("section.main-stack");
    const rg = document.querySelector("section.report-grid");
    if (!f) return { error: "footer not found" };
    const fb = f.getBoundingClientRect();
    const mb = ms ? ms.getBoundingClientRect() : null;
    const rb = rg ? rg.getBoundingClientRect() : null;
    const parent = f.parentElement ? f.parentElement.className : null;
    const link = f.querySelector("a");
    return {
      footer: { x: fb.x, width: fb.width, right: fb.right },
      mainStack: mb ? { x: mb.x, width: mb.width, right: mb.right } : null,
      reportGrid: rb ? { x: rb.x, width: rb.width, right: rb.right } : null,
      footerParentClass: parent,
      pageWidth: window.innerWidth,
      footerText: f.innerText,
      linkHref: link ? link.href : null,
      linkText: link ? link.innerText.trim() : null,
      linkTarget: link ? link.target : null,
      linkRel: link ? link.rel : null,
    };
  });
  console.log("FOOTER PROBE:", JSON.stringify(probe, null, 2));

  await page.screenshot({ path: outPath, fullPage: false });
  console.log("SCREENSHOT:", outPath);

  // Also probe help drawer hrefs to verify PRIVACY/DISCLAIMER URLs
  const drawerProbe = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("a[href*='PRIVACY.md'], a[href*='DISCLAIMER.md']"));
    return all.map((a) => ({ href: a.href, text: a.innerText.trim() }));
  });
  console.log("HELP-DRAWER LINKS:", JSON.stringify(drawerProbe, null, 2));
});
