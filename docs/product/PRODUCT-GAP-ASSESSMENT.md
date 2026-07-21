# CareCareer Product Gap Assessment

## Repository: fe6a400 on master

## What Has Actually Been Built and Works Today

### Platform Foundation (COMPLETE, DEMO READY)

| Capability | Backend | Database | Frontend | Security | Tests | Demo |
|------------|---------|----------|----------|----------|-------|------|
| Tenant provisioning | ✓ | ✓ RLS | ✓ | ✓ | Unit+Integ+E2E | ✓ |
| Tenant listing | ✓ | ✓ | ✓ | ✓ | Unit+E2E | ✓ |
| Tenant detail | ✓ | ✓ | ✓ | ✓ | Unit+E2E | ✓ |
| Tenant suspend/reactivate | ✓ | ✓ | ✓ | ✓ | Unit+Integ+E2E | ✓ |
| Organization management | ✓ | ✓ RLS | ✓ | ✓ | Unit+Integ+E2E | ✓ |
| Entitlements | ✓ | ✓ RLS | ✓ | ✓ | Unit+Integ+E2E | ✓ |
| Feature configuration | ✓ | ✓ RLS | ✓ | ✓ | Unit+Integ+E2E | ✓ |
| Audit trail | ✓ | ✓ | ✓ | ✓ | Unit+E2E | ✓ |
| Transactional outbox | ✓ | ✓ | N/A | ✓ | Integration | N/A |
| Idempotency | ✓ | ✓ | ✓ | ✓ | Integration | ✓ |
| Optimistic concurrency | ✓ | ✓ | ✓ | ✓ | Integration | ✓ |
| PostgreSQL RLS | ✓ | ✓ | N/A | ✓ | 21 HTTP→RLS tests | N/A |
| Demo authentication | ✓ | N/A | ✓ | ✓ (prod disabled) | Unit+E2E | ✓ |

### Identity and Security (COMPLETE, TESTED LOCALLY)

| Capability | Backend | Database | Frontend | Security | Tests |
|------------|---------|----------|----------|----------|-------|
| RS256 token issuance | ✓ | ✓ | N/A | ✓ | Unit+Integ |
| JWKS endpoint | ✓ | ✓ | N/A | ✓ | Integration |
| Session creation | ✓ | ✓ | N/A | ✓ | Integration |
| Session revocation | ✓ | ✓ | N/A | ✓ | Integration |
| Refresh-token rotation | ✓ | ✓ | N/A | ✓ | Integration |
| Historical replay detection | ✓ | ✓ | N/A | ✓ | Integration |
| Family compromise | ✓ | ✓ | N/A | ✓ | Integration |
| User suspension | ✓ | ✓ | N/A | ✓ | Integration |
| Membership management | ✓ | ✓ | N/A | ✓ | Integration |
| Production startup fail-closed | ✓ | N/A | N/A | ✓ | 13+14 tests |
| Tenant-aware transaction | ✓ | ✓ | N/A | ✓ | 21 HTTP tests |

### Admin UI (COMPLETE, DEMO READY)

| Page | Route | Functional | Accessible | Responsive | Cross-Browser |
|------|-------|------------|------------|------------|---------------|
| Persona selector | / | ✓ | ✓ | ✓ | ✓ |
| Dashboard | / | ✓ | ✓ | ✓ | ✓ |
| Tenant list | /tenants | ✓ | ✓ | ✓ | ✓ |
| Create tenant | /tenants/create | ✓ | ✓ | ✓ | ✓ |
| Tenant detail | /tenants/:id | ✓ | ✓ | ✓ | ✓ |
| Organizations | /tenants/:id/organizations | ✓ | ✓ | ✓ | ✓ |
| Entitlements | /tenants/:id/entitlements | ✓ | ✓ | ✓ | ✓ |
| Features | /tenants/:id/features | ✓ | ✓ | ✓ | ✓ |
| Audit | /tenants/:id/audit | ✓ | ✓ | ✓ | ✓ |

## What Remains Incomplete or Partially Implemented

### P0 — Production Blockers

