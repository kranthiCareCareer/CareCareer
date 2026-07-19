-- Identity Service RLS Policies and Grants — GP-03.1
-- Implements least-privilege grants and tenant isolation

-- ─── RLS on tenant_memberships ────────────────────────────────────────────────

ALTER TABLE identity.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.tenant_memberships FORCE ROW LEVEL SECURITY;

-- Tenant-scoped access: only see memberships for current tenant
CREATE POLICY tenant_isolation ON identity.tenant_memberships
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- Administrative override: only when app.is_admin is explicitly set
CREATE POLICY admin_access ON identity.tenant_memberships
    FOR ALL
    USING (current_setting('app.is_admin', true) = 'true');

-- ─── RLS on membership_roles ──────────────────────────────────────────────────

ALTER TABLE identity.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.membership_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.membership_roles
    FOR ALL
    USING (
      membership_id IN (
        SELECT id FROM identity.tenant_memberships
        WHERE tenant_id = current_setting('app.tenant_id', true)::UUID
      )
    );

CREATE POLICY admin_access ON identity.membership_roles
    FOR ALL
    USING (current_setting('app.is_admin', true) = 'true');

-- ─── Grants to carecareer_app (tenant-scoped operations) ─────────────────────

GRANT USAGE ON SCHEMA identity TO carecareer_app;
GRANT SELECT, INSERT, UPDATE ON identity.users TO carecareer_app;
GRANT SELECT, INSERT ON identity.external_identities TO carecareer_app;
GRANT SELECT, INSERT, UPDATE ON identity.tenant_memberships TO carecareer_app;
GRANT SELECT ON identity.roles TO carecareer_app;
GRANT SELECT ON identity.permissions TO carecareer_app;
GRANT SELECT ON identity.role_permissions TO carecareer_app;
GRANT SELECT, INSERT, DELETE ON identity.membership_roles TO carecareer_app;
GRANT SELECT ON identity.platform_role_assignments TO carecareer_app;
GRANT SELECT, INSERT ON identity.event_outbox TO carecareer_app;

-- Audit is append-only: INSERT only, no UPDATE or DELETE
GRANT SELECT, INSERT ON identity.audit_records TO carecareer_app;

-- ─── Grants to carecareer_admin_service (administrative path) ─────────────────

GRANT USAGE ON SCHEMA identity TO carecareer_admin_service;
GRANT ALL ON ALL TABLES IN SCHEMA identity TO carecareer_admin_service;

-- Audit records: even admin cannot UPDATE or DELETE
REVOKE UPDATE, DELETE, TRUNCATE ON identity.audit_records FROM carecareer_admin_service;
GRANT SELECT, INSERT ON identity.audit_records TO carecareer_admin_service;

-- ─── Prevent table owner bypass on RLS ────────────────────────────────────────
-- FORCE ROW LEVEL SECURITY already applied above ensures even table owner
-- cannot bypass RLS policies.
