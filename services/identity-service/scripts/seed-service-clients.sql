-- Seed service clients for LOCAL DEVELOPMENT ONLY.
-- DO NOT use these credentials in production.
-- Production credentials are provisioned via AWS Secrets Manager with rotation.
--
-- To generate a scrypt hash for a new secret, run the Node.js helper:
--   node services/identity-service/scripts/hash-secret.mjs YOUR_SECRET_HERE
--
-- Usage: psql $DATABASE_URL -f scripts/seed-service-clients.sql

-- REPLACE the secret_hash value with the output of the command above.
-- Never commit the plaintext secret.

INSERT INTO identity.service_clients (client_id, secret_hash, allowed_scopes, description)
VALUES (
    'staffing-service',
    'REPLACE_WITH_SCRYPT_HASH_FROM_SCRIPT_ABOVE',
    'identity.state.validate,authorization.decide',
    'CareCareer Staffing Service'
)
ON CONFLICT (client_id) DO UPDATE SET
  secret_hash = EXCLUDED.secret_hash,
  allowed_scopes = EXCLUDED.allowed_scopes,
  updated_at = NOW();