| Gap | Why It Matters | Current State |
|-----|----------------|---------------|
| AWS KMS signing | Production tokens cannot be issued without KMS | Deferred to GP-15; local RS256 only |
| Production deployment | No IaC, no environments, no release pipeline | Docker images build; no target infra |
| Real OIDC integration | No production identity provider configured | Demo auth only; Auth0/Entra not wired |
| Secrets management | No AWS Secrets Manager integration | .env files locally; no rotation |
| Database backups/PITR | No backup strategy implemented | Local Docker volumes only |
| Monitoring/alerting | No dashboards, no alerts, no SLOs | Structured logging exists; no sink |

### P1 — Pilot Blockers

| Gap | Why It Matters | Current State |
|-----|----------------|---------------|
| Worker profiles (GP-06) | Cannot manage caregivers without profiles | NOT STARTED |
| Credentials (GP-07) | Cannot verify worker eligibility | NOT STARTED |
| Facility management (GP-05) | Cannot configure client sites | NOT STARTED |
| Shift creation (GP-08) | Cannot schedule work | NOT STARTED |
| Data migration | No legacy data can be imported | Schema exists; no migration tooling |
| Load/performance testing | Unknown scalability limits | Not performed |

### P2 — Investor Demo / Usability Gaps

| Gap | Why It Matters | Current State |
|-----|----------------|---------------|
| Mobile Safari exec-demo | 1 test fails in mobile WebKit | 63/64 pass; timing issue |
| Investor demo automation | No dedicated @investor-demo Playwright flow | demo:verify runs 20 custom tests |
| Chrome/Edge release channels | Not verified against installed browsers | Bundled Chromium only |
| Real tenant data seeding | Demo creates tenants on-the-fly | No pre-seeded production-like data |

### P3 — Roadmap Enhancements

| Gap | Target Milestone | Dependencies |
|-----|-----------------|--------------|
| Marketplace (GP-09) | GP-08 | Workers + Shifts |
| Assignments (GP-10) | GP-09 | Marketplace |
| Timecards (GP-11) | GP-10 | Assignments |
| Payroll (GP-12) | GP-11 | Timecards |
| Billing (GP-13) | GP-12 | Payroll |
| Mobile app (GP-14) | GP-10 | Assignments |
| AI matching | Post-GP-10 | Worker profiles + Shifts |
| AI scheduling | Post-GP-08 | Shift creation |
| Bullhorn replacement | Full platform | All GPs |
| Symplr replacement | GP-08+ | Scheduling domain |
| LaborEdge replacement | GP-11+ | Time/attendance |

## What Is NOT Built Yet (Workforce Product)

The following are NOT implemented. They exist only as architecture documents:

- **Worker/caregiver profiles** — no table, no API, no UI
- **Credential management** — no verification engine
- **Facility/client management** — no entity
- **Shift/schedule management** — no shift table
- **Marketplace** — no listing/request flow
- **Assignments** — no assignment entity
- **Timecards** — no clock-in/out
- **Payroll** — no calculation engine
- **Billing** — no invoice generation
- **Notifications** — no SMS/push/email
- **Mobile app** — no React Native code
- **AI features** — no model integration
- **VMS integration** — no external connection
- **Customer self-service** — no signup flow
- **Data migration** — no ETL tooling

## Production Readiness Summary

| Area | Investor Demo | Pilot | Production |
|------|---------------|-------|------------|
| Platform tenant CRUD | ✓ | ✓ | Needs KMS + OIDC |
| Identity/sessions | ✓ (demo auth) | Needs OIDC | Needs KMS + OIDC |
| Database | ✓ (Docker) | Needs managed PG | Needs PITR + DR |
| Infrastructure | ✓ (local) | Needs AWS | Needs IaC + HA |
| Security | ✓ (RLS + demo) | Needs pen test | Needs full audit |
| Observability | ✗ | Needs dashboards | Needs SLOs + alerts |
| Worker domain | ✗ | REQUIRED | REQUIRED |
| Scheduling domain | ✗ | REQUIRED | REQUIRED |
| Data migration | ✗ | For one tenant | Full migration plan |

---
*Generated: 2026-07-21 at fe6a400*
