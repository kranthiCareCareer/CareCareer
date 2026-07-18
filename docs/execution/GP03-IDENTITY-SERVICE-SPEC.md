# GP-03 Identity Service — Architecture and Execution Plan

## 1. Purpose

The identity-service owns authentication, user identity, tenant membership, roles, permissions, and provider-neutral OIDC integration for the CareCareer platform.

It replaces the demo-only `DemoAuthController` with a real identity layer while preserving the demo persona model for local development.

---

## 2. Domain Model

### Core Entities

```
User
├── id: UUID
├── externalId: string (OIDC subject)
├── email: string (unique, verified)
├── firstName: string
├── lastName: string
├── status: ACTIVE | SUSPENDED | DEACTIVATED
├── emailVerified: boolean
├── lastLoginAt: timestamp
├── createdAt / updatedAt
└── version: int

TenantMembership
├── id: UUID
├── userId: UUID
├── tenantId: UUID
├── roles: Role[]
├── branchIds: UUID[] (optional scope)
├── status: ACTIVE | SUSPENDED | REVOKED
├── invitedBy: UUID
├── acceptedAt: timestamp
├── createdAt / updatedAt
└── version: int

Invitation
├── id: UUID
├── tenantId: UUID
├── email: string
├── roles: Role[]
├── branchIds: UUID[]
├── invitedBy: UUID
├── status: PENDING | ACCEPTED | EXPIRED | REVOKED
├── expiresAt: timestamp
├── token: string (hashed)
└── createdAt

Role (enum)
├── PLATFORM_ADMIN
├── TENANT_ADMIN
├── BRANCH_MANAGER
├── SCHEDULER
├── PAYROLL_ADMIN
├── RECRUITER
├── CREDENTIALING_SPECIALIST
├── READ_ONLY_AUDITOR
└── WORKER (future)

Permission (derived from roles — not stored per-user)
```

### External Identity Mapping

```
ExternalIdentityLink
├── id: UUID
├── userId: UUID
├── provider: string (e.g., 'auth0', 'okta', 'entra-id')
├── providerUserId: string (OIDC sub claim)
├── providerTenantId: string (optional — for federated tenants)
├── linkedAt: timestamp
└── lastUsedAt: timestamp
```

---

## 3. Provider-Neutral OIDC Integration

### Architecture

```
Browser/Mobile
  → Authorization Code + PKCE flow
  → External IdP (Auth0 / Okta / Entra ID)
  → Callback with authorization code
  → identity-service exchanges code for tokens
  → identity-service validates ID token
  → Maps claims to internal User + TenantMembership
  → Issues platform session (short-lived JWT or opaque token)
  → Platform JWT consumed by all services via @carecareer/auth
```

### Token Claim Mapping

```
External ID Token Claims        →  Platform Context
─────────────────────────────────────────────────────
sub                             →  ExternalIdentityLink.providerUserId
email                           →  User.email (verified match)
email_verified                  →  User.emailVerified
given_name                      →  User.firstName
family_name                     →  User.lastName
org_id (custom)                 →  TenantMembership lookup
roles (custom)                  →  Role mapping table
```

### Platform JWT (issued by identity-service)

```json
{
  "iss": "carecareer-identity",
  "sub": "<userId>",
  "aud": "carecareer-api",
  "tenant_id": "<active-tenant-id>",
  "actor_id": "<userId>",
  "actor_type": "user",
  "roles": ["TENANT_ADMIN"],
  "permissions": ["platform.tenant.read", "platform.organization.create", ...],
  "branch_ids": ["<branch-uuid>"],
  "iat": 1700000000,
  "exp": 1700000900
}
```

### Multi-Tenant Session Model

Users may belong to multiple tenants. The platform JWT is scoped to ONE active tenant at a time. Tenant switching:

1. User requests tenant switch
2. identity-service verifies membership is ACTIVE
3. New JWT issued with updated `tenant_id`, roles, permissions
4. Previous JWT is not revoked (short-lived, 15 min)

---

## 4. Platform vs. Tenant Administrators

| Capability                 | Platform Admin | Tenant Admin |
| -------------------------- | -------------- | ------------ |
| Provision tenants          | ✓              | ✗            |
| Manage all tenants         | ✓              | ✗            |
| Invite platform admins     | ✓              | ✗            |
| Manage own tenant          | ✓              | ✓            |
| Invite tenant users        | ✓              | ✓            |
| Assign roles within tenant | ✓              | ✓            |
| View cross-tenant audit    | ✓              | ✗            |
| View own-tenant audit      | ✓              | ✓            |

