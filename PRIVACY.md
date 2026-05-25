# Privacy Notice

**Product:** Retirement Corpus & Income Planner
**Version:** 1.0.0
**Effective date:** 2026-05-19

---

## 0. TL;DR

| What | Where | How long | How to delete |
|---|---|---|---|
| Plan assumptions, tax-law, active view | `localStorage` in your browser | Until you clear it | Help > Local Data & Privacy > Clear saved data, or browser site-data controls |
| Named scenario history (up to 12 snapshots) | `localStorage` in your browser | Until you clear it | Same as above |
| Layout preference | `localStorage` in your browser | Until you clear it | Same as above |
| Theme preference | `localStorage` in your browser | Until you clear it | Same as above |
| Guided-tour completion flag | `localStorage` in your browser | Until you clear it | Same as above |
| Privacy consent acknowledgement | `localStorage` in your browser | Until you clear it | Same as above |

Nothing is uploaded. Nothing is transmitted. No network request is made by this app at runtime.

---

## 1. Data the App Stores

All persistence is via the browser's `localStorage` API. There is no backend, no server, no database, and no cloud account. Data exists only in the browser profile on the device where you use the app.

The implementation is in `src/persistence.js`. The following `localStorage` keys are managed by the app:

### `fin-cockpit-state-v2`

Content: your current plan state — contribution amounts, target corpus, withdrawal rate, tax assumptions, income mode, household plan, Tax Studio custom JSON, active view, scenario preset, and table display mode.

Classification: **Restricted** if you enter real financial figures belonging to an identifiable individual (yourself, a family member, or a client). Internal-use only if you use synthetic or illustrative figures.

Defined at `src/persistence.js` line 3 (`const STORAGE_KEY = "fin-cockpit-state-v2"`).

### `fin-cockpit-scenario-history-v1`

Content: up to 12 named scenario snapshots. Each snapshot contains the plan state at the time of saving, a name, optional notes, the effective projection parameters, summary output figures, and a tax-law version string.

Classification: **Restricted** if snapshots contain real financial data for an identifiable individual.

Defined at `src/persistence.js` line 8 (`const SCENARIO_HISTORY_KEY = "fin-cockpit-scenario-history-v1"`).

### `fin-cockpit-layout-v2`

Content: panel widths (rail, insights panel), viewport setting, viewport mode (auto/manual), and font scale.

Classification: Internal. Contains no personal financial data.

Defined at `src/persistence.js` line 4 (`const LAYOUT_KEY = "fin-cockpit-layout-v2"`).

### `fin-cockpit-theme`

Content: the selected UI theme identifier (light/dark/system/etc.).

Classification: Internal. Contains no personal financial data.

Defined at `src/persistence.js` line 5 (`const THEME_KEY = "fin-cockpit-theme"`).

### `fin-cockpit-guided-tour-v1`

Content: a completion flag (`"done"`) written when you finish the guided tour.

Classification: Internal. Contains no personal financial data.

Defined at `src/persistence.js` line 6 (`const TOUR_KEY = "fin-cockpit-guided-tour-v1"`).

### `fin-cockpit-privacy-consent-v1`

Content: a JSON object recording that you acknowledged this privacy notice — includes a boolean flag, the ISO timestamp of acknowledgement, and a plain-English scope description. Written by `persistPrivacyConsent()` in `src/persistence.js`.

Classification: Internal. Contains no personal financial data.

Defined at `src/persistence.js` line 7 (`const PRIVACY_CONSENT_KEY = "fin-cockpit-privacy-consent-v1"`).

---

## 2. What This App Does Not Do

**No outbound network requests are made at runtime.** The app does not transmit any data to any server.

Specifically, the following capabilities are absent from the production build:

