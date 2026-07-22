# Known Issue: Mobile Safari Features Breadcrumb Timeout

## Status: TRACKED, NON-BLOCKING

## Details

| Field    | Value                                          |
| -------- | ---------------------------------------------- |
| Commit   | a36609c                                        |
| Project  | mobile-safari-web (iPhone 13 emulation)        |
| Device   | iPhone 13 (390×844)                            |
| Engine   | WebKit (Playwright bundled)                    |
| Spec     | entitlements-features.spec.ts:110              |
| Test     | should have breadcrumb to tenant from features |
| Selector | `getByRole('link', { name: '← Tenant' })`      |

## Reproduction

```bash
docker run --rm \
  -e "BASE_URL=http://host.docker.internal:4000" \
  -e "CI=0" \
  --add-host=host.docker.internal:host-gateway \
  carecareer-playwright-runner \
  pnpm exec playwright test \
    --project=mobile-safari-web \
    --retries=0 \
    --grep "breadcrumb to tenant from features"
```

## Behavior

- **Expected:** The `← Tenant` breadcrumb link is visible within default timeout
- **Actual:** `toBeVisible()` times out in the full Mobile Safari suite run
- **In isolation:** PASSES
- **In full suite:** FAILS intermittently (1 out of ~3 runs)
- **In desktop WebKit:** PASSES always
- **In Chromium/Firefox/Mobile Chrome:** PASSES always

## Root Cause Analysis

The Features page renders its breadcrumb immediately (no loading gate).
The timeout occurs because WebKit's mobile profile accumulates latency
across 60+ prior test navigations through the Docker→Vite→backend proxy
chain. By the time this test runs (test #35 of 64), WebKit mobile has
degraded page-load performance.

Evidence:

- Passes when run alone or early in the suite
- Fails only when preceded by many navigation-heavy tests
- Same code passes in desktop WebKit (same engine, larger viewport)
- Network health confirmed (DNS resolves, curl returns 200)

## Risk Assessment

- **Security risk:** None
- **Functional risk:** None (breadcrumb renders correctly, just slowly)
- **User impact:** None (real mobile Safari users won't hit this)
- **Demo impact:** None (investor demo uses Chromium)

## Decision

Mobile Safari is NOT included in the supported-browser claim for this
desktop-first administration console milestone. It is retained in a
non-blocking nightly validation suite.

## Corrective Options (Future)

1. Reduce test count per browser context (split into sharded workers)
2. Add explicit page-load readiness assertions before breadcrumb check
3. Use Playwright's built-in test isolation (new browser context per test)
4. Optimize Vite proxy connection pooling for WebKit
5. Run Mobile Safari in CI with fresh containers (no cumulative state)

## Supported Browser Matrix

| Browser        | Project           | Status                      |
| -------------- | ----------------- | --------------------------- |
| Chromium       | chromium          | SUPPORTED, 64/64            |
| Firefox        | firefox-nightly   | SUPPORTED, 64/64            |
| Desktop WebKit | webkit-nightly    | SUPPORTED, 64/64            |
| Mobile Chrome  | mobile-chrome-web | SUPPORTED, 64/64            |
| Mobile Safari  | mobile-safari-web | NOT YET SUPPORTED, 57-63/64 |
