#!/usr/bin/env node
// Pre-merge gate enforcing the Co-authored-by trailer rule from AGENTS.md §9
// and audit/ORCHESTRATION.md §6 (Charter authority: AIAES §5.1 / USEC §7.7,
// owner decision K-V01). See docs/internal/CHARTER-COMPLIANCE-ANNEX.md for the
// historical K-V01 trailer-gap finding this gate prevents prospectively.
//
// Modes:
//   default       — verify HEAD commit only (fast, intended for a local pre-commit hook).
//   --branch      — verify every commit since the merge-base with main (CI default,
//                   also auto-selected when env CI=1 is set).
//   --range A..B  — verify an explicit commit range.
//
// Exit codes: 0 = compliant or exempt; 1 = violation or operational failure.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Pure rule logic (exported for unit tests).
// ---------------------------------------------------------------------------

// Match `Co-authored-by: Some Name <addr@host>` on its own line, body-only.
// Subject (first line) is excluded by inspecting only lines after the first.
// `Co-authored-by:` is case-sensitive per git's trailer convention; trailing
// whitespace is tolerated.
const TRAILER_PATTERN = /^Co-authored-by: .+ <.+@.+>\s*$/;

// Exact opt-out for human-only commits.
const OPT_OUT_PATTERN = /^No-AI-Author: true\s*$/;

/**
 * Decide whether a commit message satisfies the trailer rule.
 * Returns { compliant: boolean, reason: "trailer" | "opt-out" | "missing" }.
 *
 * Both trailer and opt-out are looked up across the message *body* (everything
 * after the first line). If both are present, the trailer wins — which is the
 * conservative path: a commit that says "no AI assisted me, but here is an AI
 * co-author" should still be treated as AI-assisted.
 */
export function classifyCommitMessage(message) {
  if (typeof message !== "string") {
    return { compliant: false, reason: "missing" };
  }
  const lines = message.split("\n");
  // Body = everything after the subject line. Trailer must live in the body,
  // never the subject.
  const bodyLines = lines.slice(1);
  const hasTrailer = bodyLines.some((line) => TRAILER_PATTERN.test(line));
  if (hasTrailer) return { compliant: true, reason: "trailer" };
  const hasOptOut = bodyLines.some((line) => OPT_OUT_PATTERN.test(line));
  if (hasOptOut) return { compliant: true, reason: "opt-out" };
  return { compliant: false, reason: "missing" };
}

/**
 * Inspect a list of commit records. Each record is `{ sha, subject, message }`.
 * Returns { violations: [...], commitsChecked: number }.
 */
export function classifyCommits(commits) {
  const violations = [];
  for (const commit of commits) {
    const verdict = classifyCommitMessage(commit.message);
    if (!verdict.compliant) {
      violations.push({ sha: commit.sha, subject: commit.subject, reason: verdict.reason });
    }
  }
  return { violations, commitsChecked: commits.length };
}

// ---------------------------------------------------------------------------
// Git plumbing (kept thin so the rule logic above stays unit-testable).
// ---------------------------------------------------------------------------

