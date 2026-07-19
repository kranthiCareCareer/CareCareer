# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.3 — Tokens, Sessions, Signing Keys (IN PROGRESS)

## Current State

| Field                   | Value                                      |
| ----------------------- | ------------------------------------------ |
| Current branch          | master                                     |
| GP-03.3 latest          | 3c7c0b3                                    |
| Working tree            | clean (git status --porcelain = no output) |
| Unit tests              | 155 passing (14 test files)                |
| Integration tests       | 67 passing (5 test files)                  |
| OpenAPI validation      | 13 checks passing                          |
| Docker                  | identity 14/14, platform 15/15             |
| Build                   | 15/15                                      |
| Typecheck               | 24/24                                      |
| Lint                    | 24/24 (0 errors)                           |
| Format check            | passing                                    |
| DEMO-01                 | demo:verify passes                         |
| Local verify            | local:verify passes (5 steps)              |
| Platform integration    | 34/34                                      |
| Identity integration    | 67/67 (3/3 deterministic runs)             |
| Testing pkg integration | 8/8                                        |

## Coverage Results (Combined Unit + Integration)

```
All files:   88.36% stmts | 80.15% branches | 90.27% functions | 88.36% lines
```

### Per-file Security Coverage

| File                        | Lines | Branches | Functions |
| --------------------------- | ----- | -------- | --------- |
| domain/session.ts           | 100%  | 100%     | 100%      |
| domain/refresh-token.ts     | 100%  | 100%     | 100%      |
| domain/signing-key.ts       | 100%  | 100%     | 100%      |
| config/identity-config.ts   | 100%  | 100%     | 100%      |
| session-state-validator.ts  | 100%  | 100%     | 100%      |
| jwt-service.ts              | 100%  | 50%      | 100%      |
| health.controller.ts        | 90%   | 80%      | 100%      |
| platform-token-validator.ts | 89%   | 81%      | 100%      |
| identity-auth.guard.ts      | 89%   | 76%      | 100%      |
| postgres-session-repository | 90%   | 86%      | 75%       |
| postgres-refresh-token-repo | 84%   | 75%      | 76%       |
| session-commands.ts         | 79%   | 81%      | 92%       |
| demo-token-validator.ts     | 89%   | 64%      | 100%      |

### Coverage Gap Justification

Files below 95%/90% security thresholds:

- **jwt-service.ts branches (50%)**: Uncovered branches are `??` nullish coalescing
  operators for optional ES256 JWK fields (crv, x, y) that are unreachable with
  RSA-only keys. All executable logic paths are covered at 100% lines.

- **session-commands.ts (79% lines)**: The legacy refresh path (backward-compat
  code for non-lineage mode) accounts for ~100 uncovered lines. The production
  lineage path is fully exercised. Legacy path is retained only for migration.

- **identity-auth.guard.ts (89% lines)**: Uncovered lines are defensive catch blocks
  for `AuthenticationError` type checking and the `extractSessionId` parse-failure
  fallback. These are error-resilience paths, not security decision paths.

- **postgres-refresh-token-repository.ts (84% lines)**: The `expireRefreshTokens`
  and `revokeTokenFamily` methods are integration-tested but some edge branches
  (empty result sets) are not hit.

- **demo-token-validator.ts branches (64%)**: Optional claim branches in demo-mode
  JWT parsing. Demo mode is prohibited in production and tested for rejection.

## GP-03.3 Proven Security Controls

All controls below have been proven with real PostgreSQL via Testcontainers.

### Historical Replay Detection

- A→B then replay A = **AUTH_REFRESH_REPLAY** (proven)
- A→B→C then replay B = **AUTH_REFRESH_REPLAY** (proven)
- Family marked **COMPROMISED** (all tokens) (proven)
- Successor C unusable after compromise (proven)
- No new token issued (proven)
- Audit record written, no token hashes (proven)
- Outbox event emitted, no token hashes (proven)
- Unknown token = AUTH_REFRESH_INVALID (proven)

### Concurrent Refresh Safety

- FOR UPDATE row lock prevents duplicates (proven)
- At most one rotation succeeds (proven)
- Family ends compromised on concurrent replay (proven)
- 3/3 deterministic consecutive runs (proven)

### Production RS256 Guard (HTTP Integration)

- Valid RS256 token + ACTIVE session → 200 OK (proven via Supertest)
- REVOKED session → 401 AUTH_SESSION_REVOKED (proven via Supertest)
- COMPROMISED session → 401 AUTH_SESSION_COMPROMISED (proven via Supertest)
- Expired session → 401 AUTH_SESSION_EXPIRED (proven via Supertest)
- Nonexistent session → 401 AUTH_TOKEN_INVALID (proven via Supertest)
- HS256 demo token rejected by production guard (proven via Supertest)
- alg=none token rejected by production guard (proven via Supertest)

### Session-State Enforcement

- ACTIVE → accepted (proven)
- REVOKED → AUTH_SESSION_REVOKED immediate (proven)
- COMPROMISED → AUTH_SESSION_COMPROMISED immediate (proven)
- Expired → AUTH_SESSION_EXPIRED (proven)
- User authorization version stale → rejected (proven)
- Membership authorization version stale → rejected (proven)
- Session resolved from PostgreSQL, not token claims (proven)
- No JWT claim activates app.is_admin (proven)

### Startup Safety

- DEMO_MODE in production → startup failure (proven)
- Missing TOKEN_ISSUER in production → failure (proven)
- Missing TOKEN_AUDIENCE in production → failure (proven)
- Missing DATABASE_URL in production → failure (proven)
- DEMO_AUTH_SECRET < 32 chars → failure (proven)

## Known Gaps — GP-03.3 Not Yet Closed

1. **Per-file 95%/90% thresholds not universally met**: Some security files are
   at 79-89% lines rather than 95%. Documented justifications above. Raising
   these requires testing legacy/defensive paths and ES256 key types.

2. **local:verify is integration-suite based**: The script exercises all security
   behaviors through Testcontainers integration tests but does not orchestrate
   a multi-step HTTP-level script against running service containers.

3. **KMS signing provider**: Deferred to GP-15. Production throws on unsupported
   reference (fail-closed at request time, not startup). The identity service is
   NOT production-deployable until a supported signing provider is configured.
   This is a GP-15 deployment blocker, not a GP-03.3 security logic gap.

4. **Startup signing-provider validation**: Production currently fails at request
   time (when resolving private key), not at startup. Startup validation of the
   signing provider should be added to reject deployment before traffic arrives.

## Previous Phases

- GP-03.0: 6098d85 (threat model)
- GP-03.1: 4157886 (service skeleton + schema)
- GP-03.2: 4f80b6e (memberships + permissions)
