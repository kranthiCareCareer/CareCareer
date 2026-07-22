---
inclusion: always
description: Tenant isolation, RLS, authentication, authorization, and secrets management
---

# CareCareer Multi-Tenancy & Security Standards

## 1. Tenant Isolation — Non-Negotiable Rules

### Every database query MUST be tenant-scoped:

```typescript
// ✅ CORRECT — tenant context is always applied
const shifts = await this.shiftRepository.findMany({
  where: { tenantId: ctx.tenantId, status: 'OPEN' },
});

// ❌ WRONG — missing tenant scope (data leak vulnerability)
const shifts = await this.shiftRepository.findMany({
  where: { status: 'OPEN' },
});
```

### RLS (Row-Level Security) as safety net:

Even if application code has a bug, the database layer blocks cross-tenant access.

```sql
-- Every tenant-owned table:
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shifts
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Tenant context propagation:

- Extracted from JWT at API gateway
- Set in database session (`SET app.tenant_id = '...'`)
- Passed to all downstream service calls (header)
- Included in all events (envelope field)
- Used in all cache keys (prefix)
- Used in all S3 paths (prefix)

### Testing tenant isolation:

Every service MUST have tests that prove:

```typescript
it('should NOT return data from another tenant', async () => {
  // Create data for tenant A
  await createShift({ tenantId: tenantA });
  // Query as tenant B
  const results = await queryShifts({ tenantId: tenantB });
  // Must be empty
  expect(results).toHaveLength(0);
});
```

## 2. Authentication Standards

### JWT Structure:

```typescript
{
  sub: string;           // User ID
  tenant_id: string;     // Tenant ID (primary isolation key)
  roles: string[];       // Role names
  permissions: string[]; // Explicit permissions
  branch_ids: string[];  // Accessible branches
  iat: number;           // Issued at
  exp: number;           // Expires (short-lived: 15 min)
}
```

### Token Rules:

- Access tokens: 15-minute expiry
- Refresh tokens: 7-day expiry, rotated on use
- Tokens stored in httpOnly cookies (web) or secure storage (mobile)
- Never in localStorage (XSS vulnerable)

## 3. Authorization — RBAC + ABAC

### Every API endpoint MUST declare required permissions:

```typescript
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions('shifts:create')
@Post('/shifts')
async createShift(@Body() dto: CreateShiftDto, @TenantCtx() ctx: TenantContext) {
  // Permission already verified by guard
}
```

### ABAC checks for fine-grained access:

```typescript
// Beyond role: check attribute-based conditions
@UseGuards(AuthGuard, PermissionGuard, FacilityAccessGuard)
@RequirePermissions('shifts:create')
@RequireFacilityAccess() // User must have access to this facility
```

## 4. Input Validation

### Every external input is validated with Zod at the boundary:

```typescript
const CreateShiftSchema = z
  .object({
    facilityId: z.string().uuid(),
    departmentId: z.string().uuid(),
    role: z.enum(['RN', 'LPN', 'CNA', 'RT', 'ALLIED']),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    payRate: z.number().positive().max(500), // sanity cap
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: 'End time must be after start time',
  });
```

### Never trust client input for:

- `tenantId` (always from JWT, never from request body)
- `userId` (always from JWT)
- Role/permissions (always from JWT)
- Timestamps for audit (always server-generated)

## 5. Secrets Management

### Local development:

- `.env` file (gitignored) with local-only values
- `.env.example` committed with placeholder descriptions
- No real API keys in `.env.example`

### Production:

- AWS Secrets Manager for all secrets
- Rotated automatically where possible
- Never in environment variables at build time
- Never in Docker images

### What counts as a secret:

- Database passwords
- API keys (any external service)
- JWT signing keys
- Encryption keys
- OAuth client secrets
- Webhook signing secrets

## 6. Data Classification in Code

```typescript
// Mark sensitive fields explicitly
interface Worker {
  id: string; // INTERNAL
  tenantId: string; // INTERNAL
  firstName: string; // CONFIDENTIAL
  lastName: string; // CONFIDENTIAL
  email: string; // CONFIDENTIAL
  /** @classification RESTRICTED — never log, always encrypt at rest */
  ssn?: string;
  /** @classification RESTRICTED */
  dateOfBirth?: string;
}
```

### API responses MUST NOT leak restricted data:

- Worker SSN: never returned in API responses
- Full credentials: return status only, not document content
- Internal IDs of other tenants: never
- System internals (stack traces, SQL queries): never in production errors

---
