# CareCareer Security Controls

## Authentication

| Control              | Implementation                                                            | Evidence                     |
| -------------------- | ------------------------------------------------------------------------- | ---------------------------- |
| JWT RS256 validation | identity-service issues RS256 tokens, staffing-service validates via JWKS | Integration tests            |
| Token expiry (15min) | Short-lived access tokens                                                 | Token payload includes `exp` |
| Session management   | Refresh rotation with family compromise detection                         | 98 integration tests         |
| Demo isolation       | DEMO_MODE only in development, rejected in production startup             | Startup validation tests     |

## Authorization

| Control             | Implementation                                     | Evidence                |
| ------------------- | -------------------------------------------------- | ----------------------- |
| RBAC                | Role-based permission resolution                   | Permission guard tests  |
| Tenant scoping      | Every query filtered by tenant_id from JWT         | RLS + integration tests |
| Fail-closed         | Missing context → deny (TenantContextMissingError) | Unit tests              |
| Cross-tenant denial | Returns 404 not 403 (information hiding)           | Cross-tenant tests      |

## Data Isolation

| Control                | Implementation                                    | Evidence                      |
| ---------------------- | ------------------------------------------------- | ----------------------------- |
| PostgreSQL RLS         | ENABLE + FORCE on all tenant tables               | Migration + integration tests |
| SET LOCAL              | Tenant context scoped to transaction only         | TenantAwareTransaction        |
| Application role       | staffing_app never BYPASSRLS or superuser         | Role configuration            |
| No tenant from request | Tenant derived exclusively from validated session | requirePrincipal()            |

## Input Validation

| Control                | Implementation                                    | Evidence               |
| ---------------------- | ------------------------------------------------- | ---------------------- |
| Zod schemas            | All request bodies validated at boundary          | DTO validation         |
| UUID format check      | Tenant ID validated as UUID before use            | TenantAwareTransaction |
| Parameterized queries  | All SQL uses template literals (no string concat) | Repository code        |
| Optimistic concurrency | expectedVersion prevents lost updates             | 409 conflict tests     |

## Secrets Management

| Control               | Implementation                         | Evidence                |
| --------------------- | -------------------------------------- | ----------------------- |
| No secrets in source  | .env.example has placeholders only     | gitleaks scanning       |
| Environment variables | All secrets via env vars in containers | docker-compose.demo.yml |
| Non-root containers   | appuser:appgroup (UID 1001)            | Dockerfile              |

## Audit

| Control                | Implementation                                      | Evidence        |
| ---------------------- | --------------------------------------------------- | --------------- |
| Append-only audit log  | INSERT-only table, no UPDATE/DELETE grants          | Migration SQL   |
| Every mutation audited | Controllers write audit entries in same transaction | Controller code |
| Immutable evidence     | Eligibility evaluations preserved historically      | Domain model    |
| Correlation tracking   | x-correlation-id flows through all operations       | Middleware      |

## Logging

| Control               | Implementation                              | Evidence               |
| --------------------- | ------------------------------------------- | ---------------------- |
| No PHI in logs        | PII redaction utility                       | pii-redaction.spec.ts  |
| No credential numbers | Notification bodies sanitized               | notification-worker.ts |
| Structured JSON       | Pino logger with tenant/correlation context | observability package  |
| No console.log        | ESLint no-console rule enforced             | lint configuration     |
