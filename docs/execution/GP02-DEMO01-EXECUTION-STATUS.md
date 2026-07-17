# GP-02 / DEMO-01 Execution Status

## Current state

- Branch: master
- Commit: 4697df9
- Working tree: clean
- Tag: gp-02-platform-service-final (at 4697df9)

## GP-02 Final Gate — VERIFIED

| Suite                                    | Result        |
| ---------------------------------------- | ------------- |
| pnpm lint                                | 23/23 tasks   |
| pnpm format:check                        | pass          |
| pnpm typecheck                           | 23/23 tasks   |
| pnpm test (unit)                         | 117 passing   |
| @carecareer/testing integration          | 8 passing     |
| @carecareer/platform-service integration | 34 passing    |
| pnpm build                               | 14/14 tasks   |
| Docker verification                      | 15/15 checks  |
| **Combined evidence**                    | **173 tests** |

## Idempotency NULL-safety verification

- `idempotency_keys.tenant_id` is `VARCHAR(200) NOT NULL`
- Platform provisioning uses `tenantId: 'platform'` (non-null scope)
- UNIQUE(tenant_id, operation, idempotency_key) is safe — no NULL values possible
- PostgreSQL concurrent test proves atomic claim with wait/poll behavior
- Both callers receive same tenant ID (strict assertion)

## Completed checkpoints

- **Checkpoint 1: HTTP Authentication and Authorization** — COMPLETE
- **Checkpoint 2: Tenant-State Enforcement and Controller Contracts** — COMPLETE
- **Checkpoint 3: OpenAPI, Docker, Final GP-02 Gate** — COMPLETE (tag applied)
- **Checkpoint 4: DEMO-01 Frontend Shell** — COMPLETE (scaffolded, needs API integration)
- **Checkpoint 5: Demo Orchestration** — COMPLETE (PostgreSQL starts, migrations applied)

## DEMO-01 current state

### Working (verified end-to-end against real PostgreSQL)

- PostgreSQL starts via Docker Compose (demo:up)
- Migrations applied (all tables including idempotency_keys)
- Roles and grants applied (app_service with RLS, audit immutability)
- Platform-service starts on port 3001 (tsx --env-file=.env)
- GET /health/live → 200 ✓
- POST /demo/token → 200 (signed JWT) ✓
- POST /v1/tenants → 201 (real tenant in PostgreSQL) ✓
- CORS enabled for admin console on port 4000
- Admin console builds (Vite + React + TypeScript strict)
- Typed API client covers all platform-service endpoints
- Persona selector, Dashboard, Tenant List, Create Tenant pages
- Playwright config and page objects scaffolded

### Next steps for DEMO-01 completion

1. Wire admin console Vite proxy to port 3001
2. Verify persona selection end-to-end via browser
3. Complete remaining pages (tenant detail, entitlements, features, lifecycle, audit)
4. Install Playwright Chromium browsers
5. Implement full E2E spec suite
6. Executive demo spec with screenshots
7. CI workflow (demo-e2e.yml)
8. Documentation (README, walkthrough, architecture, test matrix, troubleshooting)
9. CI pipeline
10. Documentation