- No `fetch()` or `XMLHttpRequest` calls originating from application code
- No `navigator.sendBeacon()` analytics pings
- No third-party analytics SDKs (Google Analytics, Mixpanel, Segment, Amplitude, Hotjar, Plausible, PostHog, or any equivalent)
- No telemetry pipeline
- No tracking pixels
- No cookies (`document.cookie` is never read or written by this app)
- No session storage used for persistence (only `localStorage`)
- No WebSocket connections
- No background sync or service worker network activity

The built application (`dist/app.html`, `index.html`, and `Retirement Corpus & Income Planner.html`) is a single self-contained HTML file. It loads fully from `file://` without any network access.

The word `analytics` appears in `src/analytics.js` and `src/workers/analytics-worker.js` and throughout `src/main.jsx` — this refers entirely to in-process financial computation (risk analytics, Monte Carlo simulation, strategy ranking). It is a naming choice for local computation modules. There is no connection to any web analytics service. The analytics worker (`src/workers/analytics-worker.js`) is a browser Web Worker that imports only from `src/analytics.js`, which in turn imports only from `src/model.js`. No network API is used.

The two occurrences of `import.meta.env` in `src/main.jsx` (lines 6435–6436) are used to expose a debug API object (`window.__FIN_DASHBOARD_MODEL__`, `window.__FIN_DASHBOARD_TEST_API__`) to the browser console in the Vite development server (`DEV` mode) or on local test hosts. These are development tooling features only; they are eliminated by Vite's production build process. They do not involve any network calls.

Network API patterns (`XMLHttpRequest`, `fetch`) visible in the built HTML originate from bundled third-party libraries — specifically `jspdf` (PDF export) and `echarts` (charting). These libraries include code that _could_ make network calls in other contexts. In this build, none of those code paths are invoked: PDF generation is entirely synchronous and local; charts render from in-memory data. No URL is passed to any of these APIs by application code.

### CI evidence

The permanent, machine-verifiable evidence for the zero-network-request claim is the test at `tests/e2e/offline-load.mjs`. That test:

1. Starts Puppeteer with `offline: true` (Chromium DevTools Protocol network condition).
2. Loads the built `index.html` via `file://` protocol.
3. Asserts the app reaches interactive state within the load-time budget.
4. Asserts zero outbound `fetch` or `XMLHttpRequest` events were initiated during or after load.
5. Asserts `localStorage` read/write works correctly without network access.

In addition, the following grep over `src/` returns only `import.meta.env.DEV`-gated debug-API exposure in `src/main.jsx` (lines 6435–6436), with zero application-logic network calls:

```
grep -rE "fetch\(|XMLHttpRequest|navigator\.sendBeacon|import\.meta\.env" src/
```

### How to verify yourself

1. Open the built file (`Retirement Corpus & Income Planner.html` or `index.html`) in your browser using the `file://` protocol — not a local HTTP server.
2. Open DevTools (F12 or Cmd+Option+I).
3. Select the **Network** tab.
4. Use every screen in the application: change inputs, run a simulation, export a CSV, export a PDF.
5. Confirm the Network panel shows zero requests after the initial `file://` page load. (The initial load entry is the file itself, not a network request.)
6. Optionally, in the DevTools Console, run:
   ```js
   document.cookie
   ```
   Expected result: `""` (empty string — no cookies are set).

---

## 3. How to Delete Your Data

### Method A — In-app clear control (recommended)

1. Open the app.
2. Click **Help** (the `?` button in the top toolbar).
3. Navigate to **Local Data & Privacy**.
4. Click **Clear saved data**.

This removes all six `fin-cockpit-*` `localStorage` keys listed in §1 and resets the app to factory defaults. Downloaded exports (PDF, CSV, JSON review packs) remain on your disk; you must delete those manually.

### Method B — Browser site-data controls

Use your browser's built-in data clearing tools. The path varies by browser:

