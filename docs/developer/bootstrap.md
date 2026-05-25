---
title: "Retirement Planner Developer Bootstrap"
created: 2026-05-12
updated: 2026-05-15
type: project/developer-doc
status: governing-reference
version: "2.0.0"
revision: 2
last_updated: 2026-05-15
tags: [developer-docs, bootstrap, onboarding]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Developer Bootstrap

> Bring a fresh checkout to a working local development loop and a green proof.

This guide is for contributors and maintainers working on the local-first React/Vite retirement planner. It assumes macOS, `/bin/zsh`, Node/npm, and the repository checked out locally.

## 0. TL;DR

```zsh
npm install
make build
make artifact-check
make doc-gate
make test-smoke
make all
```

Open the product with `npm run dev` during development and open the generated `index.html` after `make build` when validating the shippable artifact.

## 1. Prerequisites

| Dependency | Expected Use |
|------------|--------------|
| Node.js and npm | Install packages, run Vite, tests, scripts, and gates |
| `/bin/zsh` | Shell used by project instructions and local workflow |
| Chrome | Puppeteer screenshot, E2E, accessibility, and UI regression tests |
| `/opt/homebrew/bin/d2` | Render documentation diagrams to SVG and PNG |
| Beads `bd` | Mandatory issue tracking workflow |
| Git | Local-only version control unless the owner explicitly asks to push |

## 2. First Local Proof

1. Install dependencies:

   ```zsh
   npm install
   ```

2. Build the single-file artifacts:

   ```zsh
   make build
   ```

3. Verify generated HTML integrity:

   ```zsh
   make artifact-check
   ```

4. Verify documentation topology, required docs, screenshots, and links:

   ```zsh
   make doc-gate
   ```

5. Run the shipped-form smoke test:

   ```zsh
   make test-smoke
   ```

6. Run the full local gate:

   ```zsh
   make all
   ```

## 3. Development Loop

Start the Vite app:

```zsh
npm run dev
```

Use the shown `127.0.0.1` URL for development. The built file remains `index.html`; do not treat the dev server as the shipped artifact.

## 4. Generated Artifact Rule

Do not hand-edit:

- `index.html`
- `Retirement Corpus & Income Planner.html`
- `dist/app.html`
- `dist/index.html`

Edit source files, docs, scripts, or tests, then run:

```zsh
make build
make artifact-write
make artifact-check
```

`artifact-write` updates the integrity manifest only when the generated artifact change is intended.

## 5. Beads Workflow

Start substantial work with:

```zsh
bd ready
bd list --status=open
bd show <issue-id>
bd update <issue-id> --status in_progress --notes "Started work."
```

Close an issue only after the relevant verification evidence exists.

## 6. Documentation Workflow

Read [Documentation Workflow](documentation-workflow.md) before changing docs, screenshots, diagrams, Help, public-surface text, or architecture contracts. Significant changes also update BrainForest.

## 7. Common Bootstrap Failures

| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| `d2` not found | D2 not installed at expected Homebrew path | Install D2 or update the local path only after confirming project rules |
| Puppeteer cannot launch Chrome | Chrome path changed or browser missing | Install Chrome or update screenshot/E2E scripts with review |
| `artifact-check` fails after source edit | Built artifact changed but manifest not refreshed | Run `make artifact-write` after confirming the change is intended |
| `doc-gate` fails on links | New docs added with missing local target | Fix the link or add the referenced file |
| `coverage` fails | New branch/function lacks tests | Add focused tests before broad gates |

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.0.0 | 2 | 2026-05-15 | Rebuilt bootstrap into a contributor-grade onboarding guide with prerequisites, proof path, generated-artifact rules, Beads flow, docs workflow, and failure diagnostics. |
| 1.0.0 | 1 | 2026-05-12 | Added developer bootstrap. |
