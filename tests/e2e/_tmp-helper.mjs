// tests/e2e/_tmp-helper.mjs
// Per-process unique temp root for e2e + performance tests.
//
// Why: hardcoded "/tmp/..." literals are not Windows-portable and collide
// when two test workers run concurrently on the same CI host. mkdtempSync
// returns a fresh, unique directory each process — same idiom already used
// by _browser-helper.mjs for the Chrome user-data-dir.

import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "fin-e2e-"));

export function tmpDir(purpose) {
  const dir = join(ROOT, purpose);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function tmpFile(name) {
  return join(ROOT, name);
}

export const tmpRoot = ROOT;
