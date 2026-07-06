import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Zero-network runtime gate: this product is offline-first by product
// decision (Charter Security Posture Standard, browser-storage inventory in
// docs/internal/CHARTER-COMPLIANCE-ANNEX.md §2.6.17 — zero outbound
// connect-src). This gate blocks accidental introduction of runtime network
// APIs into hand-maintained source, and blocks external resource loads in
// the source HTML entrypoint and the built single-file artifact.

const root = process.cwd();
const allowComment = "network-gate-allow";

// Runtime network APIs disallowed in hand-maintained source. Patterns use
// word-boundary/call-syntax matching so they do not fire on unrelated
// identifiers that merely contain these words as a substring (e.g.
// `prefetch(`, `useEffect(`, `fetchData(`, `customFetch(`).
const runtimeApiPatterns = [
  { label: "fetch(", test: (line) => /\bfetch\s*\(/.test(line) },
  { label: "XMLHttpRequest", test: (line) => /\bXMLHttpRequest\b/.test(line) },
  { label: "sendBeacon(", test: (line) => /\bsendBeacon\s*\(/.test(line) },
  { label: "new WebSocket(", test: (line) => /\bnew\s+WebSocket\s*\(/.test(line) },
  { label: "EventSource(", test: (line) => /\bEventSource\s*\(/.test(line) },
  { label: "navigator.serviceWorker", test: (line) => /navigator\.serviceWorker\b/.test(line) },
  { label: "importScripts(", test: (line) => /\bimportScripts\s*\(/.test(line) }
];

// External resource-loading tags: only the actual src/href attribute value
// on a script/link/img/iframe tag counts. Data: URIs, inline SVG xmlns
// namespace strings, and license/comment text that merely contains
// "http://" are not resource loads and must not be flagged.
const resourceTagPattern = /<(script|link|img|iframe)\b([^>]*)>/gi;
const resourceAttrPattern = /(?:^|\s)(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/i;

const failures = [];

async function walkSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSourceFiles(fullPath)));
    } else if ([".js", ".jsx"].includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanRuntimeApis(relativePath, content) {
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (line.includes(allowComment)) return;
    for (const pattern of runtimeApiPatterns) {
      if (pattern.test(line)) {
        failures.push(`${relativePath}:${index + 1} uses disallowed runtime network API: ${pattern.label}`);
      }
    }
  });
}

function scanExternalResourceTags(relativePath, content) {
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (line.includes(allowComment)) return;
    resourceTagPattern.lastIndex = 0;
    let tagMatch;
    while ((tagMatch = resourceTagPattern.exec(line))) {
      const [, tagName, attributes] = tagMatch;
      const attrMatch = resourceAttrPattern.exec(attributes);
      if (attrMatch) {
        failures.push(`${relativePath}:${index + 1} loads external resource in <${tagName}>: ${attrMatch[1]}`);
      }
    }
  });
}

// 1. src/**/*.{js,jsx} — runtime network API scan.
const sourceFiles = await walkSourceFiles(path.join(root, "src"));
for (const file of sourceFiles) {
  const relative = path.relative(root, file);
  const content = await readFile(file, "utf8");
  scanRuntimeApis(relative, content);
}

// 2. app.html — runtime network API scan plus external resource-tag scan.
const appHtmlContent = await readFile(path.join(root, "app.html"), "utf8");
scanRuntimeApis("app.html", appHtmlContent);
scanExternalResourceTags("app.html", appHtmlContent);

// 3. Built artifact (index.html at repo root) — external resource-tag scan
// only. It is generated output (single-file inlined build), so it is not
// re-scanned for runtime API source patterns; those are already caught at
// the source in step 1. Skip gracefully when the artifact has not been
// built yet (e.g. a fresh checkout before `npm run build`).
const builtIndexPath = path.join(root, "index.html");
if (existsSync(builtIndexPath)) {
  const builtContent = await readFile(builtIndexPath, "utf8");
  scanExternalResourceTags("index.html", builtContent);
} else {
  console.log(
    "[network-gate] index.html not present at repo root — skipping built-artifact scan (run npm run build first for full coverage)."
  );
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checked: "network-gate",
  scanned: {
    sourceFiles: sourceFiles.length,
    appHtml: true,
    builtArtifact: existsSync(builtIndexPath)
  }
}, null, 2));
