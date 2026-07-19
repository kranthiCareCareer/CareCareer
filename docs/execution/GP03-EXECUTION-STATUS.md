# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.3 — Tokens, Sessions, Signing Keys (In Progress)

## Current State

| Field                | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Current branch       | master                                                      |
| GP-03.0 final commit | 6098d85                                                     |
| GP-03.1 original     | 010f0ef                                                     |
| GP-03.1 closure      | 4157886                                                     |
| GP-03.2 commit       | 4f80b6e                                                     |
| Current slice        | GP-03.3 (domain + signing complete, HTTP endpoints pending) |
| Schema status        | 12 tables (added auth_sessions, signing_keys)               |
| API status           | 20 implemented, 7 more pending (refresh, logout, JWKS, me)  |
| Unit tests           | 105 passed                                                  |
| Integration tests    | 31 passed                                                   |

## GP-03.3 Progress

### Completed

- Migration 004: auth_sessions and signing_keys tables with grants
- SigningKey domain entity (create, rotate, revoke)
- AuthSession domain entity (create, rotate, revoke, verify, expiry check)
- Refresh-token generation (32 bytes cryptographically random)
- SHA-256 token hashing (no raw tokens stored)
- JWT signing service (RS256, kid, platform claims)
- JWT verification service (JWKS-based, clock skew tolerance)
- JWKS builder (includes ACTIVE + ROTATED, excludes REVOKED)
- RSA key pair generation for development/test
- Unit tests: 20 new tests proving session lifecycle + JWT signing/verification

### Next Tasks (resume here)

1. Auth controller: POST /v1/auth/refresh, POST /v1/auth/logout, POST /v1/auth/logout-all
2. Auth controller: GET /v1/auth/sessions, DELETE /v1/auth/sessions/{sessionId}
3. JWKS controller: GET /.well-known/jwks.json
4. Me controller: GET /v1/auth/me
5. Session repository (PostgreSQL)
6. Signing-key repository (PostgreSQL) with initialization
7. Authorization-version enforcement middleware
8. Maximum 5 sessions per user enforcement
9. Replay detection (old token → family revocation)
10. Integration tests for sessions and tokens
11. HTTP contract tests for auth endpoints
12. OpenAPI extension
13. Full GP-03.3 gate

## GP-03.2 Summary (Complete)

- Membership lifecycle: INVITED → ACTIVE → SUSPENDED → DEACTIVATED
- System roles: 5 seeded
- Permission derivation: deriveEffectivePermissions + derivePlatformPermissions
- Platform-role controls: admin path only, user auth_version incremented
- RLS: cross-tenant SELECT/UPDATE/INSERT blocked
- Administrative isolation: proven
- Integration tests: deterministic (3/3 platform runs)
- DEMO-01: all green

## Known Gaps

1. Auth HTTP endpoints not yet implemented (GP-03.3 in progress)
2. OIDC exchange not yet implemented (GP-03.4)
3. Invitations not yet implemented (GP-03.5)
4. Identity admin UI not yet built (GP-03.6)
5. Demo auth replacement not yet done (GP-03.7)
