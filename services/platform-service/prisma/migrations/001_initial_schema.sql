-- Platform Service Initial Schema
-- UUID v7 IDs, RLS enabled, optimistic concurrency via version

-- Tenants (platform-level — admin RLS policy)
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PROVISIONING',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200) NOT NULL
);

-- Tenants use a special RLS policy: platform admins can create,
-- tenant members can read their own tenant.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read_own ON tenants
    FOR SELECT USING (id = current_setting('app.tenant_id', true)::UUID);
CREATE POLICY tenant_admin_all ON tenants
    FOR ALL USING (current_setting('app.is_admin', true) = 'true');

-- Organizations (tenant-scoped)
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(200) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200) NOT NULL,
    CONSTRAINT uq_org_name_per_tenant UNIQUE (tenant_id, name)
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_organizations_tenant ON organizations (tenant_id);

-- Branches (tenant-scoped, within organization)
CREATE TABLE branches (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200) NOT NULL,
    CONSTRAINT uq_branch_code_per_tenant UNIQUE (tenant_id, code)
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON branches
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_branches_tenant ON branches (tenant_id);
CREATE INDEX idx_branches_org ON branches (organization_id);

-- Entitlements (one row per tenant)
CREATE TABLE tenant_entitlements (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
    modules JSONB NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200) NOT NULL
);

ALTER TABLE tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_entitlements
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- Feature Configuration (per tenant, per feature key)
CREATE TABLE tenant_feature_configurations (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    feature_key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(200) NOT NULL,
    PRIMARY KEY (tenant_id, feature_key)
);

ALTER TABLE tenant_feature_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_configurations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_feature_configurations
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- Event Outbox (tenant-scoped)
CREATE TABLE event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
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

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON event_outbox
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE INDEX idx_outbox_pending ON event_outbox (status, created_at) WHERE status = 'PENDING';
CREATE INDEX idx_outbox_tenant ON event_outbox (tenant_id);

-- Audit records (immutable, append-only)
CREATE TABLE audit_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    actor_id VARCHAR(200) NOT NULL,
    actor_type VARCHAR(30) NOT NULL DEFAULT 'user',
    action VARCHAR(200) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(200) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason VARCHAR(500),
    correlation_id VARCHAR(200) NOT NULL,
    request_id VARCHAR(200),
    outcome VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit records are NOT tenant-RLS-filtered (platform admins need cross-tenant audit access)
-- Instead, application queries always include tenant_id in WHERE clause
CREATE INDEX idx_audit_tenant ON audit_records (tenant_id, timestamp);
CREATE INDEX idx_audit_resource ON audit_records (resource_type, resource_id);
CREATE INDEX idx_audit_actor ON audit_records (actor_id, timestamp);
CREATE INDEX idx_audit_correlation ON audit_records (correlation_id);

-- Note: GRANT for app_service applied separately after role creation
-- App role gets SELECT + INSERT only (no UPDATE or DELETE on audit_records)

-- Idempotency keys (atomic deduplication for mutations)
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(200) NOT NULL,
    actor_id VARCHAR(200),
    operation VARCHAR(200) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
    response_status INTEGER,
    response_body JSONB,
    resource_type VARCHAR(100),
    resource_id VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ,
    CONSTRAINT uq_idempotency_key UNIQUE (tenant_id, operation, idempotency_key)
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys (expires_at);
CREATE INDEX idx_idempotency_status ON idempotency_keys (status, locked_until);
