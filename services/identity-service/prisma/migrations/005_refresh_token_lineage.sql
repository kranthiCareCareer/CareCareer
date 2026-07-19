-- GP-03.3: Durable Refresh Token Lineage
-- Enables historical replay detection by preserving hashed token history.
-- A known rotated token can now be identified, triggering family compromise.

-- ─── Refresh Token Lineage Table ──────────────────────────────────────────────

CREATE TABLE identity.auth_refresh_tokens (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES identity.auth_sessions(id),
    token_family_id UUID NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    parent_token_id UUID REFERENCES identity.auth_refresh_tokens(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_refresh_token_status CHECK (
        status IN ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED', 'COMPROMISED')
    )
);

-- Unique constraint: only one token with a given hash can exist
CREATE UNIQUE INDEX idx_refresh_tokens_hash ON identity.auth_refresh_tokens (token_hash);

-- Fast lookup by family for compromise operations
CREATE INDEX idx_refresh_tokens_family ON identity.auth_refresh_tokens (token_family_id, status);

-- Fast lookup by session for cleanup
CREATE INDEX idx_refresh_tokens_session ON identity.auth_refresh_tokens (session_id, status);

-- Expiry cleanup index
CREATE INDEX idx_refresh_tokens_expires ON identity.auth_refresh_tokens (expires_at)
    WHERE status = 'ACTIVE';

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON identity.auth_refresh_tokens TO carecareer_app;
GRANT SELECT, INSERT, UPDATE ON identity.auth_refresh_tokens TO carecareer_admin_service;
