# GP-03 Identity Service — Threat Model

## Scope

This threat model covers the identity-service and its interactions with external identity providers, the platform-service, browsers, and PostgreSQL.

---

## Threats

### T01: Forged External Identity Token

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| Asset          | User authentication                                              |
| Actor          | External attacker                                                |
| Entry point    | POST /v1/auth/exchange                                           |
| Attack path    | Submit a crafted ID token with arbitrary claims                  |
| Trust boundary | External IdP → identity-service                                  |
| Preventive     | Validate signature against IdP JWKS; verify iss, aud, exp, nonce |
| Detective      | Log rejected tokens with issuer mismatch                         |
| Recovery       | No state change on rejection                                     |
| Test           | Submit token signed by unknown key → 401                         |
| Residual risk  | Compromised IdP signing key                                      |
| Severity       | Critical                                                         |
| Likelihood     | Low                                                              |

### T02: Incorrect Issuer Validation

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| Asset          | Identity trust                                       |
| Actor          | External attacker                                    |
| Entry point    | POST /v1/auth/exchange                               |
| Attack path    | Present valid token from unauthorized issuer         |
| Trust boundary | External IdP → identity-service                      |
| Preventive     | Issuer allowlist; reject tokens from unknown issuers |
| Detective      | Audit log of rejected issuers                        |
| Recovery       | No state change                                      |
| Test           | Token from valid but non-allowlisted issuer → 401    |
| Residual risk  | Allowlist misconfiguration                           |
| Severity       | High                                                 |
| Likelihood     | Low                                                  |

### T03: Incorrect Audience Validation

| Field          | Value                                            |
| -------------- | ------------------------------------------------ |
| Asset          | Token scope                                      |
| Actor          | External attacker or misconfigured client        |
| Entry point    | POST /v1/auth/exchange                           |
| Attack path    | Present token intended for different application |
| Trust boundary | External IdP → identity-service                  |
| Preventive     | Validate aud claim matches configured audience   |
| Detective      | Log rejected audience mismatches                 |
| Recovery       | No state change                                  |
| Test           | Token with wrong audience → 401                  |
| Residual risk  | Audience misconfiguration                        |
| Severity       | High                                             |
| Likelihood     | Low                                              |

### T04: Algorithm Confusion

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Asset          | Token verification                                                    |
| Actor          | External attacker                                                     |
| Entry point    | Token verification path                                               |
| Attack path    | Set alg=none or alg=HS256 with public key as secret                   |
| Trust boundary | Token → verification logic                                            |
| Preventive     | Hardcoded allowed algorithms; never trust alg from token header alone |
| Detective      | Log rejected algorithm attempts                                       |
| Recovery       | No state change                                                       |
| Test           | Token with alg=none → rejected; token with unexpected alg → rejected  |
| Residual risk  | Implementation bug in JWT library                                     |
| Severity       | Critical                                                              |
| Likelihood     | Low                                                                   |

### T05: Unknown Signing Key

| Field          | Value                                          |
| -------------- | ---------------------------------------------- |
| Asset          | Token authenticity                             |
| Actor          | External attacker                              |
| Entry point    | Any authenticated endpoint                     |
| Attack path    | Present JWT signed by key not in JWKS          |
| Trust boundary | Client → service                               |
| Preventive     | Verify kid against current + overlap keys only |
| Detective      | Log unknown kid attempts                       |
| Recovery       | No state change                                |
| Test           | Token with unknown kid → 401                   |
| Residual risk  | None (deterministic rejection)                 |
| Severity       | High                                           |
| Likelihood     | Medium                                         |

### T06: Signing-Key Compromise

| Field          | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| Asset          | All platform tokens                                                                 |
| Actor          | Insider or infrastructure compromise                                                |
| Entry point    | Key storage (KMS, secrets manager)                                                  |
| Attack path    | Extract private key, forge arbitrary tokens                                         |
| Trust boundary | Key storage → signing service                                                       |
| Preventive     | KMS with access logging; key never in app config; rotation capability               |
| Detective      | KMS access alerts; anomalous token patterns                                         |
| Recovery       | Immediate key rotation; revoke all sessions; force re-authentication                |
| Test           | Rotated key: old key rejected for signing, accepted for verification during overlap |
| Residual risk  | Time between compromise and detection                                               |
| Severity       | Critical                                                                            |
| Likelihood     | Very Low                                                                            |

### T07: Stolen Access Token

