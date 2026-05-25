import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

const required = [
  "AGENTS.md",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "docs/internal/CHARTER-COMPLIANCE-ANNEX.md",
  "docs/internal/MASTER-REFERENCE.md",
  "docs/internal/TESTING-STRATEGY.md",
  "docs/internal/BUILD-PLAN.md",
  "docs/internal/WAIVERS.md",
  "docs/internal/PUBLIC-RELEASE-READINESS.md",
  "docs/user/quickstart.md",
  "docs/user/how-to/tune-retirement-plan.md",
  "docs/user/reference/assumptions.md",
  "docs/user/reference/screens-and-outputs.md",
  "docs/user/reference/regional-accessibility.md",
  "docs/user/concepts/retirement-tax-and-withdrawal-model.md",
  "docs/user/troubleshooting.md",
  "docs/user/releases/2026-05-12-charter-compliance.md",
  "docs/user/support.md",
  "docs/developer/ui/design-system.md",
  "docs/developer/ui/ia-contract.md",
  "docs/developer/ui/in-product-string-catalog.md",
  "docs/developer/ui/polish-checklist.md",
  "docs/developer/bootstrap.md",
  "docs/developer/architecture.md",
  "docs/developer/public-surface.md",
  "docs/developer/deprecation.md",
  "docs/developer/deprecations.md",
  "docs/developer/adr/ADR-0002-public-release-internal-docs.md",
  "docs/developer/adr/README.md"
];

const screenshotAssets = [
  "docs/user/assets/guided-tour.jpg",
  "docs/user/assets/overview-cockpit.jpg",
  "docs/user/assets/guided-planner.jpg",
  "docs/user/assets/tax-studio.jpg",
  "docs/user/assets/simulations-risk.jpg",
  "docs/user/assets/ledger-evidence.jpg",
  "docs/user/assets/assumption-studio.jpg",
  "docs/user/assets/help-system.jpg",
  "docs/user/assets/mobile-overview.jpg",
  "docs/user/assets/mobile-topbar-actions.jpg",
  "docs/user/assets/mobile-topbar-more-menu.jpg",
  "docs/user/assets/mobile-guided-planner.jpg",
  "docs/user/assets/mobile-tax-studio.jpg",
  "docs/user/assets/mobile-simulations-risk.jpg",
  "docs/user/assets/mobile-ledger-evidence.jpg",
  "docs/user/assets/mobile-assumption-studio.jpg",
  "docs/user/assets/mobile-help-system.jpg",
  "docs/user/assets/android-mobile-overview.jpg",
  "docs/user/assets/android-mobile-guided-planner.jpg",
  "docs/user/assets/android-mobile-tax-studio.jpg",
  "docs/user/assets/android-mobile-simulations-risk.jpg",
  "docs/user/assets/android-mobile-ledger-evidence.jpg"
];
const screenshotManifestPath = "docs/user/assets/manifest.json";

const failures = [];

async function markdownFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

function hasFrontmatter(content) {
  return /^---\n[\s\S]+?\n---\n/.test(content);
}

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function localMarkdownTargets(content) {
  const targets = [];
  const pattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(content))) {
    const raw = match[1].split(/\s+/)[0].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("http:") || raw.startsWith("https:") || raw.startsWith("mailto:")) continue;
    targets.push(raw.replace(/^<|>$/g, "").split("#")[0]);
  }
  return targets.filter(Boolean);
}

const topLevelDocsEntries = await readdir("docs", { withFileTypes: true });
const topLevelNames = topLevelDocsEntries.map((entry) => entry.name).sort();
const expectedTopLevel = ["developer", "internal", "user"];
if (JSON.stringify(topLevelNames) !== JSON.stringify(expectedTopLevel)) {
  failures.push(`docs/ top level must be exactly ${expectedTopLevel.join(", ")}; found ${topLevelNames.join(", ")}`);
}
for (const entry of topLevelDocsEntries) {
  if (!entry.isDirectory()) failures.push(`docs/${entry.name}: root docs entry must be a directory`);
}

for (const path of required) {
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    failures.push(`${path}: missing`);
    continue;
  }
  if (path.endsWith(".md")) {
    // R4.4 public-release rewrites (CHANGELOG → Keep a Changelog convention;
    // README → public-facing repo entry; SECURITY/CONTRIBUTING — see below)
    // do not carry the internal SDS-style YAML frontmatter. These public-facing
    // root files are exempt from the frontmatter-required block; the
    // charter-docs.test.mjs `publicRelease` flag enforces the matching
    // content-marker checks instead.
    const publicReleaseExempt = ["CHANGELOG.md", "README.md", "SECURITY.md", "CONTRIBUTING.md"].includes(path);
    if (!publicReleaseExempt) {
      if (!hasFrontmatter(content)) failures.push(`${path}: missing YAML frontmatter`);
      for (const key of ["title", "created", "updated", "type", "status", "version", "revision", "last_updated", "tags", "project"]) {
        if (!frontmatterValue(content, key)) failures.push(`${path}: missing frontmatter key ${key}`);
      }
      if (!/last_updated:\s+2026-05-\d{2}/.test(content)) failures.push(`${path}: missing last_updated frontmatter`);
    }
    if (!publicReleaseExempt && !/## .*Revision History/.test(content) && !path.includes("CHANGELOG") && path !== "AGENTS.md") failures.push(`${path}: missing revision history`);
  }
}

