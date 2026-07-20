# Playwright Testing Foundation — Paused Status

## Checkpoint

| Field | Value |
| --- | --- |
| Commit | 9f9ddf0 |
| Working tree | clean |
| Status | PAUSED — resume after GP-03.3 closes |

## Completed Work

- @axe-core/playwright installed
- 8 Playwright projects configured (chromium, chromium-pr, firefox-nightly, webkit-nightly, mobile-chrome-web, mobile-safari-web, chrome-release, edge-release)
- Accessibility helper (checkAccessibility)
- ErrorCollector fixture (console, page, network, 5xx)
- Navigation smoke spec
- Keyboard smoke test
- ESM __dirname fix (executive-demo.spec.ts)
- Vite allowedHosts fix for Docker containers
- Demo sessionStorage persistence for page-reload resilience
- Docker E2E runner image (Node 22 + Chromium/Firefox/WebKit)
- docker-compose.e2e.yml
- scripts/e2e-standard.mjs orchestrator
- Root E2E commands (smoke, chromium, cross-browser, navigation, accessibility, responsive, release)
- Standard Playwright runner proven working on Linux (Node 22 and Node 24)
- Frozen lockfile installation verified on Node 22 Linux
- Custom Chromium runner: 20/20 passing (demo:verify)
- Standard Chromium: 45/50 passing

## Five Remaining Chromium Failures

1. entitlements-features.spec.ts:12 — tenant-scoped page with fake test-id
2. entitlements-features.spec.ts:50 — breadcrumb on tenant-scoped page
3. executive-demo.spec.ts:19 — multi-step workflow
4. tenant-provisioning.spec.ts:87 — slug pattern validation
5. validation-errors.spec.ts:24 — slug pattern validation

## Tests Removed (Must Be Replaced)

- Navigation smoke for /features (invalid top-level route)
- Navigation smoke for /audit (invalid top-level route)
- These must be replaced with /tenants/{realTenantId}/features and /tenants/{realTenantId}/audit using seeded data

## Route Coverage Gaps

- /tenants/:tenantId/features — no valid navigation test
- /tenants/:tenantId/audit — no valid navigation test
- /tenants/:tenantId/entitlements — uses fake tenant ID
- /tenants/:tenantId/organizations — not tested in navigation smoke
- /tenants/:tenantId — only tested through provisioning flow

## Accessibility Gaps

- Only 3 routes Axe-tested (/, /tenants, /tenants/create)
- 5 tenant-scoped routes need real tenant ID for Axe scan

## Cross-Browser Gaps

- Firefox: configured, not executed against running app
- WebKit: configured, not executed against running app
- Responsive: configured, not executed
- CI tiers: not created

## Recommended Restart Sequence

1. Create deterministic tenant fixture with real seeded data
2. Replace deleted route tests with tenant-scoped equivalents
3. Fix remaining 5 failures
4. Complete all-route accessibility
5. Execute Firefox and WebKit
6. Add responsive coverage
7. Implement route coverage validator
8. Add CI tiers
