-- Service client registry for internal service-to-service authentication.
-- Only the identity-service issues service JWTs via client-credentials flow.

CREATE TABLE identity.service_clients (
    client_id VARCHAR(100) PRIMARY KEY,
    secret_hash VARCHAR(128) NOT NULL,
    allowed_scopes TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    description VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Register the staffing-service client
-- Secret: 'staffing-service-dev-secret' → SHA-256 hash
-- In production, secrets are rotated via Secrets Manager
INSERT INTO identity.service_clients (client_id, secret_hash, allowed_scopes, description)
VALUES (
    'staffing-service',
    -- SHA-256 of 'staffing-service-dev-secret'
    '483455756fbe6e8692095b2dc7fa8f6ebe5ba1de749bf2b98f8fba569e996f85',
    'identity.state.validate,authorization.decide',
    'CareCareer Staffing Service - manages facilities, departments, and workers'
);