| Field          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Asset          | User session                                                              |
| Actor          | Network attacker, XSS                                                     |
| Entry point    | Network interception, client-side script                                  |
| Attack path    | Capture JWT from memory or network, replay within 15-min window           |
| Trust boundary | Browser → API                                                             |
| Preventive     | HTTPS only; 15-min lifetime; no localStorage; authorization-version check |
| Detective      | Unusual IP/user-agent patterns                                            |
| Recovery       | Token expires quickly; session revocation invalidates refresh             |
| Test           | Expired token → 401; stale auth-version → 401                             |
| Residual risk  | 15-minute window of valid token use                                       |
| Severity       | High                                                                      |
| Likelihood     | Low                                                                       |

### T08: Stolen Refresh Token

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| Asset          | Session persistence                                                    |
| Actor          | XSS, device theft                                                      |
| Entry point    | httpOnly cookie extraction (requires severe vulnerability)             |
| Attack path    | Use stolen refresh token to obtain new access tokens                   |
| Trust boundary | Browser → identity-service                                             |
| Preventive     | httpOnly + Secure + SameSite=Strict; token rotation; family tracking   |
| Detective      | Refresh from unexpected client metadata                                |
| Recovery       | Session revocation; family revocation on replay                        |
| Test           | Revoked session refresh → rejected; old rotated token → family revoked |
| Residual risk  | Single use before detection                                            |
| Severity       | High                                                                   |
| Likelihood     | Low                                                                    |

### T09: Refresh-Token Replay

| Field          | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Asset          | Session integrity                                                        |
| Actor          | Attacker with previously valid refresh token                             |
| Entry point    | POST /v1/auth/refresh                                                    |
| Attack path    | Reuse a refresh token that has already been rotated                      |
| Trust boundary | Client → identity-service                                                |
| Preventive     | Token rotation; each token single-use; family tracking                   |
| Detective      | Replay attempt triggers family revocation + alert                        |
| Recovery       | Entire token family revoked; user must re-authenticate                   |
| Test           | Use old refresh token after rotation → family revoked; new refresh fails |
| Residual risk  | Race condition within rotation window                                    |
| Severity       | High                                                                     |
| Likelihood     | Medium                                                                   |

### T10: Session Fixation

| Field          | Value                                                                         |
| -------------- | ----------------------------------------------------------------------------- |
| Asset          | User session                                                                  |
| Actor          | Attacker pre-setting session state                                            |
| Entry point    | OIDC callback                                                                 |
| Attack path    | Force victim to use attacker-controlled state/nonce                           |
| Trust boundary | Browser → identity-service                                                    |
| Preventive     | Server-generated state + nonce; validate on callback; bind to browser session |
| Detective      | State mismatch logging                                                        |
| Recovery       | Reject callback; no session created                                           |
| Test           | Callback with wrong state → rejected                                          |
| Residual risk  | None (deterministic rejection)                                                |
| Severity       | High                                                                          |
| Likelihood     | Low                                                                           |

### T11: CSRF During OIDC Callback

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Asset          | User authentication                                               |
| Actor          | Attacker-controlled page                                          |
| Entry point    | GET /auth/callback                                                |
| Attack path    | Trick user into visiting callback URL with attacker's code        |
| Trust boundary | Browser → identity-service                                        |
| Preventive     | State parameter bound to user's browser session; SameSite cookies |
| Detective      | State validation failure logging                                  |
| Recovery       | No session created                                                |
| Test           | Callback without valid state → rejected                           |
| Residual risk  | None                                                              |
| Severity       | Medium                                                            |
| Likelihood     | Low                                                               |

### T12: Missing State Validation

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| Asset          | OIDC flow integrity                                         |
| Actor          | External attacker                                           |
| Entry point    | OIDC callback                                               |
| Attack path    | Omit or forge state parameter                               |
| Trust boundary | IdP → identity-service                                      |
| Preventive     | Mandatory state validation; reject if missing or mismatched |
| Detective      | Log missing state attempts                                  |
| Recovery       | No state change                                             |
| Test           | Callback without state → 400; mismatched state → 400        |
| Residual risk  | None                                                        |
| Severity       | Medium                                                      |
| Likelihood     | Low                                                         |

### T13: Missing Nonce Validation

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Asset          | Token freshness                                           |
| Actor          | Replay attacker                                           |
| Entry point    | Token validation                                          |
| Attack path    | Replay previously issued ID token                         |
| Trust boundary | IdP → identity-service                                    |
| Preventive     | Include nonce in auth request; validate nonce in ID token |
| Detective      | Nonce mismatch logging                                    |
| Recovery       | No session created                                        |
| Test           | ID token with wrong nonce → rejected                      |
| Residual risk  | None                                                      |
| Severity       | Medium                                                    |
| Likelihood     | Low                                                       |

