---
title: "Persistence and Privacy Contract"
created: 2026-05-15
updated: 2026-05-18
type: project/developer-doc
status: governing-reference
version: "1.1.1"
revision: 3
last_updated: 2026-05-18
tags: [developer-docs, persistence, privacy, local-storage]
project: fin-dashboard
owners: [msambare]
audience: [contributor, maintainer, audit-reviewer]
---

# Persistence and Privacy Contract

> Contributor contract for remembered state, local data controls, and privacy-facing behaviour.

## 0. TL;DR

Browser persistence is centralized through `src/persistence.js`, with two explicit bootstrap/UI exceptions: `app.html` reads consent and theme before React mounts to prevent a theme flash, and the current guided-tour completion state is still read/written in `src/main.jsx` through the shared `TOUR_KEY`. The domain model must remain free of direct browser storage access. Every remembered key must be visible to the user through privacy notice, Trust Center, Help, and clear-data behaviour.

## 1. Stored State

`src/persistence.js` owns the known storage-key constants and helpers:

- `fin-cockpit-state-v2` - assumptions and active workspace; Restricted if real financial data is entered.
- `fin-cockpit-scenario-history-v1` - saved plan snapshots and notes; Restricted if real financial data is entered.
- `fin-cockpit-layout-v2` - layout preference.
- `fin-cockpit-theme` - theme preference. `app.html` performs a consent-gated early read of this key before React loads; persistence helpers own normal React-time writes.
- `fin-cockpit-guided-tour-v1` - guided-tour state. The completion flag is currently UI-local in `src/main.jsx` for first-run/replay behaviour, but clear-data and documentation still treat it as part of the persistence surface.
- `fin-cockpit-privacy-consent-v1` - privacy consent acknowledgement.
- Tax-law ruleset edits are serialised as `taxLawJson` within `fin-cockpit-state-v2`; there is no separate storage key for tax-law. They are cleared when the user clears saved data.

Changing stored state requires updating clear-data behaviour, Trust Center language, Help, user docs, tests, and export caveats when the field can affect evidence.

## 2. Consent Sequence

The first-run privacy notice must appear before remembered assumptions are treated as trusted user intent. `app.html` may read only the consent key and, when accepted, the theme key before React mounts. The guided tour starts after consent and can be replayed from Help; if the tour state remains UI-local, it must still respect consent, clear-data, and Help/Trust Center disclosure.

## 3. Clear-data Contract

Clear saved data must remove all known dashboard keys from the current browser profile and leave downloaded files untouched. The UI must explain that exported PDFs, CSVs, JSON packs, and HTML files already on disk are outside browser storage.

## 4. Sensitive Data Posture

Financial assumptions, household expenses, tax profile, scenario notes, and exports can be sensitive. Do not add remote telemetry, analytics, or network transmission without a new ADR, user disclosure, consent path, security review, and updated documentation.

## 5. Test Expectations

Persistence changes need E2E coverage for:

- Consent-first launch.
- Theme persistence.
- Layout persistence.
- State persistence.
- Scenario history save/restore/import/export.
- Clear saved data.
- Broken or malformed storage recovery.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 1.1.1 | 3 | 2026-05-18 | Documented consent-gated `app.html` theme bootstrap and current UI-local tour completion state. |
| 1.1.0 | 2 | 2026-05-17 | Replaced generic storage bullets with exact localStorage keys and classifications. |
| 1.0.0 | 1 | 2026-05-15 | Added persistence and privacy contract for browser storage and local-first trust surfaces. |
