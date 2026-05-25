import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Charter control-plane documents live under docs/internal/, which is
// gitignored. This test suite enforces local audit discipline against
// those documents. In the public release tree (e.g. fresh clone of the
// open-source repo), docs/internal/ does not exist and these checks are
// not applicable — skip the entire suite in that case so public CI
// stays green while local audit work retains the full gate.
const hasInternalDocs = existsSync("docs/internal");

const requiredDocs = [
  {
    path: "AGENTS.md",
    markers: [
      "Fin-Dashboard Agent Instructions",
      "Treat Beads as mandatory",
      "Stribog Charter",
      "Git is local-only"
    ]
  },
  {
    path: "docs/internal/CHARTER-COMPLIANCE-ANNEX.md",
    markers: [
      "Universal Stribog Engineering Charter | Applies (binds every Stribog project) | 1.3.0",
      "Stribog User Documentation Standard",
      "Stribog Developer Documentation Standard",
      "Stribog UI/UX Standard",
      "Single-file distributable artifacts",
      "Browser-storage inventory",
      "Token drift-gate command",
      "Doc-to-release sync gate command",
      "Universal Stribog Engineering Charter",
      "Stribog AI Agent Execution Standard",
      "AI attribution convention",
      "Coverage floor",
      "Charter Governance §3.6",
      "included set",
      "excluded set",
      "test-charter-docs",
      "Data and Privacy Standard §3.2"
    ]
  },
  {
    path: "docs/internal/MASTER-REFERENCE.md",
    markers: [
      "Source of truth",
      "System Architecture",
      "Retirement planning model",
      "Data Classification and Lifecycle",
      "Generated Artifact Boundary"
    ]
  },
  {
    path: "docs/internal/TESTING-STRATEGY.md",
    markers: [
      "Coverage floor",
      "End-to-end",
      "Visual regression",
      "Automated accessibility",
      "Artifact integrity",
      "UI performance budget"
    ]
  },
  {
    path: "docs/internal/BUILD-PLAN.md",
    markers: [
      "Phase 1",
      "Quality Gates",
      "Charter Compliance",
      "Charter v1.2 Compliance Migration"
    ]
  },
  {
    path: "docs/internal/WAIVERS.md",
    markers: [
      "W-0001",
      "Browser localStorage for Restricted local financial assumptions",
      "Data and Privacy Standard §3.2 Storage",
      "Compensating Controls",
      "Waiver Register"
    ]
  },
  {
    path: "docs/internal/PUBLIC-RELEASE-READINESS.md",
    markers: [
      "Charter Governance public release profile",
      "Included set",
      "Excluded set",
      "No public-release or release-ready claim"
    ]
  },
  {
    path: "docs/developer/adr/ADR-0001-domain-ui-boundary.md",
    markers: [
      "accepted",
      "domain model",
      "UI shell"
    ]
  },
  {
    path: "docs/internal/CHARTER-NOTES.md",
    markers: [
      "Charter Notes",
      "No charter documents were modified",
      "2026-05-12 public GitHub charter migration"
    ]
  },
  {
    path: "README.md",
    markers: [
      "Retirement Corpus & Income Planner",
      "AY 2026-27",
      "PRIVACY.md"
    ],
    publicRelease: true
  },
  {
    path: "CONTRIBUTING.md",
    markers: [
      "Co-authored-by: Claude <noreply@anthropic.com>",
      "scripts/precommit-trailer-check.mjs",
      "test:smoke"
    ],
    publicRelease: true
  },
  {
    path: "SECURITY.md",
    markers: [
      "Responsible Disclosure",
      "GitHub Security Advisories",
      "PRIVACY.md"
    ],
    publicRelease: true
  },
  {
    path: "CHANGELOG.md",
    markers: [
      "Unreleased",
      "[1.0.0]",
      "keepachangelog"
    ],
    publicRelease: true
  },
  {
    path: "docs/user/quickstart.md",
    markers: [
      "First-run tour",
      "Export the evidence",
      "assets/overview-cockpit.jpg",
      "assets/guided-planner.jpg",
      "assets/mobile-overview.jpg"
    ]
  },
  {
    path: "docs/user/assets/manifest.json",
    markers: [
      "productVersion",
      "artifactSha256",
      "mobile-overview.jpg"
    ]
  },
  {
    path: "docs/user/how-to/tune-retirement-plan.md",
    markers: [
      "Tune a retirement plan",
      "Assumption Studio",
      "../assets/assumption-studio.jpg"
    ]
  },
  {
    path: "docs/user/reference/assumptions.md",
    markers: [
      "Assumption reference",
      "Retiree tax profile"
    ]
  },
  {
    path: "docs/user/reference/screens-and-outputs.md",
    markers: [
      "Screens and Outputs Reference",
      "../assets/mobile-topbar-actions.jpg",
      "../assets/mobile-assumption-studio.jpg"
    ]
  },
  {
    path: "docs/user/reference/regional-accessibility.md",
    markers: [
      "Regional Accessibility Reference",
      "../assets/android-mobile-overview.jpg",
      "../assets/mobile-help-system.jpg"
    ]
  },
  {
    path: "docs/user/concepts/retirement-tax-and-withdrawal-model.md",
    markers: [
      "SWP",
      "IDCW",
      "Section 87A",
      "../assets/tax-studio.jpg",
      "../assets/simulations-risk.jpg"
    ]
  },
  {
    path: "docs/user/troubleshooting.md",
    markers: [
      "Blank page",
      "Numbers do not update",
      "assets/help-system.jpg",
      "assets/ledger-evidence.jpg"
    ]
  },
  {
    path: "docs/user/releases/2026-05-12-charter-compliance.md",
    markers: [
      "Local-First Planner Release Notes",
      "What changed for users"
    ]
  },
  {
    path: "docs/user/support.md",
    markers: [
      "Escalation",
      "Security or privacy issue"
    ]
  },
  {
    path: "docs/developer/ui/design-system.md",
    markers: [
      "Design Token Contract",
      "WCAG 2.2 AA",
      "Reduced motion"
    ]
  },
  {
    path: "docs/developer/ui/ia-contract.md",
    markers: [
      "Overview",
      "Guided Planner",
      "Route contract"
    ]
  },
  {
    path: "docs/developer/ui/in-product-string-catalog.md",
    markers: [
      "Guided product tour",
      "Tax Assumptions & Scenarios",
      "Local Data & Privacy"
    ]
  },
  {
    path: "docs/developer/ui/polish-checklist.md",
    markers: [
      "Visual polish",
      "Manual design QA",
      "Motion"
    ]
  },
  {
    path: "docs/developer/bootstrap.md",
    markers: [
      "Bootstrap",
      "make all"
    ]
  },
  {
    path: "docs/developer/architecture.md",
    markers: [
      "Domain model",
      "React shell"
    ]
  },
  {
    path: "docs/developer/public-surface.md",
    markers: [
      "Public Surface Map",
      "Generated HTML artifacts"
    ]
  },
  {
    path: "docs/developer/deprecation.md",
    markers: [
      "Deprecation Register",
      "No active deprecations",
      "canonical developer documentation surface"
    ]
  },
  {
    path: "docs/developer/deprecations.md",
    markers: [
      "Deprecation Register",
      "No active deprecations",
      "compatibility alias"
    ]
  },
  {
    path: "docs/developer/adr/README.md",
    markers: [
      "ADR Index",
      "ADR-0001"
    ]
  },
  {
    path: "docs/internal/release/artifact-integrity.json",
    markers: [
      "index.html",
      "sha256",
      "sizeBudgetBytes"
    ]
  },
  {
    path: "docs/internal/audits/2026-05-11-charter-refactor-closeout.md",
    markers: [
      "Audit Closeout",
      "make all",
      "96.26%"
    ]
  },
  {
    path: "docs/internal/audits/2026-05-12-charter-v1.2-compliance-audit.md",
    markers: [
      "Charter v1.2 Compliance Audit Closeout",
      "Stribog UI/UX Standard",
      "make all"
    ]
  },
  {
    path: "docs/internal/audits/2026-05-12-codebase-and-charter-audit.md",
    markers: [
      "Codebase and Charter Compliance Audit",
      "Codebase Audit Pass",
      "Charter Compliance Audit Pass",
      "fin-9fp"
    ]
  }
];