Platform administrators are NOT members of individual tenants. They access the system with a special `tenant_id: 'platform'` context and bypass tenant-scoped RLS via the `app.is_admin` policy.

---

## 5. Membership Lifecycle

```
Invitation sent
  → PENDING
  → User accepts (creates account or links existing)
  → Membership ACTIVE
  → Tenant admin suspends
  → Membership SUSPENDED (user cannot access tenant)
  → Tenant admin reactivates
  → Membership ACTIVE
  → Tenant admin revokes
  → Membership REVOKED (terminal)
```

### Invitation Flow

1. Tenant admin creates invitation (email + roles + branches)
2. System sends email with secure token link
3. Recipient clicks link → identity-service validates token
4. If user exists: link membership to existing user
5. If user is new: redirect to OIDC registration
6. After OIDC, complete membership acceptance
7. Token is single-use and expires after 7 days

---

## 6. RLS Model

### identity-service tables

```sql
-- Users table: platform-wide, no tenant_id
-- Only identity-service reads/writes
-- Other services receive user context via JWT

-- Memberships: tenant-scoped
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_own_tenant ON tenant_memberships
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY membership_admin ON tenant_memberships
  FOR ALL USING (current_setting('app.is_admin') = 'true');

-- Invitations: tenant-scoped
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_own_tenant ON invitations
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

---

## 7. APIs

### Public (no auth required)

```
POST   /auth/login                    → Initiate OIDC flow
GET    /auth/callback                 → OIDC callback handler
POST   /auth/refresh                  → Refresh platform token
POST   /auth/logout                   → Revoke refresh token
POST   /auth/demo/token               → Demo persona (dev only)
GET    /invitations/:token/accept     → Accept invitation landing
POST   /invitations/:token/complete   → Complete invitation acceptance
```

### Authenticated

```
GET    /v1/users/me                   → Current user profile
PUT    /v1/users/me                   → Update own profile
GET    /v1/users/me/tenants           → List tenant memberships
POST   /v1/users/me/tenants/:id/switch → Switch active tenant

GET    /v1/tenants/:id/members        → List tenant members
POST   /v1/tenants/:id/invitations    → Create invitation
DELETE /v1/tenants/:id/invitations/:id → Revoke invitation
PUT    /v1/tenants/:id/members/:id/suspend   → Suspend membership
PUT    /v1/tenants/:id/members/:id/reactivate → Reactivate
PUT    /v1/tenants/:id/members/:id/revoke    → Revoke (terminal)
PUT    /v1/tenants/:id/members/:id/roles     → Update roles
```

### Platform Admin Only

```
GET    /v1/platform/users             → List all platform users
POST   /v1/platform/users/:id/suspend → Suspend user globally
```

---

## 8. Database Schema

```sql
-- Users (platform-wide, no RLS — accessed only by identity-service)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- External identity links
CREATE TABLE external_identity_links (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(500) NOT NULL,
  provider_tenant_id VARCHAR(500),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(provider, provider_user_id)
);

-- Tenant memberships (RLS-enforced)
CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  roles JSONB NOT NULL DEFAULT '[]',
  branch_ids JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  invited_by UUID,
  accepted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

-- Invitations (RLS-enforced)
CREATE TABLE invitations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(320) NOT NULL,
  roles JSONB NOT NULL DEFAULT '[]',
  branch_ids JSONB NOT NULL DEFAULT '[]',
  invited_by UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 9. Migration Strategy

### Phase 1: Schema + Service skeleton

- Add migration for identity tables
- Create `services/identity-service` with NestJS
- Implement User + Membership domain entities
- Implement PostgreSQL repository with $queryRaw

### Phase 2: OIDC integration

- Add provider-neutral OIDC module to `@carecareer/auth`
- Implement token exchange, claim mapping
- Issue platform JWTs from identity-service
- Platform-service validates platform JWTs (no code change needed — already uses `@carecareer/auth`)

### Phase 3: Membership and invitation flows

- Invitation creation, acceptance, expiry
- Membership lifecycle (suspend, reactivate, revoke)
- Role assignment and permission derivation

### Phase 4: Demo persona replacement path

