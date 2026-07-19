# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.1 — Identity Service Skeleton and Core Identity Schema

## Current State

| Field                 | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| Current branch        | master                                                       |
| GP-03.0 final commit  | 6098d85                                                      |
| Current slice         | GP-03.1                                                      |
| Schema status         | Complete (10 tables in identity schema)                      |
| Migration status      | 3 migration files applied (schema, RLS/grants, seed)         |
| RLS status            | Enforced on tenant_memberships, membership_roles             |
| API status            | 6 endpoints implemented + 2 health                           |
| Unit results          | 37 passed                                                    |
| HTTP results          | 15 passed (auth, permission, validation, success)            |
| PostgreSQL results    | 17 passed (migrations, seeding, RLS, atomicity, uniqueness)  |
| Docker verification   | 14 checks passed                                             |
| Platform regression   | 117 unit tests passed, Docker verified                       |
| DEMO-01 regression    | 20 Chromium E2E + 103 frontend + 117 backend all green       |

## Specification Status

| Document                      | Status                               |
| ----------------------------- | ------------------------------------ |
| GP03-IDENTITY-SERVICE-SPEC.md | Rev 2.1 — Approved with corrections  |
| GP03-THREAT-MODEL.md          | Complete (40 threats)                |
| GP03-TRUST-BOUNDARIES.md      | Complete                             |
| GP03-SECURITY-TEST-MATRIX.md  | Complete (62 security tests planned) |

## GP-03.1 Deliverables

### Service Skeleton

- NestJS application with TypeScript strict mode
- Zod-based configuration with fail-fast validation
- Demo token validator (cannot start in production)
- Global authentication guard with @Public() bypass
- Permission decorator with PLATFORM_ADMIN enforcement
- Structured error envelopes
- Correlation-ID propagation via headers
- PostgreSQL-aware readiness endpoint
- Graceful shutdown hooks
- Multi-stage non-root Dockerfile (port 3100)
- Docker verification script (14 checks)
- Unit and integration test configurations

### Database Schema (identity schema)

| Table                       | Created | RLS | Indexed |
| --------------------------- | :-----: | :-: | :-----: |
| users                       |    ✓    |  —  |    ✓    |
| external_identities         |    ✓    |  —  |    ✓    |
| tenant_memberships          |    ✓    |  ✓  |    ✓    |
| roles                       |    ✓    |  —  |    —    |
| permissions                 |    ✓    |  —  |    —    |
| role_permissions            |    ✓    |  —  |    —    |
| membership_roles            |    ✓    |  ✓  |    —    |
| platform_role_assignments   |    ✓    |  —  |    —    |
| event_outbox                |    ✓    |  —  |    ✓    |
| audit_records               |    ✓    |  —  |    ✓    |

### Seeded System Roles

- PLATFORM_ADMIN (platform scope)
- PLATFORM_AUDITOR (platform scope)
- TENANT_ADMIN (tenant scope)
- TENANT_OPERATOR (tenant scope)
- TENANT_AUDITOR (tenant scope)

### Seeded Permissions (17)

Platform: platform.users.read, platform.users.manage, platform.tenants.read, platform.tenants.create, platform.tenants.lifecycle, platform.audit.read

Tenant: tenant.members.read, tenant.members.invite, tenant.members.manage, tenant.roles.assign, tenant.organizations.read, tenant.organizations.manage, tenant.entitlements.read, tenant.entitlements.manage, tenant.features.read, tenant.features.manage, tenant.audit.read

### RLS and Security Controls

- `FORCE ROW LEVEL SECURITY` on tenant_memberships and membership_roles
- carecareer_app role: SELECT, INSERT, UPDATE only (no DELETE on memberships)
- carecareer_admin_service role: full access minus audit UPDATE/DELETE/TRUNCATE
- Audit records: INSERT only for all application roles
- Administrative context: only via AdministrativeDatabase with explicit server-side authorization

### API Endpoints

| Method | Path                                                  | Status |
| ------ | ----------------------------------------------------- | :----: |
| GET    | /health                                               |   ✓    |
| GET    | /ready                                                |   ✓    |
| POST   | /v1/platform/users                                    |   ✓    |
| GET    | /v1/platform/users                                    |   ✓    |
| GET    | /v1/platform/users/{userId}                           |   ✓    |
| PATCH  | /v1/platform/users/{userId}/status                    |   ✓    |
| POST   | /v1/platform/users/{userId}/external-identities       |   ✓    |
| GET    | /v1/platform/users/{userId}/external-identities       |   ✓    |

### OpenAPI

- openapi.yaml committed and validated against implemented routes

## Known Gaps

1. Platform-service idempotency concurrency test is flaky (pre-existing, not caused by GP-03.1)
2. OpenAPI automated validation tooling not integrated into CI yet (manual verification complete)
3. Tenant-facing `TenantAwareTransaction` path not implemented for identity service (not needed until GP-03.2)

## GP-03.2 Readiness Recommendation

Ready to proceed. All GP-03.1 requirements satisfied:
- Service skeleton operational
- Schema proven with real PostgreSQL
- RLS tenant isolation verified
- Administrative path audit-controlled
- Domain model tested (lifecycle, concurrency, external identities)
- HTTP contracts tested (auth, permissions, validation, errors)
- Docker image production-ready
- Existing platform and DEMO-01 regression green
