import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const ignoredDirectories = new Set([".git", ".beads", "node_modules", "dist", "coverage"]);
const textExtensions = new Set([".js", ".jsx", ".mjs", ".css", ".md", ".json", ".html", ".yml", ".yaml", ".env"]);
const suspiciousPatterns = [
  { label: "private key block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { label: "secret assignment", regex: /\b(api[_-]?key|token|password|secret)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i },
  { label: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9_]{36,}/ }
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await walk(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (textExtensions.has(path.extname(entry.name)) || entry.name.startsWith(".env")) {
      files.push(fullPath);
    }
  }
  return files;
}

function shouldScanRelative(relative) {
  const parts = relative.split(path.sep);
  if (parts.some((part) => ignoredDirectories.has(part) && part !== "dist")) return false;
  return textExtensions.has(path.extname(relative)) || path.basename(relative).startsWith(".env");
}

async function scanContent(label, content, failures) {
  for (const pattern of suspiciousPatterns) {
    if (pattern.regex.test(content)) failures.push(`${label} matched ${pattern.label}`);
  }
}

async function scanReachableGitHistory(failures) {
  let revs = [];
  try {
    const { stdout } = await execFileAsync("git", ["rev-list", "--all"], { maxBuffer: 1024 * 1024 * 16 });
    revs = stdout.trim().split(/\n/).filter(Boolean);
  } catch (error) {
    failures.push(`git history scan unavailable: ${error.message}`);
    return;
  }
  for (const rev of revs) {
    let files = [];
    try {
      const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "--name-only", rev], { maxBuffer: 1024 * 1024 * 16 });
      files = stdout.trim().split(/\n/).filter(Boolean).filter(shouldScanRelative);
    } catch (error) {
      failures.push(`${rev}: could not list files for secret scan`);
      continue;
    }
    for (const file of files) {
      try {
        const { stdout } = await execFileAsync("git", ["show", `${rev}:${file}`], { maxBuffer: 1024 * 1024 * 32 });
        await scanContent(`${rev.slice(0, 8)}:${file}`, stdout, failures);
      } catch (error) {
        // Binary or removed paths can be skipped after ls-tree filtering.
      }
    }
  }
}

const failures = [];
for (const file of await walk(root)) {
  const relative = path.relative(root, file);
  const content = await readFile(file, "utf8");
  await scanContent(relative, content, failures);
}
await scanReachableGitHistory(failures);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: "secrets" }));
