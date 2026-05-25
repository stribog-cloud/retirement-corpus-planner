# Retirement Corpus & Income Planner

[![CI](https://github.com/stribog-cloud/retirement-corpus-planner/actions/workflows/ci.yml/badge.svg)](https://github.com/stribog-cloud/retirement-corpus-planner/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/msambare/810e83e2fd273e360c77ffc7f12e886e/raw/retirement-corpus-planner-coverage.json)](https://github.com/stribog-cloud/retirement-corpus-planner/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/stribog-cloud/retirement-corpus-planner)](https://github.com/stribog-cloud/retirement-corpus-planner/releases/latest)
[![Node](https://img.shields.io/badge/node-26-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Downloads](https://img.shields.io/github/downloads/stribog-cloud/retirement-corpus-planner/total)](https://github.com/stribog-cloud/retirement-corpus-planner/releases)
[![Last Commit](https://img.shields.io/github/last-commit/stribog-cloud/retirement-corpus-planner/main)](https://github.com/stribog-cloud/retirement-corpus-planner/commits/main)

> An offline-first, single-file Indian retirement planning tool for corpus durability, monthly income, tax drag, inflation, sequence risk, and guided allocation.

---

## What It Does

This is a local, browser-based retirement planning cockpit for Indian investors. You open one HTML file, enter your corpus, monthly cash need, instrument allocation, and tax profile, and the tool projects how long your money lasts — accounting for monthly SWP withdrawals, FIFO lot-level capital gains tax, inflation, and sequence-of-returns risk modelled via Monte Carlo simulation. Every number on screen traces back to the same live model. Nothing is uploaded or stored outside your browser.

---

## Who It Is For

Indian retirees, pre-retirees, and financial planners who need to answer: can this corpus fund a monthly cash need after tax, inflation, and a bad market sequence? It is also useful for family decision-makers comparing withdrawal strategies and advisers preparing a plan for CA or SEBI-RIA review.

This tool is not a tax filing product, not investment advice, and not a substitute for a SEBI-registered investment adviser or Chartered Accountant. See [DISCLAIMER.md](DISCLAIMER.md) for the full scope statement.

---

## Key Features

- **Offline-first single-file HTML** — built with `vite-plugin-singlefile`; the entire app ships as one HTML file with no CDN dependency, no backend, and no install step. Open it in any modern browser from a local drive.
- **Monthly FIFO SWP with tax lot accounting** — each withdrawal sells lots in first-in-first-out order; short-term and long-term capital gains are computed separately per lot; grandfathered pre-2018 FMV is supported for equity.
- **Monte Carlo sequence-of-returns simulation** — up to 1,000 normal or fat-tail return paths; seeded for reproducibility; reports P10/P50/P90 corpus outcomes and success probability with 95% confidence margin.
- **Joint-life household modelling** — longevity is derived from last-survivor basis (max of retiree and spouse age-to-90); household spend, pension/rental income floor, healthcare reserve, and dependant need are modelled explicitly.
- **Indian tax law scope (FY 2025-26 / AY 2026-27, Finance Act 2025)** — seven-band new-regime slabs, §87A ₹12L rebate with marginal relief, surcharge with marginal relief at ₹50L/₹1Cr/₹2Cr/₹5Cr thresholds, LTCG/STCG special rates per Finance Acts 2024 and 2025, §80TTB senior deposit deduction (old regime). Ruleset is editable and version-tagged.
- **Sensitivity heatmap and scenario library** — return × withdrawal rate heatmap shows corpus outcomes in today's rupees; built-in standard stress cases (income-floor, market-crash, high-inflation, spouse-longevity, healthcare-reserve).
- **Adviser / CA Pack export** — one-click export of PDF narrative report, CSV annual/monthly ledger, tax-law rules JSON, and assumptions JSON for professional challenge.
- **No telemetry** — no outbound network requests, no analytics beacon, no cookies, no backend. All computation is local. Verified by zero matches for `fetch(`, `XMLHttpRequest`, `navigator.sendBeacon`, or `gtag(` anywhere in `src/`.
- **Privacy-first local persistence** — plan assumptions and scenario snapshots are stored only in browser `localStorage` under six known keys. Clear all data at any time from Help > Local Data & Privacy. See [PRIVACY.md](PRIVACY.md) for the full data inventory.

---

## Quickstart

No install required.

1. Download the latest `index.html` from the [Releases](https://github.com/stribog-cloud/retirement-corpus-planner/releases) page.
2. Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge). No server needed — `file://` works.
3. The first-launch acknowledgment explains what is stored locally and the planning-grade nature of all outputs. Read it, then dismiss to begin.
4. In **Assumption Studio**, set corpus, monthly cash need, instrument allocation, inflation, return, and tax profile.
5. The **Overview** cockpit updates immediately. The KPI strip shows depletion year, corpus at target year, and monthly surplus/shortfall.
6. Use **Guided Planner** to translate household spend, income floor, healthcare reserve, and risk comfort into a recommended withdrawal posture and portfolio.
7. Review **Tax Studio** for slab computation, SWP FIFO lot trail, and editable tax-law ruleset before trusting the tax number.
8. Run **Simulations** (Monte Carlo, Scenario Library, Sensitivity Heatmap) to stress-test against sequence risk.
9. Export the **Adviser / CA Pack** (PDF, CSV, JSON) when a professional needs the full evidence trail.

---

## Tax Law Scope

This tool models Indian income tax under **FY 2025-26 / Assessment Year 2026-27** as amended by **Finance Act, 2025** and Finance Act 2024 (No. 2):

- New-regime seven-band slabs (§115BAC, effective AY 2026-27)
- §87A rebate: ₹12,00,000 threshold with ₹60,000 cap; marginal relief above ₹12L
- Surcharge with marginal relief at ₹50L, ₹1Cr, ₹2Cr, ₹5Cr thresholds
- LTCG on equity/equity-MF at 12.5% (>₹1.25L exemption); STCG at 20%
- Debt MF and listed bond LTCG at applicable slab rate
- §80TTB: ₹50,000 senior citizen deposit interest deduction (old regime)
- Health and education cess at 4%

All rates are encoded in an editable, version-tagged JSON ruleset. The ruleset can be inspected and overridden in Tax Studio. Tax calculations are planning-grade estimates only. See [DISCLAIMER.md](DISCLAIMER.md).

---

## Privacy

All data stays in your browser. Nothing is uploaded or transmitted. See [PRIVACY.md](PRIVACY.md) for the complete data inventory and deletion instructions.

---

## Disclaimer

Outputs are planning-grade estimates only — not personalized investment advice, tax filing guidance, or a substitute for professional review. See [DISCLAIMER.md](DISCLAIMER.md).

---

## Product Surfaces

| Surface | What it does |
|---|---|
| **Overview** | Decision cockpit: KPI strip, Trust Center, monthly cash solver, scenario timeline |
| **Guided Planner** | Retiree Guided Mode: household spend, income floor, healthcare reserve, risk questions, strategy shortlist |
| **Tax Studio** | Tax profile, SWP FIFO ledger, editable tax-law ruleset, provenance panel |
| **Simulations** | Monte Carlo, Scenario Library, sensitivity heatmap, scenario lens |
| **Ledger** | Adviser / CA Pack, annual/monthly evidence trail, CSV and PDF export |
| **Assumption Studio** | Full model configuration: corpus, instruments, inflation, return, tax, household |
| **Help** | Guided tour, context-sensitive help, local data and privacy controls |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, quality gates, and AI attribution rules. All contributions must pass `make all` before review.

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Participation implies acceptance.

For bug reports and feature requests, open a [GitHub Issue](https://github.com/stribog-cloud/retirement-corpus-planner/issues).

---

## Security

For security concerns, see [SECURITY.md](SECURITY.md). Use GitHub Private Vulnerability Reporting for sensitive disclosures.

---

## License

[MIT License](LICENSE) — Copyright (c) 2026 Stribog IT Solutions Pvt. Ltd. <hello@stribog.com>

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the version history.

---

*Retirement Corpus & Income Planner · Planning tool · not financial/tax advice · v1.0.0 · MIT · https://github.com/stribog-cloud/retirement-corpus-planner*
