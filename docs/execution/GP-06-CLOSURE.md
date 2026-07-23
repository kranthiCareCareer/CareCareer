# GP-06 — Worker Minimum Profile

## Status: COMPLETE

## Backend Status: Partial

## Commits

| Commit  | Description                                               |
| ------- | --------------------------------------------------------- |
| 8d7c45e | Worker domain, repository, HTTP API                       |
| 20579b5 | Worker HTTP integration tests (RLS, lifecycle, isolation) |

## Acceptance Evidence

### Worker created with mandatory fields

- Zod schema enforces: firstName, lastName, email (valid format), profession
- Integration test: valid creation returns 201 with UUID
- Integration test: missing fields returns 400

### Worker can update own profile (version check)

- PATCH /v1/workers/:id with expectedVersion
- Optimistic concurrency: 409 CONFLICT on version mismatch
- Integration test proves update increments version

### Worker A cannot read Worker B's profile

- RLS policy: `USING (tenant_id = current_setting('app.tenant_id', true)::UUID)`
- Integration test: cross-tenant GET returns 404
- Integration test: cross-tenant list does not include other tenant's workers

### External references stored correctly

- POST /v1/workers with `externalReferences` array
- Persisted atomically in same transaction as worker creation
- Supports: symplr, auth0, bullhorn (any system_name)

### Status transitions are validated

- State machine with 9 states:
  APPLICANT → SCREENING → QUALIFIED → CREDENTIALING → READY → ACTIVE → INACTIVE/BLOCKED → ALUMNI
- Invalid transitions return 400 INVALID_TRANSITION
- Integration test: APPLICANT → ACTIVE (skip steps) rejected
- Integration test: Full lifecycle traversal proven (APPLICANT→...→ACTIVE→BLOCKED)
- Unit tests cover all valid and invalid transitions

### PII fields never appear in logs

- Audit records store only: profession, status, version
- Worker firstName, lastName, email, phone are NEVER in audit afterSummary
- Controller explicitly excludes PII from audit payloads

## API Endpoints

| Method | Path                   | Purpose                 |
| ------ | ---------------------- | ----------------------- |
| POST   | /v1/workers            | Create worker           |
| GET    | /v1/workers/:id        | Get worker by ID        |
| GET    | /v1/workers?status=X   | List/filter workers     |
| PATCH  | /v1/workers/:id        | Update profile          |
| POST   | /v1/workers/:id/status | Change lifecycle status |

## Events Published

- `worker.created` — audit record (not outbox yet — outbox deferred to shift integration)

## Cross-Service Contract Tests

A dedicated contract test (`cross-service-contract.spec.ts`) proves the full service-to-service authentication chain:

| Contract Stage            | Tests | Fail-Closed Proven                                           |
| ------------------------- | ----- | ------------------------------------------------------------ |
| Token Exchange            | 7     | Network error, timeout, 401, 500, malformed response         |
| Identity State Validation | 8     | Network error, timeout, 401, 500, malformed, revoked         |
| Authorization Decision    | 10    | Network error, timeout, 401, 500, malformed, unknown value   |
| Full Chain (end-to-end)   | 3     | Happy path, token failure cascades, state rejection cascades |

Total: 30 contract tests proving deny-by-default at every stage of the inter-service auth flow.

## Test Summary

| Layer                     | Count                           |
| ------------------------- | ------------------------------- |
| Unit (worker domain)      | 18                              |
| Integration (worker HTTP) | 12                              |
| Cross-service contract    | 30                              |
| Total staffing-service    | 159 unit + 86 integration = 245 |
| Coverage (combined)       | 93.7% stmts, 86% br, 97% funcs  |
| Determinism               | 159/159 × 3 consecutive runs    |

## Schema

- `staffing.workers` — RLS enabled/forced, email unique per tenant
- `staffing.external_references` — RLS enabled/forced, unique per worker+system
