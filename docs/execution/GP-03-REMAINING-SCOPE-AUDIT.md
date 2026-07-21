# GP-03 Remaining Scope Audit

## Source: docs/decisions/golden-path-backlog.md (GP-03 section)

## Implemented (GP-03.0 through GP-03.3)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| User profile (name, email, status) | COMPLETE | identity.users table, PostgresIdentityRepository |
| Tenant membership (user belongs to tenant) | COMPLETE | identity.tenant_memberships, MembershipController |
| Roles (CRUD, assignment to users) | COMPLETE | identity.roles, membership_roles tables |
| Permissions (resolved from roles) | COMPLETE | identity.role_permissions, permission resolution |
| Access suspension (immediate block) | COMPLETE | SessionStateValidator, auth version enforcement |
| Token issuance (RS256) | COMPLETE | jwt-service, PlatformTokenValidator |
| Session management | COMPLETE | auth_sessions, refresh rotation, replay detection |
| JWKS endpoint | COMPLETE | /.well-known/jwks.json |
| Tenant isolation (RLS) | COMPLETE | 21 HTTP→RLS tests |
| Production startup fail-closed | COMPLETE | 14+13 config validation tests |
| User belongs to tenant with specific roles | COMPLETE | Membership + role integration tests |
| Tenant switching requires valid membership | COMPLETE | Session selected_tenant_id enforcement |
| Disabled membership immediately blocks access | COMPLETE | Authorization version checks |

## NOT Implemented (Remaining for GP-03 Closure)

| Requirement | Source | Current State | Security Risk |
|-------------|--------|---------------|---------------|
| Authorization decision endpoint | Backlog: "Authorization decision endpoint" | No endpoint exists | Medium — no centralized authz query |
| Explicit deny overrides role grants | Acceptance criteria #4 | Not implemented | High — cannot block specific actions |
| Policy attribute evaluation (ABAC) | Included capabilities | Not implemented | Medium — coarse RBAC only |
| Authorization decisions generate audit | Acceptance criteria #6 | Not implemented | Medium — no authz audit trail |
| Break-glass elevation with TTL | Acceptance criteria #7, included capabilities | Not implemented | Low — no admin emergency path |
| Invitation lifecycle and expiration | Acceptance criteria #8, state transitions | No invitations table | Low — manual user creation works |
| External OIDC user mapping | Acceptance criteria #1 | Schema exists, no real provider | Medium — demo auth only |
| GET /v1/me/permissions | API contracts | Not implemented | Low — roles visible via /me |
| POST /v1/users/invite | API contracts | Not implemented | Low — manual creation works |

## Proposed Milestone Split

### GP-03.4 — Authorization Decision Service

**Purpose:** Centralized, auditable authorization query for any service or UI component.

**Included:**
- Authorization decision endpoint (POST /v1/authorization/decisions)
- Default-deny behavior
- Explicit deny overrides role grants
- Permission resolution from roles
- State enforcement (suspended user/membership, version checks)
- Tenant isolation (principal cannot query cross-tenant)
- Authorization audit evidence (every denial persisted)
- Stable machine-readable reason codes
- OpenAPI contract

**Excluded:**
- Break-glass elevation (GP-03.5)
- Invitation lifecycle (GP-03.6)
- Real OIDC provider integration (GP-15)
- General-purpose policy language
- ABAC beyond existing role-permission model

**Dependencies:** GP-03.3 (COMPLETE)

**Acceptance criteria:**
- [ ] Decision endpoint returns allow/deny with reason code
- [ ] Default deny when no matching permission
- [ ] Explicit deny overrides all grants
- [ ] Suspended/deactivated user denied
- [ ] Stale authorization version denied
- [ ] Cross-tenant resource evaluation denied
- [ ] Every denial produces audit evidence
- [ ] No sensitive data in responses or audit
- [ ] Caller cannot override principal fields
- [ ] Security coverage meets 95/90 thresholds
- [ ] 3x integration determinism

### GP-03.5 — Break-Glass Administrative Elevation (DEFERRED)

**Purpose:** Emergency elevated access with audit trail and automatic expiration.

**Included:**
- Elevation request with reason
- Time-bounded TTL
- Revocation
- Full audit trail
- carecareer.access.elevated.v1 event

**Dependencies:** GP-03.4

### GP-03.6 — Membership Invitations (DEFERRED)

**Purpose:** Invite users to tenants with configurable expiration.

**Included:**
- Invitation creation with email
- Invitation acceptance
- TTL-based expiration
- State machine: PENDING → ACCEPTED → EXPIRED
- carecareer.user.invited.v1 event

**Dependencies:** GP-03.4 (deny uninvited access)

### GP-15 — Production Identity Integration (DEFERRED)

**Purpose:** Connect to real OIDC providers and AWS KMS for production.

**Included:**
- Auth0/Entra OIDC validation
- External identity mapping (subject → user)
- AWS KMS signing
- Secrets Manager integration
- Production startup configuration

**Dependencies:** GP-03.4, AWS infrastructure

## Parallelization Analysis

| Milestone | Can Proceed After | Blocks |
|-----------|-------------------|--------|
| GP-03.4 | GP-03.3 (done) | GP-03.5, GP-03.6, GP-04 |
| GP-05 (Facilities) | GP-01 (done) | GP-07, GP-08 |
| GP-06 (Workers) | GP-01 (done) | GP-07, GP-09 |

**Recommendation:** GP-03.4 and GP-05/GP-06 can proceed in parallel.
GP-03.4 is required before GP-04 (formal admin portal) can close.
GP-05 and GP-06 can proceed independently since they only depend on GP-01.

After GP-03.4 closes, the highest business-value next step is GP-05 (Facilities)
followed by GP-06 (Workers), which together enable GP-07 (Credentials/Eligibility).
