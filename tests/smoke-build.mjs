import { readFile, stat } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rootIndex = await readFile("index.html", "utf8");
const distIndex = await readFile("dist/index.html", "utf8");
const titledArtifact = await readFile("Retirement Corpus & Income Planner.html", "utf8");
const size = await stat("index.html");

assert(rootIndex.includes('<div id="root"></div>'), "root index is missing React mount node");
assert(rootIndex.includes("Retirement Corpus & Income Planner"), "root index is missing retirement planner title text");
const favicon = rootIndex.match(/<link rel="icon"[^>]+href="([^"]+)"/);
assert(favicon, "root index is missing favicon link");
assert(favicon[1].startsWith("data:image/svg+xml,"), "root index favicon must be a self-contained SVG data URL");
assert(favicon[1] !== "data:,", "root index favicon is still blank");
assert(rootIndex.includes('<meta name="theme-color" content="#101827" />'), "root index is missing browser theme color");
assert(rootIndex.includes("Recommended Strategy Shortlist"), "root index is missing strategy shortlist panel");
assert(rootIndex.includes("Withdrawal Policy & Trust Plan"), "root index is missing withdrawal policy advisor panel");
// R4.9.5g (fin-4ml, 2026-05-21): the old PDF code path containing the
// "Advisor Action Plan" literal has been removed. The R4.9.5g structured
// PDF (sole production export) renders §2 with the "CLOSING THE GAP"
// section heading and "CAN THIS PLAN WORK?" verdict tile.
assert(rootIndex.includes("CLOSING THE GAP"), "root index is missing R4.9.5g PDF §2 section header");
assert(rootIndex.includes("CAN THIS PLAN WORK?"), "root index is missing R4.9.5g PDF §2 verdict tile");
assert(rootIndex.includes("Guided Planner"), "root index is missing guided planner copy");
assert(rootIndex.includes("Tax Assumptions & Scenarios"), "root index is missing tax help content");
assert(rootIndex.includes("Tax Law Studio"), "root index is missing editable tax-law ruleset UI");
assert(rootIndex.includes("editable tax-law ruleset"), "root index is missing tax-law update help content");
assert(rootIndex.includes("Retiree profile engine"), "root index is missing retiree tax profile controls");
assert(rootIndex.includes("Section 87A rebate"), "root index is missing Section 87A controls");
assert(rootIndex.includes("End Target Chance"), "root index is missing End Target Chance label (help text)");
assert(rootIndex.includes("Plan Endurance"), "root index is missing Plan Endurance primary tile label");
assert(rootIndex.includes("Target Confidence"), "root index is missing Target Confidence secondary tile label");
assert(rootIndex.includes("Chance your money lasts the full plan"), "root index is missing Plan Endurance caption");
assert(rootIndex.includes("Saved Scenario Timeline"), "root index is missing saved scenario timeline");
assert(rootIndex.includes("Assumptions fingerprint"), "root index is missing export fingerprint framing");
assert(rootIndex.includes("planning sensitivity, not a prediction"), "root index is missing risk trust caveat");
assert(rootIndex.includes("Trust Center"), "root index is missing trust center surface");
assert(rootIndex.includes("Retiree Guided Mode"), "root index is missing retiree guided mode");
assert(rootIndex.includes("Retirement Stress Case Library"), "root index is missing scenario library");
assert(rootIndex.includes("Adviser / CA Pack"), "root index is missing adviser/CA review pack");
assert(rootIndex.includes("retirement_adviser_ca_review_pack.json"), "root index is missing review-pack JSON export");
assert(rootIndex.includes("data:text/javascript") || rootIndex.includes("<script"), "root index is missing inline script");
assert(!rootIndex.includes('src="/src/main.jsx"'), "root index still references dev source entry");
assert(rootIndex === distIndex, "root index and dist/index.html differ");
assert(rootIndex === titledArtifact, "root index and product-title shippable file differ");
assert(size.size > 1_000_000, "single-file artifact is unexpectedly small");

console.log(JSON.stringify({ ok: true, bytes: size.size }, null, 2));
