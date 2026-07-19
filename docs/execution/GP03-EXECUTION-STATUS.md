# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.3 — Tokens, Sessions, Signing Keys (IN PROGRESS)

## Current State

| Field                   | Value                                            |
| ----------------------- | ------------------------------------------------ |
| Current branch          | master                                           |
| GP-03.3 latest          | 58eca41                                          |
| Working tree            | clean (git status --porcelain returns no output) |
| Unit tests              | 141 passing (13 test files)                      |
| Integration tests       | 56 passing (4 test files)                        |
| OpenAPI validation      | 13 checks, 27 routes                             |
| Docker                  | identity 14/14, platform 15/15                   |
| Build                   | 15/15                                            |
| Typecheck               | 24/24                                            |
| Lint                    | 24/24 (0 errors, 4 pre-existing warnings)        |
| DEMO-01                 | demo:verify passes                               |
| Platform integration    | 34/34                                            |
| Identity integration    | 56/56 (3/3 deterministic consecutive runs)       |
| Testing pkg integration | 8/8                                              |

## GP-03.3 Commit History

| Commit  | Description                                                           |
| ------- | --------------------------------------------------------------------- |
| 15fc298 | User authorization-version enforcement during refresh                 |
| 7eec78c | Session persistence, replay, and concurrent refresh safety            |
| 1213d94 | Durable refresh-token lineage with historical replay detection        |
| 591c5a8 | Production RS256 token guard and startup safety tests                 |
| dd55abe | Membership authorization-version enforcement during refresh           |
| c3ed77c | Execution status update                                               |
| dd5572a | Resolve untracked file (gitignore)                                    |
| 71f7da7 | Live session-state enforcement from PostgreSQL with integration tests |
| 58eca41 | Prettier formatting applied                                           |

## Proven Security Controls

### Durable Refresh Token Lineage (commit 1213d94)

- Migration `005_refresh_token_lineage.sql` creates `identity.auth_refresh_tokens`
- Token statuses: ACTIVE, ROTATED, REVOKED, EXPIRED, COMPROMISED
- SHA-256 hash uniqueness enforced at database level
- Parent-child lineage chain with `parent_token_id`
- FOR UPDATE row locking on token lookup
- Raw tokens never stored

### Historical Replay Detection (commit 1213d94)

- **Proven:** A→B then replay A = AUTH_REFRESH_REPLAY
- **Proven:** A→B→C then replay B = AUTH_REFRESH_REPLAY
- **Proven:** Family-wide compromise (all tokens → COMPROMISED)
- **Proven:** Session marked COMPROMISED
- **Proven:** Successor token C becomes unusable after compromise
- **Proven:** No new token issued on replay
- **Proven:** Audit record written (no token hashes in payload)
- **Proven:** Outbox event emitted (no token hashes in payload)
- **Proven:** Compromise state committed before error surfaced (durable)
- **Proven:** Unknown random token returns AUTH_REFRESH_INVALID (not REPLAY)

### Concurrent Refresh Safety (commit 1213d94)

- **Proven:** FOR UPDATE lock prevents duplicate successors
- **Proven:** At most one rotation succeeds for a single token
- **Proven:** Competing request detects ROTATED → replay/compromise
- **Proven:** Family ends compromised after concurrent replay
- **Proven:** No two usable successor tokens remain
- **Proven:** Deterministic outcome (3/3 consecutive runs)

### Production RS256 Token Guard (commit 591c5a8)

- **Proven:** Valid RS256 token accepted
- **Proven:** alg=none rejected (InvalidTokenError)
- **Proven:** HS256 confusion attack rejected (InvalidTokenError)
- **Proven:** Unknown kid rejected (InvalidTokenError)
- **Proven:** Missing kid rejected (InvalidTokenError)
- **Proven:** Wrong issuer rejected (InvalidTokenError)
- **Proven:** Wrong audience rejected (InvalidTokenError)
- **Proven:** Expired token rejected (TokenExpiredError)
- **Proven:** Missing subject rejected (InvalidTokenError)
- **Proven:** Missing session identifier rejected (InvalidTokenError)
- **Proven:** Random string rejected (InvalidTokenError)
- **Proven:** Modified signature rejected (InvalidTokenError)
- **Proven:** Empty token rejected (InvalidTokenError)

### Demo Adapter Isolation (commit 591c5a8)

- DemoTokenValidator used only when DEMO_MODE=true in non-production
- Production module startup rejects DEMO_MODE=true
- Production guard never delegates to demo adapter
- Fallback to demo requires explicit development/test NODE_ENV

### Production Startup Safety (commit 591c5a8)

- **Proven:** DEMO_MODE=true in production → startup failure
- **Proven:** DEMO_MODE without DEMO_AUTH_SECRET → failure
- **Proven:** DEMO_AUTH_SECRET < 32 chars → failure
- **Proven:** Missing DATABASE_URL in production → failure
- **Proven:** Missing TOKEN_ISSUER in production → failure
- **Proven:** Missing TOKEN_AUDIENCE in production → failure
- **Proven:** Valid development config accepted
- **Proven:** Valid test config accepted

### Live Session-State Enforcement (commit 71f7da7)

- **Proven:** ACTIVE session → accepted
- **Proven:** REVOKED session → AUTH_SESSION_REVOKED (immediate)
- **Proven:** COMPROMISED session → AUTH_SESSION_COMPROMISED (immediate)
- **Proven:** Expired session (beyond absolute lifetime) → AUTH_SESSION_EXPIRED
- **Proven:** Nonexistent session ID → AUTH_TOKEN_INVALID
- **Proven:** Wrong user for session → AUTH_TOKEN_INVALID
- **Proven:** Immediate revocation reflected (database state, not cached)
- **Proven:** Token claims cannot override session state
- **Proven:** No JWT claim activates app.is_admin

**Revocation guarantee:** Identity-service endpoints using live session validation
reject revoked sessions immediately. Services performing only offline JWT
validation remain bounded by the 15-minute access-token lifetime until shared
live validation or introspection is implemented.

### Authorization Version Enforcement (commits 15fc298, dd55abe)

- **Proven:** Suspended user → AUTH_USER_SUSPENDED
- **Proven:** Deactivated user → AUTH_USER_DEACTIVATED
- **Proven:** Suspended membership → AUTH_MEMBERSHIP_SUSPENDED
- **Proven:** Deactivated membership → AUTH_MEMBERSHIP_DEACTIVATED
- **Proven:** Stale membership version → AUTH_MEMBERSHIP_VERSION_STALE

## Known Gaps (GP-03.3 not yet closed)

1. **Local full authentication verification script** — `local:verify` not yet implemented
2. **Exact coverage report** — workspace-level `pnpm coverage` not yet run
3. **format:check** — pre-existing `playwright-report/index.html` issue (not GP-03.3)
4. **KMS signing provider** — deferred to GP-15 (infrastructure). Production throws on
   unsupported reference; cannot silently use development key.
5. **Membership enforcement through production guard integration test** — proven in
   refresh command internals, guard wiring proven through session-state validator

## GP-03.3 Remaining Work

- [ ] Local full auth flow verification script (`local:verify`)
- [ ] Exact coverage evidence
- [ ] Final documentation commit

## Previous Phases

- GP-03.0: 6098d85 (threat model)
- GP-03.1: 4157886 (service skeleton + schema)
- GP-03.2: 4f80b6e (memberships + permissions)
