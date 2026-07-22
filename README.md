# CareCareer

AI-native healthcare workforce platform for staffing agencies managing caregivers, nurses, and allied health professionals across acquired and licensed operations.

## What This Is

CareCareer is a multi-tenant SaaS platform designed to consolidate and modernize fragmented healthcare staffing systems (Bullhorn, Symplr CTM, LaborEdge, Maestra) into a single secure, auditable, and configurable platform.

## Current State

**Platform foundation: LOCALLY COMPLETE**

The platform control plane is functional with:

- Multi-tenant architecture with PostgreSQL Row-Level Security
- Identity, session management, and RS256 token infrastructure
- Authorization decision service with explicit deny precedence
- Tenant provisioning, lifecycle, organizations, entitlements, and features
- Administrative console (React) with 9 routes
- Comprehensive security testing (99%+ coverage on critical paths)
- Cross-browser validation (Chromium, Firefox, WebKit, Mobile Chrome)
- Deterministic investor demonstration

**Workforce product: IN PROGRESS (GP-05 Facilities)**

- Facility CRUD with timezone enforcement and geofence versioning
- Department management (per-facility)
- Credential requirements queryable by role + department
- Audit + outbox event emission (atomic, within transaction)
- 34 integration tests against real PostgreSQL with RLS

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

| Service          | Port | Purpose                                                |
| ---------------- | ---- | ------------------------------------------------------ |
| platform-service | 3001 | Tenants, organizations, entitlements, features         |
| identity-service | 3100 | Users, sessions, authorization, signing keys           |
| staffing-service | 3200 | Facilities, departments, workers, shifts (in progress) |

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

# Start the demo (PostgreSQL + services + admin console)
pnpm demo:verify

# Run all tests
pnpm test

# Run integration tests (requires Docker)
pnpm test:integration

# Run security coverage
pnpm coverage
pnpm coverage:security-check
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

# Build all packages
pnpm build
```

## Testing

```bash
# Unit tests
pnpm test

# Integration tests (real PostgreSQL via Testcontainers)
pnpm --filter @carecareer/identity-service test:integration
pnpm --filter @carecareer/platform-service test:integration
pnpm --filter @carecareer/staffing-service test:integration

# Security coverage gate
pnpm coverage:security-check

# Browser E2E (Chromium)
pnpm test:e2e:investor

# Full verification
pnpm demo:verify
pnpm local:verify
```

## Golden Path Milestones

| #            | Milestone                      | Status         |
| ------------ | ------------------------------ | -------------- |
| GP-00        | Repository baseline            | ✅ Complete    |
| GP-01        | Service template + packages    | ✅ Complete    |
| GP-02        | Platform service               | ✅ Complete    |
| GP-03.0–03.3 | Identity, sessions, signing    | ✅ Complete    |
| GP-03.4      | Authorization decisions        | ✅ Complete    |
| GP-05        | Facilities and departments     | 🔄 In progress |
| GP-06        | Worker profiles                | ⬜ Not started |
| GP-07        | Credentials and eligibility    | ⬜ Not started |
| GP-08        | Shift creation                 | ⬜ Not started |
| GP-09–15     | Marketplace through production | ⬜ Not started |

## Security

- All tenant data protected by PostgreSQL RLS (FORCE ROW LEVEL SECURITY)
- Application roles have no superuser or BYPASSRLS privileges
- Tenant context derived exclusively from validated session state
- Explicit deny overrides all permission grants
- Authorization versions enforce immediate revocation
- Refresh token replay compromises the entire token family
- Production startup rejects insecure configuration

## Documentation

- Architecture decisions: `docs/adr/` and `docs/architecture/decisions/`
- Golden Path execution: `docs/execution/`
- Security controls: `docs/security/`
- Testing strategy: `docs/testing/`
- Demo documentation: `docs/demo/`
- Product assessment: `docs/product/`

## License

Private — CareCareer proprietary.
