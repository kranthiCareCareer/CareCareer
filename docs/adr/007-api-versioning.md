# ADR-007: API Versioning

- Status: **Accepted**
- Date: 2026-07-16
- Owners: CTO, Platform Engineering Lead
- Decision deadline: N/A (accepted)
- Review trigger: First breaking API change required

## Context

CareCareer APIs will be consumed by web portals, mobile apps, external integrations,
and potentially third-party customers. Breaking changes without a versioning strategy
will cause client failures.

## Decision

**Accepted.** URI-based major versioning with additive-only changes within a version.

### Rules

1. **URI major versions:** `/v1/shifts`, `/v2/shifts`
2. **Additive changes allowed within a major version:**
   - New optional fields in responses
   - New optional query parameters
   - New endpoints
   - New enum values (consumers must handle unknown values gracefully)
3. **Breaking changes require a new major version:**
   - Removing or renaming a field
   - Changing a field's type or semantic meaning
   - Changing required/optional status of request fields
   - Removing an endpoint
   - Changing error code semantics
4. **Consumer-driven compatibility tests** verify no regression.
5. **Deprecation metadata:** Deprecated endpoints include `Sunset` header and
   `X-Deprecated: true` header with documentation link.
6. **Published retirement window:** Minimum 90 days from deprecation to removal.
7. **OpenAPI is the contract source** — generated from code decorators (NestJS Swagger).
8. **Generated clients must pass CI** — type-safe client regeneration on contract change.
9. **Events version independently from APIs** — event versions in `eventType` string.
10. **Database schema versions never appear in public contracts.**

### Version Lifecycle

```
/v1 ACTIVE      — receiving new features (additive only)
/v1 DEPRECATED  — Sunset header set; new version available
/v1 RETIRED     — returns 410 Gone (after retirement window)
```

## Alternatives considered

| Option                     | Pros                                   | Cons                                 |
| -------------------------- | -------------------------------------- | ------------------------------------ |
| URI versioning (chosen)    | Explicit; easy to route; clear in logs | URL changes between versions         |
| Header versioning (Accept) | Clean URLs                             | Hidden; harder to test; proxy issues |
| Query parameter (?v=1)     | Simple                                 | Easy to forget; not RESTful          |
| No versioning              | Simple                                 | Any change can break clients         |

## Consequences

- Clear contract between producer and consumer.
- Mobile apps (which can't force-update) are protected from breaking changes.
- Slightly more endpoints to maintain during transition periods.

## Security implications

- Retired versions return 410, not silently serve stale behavior.
- Version-specific rate limits can be applied.

## Operational implications

- API gateway routes by version prefix.
- Monitoring per version (detect clients still on deprecated versions).
- Generated OpenAPI spec published per version.

## Migration implications

- Initial golden path is `/v1` — no versioning overhead yet.
- First breaking change triggers `/v2` creation with migration guide.

## Validation criteria

- [ ] All endpoints use `/v1` prefix
- [ ] OpenAPI spec generated and published in CI
- [ ] Consumer tests verify backward compatibility on changes
- [ ] Deprecated endpoints include Sunset header
- [ ] No database schema concepts in API contracts

## References

- API versioning best practices (Microsoft REST API guidelines)
- CARECAREER_MASTER_PACKAGE.md Section 10.1 (External APIs)
