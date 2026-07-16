---
inclusion: always
---

# CareCareer Testing Standards

## 1. Coverage Requirements

| Layer | Minimum Coverage | Target Coverage |
|-------|-----------------|-----------------|
| Domain logic (state machines, calculations, rules) | 95% | 100% |
| Application layer (use cases, commands) | 85% | 95% |
| Infrastructure adapters | 80% | 90% |
| HTTP controllers | 80% | 90% |
| Overall per service | 85% | 95% |

Coverage is enforced in CI. A PR with coverage below thresholds is blocked.

## 2. Test Pyramid

```
         ┌─────────┐
         │  E2E    │  ~10% — Critical user journeys only
         ├─────────┤
         │ Integr. │  ~30% — Service + DB + adapters together
         ├─────────┤
         │  Unit   │  ~60% — Pure logic, fast, isolated
         └─────────┘
```

## 3. What Each Layer Tests

### Unit Tests (Vitest)
- Domain entities and value objects
- State machine transitions (every valid AND invalid transition)
- Business rules and calculations (pay rules, eligibility, validation)
- Pure utility functions
- No database, no network, no file system
- Use dependency injection with mock/stub implementations
- Must run in <5 seconds total per service

### Integration Tests (Vitest + Testcontainers)
- Repository implementations against real PostgreSQL (via Testcontainers)
- Event publishing and consuming
- External adapter behavior (MinIO, Redis, search)
- Database migrations (up AND down)
- RLS policies (tenant isolation — can tenant A see tenant B's data? NO)
- Transaction boundaries (rollback on failure)

### E2E Tests (Vitest + Supertest or Playwright)
- Full HTTP request/response cycles
- Authentication and authorization flows
- Multi-step workflows (create job → submit candidate → approve)
- Error responses (correct status codes, error bodies)
- Pagination, filtering, sorting behavior

## 4. Test Writing Rules

### Every test MUST have:
- Descriptive name: `should reject shift assignment when worker credential is expired`
- Arrange/Act/Assert (AAA) pattern clearly separated
- Single assertion focus (one logical assertion per test)
- No shared mutable state between tests
- Cleanup after itself (database, files, etc.)

### Test naming convention:
```typescript
describe('ShiftService', () => {
  describe('assignWorker', () => {
    it('should assign worker when all credentials are valid', () => {});
    it('should reject assignment when license is expired', () => {});
    it('should reject assignment when worker has scheduling conflict', () => {});
    it('should emit ShiftAssigned event on success', () => {});
    it('should NOT emit event on failure', () => {});
  });
});
```

### Factories over raw data:
```typescript
// ✅ GOOD — use factories
const worker = WorkerFactory.create({ status: 'ACTIVE', tenantId: tenantA });
const shift = ShiftFactory.create({ facilityId: facility.id, tenantId: tenantA });

// ❌ BAD — raw object literals scattered everywhere
const worker = { id: 'abc', firstName: 'John', ... };
```

## 5. Regression Testing

- Every bug fix MUST include a failing test FIRST, then the fix
- State machine tests must cover EVERY transition (allowed + denied)
- Pay/bill calculation tests use decision tables (all rule combinations)
- Credential blocking tests must prove: expired = blocked, always

## 6. When to Ask Requirements

If any of these are unclear, STOP and ask before implementing:
- Business rule ambiguity (what happens when X AND Y are both true?)
- Edge cases with financial impact (rounding, overtime thresholds)
- Compliance implications (what must be blocked vs warned?)
- Multi-tenant behavior (does this cross tenant boundaries?)
- State machine transitions (is this transition allowed?)

---