function runGit(args, { cwd } = {}) {
  return execFileSync("git", args, {
    cwd: cwd || process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

/**
 * List commits in a revision range using a record separator unlikely to appear
 * inside a commit message. Parses into structured records the rule logic can
 * consume directly.
 */
export function listCommitsInRange(range, options = {}) {
  // ASCII unit separator (US, 0x1F) terminates each record; group separator
  // (GS, 0x1D) separates fields. Commit messages may contain newlines but
  // never these control bytes.
  const fieldSep = "\x1d";
  const recordSep = "\x1e";
  const format = ["%H", "%s", "%B"].join(fieldSep) + recordSep;
  let stdout;
  try {
    stdout = runGit(["log", `--format=${format}`, range], options);
  } catch (error) {
    const stderr = (error.stderr || "").toString().trim();
    throw new Error(`git log ${range} failed: ${stderr || error.message}`);
  }
  const records = stdout.split(recordSep).map((record) => record.replace(/^\n+/, "")).filter((record) => record.length > 0);
  return records.map((record) => {
    const [sha, subject, ...messageParts] = record.split(fieldSep);
    // %B can itself contain field-separator-free newlines; rejoin safely.
    const message = messageParts.join(fieldSep).replace(/\n$/, "");
    return { sha: sha.trim(), subject: subject.trim(), message };
  });
}

/**
 * Read HEAD's commit message as a single-element list, matching the shape
 * `classifyCommits` expects.
 */
export function getHeadCommit(options = {}) {
  let sha;
  let subject;
  let message;
  try {
    sha = runGit(["rev-parse", "HEAD"], options).trim();
    subject = runGit(["log", "-1", "--format=%s", "HEAD"], options).trim();
    message = runGit(["log", "-1", "--format=%B", "HEAD"], options).replace(/\n$/, "");
  } catch (error) {
    const stderr = (error.stderr || "").toString().trim();
    throw new Error(`unable to read HEAD: ${stderr || error.message}`);
  }
  return { sha, subject, message };
}

/**
 * Resolve the merge-base between HEAD and `main` (or a configurable base ref).
 * Throws a descriptive error when no merge-base exists (e.g. detached HEAD
 * with no shared history).
 */
export function getMergeBase(baseRef = "main", options = {}) {
  try {
    return runGit(["merge-base", "HEAD", baseRef], options).trim();
  } catch (error) {
    const stderr = (error.stderr || "").toString().trim();
    throw new Error(`no merge-base between HEAD and ${baseRef}: ${stderr || error.message}. Use --range <a>..<b> to specify an explicit range.`);
  }
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { mode: "head", range: null, baseRef: "main" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--branch") {
      args.mode = "branch";
    } else if (arg === "--head") {
      args.mode = "head";
    } else if (arg === "--range") {
      const value = argv[index + 1];
      if (!value || !value.includes("..")) {
        throw new Error("--range requires a <a>..<b> argument");
      }
      args.mode = "range";
      args.range = value;
      index += 1;
    } else if (arg.startsWith("--range=")) {
      const value = arg.slice("--range=".length);
      if (!value.includes("..")) {
        throw new Error("--range= requires a <a>..<b> value");
      }
      args.mode = "range";
      args.range = value;
    } else if (arg === "--base") {
      const value = argv[index + 1];
      if (!value) throw new Error("--base requires a ref name");
      args.baseRef = value;
      index += 1;
    } else if (arg.startsWith("--base=")) {
      args.baseRef = arg.slice("--base=".length);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  const text = [
    "Usage: node scripts/precommit-trailer-check.mjs [options]",
    "",
    "Modes:",
    "  (default)         Verify the HEAD commit message.",
    "  --branch          Verify every commit since the merge-base with main.",
    "                    Implied by env CI=1.",
    "  --range A..B      Verify an explicit revision range.",
    "  --base <ref>      Override the merge-base reference (default: main).",
    "",
    "Exit codes: 0 = compliant or opt-out, 1 = violation.",
    "Output: single-line JSON on stdout (stderr on failure with violation list)."
  ];
  console.log(text.join("\n"));
}

/**
 * Run the gate. Returns the JSON-shaped result object plus an exit code,
 * leaving the actual process.exit to the CLI shim so this stays testable.
 */
export function runCheck({ argv = [], env = process.env, gitOptions = {} } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return { exitCode: 1, payload: { ok: false, error: error.message }, violations: [] };
  }
  if (args.help) {
    printHelp();
    return { exitCode: 0, payload: { ok: true, help: true }, violations: [] };
  }
  // CI implicitly selects branch mode unless an explicit mode was given.
  if (env.CI === "1" && args.mode === "head") {
    args.mode = "branch";
  }
  let commits;
  let mode = args.mode;
  try {
    if (mode === "head") {
      commits = [getHeadCommit(gitOptions)];
    } else if (mode === "branch") {
      const mergeBase = getMergeBase(args.baseRef, gitOptions);
      commits = listCommitsInRange(`${mergeBase}..HEAD`, gitOptions);
    } else if (mode === "range") {
      commits = listCommitsInRange(args.range, gitOptions);
    } else {
      throw new Error(`unsupported mode: ${mode}`);
    }
  } catch (error) {
    return {
      exitCode: 1,
      payload: { ok: false, checked: "trailer", mode, error: error.message },
      violations: []
    };
  }
  const { violations, commitsChecked } = classifyCommits(commits);
  if (violations.length === 0) {
    return {
      exitCode: 0,
      payload: { ok: true, checked: "trailer", mode, commits_checked: commitsChecked, violations: 0 },
      violations: []
    };
  }
  return {
    exitCode: 1,
    payload: {
      ok: false,
      checked: "trailer",
      mode,
      commits_checked: commitsChecked,
      violations: violations.length,
      details: violations
    },
    violations
  };
}

// ---------------------------------------------------------------------------
// CLI entry. Only runs when invoked as a script (not when imported by tests).
// ---------------------------------------------------------------------------

const isMain = (() => {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  const result = runCheck({ argv: process.argv.slice(2) });
  if (result.exitCode === 0) {
    if (!result.payload.help) {
      console.log(JSON.stringify(result.payload));
    }
  } else {
    console.error(JSON.stringify(result.payload));
    if (result.violations.length > 0) {
      console.error("");
      console.error("Trailer-check violations:");
      for (const violation of result.violations) {
        console.error(`  ${violation.sha.slice(0, 12)}  ${violation.subject}`);
      }
      console.error("");
      console.error("Fix: amend each commit to include either");
      console.error("  Co-authored-by: <Name> <email@host>");
      console.error("or, for human-only commits,");
      console.error("  No-AI-Author: true");
      console.error("on its own line in the commit message body.");
    }
  }
  process.exit(result.exitCode);
}