### T14: PKCE Downgrade

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| Asset          | Authorization code                                            |
| Actor          | Network attacker                                              |
| Entry point    | Authorization request                                         |
| Attack path    | Intercept auth code when PKCE not enforced                    |
| Trust boundary | Browser → IdP → identity-service                              |
| Preventive     | Always send code_challenge; require code_verifier on exchange |
| Detective      | Exchange without verifier logged and rejected                 |
| Recovery       | Code unusable without verifier                                |
| Test           | Exchange without code_verifier → rejected                     |
| Residual risk  | IdP not enforcing PKCE (configuration issue)                  |
| Severity       | Medium                                                        |
| Likelihood     | Low                                                           |

### T15: Account Enumeration

| Field          | Value                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------ |
| Asset          | User privacy                                                                               |
| Actor          | External attacker                                                                          |
| Entry point    | Invitation acceptance, login                                                               |
| Attack path    | Probe endpoints to discover which emails have accounts                                     |
| Trust boundary | Browser → identity-service                                                                 |
| Preventive     | Generic error messages; same response time for existing/non-existing; OIDC delegates login |
| Detective      | Rate limiting; anomalous probe patterns                                                    |
| Recovery       | Rate limit triggered                                                                       |
| Test           | Accept invitation for unknown email → same generic response as known                       |
| Residual risk  | Timing side-channels                                                                       |
| Severity       | Medium                                                                                     |
| Likelihood     | Medium                                                                                     |

### T16: Automatic Email-Based Account Linking

| Field          | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Asset          | Account integrity                                                               |
| Actor          | Attacker controlling email at different IdP                                     |
| Entry point    | Identity linking logic                                                          |
| Attack path    | Register same email at different IdP, get auto-linked to victim's account       |
| Trust boundary | External IdP → identity-service                                                 |
| Preventive     | NEVER auto-link by email; require auth to both identities or admin intervention |
| Detective      | Audit of linking events                                                         |
| Recovery       | Admin can unlink; user can report                                               |
| Test           | New identity with matching email → separate user created, NOT linked            |
| Residual risk  | None (auto-linking prohibited)                                                  |
| Severity       | Critical                                                                        |
| Likelihood     | Medium                                                                          |

### T17: Invitation-Token Leakage

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| Asset          | Invitation security                                                    |
| Actor          | Log reader, email interceptor                                          |
| Entry point    | Logging, audit, email                                                  |
| Attack path    | Extract invitation token from logs or transit                          |
| Trust boundary | Identity-service → logging/audit                                       |
| Preventive     | Store only hash; never log token; never in audit; HTTPS for email link |
| Detective      | Token usage monitoring                                                 |
| Recovery       | Revoke invitation; token single-use limits damage                      |
| Test           | Verify token not present in logs, audit, or outbox events              |
| Residual risk  | Email interception (out of scope)                                      |
| Severity       | High                                                                   |
| Likelihood     | Low                                                                    |

### T18: Invitation Replay

| Field          | Value                                               |
| -------------- | --------------------------------------------------- |
| Asset          | Membership integrity                                |
| Actor          | Attacker with captured token                        |
| Entry point    | POST /v1/invitations/:token/accept                  |
| Attack path    | Use invitation token multiple times                 |
| Trust boundary | Browser → identity-service                          |
| Preventive     | Single-use tokens; mark ACCEPTED after first use    |
| Detective      | Replay attempt logging                              |
| Recovery       | No additional membership created                    |
| Test           | Accept same invitation twice → second attempt fails |
| Residual risk  | None (deterministic)                                |
| Severity       | Medium                                              |
| Likelihood     | Low                                                 |

### T19: Cross-Tenant Membership Access

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Asset          | Tenant isolation                                                  |
| Actor          | Authenticated user in different tenant                            |
| Entry point    | GET /v1/tenants/:id/members                                       |
| Attack path    | Query members of a tenant the user doesn't belong to              |
| Trust boundary | Tenant A context → Tenant B data                                  |
| Preventive     | RLS on tenant_memberships; verify active membership before switch |
| Detective      | RLS violation would return empty; audit of attempts               |
| Recovery       | No data exposed                                                   |
| Test           | User in Tenant A queries Tenant B members → 404 or empty          |
| Residual risk  | None (RLS enforced)                                               |
| Severity       | High                                                              |
| Likelihood     | Medium                                                            |

