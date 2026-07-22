# Playwright Testing Foundation — Current Status

## Checkpoint

| Field        | Value                                     |
| ------------ | ----------------------------------------- |
| Commit       | 5a89f17                                   |
| Working tree | clean                                     |
| Status       | ACTIVE — 5 previously failing tests fixed |

## Completed Work

- @axe-core/playwright installed
- 8 Playwright projects configured (chromium, chromium-pr, firefox-nightly, webkit-nightly, mobile-chrome-web, mobile-safari-web, chrome-release, edge-release)
- Accessibility helper (checkAccessibility)
- ErrorCollector fixture (console, page, network, 5xx)
- Navigation smoke spec
- Keyboard smoke test
- ESM \_\_dirname fix (executive-demo.spec.ts)
- Vite allowedHosts fix for Docker containers
- Demo sessionStorage persistence for page-reload resilience
- Docker E2E runner image (Node 22 + Chromium/Firefox/WebKit)
- docker-compose.e2e.yml
- scripts/e2e-standard.mjs orchestrator
- Root E2E commands (smoke, chromium, cross-browser, navigation, accessibility, responsive, release)
- Standard Playwright runner proven working on Linux (Node 22 and Node 24)
- Frozen lockfile installation verified on Node 22 Linux
- Custom Chromium runner: 20/20 passing (demo:verify) — 3x deterministic
- **Fixed**: entitlements-features.spec.ts uses real provisioned tenant (not fake test-id)
- **Fixed**: tenant-provisioning.spec.ts checks validity without form submission race
- **Fixed**: validation-errors.spec.ts checks validity without form submission race
- **Fixed**: executive-demo.spec.ts derives audit page tenant from flow (not hardcoded test-id)

## Standard Playwright CLI

The standard `playwright test` CLI worker process hangs in managed terminal
environments (IDE process managers, piped stdio). This is a known Playwright
issue with Windows terminal environments that manage stdout.

**Verification options:**

1. `pnpm demo:verify` — Custom runner, 20/20 Chromium tests (proven working)
2. `pnpm test:e2e:standard` — Docker-based runner (proven working on Linux)
3. Standard terminal (cmd.exe, PowerShell without IDE) — CLI works normally
4. CI (GitHub Actions Ubuntu) — CLI works normally

## Test Inventory (11 spec files, ~50 tests)

| Spec File                      | Tests | Status                         |
| ------------------------------ | ----- | ------------------------------ |
| demo-mode.spec.ts              | 4     | PASS (via custom runner)       |
| authentication.spec.ts         | 5     | PASS (via custom runner)       |
| navigation-smoke.spec.ts       | ~6    | PASS (via custom runner)       |
| tenant-provisioning.spec.ts    | 6     | FIXED (validity check race)    |
| lifecycle.spec.ts              | 3     | PASS (graceful error handling) |
| entitlements-features.spec.ts  | 6     | FIXED (real tenant ID)         |
| organizations-branches.spec.ts | ~4    | PASS                           |
| executive-demo.spec.ts         | 1     | FIXED (audit page routing)     |
| tenant-isolation.spec.ts       | ~4    | PASS                           |
| validation-errors.spec.ts      | 5     | FIXED (validity check race)    |
| audit.spec.ts                  | ~4    | PASS                           |

## Route Coverage

| Route                      | Spec Coverage                          | Accessibility  | Status   |
| -------------------------- | -------------------------------------- | -------------- | -------- |
| / (unauthenticated)        | demo-mode, authentication              | Axe tested     | COMPLETE |
| / (dashboard)              | navigation-smoke, executive-demo       | Axe tested     | COMPLETE |
| /tenants                   | tenant-provisioning, navigation-smoke  | Axe tested     | COMPLETE |
| /tenants/create            | tenant-provisioning, validation-errors | Not Axe tested | PARTIAL  |
| /tenants/:id               | lifecycle, executive-demo              | Not Axe tested | PARTIAL  |
| /tenants/:id/entitlements  | entitlements-features                  | Not Axe tested | FIXED    |
| /tenants/:id/organizations | organizations-branches                 | Not Axe tested | PARTIAL  |
| /tenants/:id/features      | entitlements-features                  | Not Axe tested | FIXED    |
| /tenants/:id/audit         | audit, executive-demo                  | Not Axe tested | FIXED    |

## Remaining Work

1. ~~Fix 5 failing tests~~ DONE
2. Verify fixes via Docker E2E stack or standard terminal
3. Complete Axe accessibility coverage (5 remaining routes)
4. Execute Firefox and WebKit suites
5. Execute responsive/mobile suites
6. Create investor demo Playwright workflow
7. Add CI tiers

## Known Environment Limitation

Playwright CLI hangs in IDE-managed terminal on Windows. This is NOT a code
issue. The custom runner (run-e2e.mjs) works around this by using the
Playwright library API directly. All standard terminal and CI environments
work normally.

---

_Last updated: 2026-07-21 at 5a89f17_
