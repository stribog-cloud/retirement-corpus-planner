# Contributing

Thanks for your interest in contributing to the **Retirement Corpus & Income Planner**.

Before filing an issue or opening a pull request, please read this document in full.

## Getting Started

### Fork and clone

1. Fork the repository on GitHub.
2. Clone your fork locally:

   ```sh
   git clone https://github.com/<your-username>/retirement-corpus-planner.git
   cd retirement-corpus-planner
   npm install
   ```

3. Confirm the smoke suite passes before making any changes:

   ```sh
   npm run test:smoke
   ```

## Filing Issues

Use [GitHub Issues](https://github.com/stribog-cloud/retirement-corpus-planner/issues).

- **Security vulnerabilities** — do not file publicly. Follow the process in [SECURITY.md](SECURITY.md) instead.
- **Code of Conduct violations** — file with the `[CONDUCT]` label as described in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- **Bug reports** — use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
- **Feature requests** — use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).

## Proposing a Change

### Fork → Branch → Commit → PR

1. Create a feature branch from `main`:

   ```sh
   git checkout -b fix/short-description
   ```

2. Make your change, following the code style and test requirements below.
3. Commit with a conventional commit message. If your commit is AI-assisted, include the trailer described in [AI Attribution](#ai-attribution).
4. Open a pull request against `main` using the [PR template](.github/pull_request_template.md).

## Code Style

The repository follows the conventions established in `src/` and enforced by `scripts/lint.mjs`. Run the linter before committing:

```sh
node scripts/lint.mjs
```

Key conventions:

- Pure retirement, tax, and planning logic lives in `src/model.js` and `src/planning.js`. React components, charts, browser persistence, and PDF/CSV export code lives in the UI layer.
- `src/persistence.js` is the only module that touches browser storage. Do not call `localStorage` from pure model code.
- Do not hand-edit generated artifacts (`index.html`, `dist/*.html`, `Retirement Corpus & Income Planner.html`). Run `npm run build` instead.

## Tests

Encode a failing test before implementing a fix or feature where it is reasonable to do so.

Run the narrowest useful test during development, then broaden before closing an issue:

| Command              | When to run                                                                       |
|----------------------|-----------------------------------------------------------------------------------|
| `npm run test:smoke` | After every commit. Verifies build integrity.                                     |
| `npm run test:unit`  | For any change to model, planning, persistence, or export code.                   |
| `npm run test:e2e`   | For UI, export, help, tour, navigation, persistence, or responsiveness changes.   |
| `npm run all`        | Before release-readiness claims or broad closeout. Runs every gate.               |

If you cannot run a required gate, leave the issue open and note the blocker in the PR description.

## AI Attribution

Any commit that contains AI-assisted work **must** carry a `Co-authored-by:` trailer. The trailer is enforced by a pre-commit and CI gate (`scripts/precommit-trailer-check.mjs`); commits without one will fail the build.

```
<commit subject>

<optional body>

Co-authored-by: Claude <noreply@anthropic.com>
```

- The trailer must appear on its own line, separated from the commit body by a blank line.
- Multiple `Co-authored-by:` lines are permitted when more than one model contributed.
- Purely human commits do not require this trailer but **must** opt out explicitly with `No-AI-Author: true` on its own line. A missing trailer with no opt-out is treated as a hard build failure.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Participation in this project — issues, pull requests, discussions, and any other interaction — implies acceptance of the Code.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers the rest of the project.
