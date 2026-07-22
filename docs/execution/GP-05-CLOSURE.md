# GP-05 — Facility and Department Management

## Status: IN PROGRESS

## Backend Status: Substantially Implemented

## Final Commits

| Commit  | Description                                                            |
| ------- | ---------------------------------------------------------------------- |
| dee0a1c | Initial staffing service scaffold, domain models, migration, RLS tests |
| 502a36d | Facility HTTP integration tests with audit/outbox emission             |
| 3f77b0b | Credential requirements endpoint with role+department query            |

## Acceptance Evidence

### Facility timezone is mandatory (reject if missing)

- Domain: `createFacility()` throws on empty/whitespace timezone
- HTTP: 400 INVALID_REQUEST when `timezone` field is missing
- Database: `CHECK (timezone <> '')` constraint at DB level
- Unit test: `should reject empty timezone`, `should reject whitespace-only timezone`
- Integration test: `should reject facility creation without timezone`

### Geofence config is stored with version (changes audited)

- Schema: `geofence_version INTEGER NOT NULL DEFAULT 1` in facilities table
- Domain: `geofenceVersion: 1` on creation, incremented on update
- Repository: `updateFacility` includes geofence_version in UPDATE
- Audit: facility creation emits afterSummary with geofence data

### Requirement changes affect future evaluations only

- Schema: `effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW()` in credential_requirements
- Repository: `WHERE effective_from <= NOW()` filter in all queries
- API: optional `effectiveFrom` parameter (ISO 8601 datetime)
- Domain: defaults to current time if not specified

### Client users see only their authorized facilities

- RLS: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on all tables
- Policy: `USING (tenant_id = current_setting('app.tenant_id', true)::UUID)`
- Integration test: `should prevent Tenant B from listing Tenant A facilities`
- Integration test: `should return 404 when facility belongs to another tenant`
- Integration test: Cross-tenant isolation at HTTP level (dedicated describe block)

### Facility creation emits versioned event

- Outbox: `carecareer.facility.created.v1` written atomically with facility INSERT
- Integration test: Verifies outbox row with event_type, payload, correlation_id, status=PENDING
- Event version: `event_version INTEGER NOT NULL DEFAULT 1` in outbox table

### Credential requirements queryable by role + department

- Endpoint: `GET /v1/facilities/:id/credential-requirements?role=RN&departmentId=...`
- Repository: 4 query paths (no filter, role only, department only, both)
- Department filter includes facility-wide requirements (WHERE department_id IS NULL)
- Integration test: `should list credential requirements queryable by role`
- Integration test: `should filter by department when department-scoped`
- Integration test: `should reject invalid role filter`

## Test Summary

| Layer                    | Count                | Status |
| ------------------------ | -------------------- | ------ |
| Unit (domain)            | 21                   | PASS   |
| Integration (RLS + HTTP) | 34                   | PASS   |
| Determinism              | 34/34 × 2 runs       | PASS   |
| Lint                     | 0 errors, 0 warnings | PASS   |
| Typecheck                | 0 errors             | PASS   |

## Security Controls

- RLS enabled and forced on: facilities, departments, clients, credential_requirements, confirmation_policies, event_outbox, audit_records
- Application role `staffing_app`: not superuser, not owner, no BYPASSRLS
- Tenant context derived from validated JWT principal only (never URL/header/body)
- Strict Zod schemas reject unknown fields (prevents tenant ID injection)
- Cross-tenant reads return 404 (not 403) — no information leakage

## API Endpoints Delivered

| Method | Path                                       | Purpose                         |
| ------ | ------------------------------------------ | ------------------------------- |
| POST   | /v1/facilities                             | Create facility                 |
| GET    | /v1/facilities                             | List facilities (tenant-scoped) |
| GET    | /v1/facilities/:id                         | Get facility by ID              |
| POST   | /v1/facilities/:id/departments             | Create department               |
| GET    | /v1/facilities/:id/departments             | List departments                |
| POST   | /v1/facilities/:id/credential-requirements | Create requirement              |
| GET    | /v1/facilities/:id/credential-requirements | Query requirements              |

## Events Published

- `carecareer.facility.created.v1` — on facility creation

## Schema

- `staffing.clients` — tenant-scoped client organizations
- `staffing.facilities` — physical healthcare sites
- `staffing.departments` — units within facilities
- `staffing.credential_requirements` — role/credential matrix
- `staffing.confirmation_policies` — assignment approval config
- `staffing.event_outbox` — transactional outbox
- `staffing.audit_records` — immutable audit trail

## Known Limitations

- No bulk operations (single facility at a time)
- No facility status transitions via API (active/inactive/suspended) — update endpoint deferred
- confirmation_policies and credential_requirements tables exist but are partially used
- Client CRUD not yet exposed (seeded directly for now)
