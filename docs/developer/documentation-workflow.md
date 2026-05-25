---
title: "Documentation Workflow"
created: 2026-05-15
updated: 2026-05-15
type: project/developer-doc
status: governing-reference
version: "1.0.0"
revision: 1
last_updated: 2026-05-15
tags: [developer-docs, documentation, screenshots, diagrams, d2]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Documentation Workflow

> How contributors keep user docs, developer docs, screenshots, diagrams, and BrainForest notes aligned with code.

## 0. TL;DR

Docs are part of the product. User docs live under `docs/user`, developer docs under `docs/developer`, internal evidence under `docs/internal`. D2 source is committed with rendered SVG and PNG. Product screenshots are generated through the screenshot script. `make doc-gate` must pass.

## 1. Change Classification

| Change | Required Documentation |
|--------|------------------------|
| User-visible workflow | User how-to or quickstart update, Help copy review, screenshots if UI changed |
| Model/tax/risk behaviour | User concept/reference update, developer model contract update, tests |
| Export format | User output reference, developer export pipeline, E2E assertions |
| Persistence/privacy | User trust/privacy docs, developer persistence contract, Trust Center copy |
| UI pattern | UI design-system doc, IA contract if navigation changes, screenshot refresh |
| Architecture boundary | Developer architecture doc, D2 diagram, ADR if the decision is durable |

## 2. Front Matter

Every serious Markdown doc carries YAML front matter with title, created, updated, type, status, version, revision, last_updated, tags, project, owners, and audience where applicable.

## 3. Diagrams

Use D2 for structural diagrams. Store source under `docs/**/diagrams/src/` and rendered files under `docs/**/diagrams/rendered/`.

Render both formats:

```zsh
/opt/homebrew/bin/d2 docs/user/diagrams/src/01-retirement-planning-journey.d2 docs/user/diagrams/rendered/01-retirement-planning-journey.svg
/opt/homebrew/bin/d2 docs/user/diagrams/src/01-retirement-planning-journey.d2 docs/user/diagrams/rendered/01-retirement-planning-journey.png
```

## 4. Screenshots

Use:

```zsh
make docs-screenshots
```

The script captures current product screenshots into `docs/user/assets/`. Do not use manually cropped desktop screenshots as user-doc evidence unless a bug report explicitly needs them.

## 5. Links And Topology

Run:

```zsh
make doc-gate
```

The gate checks required docs, screenshot references, local links, and the `docs/` top-level directory contract.

## 6. BrainForest

After significant product, tax, export, architecture, or documentation changes, update `/Users/msambare/Documents/BrainForest/20 - Personal/Finance/Fin-Dashboard.md` with a concise note and evidence. (This path is the owner's local personal vault and is not enforced by any repository gate. It is a documentation sync convention, not a repository contract.)

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.0.0 | 1 | 2026-05-15 | Added documentation workflow for docs, screenshots, diagrams, gates, and BrainForest sync. |
