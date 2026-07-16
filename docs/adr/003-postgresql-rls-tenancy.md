# ADR-003: PostgreSQL Row-Level Security Tenancy Model

- Status: **Accepted**
- Date: 2026-07-16
- Owners: CTO, Database Lead, Security Lead
- Decision deadline: N/A (accepted)
- Review trigger: Material change to tenancy model or database technology

## Context

CareCareer is a multi-tenant platform where tenant data isolation is a
non-negotiable security requirement. A data leak between tenants is a
critical severity incident. The platform must enforce isolation at the
database layer as a safety net, even if application code has a bug.

## Decision

**Accepted.** PostgreSQL Row-Level Security is the mandatory tenancy isolation
mechanism for all tenant-owned tables.

### Mandatory Requirements

1. Every tenant-owned table MUST contain a `tenant_id UUID NOT NULL` column.
2. RLS MUST be enabled: `ALTER TABLE x ENABLE ROW LEVEL SECURITY`.
3. RLS MUST be forced: `ALTER TABLE x FORCE ROW LEVEL SECURITY`.
4. Tenant isolation policy: `USING (tenant_id = current_setting('app.tenant_id')::UUID)`.
5. Application database roles MUST NOT have `BYPASSRLS`.
6. Tenant context MUST be set using `SET LOCAL app.tenant_id = $1` inside a transaction.
7. `SET LOCAL` ensures context is transaction-scoped and cannot leak to pooled connections.
8. Every database operation MUST execute within an explicit transaction with tenant context set.
9. Connection pool reuse MUST NOT leak tenant context (SET LOCAL guarantees this).
10. Background jobs MUST carry explicit tenant context and set it before any query.
11. Migration/admin roles are SEPARATE from application roles, audited, and time-limited.
12. Cross-tenant access is deny-by-default; requires separate elevated role with audit.
13. Automated isolation tests MUST run in CI.

### Prisma Implementation

Prisma interactive transactions with `$transaction` callback:

```typescript
async function withTenantContext<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set tenant context for RLS — scoped to this transaction
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
```

### Failure Mode Analysis (Prisma)

| Scenario                                 | Risk                                 | Mitigation                                                                 |
| ---------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Query outside transaction                | RLS policy fails (no tenant_id set)  | Deny-by-default policy returns empty; application-level guard also checks  |
| Implicit transaction (Prisma auto)       | SET LOCAL not applied                | Prohibit implicit transactions; lint rule enforces explicit `$transaction` |
| Connection pool returns stale connection | Previous tenant context leaks        | SET LOCAL is transaction-scoped; automatically cleared on transaction end  |
| Prisma middleware bypasses context       | Queries execute without RLS          | All repository methods go through `withTenantContext` wrapper              |
| Admin accidentally uses app role         | No BYPASSRLS; sees only their tenant | Correct behavior; admin operations use separate role                       |
| Background job forgets tenant            | Empty result set (deny-by-default)   | Job framework enforces tenantId parameter; fails if missing                |

### Database Role Structure

```sql
-- Application service role (per-service or shared)
CREATE ROLE carecareer_app NOINHERIT LOGIN;
-- NO BYPASSRLS, NO SUPERUSER, NO CREATEDB

-- Admin/migration role (separate, audited)
CREATE ROLE carecareer_admin NOINHERIT LOGIN;
-- Has BYPASSRLS for migrations ONLY
-- Access requires break-glass with audit
-- Short-lived credentials via Secrets Manager

-- Read-only analytics role
CREATE ROLE carecareer_analytics NOINHERIT LOGIN;
-- SELECT only; no BYPASSRLS; tenant-scoped
```

## Alternatives considered

| Option                     | Pros                                                     | Cons                                            |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| RLS (chosen)               | DB-level safety net; transparent to queries; fail-closed | Slightly more complex connection setup          |
| Application-only filtering | Simpler setup                                            | Single bug = data leak; no safety net           |
| Schema-per-tenant          | Strong isolation                                         | Operational nightmare at 1000+ tenants          |
| Database-per-tenant        | Maximum isolation                                        | Massive operational cost; connection management |

## Consequences

- Every repository method wraps in `withTenantContext`.
- Tests prove cross-tenant isolation (negative test cases).
- Slightly higher connection setup cost (one SET LOCAL per transaction).
- Impossible to accidentally query across tenants even with application bug.

## Security implications

- Data leak between tenants requires both application bug AND database misconfiguration.
- Defense in depth: application filter + RLS = two independent barriers.
- Admin access is auditable and time-limited.
- Compliance evidence: RLS policies are declarative and reviewable.

## Operational implications

- Migrations must account for RLS (use admin role for DDL).
- Performance: RLS adds negligible overhead (index on tenant_id).
- Monitoring: alert on queries that return unexpected empty results.

## Migration implications

- All existing Maestra tables that become CareCareer tables get RLS.
- Initial pilot data is seeded with correct tenant_id values.
- Reconciliation queries use admin role with explicit audit trail.

## Validation criteria

- [ ] Every tenant-owned table has `tenant_id` column with NOT NULL constraint
- [ ] Every tenant-owned table has RLS enabled and forced
- [ ] Application role cannot bypass RLS (verified by test)
- [ ] `SET LOCAL` is used in every transaction (enforced by repository pattern)
- [ ] CI runs cross-tenant isolation tests (Tenant A cannot see Tenant B's data)
- [ ] Background jobs fail if tenant context is not provided
- [ ] Connection pool reuse does not leak context (verified by concurrent test)
- [ ] Admin access requires separate credentials and produces audit record

## References

- PostgreSQL RLS documentation
- CARECAREER_MASTER_PACKAGE.md Section 8 (Multi-Tenancy and Isolation)
- Prisma interactive transactions documentation
