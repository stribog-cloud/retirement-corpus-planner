---
title: "Retirement Planner Support Map"
created: 2026-05-12
updated: 2026-05-18
type: project/user-doc
status: published
version: "2.1.0"
revision: 4
last_updated: 2026-05-18
tags: [user-docs, support, escalation]
project: fin-dashboard
owners: [msambare]
audience: [retiree, family-planner, adviser, evaluator]
---

# Support Map

> Use this support path when self-service Help and documentation do not resolve the issue.

The planner is a local-first product. There is no hosted support desk or in-app ticket system. Support starts with a clear, redacted report: the exact assumptions, browser, viewport, steps, and exports needed to understand the problem without exposing real family or client data unnecessarily.

## 1. Escalation

1. Open in-product Help and search for the symptom or concept.
2. Use [Troubleshooting](troubleshooting.md) for observable symptoms.
3. Check [Assumption Reference](reference/assumptions.md) when a field meaning is unclear.
4. Check [Trust, Privacy, and Evidence](concepts/trust-privacy-and-evidence.md) when the issue involves saved state or exports.
5. Check [Retirement Tax and Withdrawal Model](concepts/retirement-tax-and-withdrawal-model.md) when the issue involves SWP, IDCW, interest, rebate, or tax.

## 2. What To Capture

| Issue Type | Evidence To Capture |
|------------|---------------------|
| UI defect | Browser, viewport, screenshot, active theme, steps, expected result |
| Slow interaction | Field or button, value entered, browser, approximate delay, whether charts were visible |
| Wrong number | Assumptions, affected screen, expected reasoning, CSV export when safe |
| Tax concern | Tax regime, age band, residency, product class, tax-law JSON, relevant ledger rows |
| Export concern | Export type, active scenario, whether exported fingerprint matches current plan |
| Privacy concern | Storage action, browser profile, exported files involved, clear-data result |

## 3. Support Report

Create a support report with:

- Clear title.
- Reproduction steps.
- Expected behaviour.
- Actual behaviour.
- Evidence.
- Severity.
- Whether real financial data has been removed or replaced with representative values.

If you received the planner from a maintainer, adviser, CA, or family reviewer, send the report through the private channel they gave you. If you are using your own local copy, keep the report with your planning records and share only the redacted parts needed for review.

Do not paste real client data into public channels. Use representative values unless the exact private value is required and the recipient has agreed how it will be protected.

## 4. Professional Review Boundary

For tax or investment suitability, use the Adviser / CA Pack and involve the appropriate professional. The product can make assumptions visible; it does not replace a filing-grade tax review or regulated investment advice.

## 5. Security or privacy issue

If assumptions, exports, browser storage, or screenshots expose data unexpectedly:

1. Stop sharing the affected artifact.
2. Use Help > Local Data & Privacy > Clear saved data if browser storage is involved.
3. Preserve reproduction steps.
4. Contact the maintainer or trusted reviewer through a private channel, using redacted details first.

## Revision History

| Version | Revision | Date | Change |
|---------|----------|------|--------|
| 2.1.0 | 4 | 2026-05-18 | Replaced maintainer-only escalation details with public-user support report guidance and private-channel language. |
| 2.0.0 | 3 | 2026-05-15 | Expanded support map with self-service order, evidence capture, support report guidance, professional review boundary, and privacy/security escalation. |
| 1.1.0 | 2 | 2026-05-13 | Added clear-data first response for local browser privacy concerns. |
| 1.0.0 | 1 | 2026-05-12 | Added user support escalation map. |
