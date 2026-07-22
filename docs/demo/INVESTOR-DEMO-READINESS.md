# Investor Demo Readiness

## Status: PARTIAL — Core Platform Demonstrable, Playwright Investor Suite Pending

## Demo-Ready Now

| Feature           | Route                      | Persona        | Seed Data       | E2E Test            | Status    | Talking Point                           |
| ----------------- | -------------------------- | -------------- | --------------- | ------------------- | --------- | --------------------------------------- |
| Persona selection | / (unauthenticated)        | All            | Built-in        | demo-mode.spec.ts   | PASS      | Demonstrates multi-persona access model |
| Dashboard         | /                          | Platform Admin | PostgreSQL seed | navigation-smoke    | PASS      | Platform overview with tenant stats     |
| Tenant list       | /tenants                   | Platform Admin | PostgreSQL seed | tenant-provisioning | PASS      | Multi-tenant SaaS evidence              |
| Create tenant     | /tenants/create            | Platform Admin | None (creates)  | tenant-provisioning | PASS      | Live onboarding workflow                |
| Tenant detail     | /tenants/:id               | Platform Admin | PostgreSQL seed | lifecycle           | PASS      | Lifecycle state management              |
| Suspend tenant    | /tenants/:id               | Platform Admin | PostgreSQL seed | lifecycle           | PASS      | Operational control                     |
| Reactivate tenant | /tenants/:id               | Platform Admin | PostgreSQL seed | lifecycle           | PASS      | Recovery workflow                       |
| Entitlements      | /tenants/:id/entitlements  | Tenant Admin   | PostgreSQL seed | PARTIAL             | 2 FAILING | Module access control                   |
| Organizations     | /tenants/:id/organizations | Tenant Admin   | PostgreSQL seed | organizations       | PASS      | Hierarchy management                    |
| Features          | /tenants/:id/features      | Tenant Admin   | PostgreSQL seed | PARTIAL             | FAILING   | Tenant configuration                    |
| Audit trail       | /tenants/:id/audit         | Platform Admin | PostgreSQL seed | audit               | PASS      | Compliance evidence                     |
| Tenant isolation  | Multiple                   | All            | PostgreSQL seed | tenant-isolation    | PASS      | Security boundary proof                 |

## Working But Not Investor-Ready

| Feature             | Status                  | Why Not Ready                              | Remaining Work                     |
| ------------------- | ----------------------- | ------------------------------------------ | ---------------------------------- |
| Entitlements page   | Works in browser        | 2 Playwright tests use fake tenant ID      | Replace with seeded tenant fixture |
| Features page       | Works in browser        | Playwright test uses fake tenant ID        | Replace with seeded tenant fixture |
| Executive demo flow | Works via custom runner | Standard Playwright runner has route issue | Fix navigation timing              |
| Accessibility       | 3 routes tested         | 5 routes need real tenant for Axe scan     | Add tenant-scoped Axe tests        |
| Cross-browser       | Configured              | Not executed against running app           | Execute Firefox/WebKit suites      |
| Responsive          | Configured              | Not executed                               | Execute mobile viewports           |

## Not Yet Implemented

| Capability              | Target Milestone | Backend     | UI          | Migration   | AI/Agent |
| ----------------------- | ---------------- | ----------- | ----------- | ----------- | -------- |
| Real OIDC login         | GP-03.4/GP-04    | Partial     | Not started | N/A         | N/A      |
| Worker profiles         | GP-06            | Not started | Not started | Not started | N/A      |
| Credential verification | GP-07            | Not started | Not started | Not started | Later    |
| Shift management        | GP-08            | Not started | Not started | Not started | N/A      |
| Marketplace             | GP-09            | Not started | Not started | Not started | Later    |
| Time and attendance     | GP-11            | Not started | Not started | Not started | N/A      |
| Payroll                 | GP-12            | Not started | Not started | Not started | N/A      |
| Mobile app              | GP-14            | Not started | Not started | Not started | N/A      |

## Investor Demo Command

```bash
pnpm demo:verify
```

This command:

1. Starts PostgreSQL (Docker)
2. Applies migrations and seeds demo data
3. Starts the platform service backend
4. Starts the admin console frontend
5. Runs 20 Chromium E2E tests covering the full investor story
6. Generates screenshots and HTML report
7. Cleans up all resources

Runtime: ~60-90 seconds

---

_Last updated: 2026-07-21 at d7ae166_
