import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["src", "scripts", "tests"];
const disallowed = [
  { label: "eval", test: (line) => line.includes("eval(") && !line.includes("$eval(") && !line.includes("$$eval(") },
  { label: "new Function", test: (line) => line.includes("new Function") },
  { label: "document.write", test: (line) => line.includes("document.write") },
  { label: "dangerouslySetInnerHTML", test: (line) => line.includes("dangerouslySetInnerHTML") },
  { label: "bare innerHTML assignment", test: (line) => /\.innerHTML\s*=/.test(line) }
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if ([".js", ".jsx", ".mjs"].includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const failures = [];
for (const sourceRoot of sourceRoots) {
  for (const file of await walk(path.join(root, sourceRoot))) {
    const relative = path.relative(root, file);
    if (relative === "scripts/lint.mjs") continue;
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const rule of disallowed) {
        if (rule.test(line)) {
          failures.push(`${relative}:${index + 1} uses disallowed pattern: ${rule.label}`);
        }
      }
    });
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: "lint" }));
