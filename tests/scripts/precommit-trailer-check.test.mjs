import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  classifyCommitMessage,
  classifyCommits,
  listCommitsInRange,
  runCheck
} from "../../scripts/precommit-trailer-check.mjs";

// ---------------------------------------------------------------------------
// Pure rule tests — no git involvement, fast and deterministic.
// ---------------------------------------------------------------------------

describe("classifyCommitMessage", () => {
  it("accepts a commit body containing a Co-authored-by trailer", () => {
    const message = [
      "feat(thing): do the thing",
      "",
      "Body explaining the thing.",
      "",
      "Co-authored-by: Claude <noreply@anthropic.com>"
    ].join("\n");
    expect(classifyCommitMessage(message)).toEqual({ compliant: true, reason: "trailer" });
  });

  it("rejects a commit with no trailer and no opt-out", () => {
    const message = ["fix: small fix", "", "Body without trailer."].join("\n");
    expect(classifyCommitMessage(message)).toEqual({ compliant: false, reason: "missing" });
  });

  it("accepts an explicit No-AI-Author opt-out", () => {
    const message = [
      "chore: human-only chore",
      "",
      "Body with no AI involvement.",
      "",
      "No-AI-Author: true"
    ].join("\n");
    expect(classifyCommitMessage(message)).toEqual({ compliant: true, reason: "opt-out" });
  });

  it("prefers the trailer when both trailer and opt-out are present", () => {
    const message = [
      "feat: mixed-author edge case",
      "",
      "No-AI-Author: true",
      "Co-authored-by: Claude <noreply@anthropic.com>"
    ].join("\n");
    expect(classifyCommitMessage(message)).toEqual({ compliant: true, reason: "trailer" });
  });

  it("rejects a trailer-shaped subject line (trailer must be in the body)", () => {
    const message = "Co-authored-by: Claude <noreply@anthropic.com>";
    expect(classifyCommitMessage(message)).toEqual({ compliant: false, reason: "missing" });
  });

  it("rejects a malformed trailer missing the email angle brackets", () => {
    const message = [
      "fix: oops",
      "",
      "Co-authored-by: Claude noreply@anthropic.com"
    ].join("\n");
    expect(classifyCommitMessage(message)).toEqual({ compliant: false, reason: "missing" });
  });

  it("tolerates trailing whitespace on the trailer line", () => {
    const message = ["fix: thing", "", "Co-authored-by: Claude <noreply@anthropic.com>   "].join("\n");
    expect(classifyCommitMessage(message)).toEqual({ compliant: true, reason: "trailer" });
  });

  it("treats a non-string input as a violation", () => {
    expect(classifyCommitMessage(undefined)).toEqual({ compliant: false, reason: "missing" });
  });
});

describe("classifyCommits", () => {
  it("returns zero violations for an empty list", () => {
    expect(classifyCommits([])).toEqual({ violations: [], commitsChecked: 0 });
  });

  it("flags the missing commit in a mixed-compliance batch", () => {
    const commits = [
      { sha: "a1", subject: "feat: ok", message: "feat: ok\n\nCo-authored-by: Claude <noreply@anthropic.com>" },
      { sha: "b2", subject: "fix: oops", message: "fix: oops\n\nBody without trailer." },
      { sha: "c3", subject: "chore: human", message: "chore: human\n\nNo-AI-Author: true" }
    ];
    const result = classifyCommits(commits);
    expect(result.commitsChecked).toBe(3);
    expect(result.violations).toEqual([{ sha: "b2", subject: "fix: oops", reason: "missing" }]);
  });
});

// ---------------------------------------------------------------------------
// Git-plumbing tests — spin up a throwaway repo so we exercise listCommitsInRange,
// runCheck branch/range mode, and the merge-base behaviour end-to-end.
// ---------------------------------------------------------------------------

const repoFixture = {
  dir: "",
  commits: {}
};

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoFixture.dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
}

