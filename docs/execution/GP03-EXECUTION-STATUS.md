# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.3 — Tokens, Sessions, Signing Keys (Complete)

## Current State

| Field                | Value                                            |
| -------------------- | ------------------------------------------------ |
| Current branch       | master                                           |
| GP-03.3 latest       | dd55abe                                          |
| Working tree         | clean                                            |
| Unit tests           | 141 passing                                      |
| Integration tests    | 47 passing (31 prior + 16 session lineage tests) |
| OpenAPI validation   | 13 checks, 27 routes                             |
| Docker               | identity 14/14, platform 15/15                   |
| Build                | 15/15                                            |
| DEMO-01              | 20 E2E + 103 frontend + 117 backend — green      |
| Platform integration | 34/34                                            |
| Identity integration | 47/47                                            |

## GP-03.3 Completed Work

### Durable Refresh Token Lineage (commit 1213d94)

- Forward migration `005_refresh_token_lineage.sql` creates `identity.auth_refresh_tokens`
- Lineage table tracks: id, session_id, token_family_id, token_hash, parent_token_id, status
- Token statuses: ACTIVE, ROTATED, REVOKED, EXPIRED, COMPROMISED
- Repository: `PostgresRefreshTokenRepository` with FOR UPDATE locking
- Domain: `RefreshToken` entity with create, rotate, compromise operations
- Session commands updated to use lineage for all operations

### Historical Replay Detection (commit 1213d94)

- Replaying a ROTATED token → AUTH_REFRESH_REPLAY
- Family-wide compromise: all ACTIVE/ROTATED tokens → COMPROMISED
- Session marked COMPROMISED
- Successor tokens become unusable
- Security audit record written (no token hashes in payload)
- Outbox event emitted (no token hashes in payload)
- Compromise state is committed before error is thrown (durable)

### Concurrent Refresh Safety (commit 1213d94)

- FOR UPDATE row lock on refresh token record
- At most one successful rotation per token
- Second concurrent request detects ROTATED → triggers replay/compromise
- No duplicate active refresh hashes possible
- Deterministic outcome after concurrent replay attempts

### Production RS256 Token Guard (commit 591c5a8)

- `PlatformTokenValidator` validates CareCareer-issued RS256 JWTs
- Validates: algorithm (RS256 only), kid, issuer, audience, expiration, nbf
- Rejects: alg=none, HS256 confusion, unknown kid, modified signatures
- Resolves signing keys from PostgreSQL signing_keys table
- Uses jose library for cryptographic verification
- Never activates database administrative context
- DemoTokenValidator isolated to development/test only

### Production Startup Safety (commit 591c5a8)

- DEMO_MODE=true rejected in production (Zod schema + module resolver)
- TOKEN_ISSUER and TOKEN_AUDIENCE required in production
- DATABASE_URL required for production token validation
- DEMO_AUTH_SECRET must be 32+ chars when DEMO_MODE is enabled
- Config validation tests prove rejection patterns

### Membership Authorization Version Enforcement (commit dd55abe)

- Session domain extended with: selectedTenantId, membershipId, userAuthorizationVersion, membershipAuthorizationVersion
- Refresh validates membership status (ACTIVE required)
- Refresh validates membership authorization version (stale version rejected)
- Membership suspension → AUTH_MEMBERSHIP_SUSPENDED
- Membership deactivation → AUTH_MEMBERSHIP_DEACTIVATED
- Stale membership version → AUTH_MEMBERSHIP_VERSION_STALE

### User Authorization Version Enforcement (commit 15fc298)

- Refresh rejects suspended users: AUTH_USER_SUSPENDED
- Refresh rejects deactivated users: AUTH_USER_DEACTIVATED
- Proven with real PostgreSQL integration tests

## GP-03.3 Session Security Tests

| Test                                                        | Result |
| ----------------------------------------------------------- | ------ |
| Session creation with audit + outbox + lineage atomically   | PASS   |
| No raw refresh tokens stored                                | PASS   |
| Refresh token rotation with lineage tracking                | PASS   |
| Lineage parent_token_id chain preserved                     | PASS   |
| Absolute expiry not extended on refresh                     | PASS   |
| Historical replay A→B then replay A = AUTH_REFRESH_REPLAY   | PASS   |
| Historical replay A→B→C then replay B = AUTH_REFRESH_REPLAY | PASS   |
| Token C unusable after family compromise                    | PASS   |
| Unknown random token = AUTH_REFRESH_INVALID (not REPLAY)    | PASS   |
| Concurrent refresh: no duplicate successors                 | PASS   |
| Concurrent replay: family compromised, successor unusable   | PASS   |
| Audit record for compromise (no token hashes)               | PASS   |
| Outbox event for compromise (no token hashes)               | PASS   |
| Logout revokes session + token lineage                      | PASS   |
| Logout is idempotent                                        | PASS   |
| Logout-all revokes all sessions + lineage                   | PASS   |
| Five-session limit enforced                                 | PASS   |
| Transaction rollback on failure (no partial records)        | PASS   |
| Suspended user rejected on refresh                          | PASS   |
| Deactivated user rejected on refresh                        | PASS   |

## GP-03.3 Platform Token Validator Tests

| Test                                | Result |
| ----------------------------------- | ------ |
| Valid RS256 token accepted          | PASS   |
| alg=none rejected                   | PASS   |
| HS256 confusion attack rejected     | PASS   |
| Unknown kid rejected                | PASS   |
| Missing kid rejected                | PASS   |
| Wrong issuer rejected               | PASS   |
| Wrong audience rejected             | PASS   |
| Expired token rejected              | PASS   |
| Missing subject rejected            | PASS   |
| Missing session identifier rejected | PASS   |
| Random string rejected              | PASS   |
| Modified signature rejected         | PASS   |
| Empty token rejected                | PASS   |

## GP-03.3 Startup Safety Tests

| Test                                                | Result |
| --------------------------------------------------- | ------ |
| DEMO_MODE=true rejected in production               | PASS   |
| DEMO_MODE=true allowed in development               | PASS   |
| DEMO_MODE=true allowed in test                      | PASS   |
| DEMO_MODE without DEMO_AUTH_SECRET rejected         | PASS   |
| DEMO_AUTH_SECRET < 32 chars rejected                | PASS   |
| Missing DATABASE_URL rejected                       | PASS   |
| Module rejects DEMO_MODE in production env          | PASS   |
| Module rejects missing TOKEN_ISSUER in production   | PASS   |
| Module rejects missing TOKEN_AUDIENCE in production | PASS   |

## GP-03.3 Remaining

- [x] Durable refresh-token lineage
- [x] Historical replay detection with family compromise
- [x] Concurrent refresh safety
- [x] Production RS256 token guard
- [x] Demo adapter isolation
- [x] Production startup safety tests
- [x] User authorization-version enforcement
- [x] Membership authorization-version enforcement
- [ ] Local full auth flow verification script (deferred to final commit)
- [ ] Final GP-03.3 documentation update

## Previous Phases

- GP-03.0: 6098d85 (threat model)
- GP-03.1: 4157886 (service skeleton + schema)
- GP-03.2: 4f80b6e (memberships + permissions)