- Demo personas map to real seeded users with memberships
- `DemoAuthController` remains for local dev but issues real platform JWTs via identity-service
- Production: `DEMO_MODE=false`, OIDC required

---

## 10. Replacement Path: Demo Auth → Real Identity

| Demo Persona                    | Becomes                                                |
| ------------------------------- | ------------------------------------------------------ |
| Platform Administrator          | Seeded user with PLATFORM_ADMIN role                   |
| MAS Tenant Administrator        | Seeded user with TENANT_ADMIN membership in MAS tenant |
| CareShield Tenant Administrator | Seeded user with TENANT_ADMIN membership in CareShield |
| Read-Only Auditor               | Seeded user with READ_ONLY_AUDITOR role                |

The admin console persona selector becomes a login page with:

- "Sign in with SSO" button (OIDC flow)
- Demo mode: persona selector overlay (unchanged from DEMO-01)

---

## 11. Acceptance Tests

### Unit Tests

- User entity creation and validation
- Membership state machine transitions
- Permission derivation from roles
- Token claim mapping logic
- Invitation token generation and validation

### Integration Tests (Testcontainers)

- User CRUD with real PostgreSQL
- Membership RLS isolation
- Invitation acceptance flow
- External identity link creation
- Refresh token rotation

### E2E Tests (Chromium)

- OIDC login flow (mocked IdP)
- Tenant switching
- Invitation acceptance
- Membership management
- Permission enforcement in UI

---

## 12. Proposed Execution Slices

| Slice   | Scope                                      | Exit Criteria                                                 |
| ------- | ------------------------------------------ | ------------------------------------------------------------- |
| GP-03.1 | Schema + service skeleton + User entity    | Migrations apply, service starts, user CRUD passes            |
| GP-03.2 | Membership + roles + permission derivation | Membership lifecycle tests pass, RLS isolation proven         |
| GP-03.3 | Platform JWT issuance + validation         | Identity-service issues JWTs, platform-service validates them |
| GP-03.4 | OIDC provider integration                  | Login flow works against mock IdP, claim mapping proven       |
| GP-03.5 | Invitation flow                            | Full invite → accept → membership creation tested             |
| GP-03.6 | Admin console integration                  | Login page, tenant switch, member management screens          |
| GP-03.7 | Demo replacement                           | Demo personas use seeded users, demo:verify still passes      |

---

## 13. Dependencies

- `@carecareer/auth` — extend with OIDC provider abstraction and platform JWT verification
- `@carecareer/database` — reuse TenantAwareTransaction and AdministrativeDatabase
- `@carecareer/events` — membership events (user.created, membership.accepted, etc.)
- `platform-service` — validates JWTs issued by identity-service (no code change needed)
- External: OIDC provider account (Auth0 dev tenant or local mock like `oauth2-mock-server`)

---

## 14. Risks

| Risk                                            | Mitigation                                                  |
| ----------------------------------------------- | ----------------------------------------------------------- |
| OIDC provider lock-in                           | Provider-neutral abstraction; claim mapping is configurable |
| Multi-tenant JWT complexity                     | Single active tenant per token; explicit switch required    |
| Invitation email delivery                       | Use a queue + adapter pattern; mock in dev                  |
| Migration conflicts with existing tenants table | identity-service references tenants but doesn't own it      |
| Demo-mode regression                            | demo:verify must pass at every slice boundary               |

---

## 15. Exit Criteria for GP-03

- [ ] identity-service starts and passes health check
- [ ] User creation, lookup, and profile update work
- [ ] Tenant membership CRUD with RLS isolation proven
- [ ] Platform JWT issued and validated by platform-service
- [ ] OIDC login flow works against mock provider
- [ ] Invitation acceptance creates membership
- [ ] Membership suspension blocks tenant access
- [ ] Membership revocation is terminal
- [ ] Permission derivation from roles is tested
- [ ] Refresh token rotation works
- [ ] Admin console has login page and member management
- [ ] Demo personas still work via seeded users
- [ ] demo:verify passes with real identity flow
- [ ] All existing GP-02 and DEMO-01 tests continue passing
- [ ] Docker image builds and health checks pass
- [ ] No OIDC credentials required for local development

---

## 16. Technical Debt Carried Forward

1. Replace custom Playwright library runner with standard CLI when terminal issue is resolved
2. Verify Playwright UI and Inspector in normal desktop terminal
3. On persona switch, clear tenant-specific state and redirect to dashboard
