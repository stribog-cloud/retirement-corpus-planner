# E2E Test Suite

Run with:

```sh
npm run test:e2e
```

The browser suites open the generated `index.html` with Puppeteer and serve it through a local HTTP server.

## Functional Dashboard Regression

`dashboard-regression.mjs` checks:

- desktop render smoke and chart canvas presence
- model API availability
- integrated workspace navigation for Overview, Guided Planner, Tax Studio, Simulations, and Ledger
- click latency for Help, Model, and guided planner choices
- value-edit latency for the monthly cash input after optimizer changes
- sustained typing, click-outside blur, focus-ring cleanup, and post-edit model-settle latency
- strategy-card and cash-reserve tile latency after corpus/cash edits
- optimizer panel, strategy cards, and strategy apply behavior
- first-launch guided tour and Help-triggered tour replay, including consent-first sequencing, spatial spotlight anchoring, target outline, and non-blurring backdrop
- compact guided-tour card geometry, desktop width, step rail density, visible progress metadata, hidden verbose step labels, all-step spotlight overlap limits, and bottom-edge clearance for steps 3-6
- Trust Center panel and Trust Center help topic
- first-run local-storage privacy notice and Help-based clear-data control
- dark/light theme preference persistence across reload after local-storage consent
- saved scenario timeline persistence, annotation editing, fingerprinting, and visible change history
- Retiree Guided Mode controls and household action-plan output
- Scenario Library standard case count, save/export behavior, and library snapshot provenance
- Adviser / CA review-pack panel and JSON export contents
- Withdrawal Policy & Trust Plan advisor panel
- editable Tax Law Studio ruleset apply/reset path
- Tax Law Studio review badge, metadata safeguards, review diff, and explicit confirmation before applying changed rules
- active and draft Tax Law JSON downloads, proving the active export matches the applied model ruleset while the draft export preserves unapplied editor JSON
- Assumption Studio synchronization for household, tax, product-classification, risk, and optimizer controls
- dashboard-to-Assumption-Studio and Assumption-Studio-to-dashboard sync
- monthly target stress banner
- heatmap recalculation after assumption changes
- End Target Chance responsiveness
- right-rail scroll behavior
- context-sensitive tax help content
- context-sensitive Tax Law Studio help content
- context-sensitive household, retiree-tax, and optimum-allocation help content
- context-sensitive policy/help glossary content
- Help reader/topic-library separation, default Guided Tutorial reader, and in-place topic expansion
- PDF, CSV, scenario JSON, active/draft tax-law JSON, and review-pack JSON export smoke with live-state metadata, assumptions fingerprint, trust caveats, and schedule content
- basic accessible-name coverage for buttons and form controls
- 390px mobile viewport overflow, verdict summary, card-based ledger, and control visibility
- mobile header action geometry, including touch-target size and icon centering

## UI Layout Regression

`ui-layout-regression.mjs` checks:

- desktop, narrow-desktop, tablet, Android-sized, and iPhone-sized viewports
- every integrated workspace at each viewport
- horizontal overflow limits
- required dashboard surfaces are present
- KPI, ratio, what-if, optimizer, chart, tax, and metric grid children do not overlap
- key navigation, cards, buttons, optimizer choices, and layout controls do not clip text
- chart canvases are nonblank
- optimizer card/choice counts remain stable
- heatmap cell count remains stable
- light-theme toggle does not break layout or content
- guided-tour, toast, contextual rail, narrative panel, and page-local interaction affordances stay present
- overview trust guardrail, saved scenario timeline, mobile verdict, and mobile ledger-card surfaces stay present
- mobile action dock controls stay limited, thumb-sized, and visually centered
- Trust Center, Retiree Guided Mode, Scenario Library, and Adviser / CA Pack surfaces stay present

These browser checks are part of `npm run test:all`, but coverage percentages come from the Vitest unit/regression suite because Puppeteer e2e execution is not instrumented for V8 coverage.