const annex = await readFile("docs/internal/CHARTER-COMPLIANCE-ANNEX.md", "utf8");
for (const marker of [
  "Stribog User Documentation Standard",
  "Stribog Developer Documentation Standard",
  "Stribog UI/UX Standard",
  "make doc-gate",
  "make test-a11y",
  "make artifact-check",
  "AGENTS.md",
  "Charter Governance §3.6",
  // R4.7 Kant promoted these from "Candidate" to "Approved" after CG.R03 owner
  // approval; relax markers to substring-match both states for forward-compat.
  "included set",
  "excluded set",
  "test-charter-docs"
]) {
  if (!annex.includes(marker)) failures.push(`annex missing ${marker}`);
}

const waivers = await readFile("docs/internal/WAIVERS.md", "utf8");
if (!waivers.includes("Data and Privacy Standard §3.2 Storage")) {
  failures.push("waiver register missing current Data and Privacy Standard §3.2 Storage citation");
}

const publicReadiness = await readFile("docs/internal/PUBLIC-RELEASE-READINESS.md", "utf8");
for (const marker of [
  "Charter Governance public release profile",
  "Included set",
  "Excluded set",
  "No public-release or release-ready claim"
]) {
  if (!publicReadiness.includes(marker)) failures.push(`public release readiness missing ${marker}`);
}

const userRelease = await readFile("docs/user/releases/2026-05-12-charter-compliance.md", "utf8");
for (const marker of ["first-run tour", "local storage", "artifact integrity", "accessibility"]) {
  if (!userRelease.toLowerCase().includes(marker)) failures.push(`user release notes missing ${marker}`);
}

const userDocContents = [];
for (const path of required.filter((item) => item.startsWith("docs/user/") && item.endsWith(".md"))) {
  userDocContents.push(await readFile(path, "utf8"));
}
const userDocText = userDocContents.join("\n");
let screenshotManifest = null;
try {
  screenshotManifest = JSON.parse(await readFile(screenshotManifestPath, "utf8"));
} catch (error) {
  failures.push(`${screenshotManifestPath}: missing or invalid screenshot metadata manifest`);
}
if (screenshotManifest) {
  for (const field of ["productVersion", "artifactSha256", "capturedOn", "screenshots"]) {
    if (!screenshotManifest[field]) failures.push(`${screenshotManifestPath}: missing ${field}`);
  }
}
for (const path of screenshotAssets) {
  try {
    const info = await stat(path);
    if (info.size < 10_000) failures.push(`${path}: screenshot asset is unexpectedly small`);
  } catch (error) {
    failures.push(`${path}: missing product screenshot`);
  }
  const relative = path.replace("docs/user/", "");
  if (!userDocText.includes(relative) && !userDocText.includes(`../${relative}`)) {
    failures.push(`${path}: not referenced from user docs`);
  }
  const manifestEntry = screenshotManifest?.screenshots?.find((item) => item.path === path);
  if (!manifestEntry) {
    failures.push(`${screenshotManifestPath}: missing metadata for ${path}`);
  } else {
    for (const field of ["viewport", "sourcePage", "sha256", "bytes"]) {
      if (!manifestEntry[field]) failures.push(`${screenshotManifestPath}: ${path} missing ${field}`);
    }
  }
}

for (const path of await markdownFiles("docs")) {
  const content = await readFile(path, "utf8");
  if (path.startsWith("docs/user/") && frontmatterValue(content, "status") !== "published") {
    failures.push(`${path}: user-facing docs must use status: published`);
  }
  for (const target of localMarkdownTargets(content)) {
    const resolved = normalize(join(dirname(path), target));
    try {
      await stat(resolved);
    } catch (error) {
      failures.push(`${path}: broken local markdown link ${target}`);
    }
    if (path.startsWith("docs/user/") && resolved.includes("docs/internal/")) {
      failures.push(`${path}: user docs must not link to internal-only material (${target})`);
    }
  }
  if (/Optimum Portfolio Strategy/i.test(content)) {
    failures.push(`${path}: stale Optimum Portfolio Strategy wording`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checked: "doc-gate",
  requiredFiles: required.length,
  requiredFileScope: "governed root docs, AGENTS.md, internal control docs, user docs, and developer docs",
  checks: [
    "docs top-level partition",
    "required file presence and frontmatter",
    "annex and public-release markers",
    "waiver storage citation",
    "user release-note markers",
    "screenshot assets and manifest metadata",
    "local markdown links",
    "user-doc published status",
    "internal-link boundary for user docs",
    "stale product wording"
  ],
  screenshots: screenshotAssets.length
}, null, 2));
