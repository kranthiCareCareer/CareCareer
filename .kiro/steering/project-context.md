---
inclusion: auto
description: CareCareer project overview, current state, repository structure, and architecture rules
---

# CareCareer Project Context

## What This Project Is

CareCareer is a multi-tenant healthcare workforce SaaS platform being built from the ground up using the Golden Path methodology — a dependency-ordered sequence of milestones that each produce a working, tested vertical slice.

## Current State (read AUTONOMOUS-EXECUTION-STATE.md for exact status)

- Platform control plane: COMPLETE (tenants, organizations, entitlements, features, audit)
- Identity/authorization: COMPLETE (sessions, RS256, refresh rotation, authorization decisions)
- Staffing service: GP-05 COMPLETE (facilities, departments, credential requirements)
- Workforce product (workers, shifts, timecards): NOT STARTED (GP-06 next)

## Repository Structure

```
apps/
  platform-admin-console/    # React admin UI (Vite, React Router)
packages/
  auth/                      # Guards, JWT validation, principal types
  database/                  # TenantAwareTransaction, AdministrativeDatabase
  config/                    # Zod-validated environment config
  events/                    # Transactional outbox
  idempotency/               # Request deduplication
  observability/             # Structured logging
  request-context/           # AsyncLocalStorage context
  service-core/              # NestJS base patterns
  testing/                   # Testcontainers, fixtures
services/
  platform-service/          # Tenant management, organizations
  identity-service/          # Users, sessions, authorization
  staffing-service/          # Facilities, workers, shifts (in progress)
docs/
  execution/                 # Progress ledger and milestone closure
  decisions/                 # Golden Path backlog
  architecture/              # ADRs
  security/                  # Security policies
  testing/                   # Test strategy and evidence
  demo/                      # Demo documentation
scripts/                     # Orchestration scripts
```

## Key Files for Resuming Work

1. `docs/execution/AUTONOMOUS-EXECUTION-STATE.md` — exact next task
2. `docs/execution/MASTER-GOLDEN-PATH-STATUS.md` — milestone overview
3. `docs/decisions/golden-path-backlog.md` — authoritative requirements
4. `docs/demo/LATEST-DEMO.md` — current demo instructions

## Non-Negotiable Architecture Rules

- Every tenant-owned table: RLS enabled AND forced
- Application roles: never table owner, never superuser, never BYPASSRLS
- Tenant context: derived from validated session, never from URL/header/body
- Authorization: default deny, explicit deny overrides grants
- Secrets: never in source, never in logs, never in responses
- Tests: real PostgreSQL (Testcontainers), real RLS, real application roles
- Commits: small, forward-only, conventional messages
- Coverage: security-critical files must meet 95/90 thresholds
