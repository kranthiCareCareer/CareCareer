-- GP-03.3: Auth Sessions and Signing Keys
-- Supports refresh-token rotation, replay detection, and JWKS

-- ─── Auth Sessions ────────────────────────────────────────────────────────────

CREATE TABLE identity.auth_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES identity.users(id),
    external_identity_id UUID REFERENCES identity.external_identities(id),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    refresh_token_hash VARCHAR(128) NOT NULL,
    token_family UUID NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    client_info JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT chk_session_status CHECK (status IN ('ACTIVE', 'REVOKED'))
);

CREATE INDEX idx_sessions_user ON identity.auth_sessions (user_id, status);
CREATE INDEX idx_sessions_family ON identity.auth_sessions (token_family);
CREATE INDEX idx_sessions_expires ON identity.auth_sessions (expires_at) WHERE status = 'ACTIVE';

-- ─── Signing Keys ─────────────────────────────────────────────────────────────

CREATE TABLE identity.signing_keys (
    id UUID PRIMARY KEY,
    algorithm VARCHAR(10) NOT NULL DEFAULT 'RS256',
    public_key TEXT NOT NULL,
    private_key_ref VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    activated_at TIMESTAMPTZ,
    rotated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_key_algorithm CHECK (algorithm IN ('RS256', 'ES256')),
    CONSTRAINT chk_key_status CHECK (status IN ('ACTIVE', 'ROTATED', 'REVOKED'))
);

CREATE INDEX idx_signing_keys_status ON identity.signing_keys (status);

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON identity.auth_sessions TO carecareer_app;
GRANT SELECT, INSERT, UPDATE ON identity.auth_sessions TO carecareer_admin_service;
GRANT SELECT ON identity.signing_keys TO carecareer_app;
GRANT SELECT, INSERT, UPDATE ON identity.signing_keys TO carecareer_admin_service;
