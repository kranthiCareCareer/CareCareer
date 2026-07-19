# GP-03 Identity Service — Trust Boundaries

## System Components

### Browser (UNTRUSTED)

- All content from the browser is untrusted
- Cannot rely on client-side validation alone
- Tokens in memory may be accessed by XSS
- Cookies must use httpOnly + Secure + SameSite

### External OIDC Provider (TRUSTED after validation)

- Trusted ONLY after:
  - Issuer matches allowlist
  - Token signature verified against provider's JWKS
  - Audience matches configuration
  - Nonce matches issued nonce
  - Token is not expired
- Provider claims are informational (not authoritative for CareCareer roles)
- Provider groups may suggest initial mapping but do not control permissions

### Identity Service (TRUSTED — authorization boundary)

- Single authoritative source for:
  - User identity mapping
  - Membership state
  - Role assignments
  - Platform token issuance
  - Session management
- Issues platform JWTs signed with private key
- Validates external identity tokens
- Enforces session limits and revocation

### Platform Service / Other Services (TRUSTED — consumers)

- Validate platform JWTs via JWKS (public key verification)
- Extract claims but do NOT modify authorization state
- Set tenant database context from validated JWT claims
- NEVER set administrative database context from token claims alone
- Must verify authorization_version freshness

### Tenant-Aware Database Connection (CONTROLLED)

- SET LOCAL app.tenant_id from server-derived context
- RLS enforces tenant isolation
- Cannot access other tenants' data
- Cannot set app.is_admin

### Administrative Database Connection (RESTRICTED)

- Used ONLY by AdministrativeDatabase abstraction
- Entered ONLY after server-side platform-admin verification
- Sets app.is_admin = 'true' within transaction scope
- Always produces audit record with administrative indicator
- Cannot be triggered by:
  - Token claims
  - Request headers
  - Request body fields
  - Client-side data

### PostgreSQL (ENFORCER)

- RLS policies are the last line of defense
- Even if application logic has bugs, RLS blocks cross-tenant access
- Runtime roles have minimal grants (no BYPASSRLS)
- Audit table: INSERT + SELECT only for runtime role
- Administrative operations require separate role/context

### JWKS Consumers (VALIDATED)

- Services fetch public keys from identity-service JWKS endpoint
- HTTPS required
- Cache with short TTL (5 minutes)
- Reject unknown key IDs
- Accept current + previous (overlap) keys during rotation

### Email Delivery Adapter (UNTRUSTED output)

- Outbox event triggers delivery
- Adapter is replaceable (mock in dev, SES/SendGrid in production)
- Invitation tokens NEVER in email body as plaintext (use secure link)
- Email content is informational, not authoritative

### Outbox Publisher (INTERNAL)

- Events contain only non-sensitive identifiers
- No tokens, secrets, or raw provider claims
- Events are tenant-scoped where applicable
- Consumers must verify their own authorization

### Audit Store (APPEND-ONLY)

- INSERT only for runtime role
- No UPDATE, DELETE, TRUNCATE
- Contains actor, action, resource, correlation, timestamp
- Never contains tokens, passwords, invitation tokens, or raw secrets
- Administrative operations are explicitly marked

### Mock Identity Provider (DEVELOPMENT ONLY)

- Available ONLY when DEMO_MODE=true AND NODE_ENV ≠ production
- Issues tokens that identity-service validates normally
- Uses a known test issuer that production rejects
- Test keys are ephemeral (not committed)
- Mock provider CANNOT start in production

---

## Data Classification

| Data                   | Classification | Handling                                 |
| ---------------------- | -------------- | ---------------------------------------- |
| Private signing key    | RESTRICTED     | KMS only; never in config/logs           |
| Refresh token (raw)    | RESTRICTED     | Never stored; hash only                  |
| Invitation token (raw) | RESTRICTED     | Never stored; hash only; never logged    |
| OIDC client secret     | RESTRICTED     | Secrets manager; never in code           |
| Access token (JWT)     | CONFIDENTIAL   | Memory only; HTTPS; short-lived          |
| User email             | CONFIDENTIAL   | Profile data; never identity key         |
| Session metadata       | INTERNAL       | Minimal PII; privacy-reviewed            |
| Audit records          | INTERNAL       | Append-only; redacted secrets            |
| Role assignments       | INTERNAL       | Server-controlled; not client-modifiable |
| Public JWKS            | PUBLIC         | Served over HTTPS; cacheable             |
| Permission identifiers | PUBLIC         | Stable identifiers; no secrets           |

---

## Value Trust Levels

| Value                                 | Source                                    | Trust Level                         |
| ------------------------------------- | ----------------------------------------- | ----------------------------------- |
| JWT signature                         | Cryptographic verification                | VALIDATED                           |
| JWT claims (after signature check)    | identity-service issued                   | VALIDATED                           |
| Path parameter tenant_id              | Client request                            | UNTRUSTED (must verify membership)  |
| Request body                          | Client                                    | UNTRUSTED (must validate with Zod)  |
| app.tenant_id (DB session)            | Server-derived from validated JWT         | CONTROLLED                          |
| app.is_admin (DB session)             | Server-derived from backend authorization | CONTROLLED                          |
| External ID token (before validation) | Network                                   | UNTRUSTED                           |
| External ID token (after validation)  | Verified against IdP JWKS                 | VALIDATED                           |
| Refresh token cookie                  | Browser                                   | UNTRUSTED (verify hash against DB)  |
| Invitation token in URL               | Email link                                | UNTRUSTED (verify hash; single-use) |
