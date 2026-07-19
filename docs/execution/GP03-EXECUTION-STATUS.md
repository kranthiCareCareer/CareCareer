# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.3 — Tokens, Sessions, Signing Keys (In Progress)

## Current State

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| Current branch     | master                                          |
| GP-03.3 latest     | dd1e990                                         |
| Working tree       | clean                                           |
| Typecheck          | passing (24/24 packages)                        |
| Unit tests         | 119 identity + all packages passing             |
| Integration tests  | 31 identity + 34 platform + 8 testing           |
| OpenAPI validation | 13 checks, 27 routes documented                 |
| Docker             | identity 14/14, platform 15/15                  |
| DEMO-01            | 20 E2E + 103 frontend + 117 backend — all green |
| Build              | 15/15 packages                                  |

## GP-03.3 Commits

| Commit  | Description                                            |
| ------- | ------------------------------------------------------ |
| 69a47c1 | Session domain, signing-key lifecycle, JWT service     |
| 3f8b45e | PostgreSQL session/signing-key repos, session commands |
| dd1e990 | Auth HTTP controller, JWKS, /me, session endpoints     |

## GP-03.3 Completed

- Session domain model (create, rotate, revoke, verify, expiry)
- SigningKey domain (create, rotate, revoke)
- RS256 JWT signing and verification via jose library
- JWKS builder (ACTIVE + ROTATED, excludes REVOKED, no private fields)
- PostgreSQL session repository with FOR UPDATE locking
- PostgreSQL signing-key repository
- Session commands: create, refresh with replay detection, logout, logout-all
- Maximum 5 sessions enforcement (revokes oldest)
- Refresh-token rotation (SHA-256 hash, no raw tokens stored)
- Replay detection (family compromise on old token reuse)
- Auth HTTP controller: refresh, logout, logout-all, sessions, revoke, /me, JWKS
- Dev-only session creation endpoint (disabled in production)
- OpenAPI extended with all 7 auth routes
- HTTP contract tests (14 tests proving auth boundaries)
- Full regression gate passing

## GP-03.3 Remaining (resume here)

1. Session integration test: concurrent refresh safety with real PostgreSQL
2. Session integration test: replay family revocation with real PostgreSQL
3. Session integration test: 5-session limit under concurrency
4. Authorization-version enforcement middleware (live check)
5. Production startup safety tests (fail when dev keys in production)
6. Local full authentication validation flow script
7. Final GP-03.3 documentation and commit

## Known Gaps

- Authorization-version live enforcement not yet integrated into token guard
- Concurrent refresh integration test not yet written
- Local full auth flow validation script pending
- Production startup safety tests pending
- GP-03.4 (OIDC exchange) not started
- GP-03.5 (Invitations) not started
