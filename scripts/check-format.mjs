import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".beads", "node_modules", "dist", "coverage", ".venv"]);
const includedExtensions = new Set([".js", ".jsx", ".mjs", ".css", ".md", ".json", ".html"]);
const ignoredFiles = new Set(["package-lock.json", "index.html", "Retirement Corpus & Income Planner.html"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await walk(fullPath));
      }
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(relative)) continue;
    if (includedExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const failures = [];
for (const file of await walk(root)) {
  const relative = path.relative(root, file);
  const info = await stat(file);
  if (info.size > 2_000_000) continue;
  const content = await readFile(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      failures.push(`${relative}:${index + 1} has trailing whitespace`);
    }
  });
  if (content.length > 0 && !content.endsWith("\n")) {
    failures.push(`${relative} must end with a newline`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: "format" }));