- **Chrome / Edge:** Settings > Privacy and security > Clear browsing data > Site data — or navigate to `chrome://settings/siteData` and search for `fin-cockpit`.
- **Firefox:** Settings > Privacy & Security > Cookies and Site Data > Manage Data — search for the origin.
- **Safari:** Settings > Privacy > Manage Website Data — search for `localhost` or `file`.

Both methods remove all six keys. There is no partial-key delete option in the in-app control; if you need to remove only specific keys, use the browser's DevTools Console:

```js
localStorage.removeItem("fin-cockpit-state-v2");
localStorage.removeItem("fin-cockpit-scenario-history-v1");
localStorage.removeItem("fin-cockpit-layout-v2");
localStorage.removeItem("fin-cockpit-theme");
localStorage.removeItem("fin-cockpit-guided-tour-v1");
localStorage.removeItem("fin-cockpit-privacy-consent-v1");
```

Or clear all `localStorage` for the origin at once:

```js
localStorage.clear();
```

Note: `localStorage.clear()` removes all keys for the origin, not just the app's keys. On `file://`, each directory may be a separate origin depending on the browser.

---

## 4. Shared Browser and Export Warnings

### Shared browser profiles

`localStorage` is scoped to the browser profile, not the operating system user account. If multiple people share a browser profile on one device, they share `localStorage`. Plan assumptions, scenario history, and consent flags from one person are readable by anyone with access to that browser profile.

If you use this app for real financial planning on a shared device:
- Use a dedicated browser profile for planning sessions.
- Clear data after each session using one of the methods in §3.
- Do not leave the browser open unattended with sensitive data visible.

### Downloaded exports

When you export a PDF, CSV, or JSON review pack, the file is written to your local filesystem. That file:
- Leaves the browser's security boundary.
- Is not tracked, recalled, or deletable by the app.
- May contain the full plan state including tax assumptions and target corpus values.

Treat exported files with the same care as other sensitive financial documents. Store them in an encrypted directory or volume if the device is shared. Delete them using your operating system's secure-erase facility when they are no longer needed.

See `SECURITY.md` for the full local-only threat model and the Content Security Policy posture of the built artifact.

---

## 5. Financial Data Sensitivity

The data stored in `fin-cockpit-state-v2` and `fin-cockpit-scenario-history-v1` may include target corpus values, monthly withdrawal figures, tax regime choices, and other financial assumptions. If these figures relate to a real, identifiable person — yourself, a family member, or a client — they are **Restricted** data.

This app is a planning-grade tool, not a regulated financial service. See `DISCLAIMER.md` for the full scope-of-use statement. In particular:

- The app does not assess or verify the sensitivity of the data you enter.
- The app does not classify, label, or protect the data beyond what the browser's own `localStorage` isolation provides.
- You are responsible for the appropriateness of using browser `localStorage` for your data sensitivity requirements.
- If your regulatory or professional obligations require data-at-rest encryption, server-side access controls, or audit logging, browser `localStorage` does not meet those requirements.

---

## 6. Cookies

This app sets no cookies. The `document.cookie` API is never read or written by any application code.

Verification:

```
grep -rE "document\.cookie|Cookie:" src/
```

Result (as of 2026-05-19): zero matches in `src/`.

In a browser DevTools Console, after using the app:

```js
document.cookie  // returns: ""
```

---

## 7. Contact

This is an MIT-licensed open-source project. For data handling questions, open a GitHub Issue in the repository. For sensitive disclosures, use GitHub Private Vulnerability Reporting or the owner-designated private channel published in the repository profile.

See `SECURITY.md` §Reporting for the full disclosure policy.

---

## Related Documents

- Financial planning scope and limitations: [DISCLAIMER.md](DISCLAIMER.md)
- Security posture and threat model: [SECURITY.md](SECURITY.md)
- Software license: [LICENSE](LICENSE)
- Project overview: [README.md](README.md)

---

## Revision History

| Version | Revision | Date | Change |
|---|---|---|---|
| 1.0.0 | 1 | 2026-05-19 | Initial public release. |
