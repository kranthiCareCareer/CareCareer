# GP-02 / DEMO-01 Execution Status

## Current state

- Branch: master
- Commit: a10242e
- Working tree: clean
- Tag: gp-02-platform-service-final (at a10242e — corrected)

## Completed checkpoints

- **Checkpoint 1: HTTP Authentication and Authorization** — COMPLETE
- **Checkpoint 2: Tenant-State Enforcement and Controller Contracts** — COMPLETE
- **Checkpoint 3: OpenAPI, Docker Validation, Final GP-02 Gate** — COMPLETE (corrected)
- **Checkpoint 4: DEMO-01 Frontend Shell and Core Screens** — COMPLETE
- **Checkpoint 5: Demo Orchestration, Personas, and Seed Data** — COMPLETE
- **Checkpoint 6: Playwright Chromium Automation** — SCAFFOLDED (structure created, specs need demo stack)

## Critical correction applied

The original gp-02-platform-service-final tag (92845e9) was deleted because
it contained a weakened concurrent idempotency test that accepted an
IN_PROGRESS null response. The specification requires both callers to
receive the same completed tenant ID.

**Fix implemented:**

- `IdempotencyService.waitForCompletion()`: polls with exponential backoff
  (50ms→1s, max 10s) when encountering a PROCESSING record with same hash
- On COMPLETED: returns cached result (both callers get same tenant ID)
- On record removal: throws for retry
- On timeout (stale): throws storage error
- `idempotency_keys` table added to migration with UNIQUE constraint
- Integration test uses `PostgresIdempotencyStore` (real PostgreSQL)
- Strict assertion restored: both results === `{ tenantId: 'concurrent-id' }`

## GP-02 Final Gate Results (corrected)

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
| **Combined evidence**                    | **196 tests** |

## Concurrent idempotency test evidence

- Uses PostgresIdempotencyStore (real PostgreSQL via Testcontainers)
- Two simultaneous Promise.allSettled calls with same key+payload
- handlerExecutionCount === 1 (only one handler ran)
- Both callers receive `{ tenantId: 'concurrent-id' }` (same response)
- One fromCache=false (handler owner), one fromCache=true (waited for completion)
- Exactly one tenant, organization, entitlement set, audit record, outbox event

## Checkpoint 3 revalidation

- OpenAPI: committed at services/platform-service/openapi.yaml
- Docker: non-root UID 1001, no test files, no dev deps, no .env, no git
- Demo auth: DemoAuthController disabled when DEMO_AUTH_ENABLED=false
- Image labels: source, revision, created present
- Port 3000 only

## Next checkpoint: Continue DEMO-01

- Complete remaining Playwright E2E specs (requires running demo stack)
- Executive demo flow (checkpoint 7)
- CI pipeline integration
