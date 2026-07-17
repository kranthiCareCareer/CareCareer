# DEMO-01 Platform Administration Console

## What Has Been Built

DEMO-01 delivers a working Platform Administration Console that demonstrates CareCareer's secure multi-tenant control plane.

### Backend (platform-service)

- NestJS API with PostgreSQL
- Row-Level Security tenant isolation
- Transactional outbox for domain events
- Append-only audit records
- Optimistic concurrency control
- Idempotency with conflict detection
- Tenant lifecycle state machine (PROVISIONING → ACTIVE → SUSPENDED → DEACTIVATED)
- Demo-only JWT authentication (disabled in production)
- Organizations and branches per tenant
- Entitlement module management
- Feature configuration per tenant

### Frontend (platform-admin-console)

- React + TypeScript + Vite
- Demo persona selector (Platform Admin, MAS Admin, CareShield Admin, Auditor)
- Dashboard with tenant statistics
- Tenant list with search, filter, pagination
- Create tenant form with idempotency
- Tenant overview with lifecycle actions
- Entitlements management with optimistic concurrency
- Feature configuration with typed controls
- Organizations management
- Audit timeline (read-only)
- Correlation ID propagation
- Error envelope display

### Database

- PostgreSQL 16 with RLS policies
- Deterministic demo seed data (3 tenants with orgs, branches, entitlements)
- Append-only audit table with restricted grants
- Migration-based schema management

## How the Flows Connect

```
Browser (React) → Vite proxy (/api → :3001) → NestJS controllers
→ Guards (auth + permission + tenant status)
→ Command handlers → Domain entities → PostgreSQL
→ Audit + Outbox within same transaction
→ JSON response with correlation ID
```

## What the Demo Proves

1. Multi-tenant isolation (RLS + API guards)
2. Tenant lifecycle enforcement (suspended mutations rejected)
3. Idempotency (duplicate protection, conflict detection)
4. Audit trail (immutable, timestamped, actor-tracked)
5. Entitlement-gated features
6. Role-based authorization
7. Optimistic concurrency (version conflicts handled)
8. Demo-mode security (disabled in production)

## What Is Not Yet Built

- Production identity provider (OIDC/OAuth2)
- Worker management
- Credentialing
- Scheduling
- Timekeeping
- Pay/bill processing
- Mobile applications
- Real-time notifications
- File storage (MinIO)
- Search (Elasticsearch)
- Background job processing

## Starting the Demo

```bash
# Start PostgreSQL + apply migrations + seed data
pnpm demo:up

# In separate terminals:
pnpm --filter @carecareer/platform-service dev
pnpm --filter @carecareer/platform-admin-console dev

# Open http://localhost:4000
```

## Resetting the Demo

```bash
pnpm demo:reset
```

## Watching Chromium Execute

```bash
# Headed mode (visible browser)
pnpm demo:e2e:headed

# Executive demo only
pnpm demo:e2e:headed --grep "Executive demo"
```

## Playwright UI Mode

```bash
pnpm demo:e2e:ui
```

## Opening the HTML Report

```bash
pnpm demo:e2e:report
```

## Running Full Verification

```bash
pnpm demo:verify
```
