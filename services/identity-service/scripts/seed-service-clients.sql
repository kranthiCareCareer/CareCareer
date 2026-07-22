-- Seed service clients for LOCAL DEVELOPMENT ONLY.
-- DO NOT use these credentials in production.
-- Production credentials are provisioned via AWS Secrets Manager.
--
-- Usage: psql -f scripts/seed-service-clients.sql

-- Generate a new secret: openssl rand -hex 32
-- Hash it: echo -n "<secret>" | sha256sum

INSERT INTO identity.service_clients (client_id, secret_hash, allowed_scopes, description)
VALUES (
    'staffing-service',
    -- This is a LOCAL DEV ONLY hash. Rotate immediately if exposed.
    -- To generate: echo -n "your-local-dev-secret" | sha256sum
    'REPLACE_WITH_SHA256_OF_YOUR_LOCAL_SECRET',
    'identity.state.validate,authorization.decide',
    'CareCareer Staffing Service'
)
ON CONFLICT (client_id) DO UPDATE SET
  allowed_scopes = EXCLUDED.allowed_scopes,
  updated_at = NOW();
