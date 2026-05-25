# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-25

### Added

- Indian retirement corpus and income planning for AY 2026-27 / FA-2025
  tax rules, covering both the new default tax regime and the old regime.
- Tax-aware Systematic Withdrawal Plan (SWP) simulation with per-lot FIFO
  capital-gains accounting, grandfathered FMV (equity pre-2018), and
  §74 carry-forward loss pool.
- Joint-life household model: spouse monthly need, joint longevity horizon,
  contingency years, legacy corpus goal, and healthcare reserve.
- Sequence-of-returns Monte Carlo simulation (seeded, N up to 1000)
  reporting success probability with 95% confidence interval.
- Forced-colors / high-contrast accessibility support
  (`@media (forced-colors: active)` — UI-UX.R15).
- 200% and 400% browser-zoom acceptance tested via CI gate
  (UI-UX.R13, `tests/e2e/browser-zoom.mjs`).
- Per-component × per-state × per-theme visual-regression snapshot CI gate
  (`tests/e2e/visual-regression-matrix.mjs`).
- Tax Law Studio: user-editable per-AY JSON tax rules with diff preview
  before any ruleset is applied, and a CA-review script for rule derivation
  outside the browser.
- Offline-first single-file HTML distribution — open `index.html` directly
  in any modern browser; no install, no server, no build step required for
  end users.
- 100% client-side; zero outbound network requests at runtime (no telemetry,
  no analytics beacon, no backend sync).
- MIT licensed; see `LICENSE` for full copyright and permission notice.

[Unreleased]: https://github.com/stribog-cloud/retirement-corpus-planner/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/stribog-cloud/retirement-corpus-planner/releases/tag/v1.0.0