function makeCommit(filename, contents, message) {
  writeFileSync(path.join(repoFixture.dir, filename), contents);
  git(["add", filename]);
  git(["commit", "-m", message], {
    env: {
      ...process.env,
      GIT_COMMITTER_NAME: "Trailer Test",
      GIT_COMMITTER_EMAIL: "trailer-test@example.invalid",
      GIT_AUTHOR_NAME: "Trailer Test",
      GIT_AUTHOR_EMAIL: "trailer-test@example.invalid"
    }
  });
  return git(["rev-parse", "HEAD"]).trim();
}

beforeAll(() => {
  repoFixture.dir = mkdtempSync(path.join(tmpdir(), "trailer-check-test-"));
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "trailer-test@example.invalid"]);
  git(["config", "user.name", "Trailer Test"]);
  git(["config", "commit.gpgsign", "false"]);
  // Baseline commit on main — out of the merge-base range we'll exercise later.
  repoFixture.commits.base = makeCommit(
    "README.md",
    "baseline\n",
    "chore: initial baseline\n\nCo-authored-by: Claude <noreply@anthropic.com>"
  );
  git(["checkout", "-q", "-b", "feature"]);
  repoFixture.commits.featureGood = makeCommit(
    "a.txt",
    "a\n",
    "feat: add a\n\nCo-authored-by: Claude <noreply@anthropic.com>"
  );
  repoFixture.commits.featureBad = makeCommit("b.txt", "b\n", "feat: add b\n\nNo trailer here.");
  repoFixture.commits.featureOptOut = makeCommit("c.txt", "c\n", "chore: human-only\n\nNo-AI-Author: true");
});

afterAll(() => {
  if (repoFixture.dir) {
    rmSync(repoFixture.dir, { recursive: true, force: true });
  }
});

describe("listCommitsInRange", () => {
  it("returns the three feature commits between main and HEAD in newest-first order", () => {
    const commits = listCommitsInRange("main..HEAD", { cwd: repoFixture.dir });
    expect(commits).toHaveLength(3);
    expect(commits[0].sha).toBe(repoFixture.commits.featureOptOut);
    expect(commits[1].sha).toBe(repoFixture.commits.featureBad);
    expect(commits[2].sha).toBe(repoFixture.commits.featureGood);
    expect(commits[1].message).toContain("No trailer here.");
  });

  it("returns an empty list when range is empty (head == merge-base)", () => {
    const commits = listCommitsInRange("HEAD..HEAD", { cwd: repoFixture.dir });
    expect(commits).toEqual([]);
  });
});

describe("runCheck (CLI surface)", () => {
  it("exits 0 with commits_checked=0 when the range is empty", () => {
    const result = runCheck({
      argv: ["--range", "HEAD..HEAD"],
      env: {},
      gitOptions: { cwd: repoFixture.dir }
    });
    expect(result.exitCode).toBe(0);
    expect(result.payload).toMatchObject({ ok: true, mode: "range", commits_checked: 0, violations: 0 });
  });

  it("exits 1 and lists the violation when one commit on the branch is missing the trailer", () => {
    const result = runCheck({
      argv: ["--range", "main..HEAD"],
      env: {},
      gitOptions: { cwd: repoFixture.dir }
    });
    expect(result.exitCode).toBe(1);
    expect(result.payload.violations).toBe(1);
    expect(result.violations[0].sha).toBe(repoFixture.commits.featureBad);
    expect(result.violations[0].reason).toBe("missing");
  });

  it("auto-selects branch mode when env CI=1 is set and resolves the merge-base with main", () => {
    const result = runCheck({
      argv: [],
      env: { CI: "1" },
      gitOptions: { cwd: repoFixture.dir }
    });
    expect(result.payload.mode).toBe("branch");
    expect(result.payload.commits_checked).toBe(3);
    expect(result.exitCode).toBe(1);
  });

  it("exits 0 in HEAD mode when HEAD itself carries an opt-out trailer", () => {
    const result = runCheck({ argv: [], env: {}, gitOptions: { cwd: repoFixture.dir } });
    expect(result.exitCode).toBe(0);
    expect(result.payload).toMatchObject({ ok: true, mode: "head", commits_checked: 1, violations: 0 });
  });
});
