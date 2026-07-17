# DEMO-01 Test Matrix

## Test Pyramid

| Layer           | Framework               | Count | Location                                       |
| --------------- | ----------------------- | ----- | ---------------------------------------------- |
| Unit (domain)   | Vitest                  | 117   | services/platform-service/src/\*_/_.spec.ts    |
| Unit (packages) | Vitest                  | 72    | packages/_/src/\*\*/_.spec.ts                  |
| Unit (frontend) | Vitest + RTL            | 103   | apps/platform-admin-console/src/\*_/_.spec.tsx |
| Integration     | Vitest + Testcontainers | 41    | \*\*/test:integration                          |
| E2E (browser)   | Playwright Chromium     | ~40   | apps/platform-admin-console/e2e/specs/         |

## Frontend Unit Tests (Vitest + React Testing Library)

| Component       | Tests | Coverage                                                                 |
| --------------- | ----- | ------------------------------------------------------------------------ |
| API Client      | 20    | Auth headers, correlation ID, idempotency key, error handling, endpoints |
| Auth Context    | 11    | Persona selection, token fetch, clear, error, personas list              |
| PersonaSelector | 10    | Render, buttons, loading, error, accessibility                           |
| Dashboard       | 6     | Heading, persona display, stats, navigation, switch                      |
| TenantList      | 9     | Search, filter, create link, empty state, breadcrumb                     |
| CreateTenant    | 11    | Form fields, submit, disable, success, error, idempotency                |
| Entitlements    | 10    | Loading, checkboxes, toggle, version conflict, core locked               |
| Organizations   | 10    | List, create, clear form, error, empty state, loading                    |
| Features        | 10    | Labels, keys, boolean/number inputs, update, error                       |
| AuditTimeline   | 6     | Heading, breadcrumb, description, empty state                            |

## Configuration Matrix Tests

| Scenario              | Tests | What It Proves                         |
| --------------------- | ----- | -------------------------------------- |
| Production            | 4     | OIDC required, demo prohibited         |
| Dev + DEMO_MODE=true  | 4     | Demo secret required, OIDC optional    |
| Dev + DEMO_MODE=false | 3     | Default behavior, no secret needed     |
| Test mode             | 4     | Both OIDC and demo configurations work |

## Playwright E2E Specs

| Spec File                      | Scenarios | What It Proves                                                      |
| ------------------------------ | --------- | ------------------------------------------------------------------- |
| authentication.spec.ts         | 6         | Persona selector, login flow, switch                                |
| demo-mode.spec.ts              | 4         | Demo badge, personas, disclaimer, no console errors                 |
| tenant-provisioning.spec.ts    | 5         | Form, real API, button disable, correlation ID, validation          |
| tenant-isolation.spec.ts       | 3         | Cross-tenant blocked, persona switch clears cache                   |
| organizations-branches.spec.ts | 4         | Page structure, create form, breadcrumb, empty state                |
| entitlements-features.spec.ts  | 6         | Both pages load, core locked, feature keys, breadcrumbs             |
| lifecycle.spec.ts              | 3         | Status badge, lifecycle actions, deactivated terminal               |
| audit.spec.ts                  | 5         | Heading, description, redaction, empty state, breadcrumb            |
| validation-errors.spec.ts      | 5         | Required fields, pattern, minlength, error banner, no raw DB errors |
| executive-demo.spec.ts         | 1 (long)  | Full flow with screenshots                                          |

## Integration Tests (Testcontainers)

| Suite                        | Tests | What It Proves                                         |
| ---------------------------- | ----- | ------------------------------------------------------ |
| Platform-service integration | 33    | Real PostgreSQL, RLS, transactions, audit, idempotency |
| Shared testing integration   | 8     | Database helpers, factories, container management      |

## Security Tests

| Category                           | Coverage                |
| ---------------------------------- | ----------------------- |
| Missing auth → 401                 | HTTP contract tests     |
| Invalid JWT → 401                  | Auth guard unit tests   |
| Missing permission → 403           | HTTP contract tests     |
| Cross-tenant → 404                 | RLS integration tests   |
| TENANT_SUSPENDED → rejected        | Status guard tests      |
| TENANT_DEACTIVATED → rejected      | Status guard tests      |
| Audit append-only                  | Grant restriction tests |
| Demo mode in production → rejected | Config matrix tests     |
| Idempotency conflict → 409         | Integration tests       |
| Version conflict → 409             | Integration tests       |

## Running Tests

```bash
# All unit tests
pnpm test

# Frontend tests only
pnpm --filter @carecareer/platform-admin-console test

# Platform service integration
pnpm --filter @carecareer/platform-service test:integration

# Chromium E2E
pnpm demo:e2e

# Full verification
pnpm demo:verify
```