### T20: Tenant-Admin Privilege Escalation

| Field          | Value                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| Asset          | Platform integrity                                                                            |
| Actor          | Tenant administrator                                                                          |
| Entry point    | Role assignment API                                                                           |
| Attack path    | Tenant admin assigns themselves PLATFORM_ADMIN                                                |
| Trust boundary | Tenant scope → Platform scope                                                                 |
| Preventive     | Tenant admins can only assign tenant-scoped roles; platform roles require platform-admin path |
| Detective      | Audit of role assignments with scope validation                                               |
| Recovery       | Unauthorized assignment rejected                                                              |
| Test           | Tenant admin assigns platform role → 403                                                      |
| Residual risk  | None (scope enforced)                                                                         |
| Severity       | Critical                                                                                      |
| Likelihood     | Medium                                                                                        |

### T21: Platform-Admin Privilege Escalation via JWT

| Field          | Value                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Asset          | Database administrative access                                                                                      |
| Actor          | Attacker with crafted token                                                                                         |
| Entry point    | Any controller                                                                                                      |
| Attack path    | Include platform_roles: ["PLATFORM_ADMIN"] in forged token to trigger app.is_admin                                  |
| Trust boundary | Token claims → database session                                                                                     |
| Preventive     | Token claim NEVER directly sets app.is_admin; server-side role lookup required; only AdministrativeDatabase sets it |
| Detective      | Admin-path audit; no admin operations without explicit service                                                      |
| Recovery       | Forged token rejected at signature verification                                                                     |
| Test           | Valid token with platform_roles claim → does NOT enable admin DB context in tenant controllers                      |
| Residual risk  | None (architectural separation)                                                                                     |
| Severity       | Critical                                                                                                            |
| Likelihood     | Low                                                                                                                 |

### T22: RLS Context Spoofing

| Field          | Value                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Asset          | Tenant data isolation                                                                                                 |
| Actor          | Application-level bug                                                                                                 |
| Entry point    | Tenant-aware transaction                                                                                              |
| Attack path    | Set app.tenant_id to a different tenant's ID                                                                          |
| Trust boundary | Application → PostgreSQL session                                                                                      |
| Preventive     | TenantAwareTransaction derives tenant_id from validated JWT, not user input; path params validated against membership |
| Detective      | Cross-tenant query patterns in slow-query logs                                                                        |
| Recovery       | RLS blocks; no data returned                                                                                          |
| Test           | TenantAwareTransaction with non-matching tenant_id → empty results (RLS)                                              |
| Residual risk  | Application bug setting wrong tenant context                                                                          |
| Severity       | Critical                                                                                                              |
| Likelihood     | Very Low                                                                                                              |

### T23: Database-Role Misuse

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Asset          | Database security                                                 |
| Actor          | Insider or compromised service                                    |
| Entry point    | Database connection                                               |
| Attack path    | Runtime role attempts operations beyond grants                    |
| Trust boundary | Application → PostgreSQL                                          |
| Preventive     | Minimal grants; NOINHERIT; no BYPASSRLS on runtime role           |
| Detective      | PostgreSQL permission-denied logs                                 |
| Recovery       | Operation rejected by PostgreSQL                                  |
| Test           | Runtime role cannot SET app.is_admin; cannot DELETE audit_records |
| Residual risk  | Database misconfiguration                                         |
| Severity       | High                                                              |
| Likelihood     | Very Low                                                          |

### T24: Stale Authorization Token

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| Asset          | Authorization freshness                                                     |
| Actor          | User whose permissions were revoked                                         |
| Entry point    | Any authenticated endpoint                                                  |
| Attack path    | Continue using token after role/membership change                           |
| Trust boundary | Token issuance time → current authorization state                           |
| Preventive     | Authorization versions in token; live check on refresh; 60s cache max       |
| Detective      | Stale version rejections logged                                             |
| Recovery       | User must re-authenticate; token naturally expires in ≤15 min               |
| Test           | Change role → existing token with old version rejected on next verification |
| Residual risk  | Up to 60s cache window for non-sensitive operations                         |
| Severity       | Medium                                                                      |
| Likelihood     | High                                                                        |

### T25: Suspended Membership Continuing Access

