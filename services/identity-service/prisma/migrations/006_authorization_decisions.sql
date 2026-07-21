-- GP-03.4: Authorization Decisions
-- Explicit denials table + authorization decision audit log

-- ─── Explicit Denials ─────────────────────────────────────────────────────────
-- Tenant-scoped denial rules that override permission grants.
-- Effect is always DENY. Grants come from role_permissions.

CREATE TABLE identity.explicit_denials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    -- Scope: which principal is denied (user or membership)
    principal_type VARCHAR(20) NOT NULL,
    principal_id UUID NOT NULL,
    -- What is denied
    action VARCHAR(200) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    -- Lifecycle
    active BOOLEAN NOT NULL DEFAULT true,
    reason VARCHAR(500),
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_by VARCHAR(200),
    CONSTRAINT chk_denial_principal_type CHECK (principal_type IN ('USER', 'MEMBERSHIP'))
);

CREATE INDEX idx_denials_tenant_principal ON identity.explicit_denials (tenant_id, principal_type, principal_id)
    WHERE active = true;
CREATE INDEX idx_denials_action ON identity.explicit_denials (tenant_id, action)
    WHERE active = true;

-- RLS
ALTER TABLE identity.explicit_denials ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.explicit_denials FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.explicit_denials
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY admin_access ON identity.explicit_denials
    FOR ALL USING (current_setting('app.is_admin', true) = 'true');

-- ─── Authorization Decision Log ───────────────────────────────────────────────
-- Persists denial decisions and privileged allow decisions for audit.
-- High-volume allow decisions use structured telemetry (not persisted here).

CREATE TABLE identity.authorization_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    session_id UUID,
    action VARCHAR(200) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    outcome VARCHAR(10) NOT NULL,
    reason_code VARCHAR(50) NOT NULL,
    policy_version INTEGER NOT NULL,
    user_authorization_version INTEGER NOT NULL,
    membership_authorization_version INTEGER NOT NULL,
    correlation_id VARCHAR(200),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_decision_outcome CHECK (outcome IN ('ALLOWED', 'DENIED'))
);

CREATE INDEX idx_decisions_tenant_user ON identity.authorization_decisions (tenant_id, user_id, evaluated_at);
CREATE INDEX idx_decisions_denied ON identity.authorization_decisions (tenant_id, evaluated_at)
    WHERE outcome = 'DENIED';

-- RLS on decisions (tenant-scoped read)
ALTER TABLE identity.authorization_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.authorization_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.authorization_decisions
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY admin_access ON identity.authorization_decisions
    FOR ALL USING (current_setting('app.is_admin', true) = 'true');

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON identity.explicit_denials TO carecareer_app;
GRANT SELECT, INSERT ON identity.authorization_decisions TO carecareer_app;
GRANT SELECT, INSERT, UPDATE ON identity.explicit_denials TO carecareer_admin_service;
GRANT SELECT, INSERT ON identity.authorization_decisions TO carecareer_admin_service;
