# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.2 — Memberships, Roles, and Permission Derivation (Complete)

## Current State

| Field                 | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| Current branch        | master                                                       |
| GP-03.0 final commit  | 6098d85                                                      |
| GP-03.1 original      | 010f0ef                                                      |
| GP-03.1 closure       | 4157886                                                      |
| Current slice         | GP-03.2                                                      |
| Schema status         | Complete (10 tables, RLS enforced)                           |
| Migration status      | 3 migration files (schema, RLS/grants, seed)                 |
| API status            | 20 endpoints implemented (8 GP-03.1 + 12 GP-03.2)           |
| Unit tests            | 85 passed (domain + HTTP contract + OpenAPI)                 |
| Integration tests     | 31 passed (21 GP-03.1 + 10 GP-03.2)                         |
| OpenAPI validation    | 13 automated checks                                         |
| Docker verification   | 14/14 identity, 15/15 platform                               |
| Platform regression   | 34 integration tests — 3/3 deterministic runs                |
| DEMO-01 regression    | 20 Chromium E2E + 103 frontend + 117 backend all green       |

## GP-03.2 Deliverables

### Domain Model

- TenantMembership entity with full lifecycle (INVITED → ACTIVE → SUSPENDED → DEACTIVATED)
- MembershipStatus state machine with all valid/invalid transitions tested
- Permission derivation: deriveEffectivePermissions + derivePlatformPermissions
- Role and Permission value objects
- Platform role assignment model
- All domain errors with stable codes

### Application Layer

- createMembershipCommand (tenant path, duplicate rejection, atomic audit+outbox)
- changeMembershipStatusCommand (optimistic concurrency, auth version increment)
- assignMembershipRolesCommand (role validation, scope check, replacement semantics)
- assignPlatformRoleCommand (admin path, user auth version increment)
- removePlatformRoleCommand (admin path, audited)

### HTTP Endpoints (GP-03.2)

| Method | Path                                                         | Permission              |
| ------ | ------------------------------------------------------------ | ----------------------- |
| POST   | /v1/tenants/{tenantId}/members                               | tenant.members.manage   |
| GET    | /v1/tenants/{tenantId}/members                               | tenant.members.read     |
| GET    | /v1/tenants/{tenantId}/members/{membershipId}                | tenant.members.read     |
| PATCH  | /v1/tenants/{tenantId}/members/{membershipId}/status         | tenant.members.manage   |
| GET    | /v1/tenants/{tenantId}/members/{membershipId}/roles          | tenant.members.read     |
| PUT    | /v1/tenants/{tenantId}/members/{membershipId}/roles          | tenant.roles.assign     |
| GET    | /v1/tenants/{tenantId}/members/{membershipId}/permissions    | tenant.members.read     |
| GET    | /v1/tenants/{tenantId}/roles                                 | tenant.members.read     |
| GET    | /v1/permissions                                              | tenant.members.read     |
| GET    | /v1/platform/users/{userId}/memberships                      | platform.users.read     |
| GET    | /v1/platform/users/{userId}/platform-roles                   | platform.users.read     |
| PUT    | /v1/platform/users/{userId}/platform-roles                   | platform.users.manage   |

### Security Controls

- Membership RLS: cross-tenant SELECT, UPDATE, INSERT all proven blocked
- Missing tenant context returns no rows
- Pool reuse does not leak context
- Platform-role changes only via administrative database path
- Audit records append-only (UPDATE/DELETE/TRUNCATE denied for app role)
- TenantAwareTransaction never activates admin context
- Every mutation atomically creates domain + audit + outbox records
- Transaction rollback removes all three

### Permission Derivation

- ACTIVE membership → full derived permissions from assigned roles
- SUSPENDED membership → no permissions
- DEACTIVATED membership → no permissions
- INVITED membership → no permissions
- Tenant roles cannot grant platform permissions
- Platform roles resolved separately via derivePlatformPermissions
- Custom roles rejected (disabled)

### Integration Test Stability

- Platform-service idempotency concurrency test fixed with advisory locks
- fileParallelism: false applied to all integration configs
- Platform integration: 3 consecutive deterministic passes
- Identity integration: 31 tests passing cleanly

## GP-03.2 Events

- identity.membership.created
- identity.membership.activated
- identity.membership.suspended
- identity.membership.deactivated
- identity.role.assigned
- identity.role.removed
- identity.platform-role.assigned
- identity.platform-role.removed

## Known Gaps

1. Invitation workflow (INVITED → token-based acceptance) deferred to GP-03.5
2. Custom role CRUD disabled — only system roles operational
3. Tenant admin cannot-assign-what-they-don't-have validation deferred to authorization-service integration
4. Hidden cross-tenant 404 partially implemented — full enforcement requires auth-middleware integration

## GP-03.3 Readiness Recommendation

Ready to proceed. All GP-03.2 requirements satisfied:
- Full membership lifecycle with state machine tested
- Role assignment and permission derivation operational
- Platform-role controls audited through administrative path
- RLS tenant isolation proven with non-privileged role
- Atomic transaction behavior verified
- OpenAPI extended and validated
- All existing regressions green
