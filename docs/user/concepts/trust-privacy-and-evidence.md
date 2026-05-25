---
title: "Trust, Privacy, and Evidence"
created: 2026-05-15
updated: 2026-05-17
type: project/user-doc
status: published
version: "1.1.0"
revision: 2
last_updated: 2026-05-17
tags: [user-docs, concepts, privacy, trust, evidence]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, evaluator]
---

# Trust, Privacy, and Evidence

> Understand what the planner stores, what it proves, and what still needs human review.

The planner is local-first. It runs in the browser and uses browser storage so your configuration survives reloads. That makes the product convenient, but it also means a shared browser profile can retain sensitive financial assumptions.

## 1. Local Data

The planner can remember:

- Assumptions.
- Named scenario history.
- Layout width and font scale.
- Theme.
- Guided-tour state.
- Privacy acknowledgement.
- Tax-law ruleset edits.

The sensitive remembered keys are `fin-cockpit-state-v2` for assumptions and `fin-cockpit-scenario-history-v1` for saved plan snapshots/notes. Other keys remember layout, theme, guided-tour state, and the privacy acknowledgement.

Use Help > Local Data & Privacy > Clear saved data when a browser profile should forget this information.

## 2. Sensitive Outputs

Downloaded PDF, CSV, JSON, scenario snapshots, and review packs can contain corpus, cash need, tax profile, household facts, and risk evidence. Treat those files as financial records.

## 3. Trust Center

The Trust Center exists so you do not have to infer trust from the interface. It explains:

- Local storage posture.
- Model limits.
- Tax-law provenance.
- Risk-method sensitivity.
- Export sensitivity.
- Human-review expectations.

## 4. Fingerprints And Snapshots

Scenario snapshots and exports carry an assumptions fingerprint. Use it to verify that the file you are discussing came from the same live model state.

## 5. Planning Evidence, Not Advice

The planner is decision-support software. It does not guarantee market returns, determine final tax liability, recommend a specific fund, or replace a professional. Its value is in making assumptions visible and producing evidence that can be challenged.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.1.0 | 2 | 2026-05-17 | Added exact sensitive local-storage keys for assumptions and scenario history. |
| 1.0.0 | 1 | 2026-05-15 | Added trust, privacy, local data, exports, and evidence explanation. |
