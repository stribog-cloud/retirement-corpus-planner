# Security Policy

## Scope

**In scope:** application code in this repository — `src/`, `scripts/`, `tests/`, build tooling, and generated artifacts produced by `make build`.

**Out of scope:** downstream deployments where users run the generated HTML on their own systems. The application is 100% client-side with no server component; operator-level OS/browser security is the user's responsibility.

## Privacy by Design

This application has no telemetry, no backend, and no network calls at runtime. All computation and data storage is local to the user's browser. See [PRIVACY.md](PRIVACY.md) for the full privacy posture.

## Responsible Disclosure

If you find a security vulnerability, **do not file a public GitHub issue** with the details.

Use one of these private channels:

1. **GitHub Security Advisories** (preferred for public repo): use the private vulnerability reporting workflow at
   `https://github.com/stribog-cloud/retirement-corpus-planner/security/advisories/new`
   GitHub's guidance: https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities

2. **GitHub Issue with `[SECURITY]` label**: if GitHub Security Advisories are not available for this repository, file a GitHub Issue with the `[SECURITY]` label. Include enough information to reproduce the issue but **omit any real financial data**.

## Timeline

This is an unmonetized open-source project maintained by a single owner. There is no SLA. The owner will make a best-effort response and will credit the reporter in the fix commit unless the reporter requests anonymity.

## No Bug Bounty

This project does not offer a bug bounty programme.

## What to Include in a Report

- Description of the vulnerability and its potential impact.
- Steps to reproduce (without real financial data).
- Browser and OS version.
- Whether the vulnerability is in the local app, the build pipeline, or generated artifact integrity.

## Revision History

| Version | Date       | Change                                     |
|---------|------------|--------------------------------------------|
| 1.0.0   | 2026-05-25 | Initial public security policy for v1.0.0. |