| Field          | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Asset          | Tenant access control                                                          |
| Actor          | Suspended user                                                                 |
| Entry point    | Any tenant-scoped endpoint                                                     |
| Attack path    | Use existing access token after membership suspension                          |
| Trust boundary | Token → membership state                                                       |
| Preventive     | Membership authorization_version in token; version check; short token lifetime |
| Detective      | Stale-version rejections                                                       |
| Recovery       | Token expires in ≤15 min; refresh rejected immediately                         |
| Test           | Suspend membership → refresh with old version → rejected                       |
| Residual risk  | 15-min access window (mitigated by live check on sensitive ops)                |
| Severity       | Medium                                                                         |
| Likelihood     | High                                                                           |

### T26: Deactivated User Continuing Access

| Field          | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Asset          | Platform access                                                                 |
| Actor          | Deactivated user                                                                |
| Entry point    | POST /v1/auth/refresh                                                           |
| Attack path    | Attempt to refresh token after user deactivation                                |
| Trust boundary | Token → user state                                                              |
| Preventive     | User authorization_version check on refresh; session revocation on deactivation |
| Detective      | Rejected refresh attempts logged                                                |
| Recovery       | All sessions revoked on deactivation                                            |
| Test           | Deactivate user → existing sessions revoked → refresh fails                     |
| Residual risk  | 15-min window for existing access tokens                                        |
| Severity       | High                                                                            |
| Likelihood     | Medium                                                                          |

### T27: Tenant Deactivation Not Taking Effect

| Field          | Value                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Asset          | Tenant isolation                                                                               |
| Actor          | Deactivated tenant members                                                                     |
| Entry point    | Any tenant-scoped endpoint                                                                     |
| Attack path    | Continue accessing tenant after it's deactivated                                               |
| Trust boundary | Token → tenant state                                                                           |
| Preventive     | Tenant-status check in auth pipeline; increment all membership versions on tenant deactivation |
| Detective      | Tenant status guard rejections logged                                                          |
| Recovery       | All memberships for tenant deactivated                                                         |
| Test           | Deactivate tenant → switch-tenant rejected; existing token → tenant guard rejects              |
| Residual risk  | 60s cache window                                                                               |
| Severity       | High                                                                                           |
| Likelihood     | Low                                                                                            |

### T28: Demo Authentication Enabled in Production

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| Asset          | Production security                                                  |
| Actor          | Misconfigured deployment                                             |
| Entry point    | POST /v1/auth/demo/token                                             |
| Attack path    | Demo endpoint accessible in production, bypassing real auth          |
| Trust boundary | Configuration → runtime behavior                                     |
| Preventive     | Config validation rejects DEMO_MODE in production at startup (crash) |
| Detective      | Startup failure is immediate and visible                             |
| Recovery       | Fix configuration; redeploy                                          |
| Test           | NODE_ENV=production + DEMO_MODE=true → startup failure               |
| Residual risk  | None (fail-fast)                                                     |
| Severity       | Critical                                                             |
| Likelihood     | Low                                                                  |

### T29: Mock OIDC Enabled in Production

| Field          | Value                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Asset          | Production authentication                                               |
| Actor          | Misconfigured deployment                                                |
| Entry point    | OIDC provider configuration                                             |
| Attack path    | Mock IdP issuer accepted in production                                  |
| Trust boundary | Configuration → trust                                                   |
| Preventive     | Production issuer allowlist excludes mock; startup validation           |
| Detective      | Unknown issuer rejections                                               |
| Recovery       | Configuration fix                                                       |
| Test           | Production config with mock issuer → startup failure or issuer rejected |
| Residual risk  | None                                                                    |
| Severity       | Critical                                                                |
| Likelihood     | Very Low                                                                |

### T30: Tokens or Secrets in Logs/Audit

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| Asset          | Credential confidentiality                                       |
| Actor          | Log reader, insider                                              |
| Entry point    | Application logging, audit records                               |
| Attack path    | Extract tokens, keys, or invitation tokens from logs             |
| Trust boundary | Application → observability                                      |
| Preventive     | Never log tokens, secrets, invitation tokens; redact in audit    |
| Detective      | Log scanning for token patterns                                  |
| Recovery       | Rotate compromised credentials                                   |
| Test           | Grep logs/audit for JWT patterns, invitation tokens → none found |
| Residual risk  | Undiscovered logging of new fields                               |
| Severity       | High                                                             |
| Likelihood     | Low                                                              |

### T31: Audit-Record Tampering

