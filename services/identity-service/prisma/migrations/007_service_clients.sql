-- Service client registry for internal service-to-service authentication.
-- Only the identity-service issues service JWTs via client-credentials flow.

CREATE TABLE identity.service_clients (
    client_id VARCHAR(100) PRIMARY KEY,
    -- scrypt hash: format is "scrypt$N$r$p$salt$hash" (all base64url)
    -- Salt is unique per credential. N=16384, r=8, p=1.
    secret_hash VARCHAR(256) NOT NULL,
    allowed_scopes TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    description VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Register the staffing-service client
-- In production, the secret is provisioned via Secrets Manager and rotated.
-- For local development, run: scripts/seed-service-clients.sql
-- DO NOT commit actual credentials to source control.
