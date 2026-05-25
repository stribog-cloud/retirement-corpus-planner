import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const manifestPath = "docs/internal/release/artifact-integrity.json";
const today = process.env.ARTIFACT_DATE || new Date().toISOString().slice(0, 10);
const sizeBudgetBytes = 2_800_000;
const gzipBudgetBytes = 900_000;
const artifactPaths = [
  "index.html",
  "Retirement Corpus & Income Planner.html",
  "dist/index.html",
  "dist/app.html"
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function describeArtifact(path) {
  const buffer = await readFile(path);
  const info = await stat(path);
  return {
    path,
    bytes: info.size,
    gzipBytes: gzipSync(buffer).byteLength,
    sha256: sha256(buffer)
  };
}

async function commandOutput(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout.trim();
  } catch (error) {
    return "unavailable";
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const artifacts = [];
for (const artifactPath of artifactPaths) {
  artifacts.push(await describeArtifact(artifactPath));
}

const rootHash = artifacts[0].sha256;
for (const artifact of artifacts) {
  assert(artifact.bytes <= sizeBudgetBytes, `${artifact.path} exceeds raw size budget: ${artifact.bytes}`);
  assert(artifact.gzipBytes <= gzipBudgetBytes, `${artifact.path} exceeds gzip size budget: ${artifact.gzipBytes}`);
  assert(artifact.sha256 === rootHash, `${artifact.path} differs from index.html`);
}

const nextManifest = {
  version: "1.0.0",
  last_updated: today,
  generatedAt: new Date().toISOString(),
  provenance: {
    gitHead: await commandOutput("git", ["rev-parse", "HEAD"]),
    gitStatus: await commandOutput("git", ["status", "--short"]),
    node: process.version,
    npm: await commandOutput("npm", ["--version"]),
    buildCommand: "npm run build && npm run artifact:write"
  },
  sourceBoundary: ["src/**/*.js", "src/**/*.jsx", "src/**/*.css", "app.html"],
  artifactBoundary: artifactPaths,
  sizeBudgetBytes,
  gzipBudgetBytes,
  artifacts
};

if (process.argv.includes("--write")) {
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, wrote: manifestPath, artifacts: artifacts.length }, null, 2));
} else {
  const saved = JSON.parse(await readFile(manifestPath, "utf8"));
  assert(/\d{4}-\d{2}-\d{2}/.test(saved.last_updated || ""), "artifact manifest last_updated must be an ISO date");
  assert(saved.provenance?.gitHead, "artifact manifest missing provenance.gitHead");
  assert(saved.provenance?.node, "artifact manifest missing provenance.node");
  assert(saved.provenance?.buildCommand, "artifact manifest missing provenance.buildCommand");
  assert(saved.sizeBudgetBytes === sizeBudgetBytes, "artifact manifest size budget drifted");
  assert(saved.gzipBudgetBytes === gzipBudgetBytes, "artifact manifest gzip budget drifted");
  assert(saved.artifacts?.length === artifacts.length, "artifact manifest artifact count drifted");
  for (const artifact of artifacts) {
    const recorded = saved.artifacts.find((item) => item.path === artifact.path);
    assert(recorded, `artifact manifest missing ${artifact.path}`);
    assert(recorded.sha256 === artifact.sha256, `${artifact.path} sha256 does not match manifest`);
    assert(recorded.bytes === artifact.bytes, `${artifact.path} byte size does not match manifest`);
    assert(recorded.gzipBytes === artifact.gzipBytes, `${artifact.path} gzip size does not match manifest`);
  }
  console.log(JSON.stringify({ ok: true, checked: "artifact-integrity", bytes: artifacts[0].bytes, gzipBytes: artifacts[0].gzipBytes }, null, 2));
}
