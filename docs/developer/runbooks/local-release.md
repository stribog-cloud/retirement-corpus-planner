---
title: "Local Release Runbook"
created: 2026-05-15
updated: 2026-05-15
type: project/runbook
status: governing-reference
version: "1.0.0"
revision: 1
last_updated: 2026-05-15
tags: [developer-docs, runbook, release, local-git]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer]
---

# Local Release Runbook

> Steps for producing a local, reviewed, single-file release artifact.

## 0. TL;DR

Use Beads first, build from source, refresh generated artifacts and screenshot evidence when needed, run `make all`, commit locally, and do not push unless the owner explicitly asks.

## 1. Preconditions

- Relevant Beads issue is claimed.
- Worktree is understood with `git status --short`.
- Current Charter and repo docs have been checked for the change type.
- No manual edits were made to generated HTML artifacts.

## 2. Build

```zsh
npm install
make build
```

If generated artifacts changed intentionally:

```zsh
make artifact-write
make artifact-check
```

## 3. Evidence

For UI changes:

```zsh
make docs-screenshots
```

For docs or screenshots:

```zsh
make doc-gate
```

## 4. Full Gate

```zsh
make all
```

If a gate fails, fix the cause or keep the issue open with blocker notes.

## 5. Beads And Git

Close the Beads issue only after verification evidence exists. Commit locally with a message that names the product outcome. Do not push without explicit instruction.

## 6. Post-release Check

Open `index.html` and confirm:

- Privacy notice or remembered consent behaves correctly.
- Help and guided tour are available.
- Theme, layout, and assumptions persist after reload.
- PDF/CSV/JSON exports speak the current live numbers.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.0 | 1 | 2026-05-15 | Added local release runbook for generated artifacts, gates, Beads, and local git. |
