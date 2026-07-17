# GP-02 / DEMO-01 Execution Status

## Current state

- Branch: master
- Working tree: clean
- Tag: gp-02-platform-service-final (at 927f613)

## GP-02 — COMPLETE AND SECURED

Security corrections applied and verified:

1. DEMO_MODE=true required (not just NODE_ENV)
2. @Public() Reflector guard (no URL path bypasses)
3. demo:up auto-generates .env, demo:down removes volumes
4. Configuration matrix enforced:
   - Production: OIDC_ISSUER + OIDC_AUDIENCE required, DEMO_MODE prohibited
   - Development + DEMO_MODE=true: DEMO_AUTH_SECRET (32+ chars) required
   - Development + no DEMO_MODE: demo auth unavailable
   - Test: explicit configuration required for demo mode

## DEMO-01 Frontend — ALL SCREENS IMPLEMENTED

| Screen                | Status   | Route                      |
| --------------------- | -------- | -------------------------- |
| Persona selector      | Complete | / (when unauthenticated)   |
| Dashboard             | Complete | /                          |
| Tenant list           | Complete | /tenants                   |
| Create tenant         | Complete | /tenants/create            |
| Tenant overview       | Complete | /tenants/:id               |
| Organizations         | Complete | /tenants/:id/organizations |
| Entitlements          | Complete | /tenants/:id/entitlements  |
| Feature configuration | Complete | /tenants/:id/features      |
| Audit timeline        | Complete | /tenants/:id/audit         |

## DEMO-01 Frontend Unit Tests — COMPLETE

| File                           | Tests   | Status       |
| ------------------------------ | ------- | ------------ |
| api/client.spec.ts             | 20      | Pass         |
| lib/auth-context.spec.tsx      | 11      | Pass         |
| pages/PersonaSelector.spec.tsx | 10      | Pass         |
| pages/Dashboard.spec.tsx       | 6       | Pass         |
| pages/TenantList.spec.tsx      | 9       | Pass         |
| pages/CreateTenant.spec.tsx    | 11      | Pass         |
| pages/Entitlements.spec.tsx    | 10      | Pass         |
| pages/Organizations.spec.tsx   | 10      | Pass         |
| pages/Features.spec.tsx        | 10      | Pass         |
| pages/AuditTimeline.spec.tsx   | 6       | Pass         |
| **Total**                      | **103** | **All pass** |

## Configuration Matrix Tests — COMPLETE

| Scenario                                    | Tests  | Status       |
| ------------------------------------------- | ------ | ------------ |
| Production (OIDC required, demo prohibited) | 4      | Pass         |
| Development + DEMO_MODE=true                | 4      | Pass         |
| Development + DEMO_MODE missing/false       | 3      | Pass         |
| Test mode                                   | 4      | Pass         |
| Base config validation                      | 8      | Pass         |
| **Total**                                   | **23** | **All pass** |

## Playwright Chromium E2E — COMPLETE (structured)

| Spec                           | Scenarios         |
| ------------------------------ | ----------------- |
| authentication.spec.ts         | 6                 |
| demo-mode.spec.ts              | 4                 |
| tenant-provisioning.spec.ts    | 5                 |
| tenant-isolation.spec.ts       | 3                 |
| organizations-branches.spec.ts | 4                 |
| entitlements-features.spec.ts  | 6                 |
| lifecycle.spec.ts              | 3                 |
| audit.spec.ts                  | 5                 |
| validation-errors.spec.ts      | 5                 |
| executive-demo.spec.ts         | 1 (comprehensive) |
| **Total**                      | **~42 scenarios** |

Chromium installed: build v1169 (136.0.7103.25)

## CI Workflow — COMPLETE

File: `.github/workflows/demo-e2e.yml`

- Checks out, installs Node 20, pnpm, dependencies
- Installs Playwright Chromium with system deps
- Starts PostgreSQL service
- Applies migrations, roles, seed data
- Builds packages, starts backend and frontend
- Runs Chromium tests
- Uploads HTML report + artifacts
- Checks for .only and working tree modifications

## Documentation — COMPLETE

| Document                   | Content                                    |
| -------------------------- | ------------------------------------------ |
| DEMO-01-README.md          | What's built, how to start/reset/run       |
| DEMO-01-WALKTHROUGH.md     | 10-minute executive demo guide             |
| DEMO-01-ARCHITECTURE.md    | System diagram, security layers, flows     |
| DEMO-01-TEST-MATRIX.md     | Complete test coverage matrix              |
| DEMO-01-TROUBLESHOOTING.md | Docker, ports, migrations, Chromium issues |

## Demo Orchestration — COMPLETE

| Command              | Function                                          |
| -------------------- | ------------------------------------------------- |
| pnpm demo:up         | Start PostgreSQL, apply migrations, generate .env |
| pnpm demo:down       | Stop containers, remove volumes                   |
| pnpm demo:reset      | Reset to clean demo state                         |
| pnpm demo:e2e        | Run headless Chromium tests                       |
| pnpm demo:e2e:headed | Run visible Chromium tests                        |
| pnpm demo:e2e:ui     | Playwright UI mode                                |
| pnpm demo:e2e:debug  | Playwright Inspector                              |
| pnpm demo:e2e:report | Open HTML report                                  |
| pnpm demo:e2e:record | Playwright codegen                                |
| pnpm demo:verify     | Full verification pipeline                        |

## Quality gates (latest run)

| Suite             | Result                            |
| ----------------- | --------------------------------- |
| pnpm lint         | 23/23 pass (verified per-package) |
| pnpm format:check | pass                              |
| pnpm typecheck    | 23/23 pass                        |
| pnpm test         | 23/23 tasks (all tests pass)      |
| pnpm build        | 14/14 pass                        |

## Test Evidence

| Suite                      | Count   |
| -------------------------- | ------- |
| Platform-service unit      | 117     |
| Config package             | 23      |
| Auth package               | 17      |
| Observability              | 28      |
| Idempotency                | 19      |
| Request-context            | 14      |
| Database                   | 11      |
| Events                     | 10      |
| Engineering smoke          | 10      |
| Frontend (admin console)   | 103     |
| **Combined unit evidence** | **352** |

## Known limitations

1. Playwright E2E requires running demo stack (backend + frontend) for full-flow tests
2. Integration tests require Docker (Testcontainers)
3. Executive demo screenshots require headed mode with display
4. The `act(...)` warning in React 19 jsdom tests is cosmetic (does not affect results)

## Recommended next milestone

GP-03: Identity Service (OIDC integration, production auth, user management)
