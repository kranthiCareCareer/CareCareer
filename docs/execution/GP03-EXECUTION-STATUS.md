# GP-03 Identity Service — Execution Status

## Current Phase: GP-03.0 — Architecture Freeze and Threat Model

## Specification Status

| Document                      | Status                               |
| ----------------------------- | ------------------------------------ |
| GP03-IDENTITY-SERVICE-SPEC.md | Rev 2.1 — Approved with corrections  |
| GP03-THREAT-MODEL.md          | Complete (40 threats)                |
| GP03-TRUST-BOUNDARIES.md      | Complete                             |
| GP03-SECURITY-TEST-MATRIX.md  | Complete (62 security tests planned) |

## Architecture Decisions (Resolved)

| Decision                  | Approved Direction                                   |
| ------------------------- | ---------------------------------------------------- |
| Signing algorithm         | RS256 (algorithm-agile for future ES256)             |
| Custom roles              | Deferred; system roles only                          |
| Authorization scopes      | PLATFORM and TENANT only                             |
| Session concurrency       | Max 5 per user (configurable)                        |
| Identity linking          | Never auto-link by email; require dual auth or admin |
| Access-token lifetime     | 15 minutes                                           |
| Session absolute lifetime | 7 days (not extendable)                              |
| Refresh rotation          | Every refresh; family revocation on replay           |
| Key storage               | AWS KMS in production; ephemeral in dev              |
| Admin RLS                 | Server-side only; JWT claims never set app.is_admin  |

## Regression Verification

Commands to execute before GP-03.1:

```
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm --filter @carecareer/testing test:integration
pnpm --filter @carecareer/platform-service test:integration
pnpm build
pnpm --filter @carecareer/platform-service docker:verify
pnpm demo:verify
```

## Open Risks

1. OIDC provider selection not finalized (Auth0 dev tenant vs self-hosted mock)
2. KMS adapter interface needs validation against AWS SDK patterns
3. Refresh-token rotation race condition window needs bounded analysis

## Recommended Next Action

Review GP-03.0 deliverables. After approval, begin GP-03.1 (service skeleton + identity schema).