function functionLineCount(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      opened = true;
    } else if (char === "}") {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1).split("\n").length;
    }
  }
  return null;
}

describe.skipIf(!hasInternalDocs)("Stribog Charter control-plane documents", () => {
  it.each(requiredDocs)("keeps $path filed with required markers", async ({ path, markers, publicRelease }) => {
    const content = await readFile(path, "utf8");
    // Public-release-facing docs (post R4.4/R4.5 rewrite) do not carry the
    // internal `last_updated` frontmatter field; internal control-plane docs
    // still do. Scope the frontmatter assertion accordingly.
    if (!publicRelease) {
      expect(content).toMatch(/last_updated"?\s*:\s*"?2026-05-\d{2}/);
    }
    for (const marker of markers) {
      expect(content).toContain(marker);
    }
  });

  it("keeps package scripts aligned with the Charter v1.2 gate surface", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    for (const scriptName of [
      "artifact:check",
      "artifact:write",
      "doc:gate",
      "docs:screenshots",
      "test:a11y",
      "test:charter-docs",
      "ui:contrast",
      "ui:perf",
      "ui:tokens"
    ]) {
      expect(packageJson.scripts?.[scriptName]).toBeTruthy();
    }
    expect(packageJson.scripts?.all).toContain("npm run test:charter-docs");
  });

  it("keeps Makefile all-up aligned with package doc controls", async () => {
    const makefile = await readFile("Makefile", "utf8");
    expect(makefile).toMatch(/^test-charter-docs:/m);
    expect(makefile).toContain("npm run test:charter-docs");
    expect(makefile.match(/^all: .+$/m)?.[0]).toContain("test-charter-docs");
  });

  it("keeps the docs root partitioned into internal, user, and developer only", async () => {
    const entries = await readdir("docs", { withFileTypes: true });
    expect(entries.map((entry) => entry.name).sort()).toEqual(["developer", "internal", "user"]);
    expect(entries.every((entry) => entry.isDirectory())).toBe(true);
  });

  it("keeps committed user screenshots available for visual docs", async () => {
    const manifest = JSON.parse(await readFile("docs/user/assets/manifest.json", "utf8"));
    for (const path of [
      "docs/user/assets/overview-cockpit.jpg",
      "docs/user/assets/guided-planner.jpg",
      "docs/user/assets/tax-studio.jpg",
      "docs/user/assets/simulations-risk.jpg",
      "docs/user/assets/ledger-evidence.jpg",
      "docs/user/assets/assumption-studio.jpg",
      "docs/user/assets/help-system.jpg",
      "docs/user/assets/mobile-overview.jpg",
      "docs/user/assets/mobile-topbar-actions.jpg",
      "docs/user/assets/mobile-topbar-more-menu.jpg",
      "docs/user/assets/mobile-guided-planner.jpg",
      "docs/user/assets/mobile-tax-studio.jpg",
      "docs/user/assets/mobile-simulations-risk.jpg",
      "docs/user/assets/mobile-ledger-evidence.jpg",
      "docs/user/assets/mobile-assumption-studio.jpg",
      "docs/user/assets/mobile-help-system.jpg",
      "docs/user/assets/android-mobile-overview.jpg",
      "docs/user/assets/android-mobile-guided-planner.jpg",
      "docs/user/assets/android-mobile-tax-studio.jpg",
      "docs/user/assets/android-mobile-simulations-risk.jpg",
      "docs/user/assets/android-mobile-ledger-evidence.jpg"
    ]) {
      expect((await stat(path)).size).toBeGreaterThan(10_000);
      const entry = manifest.screenshots.find((item) => item.path === path);
      expect(entry?.viewport).toBeTruthy();
      expect(entry?.sourcePage).toBeTruthy();
      expect(entry?.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("keeps user-facing documentation marked as published", async () => {
    const files = await readdir("docs/user", { recursive: true });
    const markdown = files.filter((file) => file.endsWith(".md"));
    for (const file of markdown) {
      const content = await readFile(`docs/user/${file}`, "utf8");
      expect(content).toContain("status: published");
    }
  });

  it("keeps the React App boundary split into hook, pages, shell, and thin provider", async () => {
    const source = await readFile("src/main.jsx", "utf8");
    expect(source).toContain("function useRetirementDashboard()");
    expect(source).toContain("function DashboardPages()");
    expect(source).toContain("function DashboardShell()");
    expect(functionLineCount(source, "App")).toBeLessThanOrEqual(20);
    expect(functionLineCount(source, "useRetirementDashboard")).toBeGreaterThan(20);
  });
});
