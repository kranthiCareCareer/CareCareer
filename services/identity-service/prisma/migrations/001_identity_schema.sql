-- Identity Service Schema — GP-03.1
-- UUID PKs, UTC timestamps, RLS-enabled

-- ─── PostgreSQL Roles and Grants ──────────────────────────────────────────────

-- Application role for tenant-scoped operations (cannot bypass RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'carecareer_app') THEN
    CREATE ROLE carecareer_app NOINHERIT LOGIN PASSWORD 'carecareer_app_dev';
  END IF;
END
$$;

-- Administrative role for platform operations
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'carecareer_admin_service') THEN
    CREATE ROLE carecareer_admin_service NOINHERIT LOGIN PASSWORD 'carecareer_admin_dev';
  END IF;
END
$$;

-- Ensure identity schema exists
CREATE SCHEMA IF NOT EXISTS identity;

-- ─── Users Table ──────────────────────────────────────────────────────────────

CREATE TABLE identity.users (
    id UUID PRIMARY KEY,
    display_name VARCHAR(200) NOT NULL,
    primary_email VARCHAR(320) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    authorization_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
);

CREATE INDEX idx_users_email ON identity.users (primary_email);
CREATE INDEX idx_users_status ON identity.users (status);

-- ─── External Identities Table ────────────────────────────────────────────────

CREATE TABLE identity.external_identities (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES identity.users(id),
    issuer VARCHAR(500) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    email_claim VARCHAR(320),
    display_name_claim VARCHAR(200),
    last_authenticated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_external_identity_issuer_subject UNIQUE (issuer, subject),
    CONSTRAINT chk_provider_type CHECK (provider_type IN ('entra', 'okta', 'auth0', 'mock'))
);

CREATE INDEX idx_external_identities_user ON identity.external_identities (user_id);

-- ─── Tenant Memberships Table ─────────────────────────────────────────────────

CREATE TABLE identity.tenant_memberships (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES identity.users(id),
    tenant_id UUID NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'INVITED',
    authorization_version INTEGER NOT NULL DEFAULT 1,
    joined_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_membership_user_tenant UNIQUE (user_id, tenant_id),
    CONSTRAINT chk_membership_status CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
);

CREATE INDEX idx_memberships_tenant ON identity.tenant_memberships (tenant_id);
CREATE INDEX idx_memberships_user ON identity.tenant_memberships (user_id);

-- ─── Roles Table ──────────────────────────────────────────────────────────────

CREATE TABLE identity.roles (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    scope VARCHAR(20) NOT NULL,
    role_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    description TEXT,
    CONSTRAINT chk_role_scope CHECK (scope IN ('PLATFORM', 'TENANT')),
    CONSTRAINT chk_role_type CHECK (role_type IN ('SYSTEM', 'CUSTOM'))
);

-- ─── Permissions Table ────────────────────────────────────────────────────────

CREATE TABLE identity.permissions (
    id UUID PRIMARY KEY,
    identifier VARCHAR(200) NOT NULL UNIQUE,
    scope VARCHAR(20) NOT NULL,
    description TEXT,
    CONSTRAINT chk_permission_scope CHECK (scope IN ('PLATFORM', 'TENANT'))
);

-- ─── Role Permissions Junction ────────────────────────────────────────────────

CREATE TABLE identity.role_permissions (
    role_id UUID NOT NULL REFERENCES identity.roles(id),
    permission_id UUID NOT NULL REFERENCES identity.permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

-- ─── Membership Roles Junction ────────────────────────────────────────────────

CREATE TABLE identity.membership_roles (
    membership_id UUID NOT NULL REFERENCES identity.tenant_memberships(id),
    role_id UUID NOT NULL REFERENCES identity.roles(id),
    PRIMARY KEY (membership_id, role_id)
);

-- ─── Platform Role Assignments ────────────────────────────────────────────────

CREATE TABLE identity.platform_role_assignments (
    user_id UUID NOT NULL REFERENCES identity.users(id),
    role_id UUID NOT NULL REFERENCES identity.roles(id),
    assigned_by UUID,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- ─── Event Outbox (identity-service) ──────────────────────────────────────────

CREATE TABLE identity.event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(200) NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(200) NOT NULL,
    aggregate_version INTEGER NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(200) NOT NULL,
    causation_id VARCHAR(200),
    occurred_at VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identity_outbox_pending ON identity.event_outbox (status, created_at)
  WHERE status = 'PENDING';

-- ─── Audit Records (identity-service) ────────────────────────────────────────

CREATE TABLE identity.audit_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id VARCHAR(200) NOT NULL,
    actor_type VARCHAR(30) NOT NULL DEFAULT 'user',
    target_user_id VARCHAR(200) NOT NULL,
    action VARCHAR(200) NOT NULL,
    before_summary JSONB,
    after_summary JSONB,
    reason VARCHAR(500),
    correlation_id VARCHAR(200) NOT NULL,
    administrative_access BOOLEAN NOT NULL DEFAULT false,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identity_audit_target ON identity.audit_records (target_user_id, timestamp);
CREATE INDEX idx_identity_audit_actor ON identity.audit_records (actor_id, timestamp);
CREATE INDEX idx_identity_audit_correlation ON identity.audit_records (correlation_id);