| Field          | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Asset          | Audit integrity                                                                 |
| Actor          | Compromised application or insider                                              |
| Entry point    | Database                                                                        |
| Attack path    | UPDATE or DELETE audit records                                                  |
| Trust boundary | Application → database                                                          |
| Preventive     | REVOKE UPDATE, DELETE, TRUNCATE on audit_records from runtime role              |
| Detective      | Immutability tests; row-count monitoring                                        |
| Recovery       | Restore from backups; investigate                                               |
| Test           | Runtime role UPDATE audit → permission denied; DELETE audit → permission denied |
| Residual risk  | Database admin access                                                           |
| Severity       | High                                                                            |
| Likelihood     | Very Low                                                                        |

### T32: Session Concurrency Abuse

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| Asset          | Account security                                            |
| Actor          | Attacker with stolen credentials at IdP                     |
| Entry point    | POST /v1/auth/exchange                                      |
| Attack path    | Create many sessions to avoid detection or overwhelm limits |
| Trust boundary | IdP → identity-service                                      |
| Preventive     | Max 5 sessions; reject new session at limit; rate limiting  |
| Detective      | Session creation rate monitoring                            |
| Recovery       | User reviews sessions; admin revokes                        |
| Test           | Create 6th session → rejected with stable error             |
| Residual risk  | 5 concurrent compromised sessions                           |
| Severity       | Medium                                                      |
| Likelihood     | Low                                                         |

### T33: External Identity Takeover

| Field          | Value                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Asset          | User account                                                            |
| Actor          | Attacker who compromises IdP account                                    |
| Entry point    | OIDC login                                                              |
| Attack path    | Take over user's IdP account, authenticate as them                      |
| Trust boundary | External IdP → identity-service                                         |
| Preventive     | Out-of-scope (IdP responsibility); session revocation; admin can unlink |
| Detective      | Unusual login patterns; user report                                     |
| Recovery       | Admin suspends user; unlinks compromised identity                       |
| Test           | N/A (IdP-level compromise)                                              |
| Residual risk  | Depends on IdP security                                                 |
| Severity       | High                                                                    |
| Likelihood     | Low                                                                     |

### T34: Administrative Identity-Linking Abuse

| Field          | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Asset          | Account integrity                                                        |
| Actor          | Rogue platform admin                                                     |
| Entry point    | Administrative linking API                                               |
| Attack path    | Admin links attacker's identity to victim's account                      |
| Trust boundary | Admin privilege → identity modification                                  |
| Preventive     | Required reason; verification workflow; full audit; separation of duties |
| Detective      | Audit of all admin linking operations; anomaly detection                 |
| Recovery       | Unlink; investigate; suspend admin if malicious                          |
| Test           | Admin linking produces audit record with reason + actor + target         |
| Residual risk  | Single compromised admin (mitigated by audit trail)                      |
| Severity       | High                                                                     |
| Likelihood     | Very Low                                                                 |

### T35: JWKS Cache Poisoning

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Asset          | Token verification                                                |
| Actor          | Network attacker                                                  |
| Entry point    | JWKS endpoint caching                                             |
| Attack path    | Poison JWKS cache with attacker-controlled keys                   |
| Trust boundary | Identity-service JWKS → consuming services                        |
| Preventive     | HTTPS for JWKS; short cache TTL (5 min); verify kid matches       |
| Detective      | Key mismatch alerts                                               |
| Recovery       | Clear cache; re-fetch from authoritative source                   |
| Test           | Verify service fetches JWKS over HTTPS only; rejects unknown kids |
| Residual risk  | HTTPS compromise                                                  |
| Severity       | High                                                              |
| Likelihood     | Very Low                                                          |

### T36: DoS Through Token Exchange/Refresh

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Asset          | Service availability                                                  |
| Actor          | External attacker                                                     |
| Entry point    | Public auth endpoints                                                 |
| Attack path    | Flood exchange/refresh endpoints to exhaust resources                 |
| Trust boundary | Internet → identity-service                                           |
| Preventive     | Rate limiting per IP; per-user refresh rate limit; connection pooling |
| Detective      | Rate-limit triggers; abnormal traffic patterns                        |
| Recovery       | Rate limit blocks; auto-scaling if needed                             |
| Test           | Exceed rate limit → 429 response                                      |
| Residual risk  | Distributed attacks below per-IP threshold                            |
| Severity       | Medium                                                                |
| Likelihood     | Medium                                                                |

---

## Summary

| Severity | Count                                      |
| -------- | ------------------------------------------ |
| Critical | 7 (T01, T04, T06, T16, T20, T21, T28, T29) |
| High     | 14                                         |
| Medium   | 15                                         |

Total threats documented: **36**
