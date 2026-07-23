# CareCareer

AI-native healthcare workforce platform for staffing agencies managing caregivers, nurses, and allied health professionals across acquired and licensed operations.

## What This Is

CareCareer is a multi-tenant SaaS platform designed to consolidate and modernize fragmented healthcare staffing systems (Bullhorn, Symplr CTM, LaborEdge, Maestra) into a single secure, auditable, and configurable platform.

## Current State

**Platform foundation: COMPLETE**

- Multi-tenant architecture with PostgreSQL Row-Level Security
- Identity, session management, and RS256 token infrastructure
- Authorization decision service with explicit deny precedence
- Tenant provisioning, lifecycle, organizations, entitlements, and features
- Administrative console (React) with 9 routes
- Comprehensive security testing (99%+ coverage on critical paths)
- Cross-browser E2E validation (20/20 Chromium tests)
- All 6 CI/CD workflows green (CI, CodeQL, Secret Scan, Dependency Review, Trivy, E2E)

**Workforce product: THROUGH GP-08**

- Facility CRUD with timezone enforcement and geofence versioning
- Department management (per-facility)
- Worker profiles with 9-state lifecycle (APPLICANT → ACTIVE → BLOCKED)
- Credential management with 5-state machine (UPLOADED → VERIFIED → EXPIRED)
- Eligibility engine — deterministic evaluation at 4 checkpoints
- Shift creation with 7-state machine, multi-worker support, overnight shifts
- Cross-service authentication proven (token exchange, state validation, authorization)
- Audit + outbox event emission (atomic, within transaction)
- 300+ tests across unit, integration, and contract layers

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Admin Console (React)              │
├──────────────────────────────────────────────────┤
│   Platform Service   │  Identity Service  │ Staffing Service │
├──────────────────────────────────────────────────┤
│              PostgreSQL 16 + RLS                   │
└──────────────────────────────────────────────────┘
```

### Services

| Service          | Port | Purpose                                        |
| ---------------- | ---- | ---------------------------------------------- |
| platform-service | 3001 | Tenants, organizations, entitlements, features |
| identity-service | 3100 | Users, sessions, authorization, signing keys   |
| staffing-service | 3200 | Facilities, workers, credentials, shifts       |

### Packages

| Package                     | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| @carecareer/auth            | Authentication guards, JWT validation, principal types |
| @carecareer/database        | TenantAwareTransaction, AdministrativeDatabase, RLS    |
| @carecareer/config          | Validated environment configuration                    |
| @carecareer/events          | Transactional outbox, domain event contracts           |
| @carecareer/idempotency     | Request deduplication                                  |
| @carecareer/observability   | Structured logging, correlation IDs                    |
| @carecareer/request-context | Async-local request state                              |
| @carecareer/service-core    | NestJS base patterns                                   |
| @carecareer/testing         | Test containers, fixtures, helpers                     |

## Quick Start

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker

# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run integration tests (requires Docker)
pnpm test:integration

# Run security coverage
pnpm coverage
pnpm coverage:security-check

# Start the demo (PostgreSQL + services + admin console)
pnpm demo:up
pnpm demo:e2e
```

## Development

```bash
# Start infrastructure
pnpm demo:up

# Start individual services
pnpm --filter @carecareer/platform-service dev
pnpm --filter @carecareer/identity-service dev
pnpm --filter @carecareer/platform-admin-console dev

# Run linting and type checking
pnpm lint
pnpm typecheck

# Format
pnpm format

# Build all packages
pnpm build
```

## Testing

```bash
# Unit tests (all services)
pnpm test

# Integration tests (real PostgreSQL via Testcontainers)
pnpm --filter @carecareer/identity-service test:integration
pnpm --filter @carecareer/platform-service test:integration
pnpm --filter @carecareer/staffing-service test:integration

# Security coverage gate
pnpm coverage:security-check

# Browser E2E (Chromium)
pnpm demo:e2e

# Full local verification
pnpm local:verify
```

## Golden Path Milestones

| #        | Milestone                      | Status      |
| -------- | ------------------------------ | ----------- |
| GP-00    | Repository baseline            | ✅ Complete |
| GP-01    | Service template + packages    | ✅ Complete |
| GP-02    | Platform service               | ✅ Complete |
| GP-03    | Identity and authorization     | ✅ Complete |
| GP-04    | Admin portal shell             | ✅ Complete |
| GP-05    | Facilities and departments     | ✅ Complete |
| GP-06    | Worker profiles                | ✅ Complete |
| GP-07    | Credentials and eligibility    | ✅ Complete |
| GP-08    | Shift creation                 | ✅ Complete |
| GP-09    | Shift marketplace + assignment | ⬜ Next     |
| GP-10    | Time and attendance            | ⬜ Planned  |
| GP-11–15 | Pay/bill through production    | ⬜ Planned  |

## CI/CD

All workflows green on master:

| Workflow           | Purpose                             |
| ------------------ | ----------------------------------- |
| CI                 | Lint, typecheck, test, build        |
| Secret Scanning    | Gitleaks — no secrets in history    |
| Code Security      | CodeQL static analysis              |
| Dependency Review  | Vulnerability + license enforcement |
| Container Security | Trivy filesystem scan (0 HIGH/CRIT) |
| DEMO-01 E2E        | Playwright Chromium (20/20 pass)    |

## Security

- All tenant data protected by PostgreSQL RLS (FORCE ROW LEVEL SECURITY)
- Application roles have no superuser or BYPASSRLS privileges
- Tenant context derived exclusively from validated session state
- Explicit deny overrides all permission grants
- Authorization versions enforce immediate revocation
- Refresh token replay compromises the entire token family
- Production startup rejects insecure configuration
- Service-to-service auth via client_credentials token exchange (identity-service is sole issuer)
- Fail-closed: any adapter failure denies access

## Documentation

- Architecture decisions: `docs/adr/` and `docs/architecture/decisions/`
- Golden Path execution: `docs/execution/`
- Security controls: `docs/security/`
- Testing strategy: `docs/testing/`
- Demo documentation: `docs/demo/`
- Branching strategy: `docs/engineering/BRANCHING-STRATEGY.md`

## License

Private — CareCareer proprietary.
