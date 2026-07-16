# ADR-008: Legacy Integration Boundaries

- Status: **Accepted**
- Date: 2026-07-16
- Owners: CTO, Platform Engineering Lead, Migration Lead
- Decision deadline: N/A (accepted)
- Review trigger: New legacy system integration required

## Context

The current Maestra platform includes dedicated Symplr, Bullhorn, identity-mapping,
data-streaming, and Kafka dispatch services. These handle bidirectional synchronization
between licensed platforms. CareCareer must interact with these legacy systems during
migration without allowing vendor-specific concepts to pollute the new domain model.

## Decision

**Accepted.** An explicit anti-corruption layer (ACL) separates legacy systems from
CareCareer domain services.

### Integration Flow

```
Legacy system payload (Symplr/Bullhorn/Maestra)
    │
    ▼
Vendor adapter (under migration/)
    │  - Receives vendor-specific DTOs
    │  - Validates and sanitizes input
    │  - Translates to CareCareer canonical model
    │  - Maps external IDs to canonical IDs via external_references
    │
    ▼
CareCareer command or domain event
    │
    ▼
Domain service (standard processing)
```

### Rules

1. **Vendor DTOs, IDs, statuses, and error codes MUST NOT cross into CareCareer
   domain models.** Translation happens exclusively in the adapter.
2. **External system IDs are aliases,** stored in `external_references` table, never
   used as foreign keys between CareCareer tables.
3. **Vendor-specific business logic MUST NOT be replicated** in CareCareer services.
   If Symplr calculates something, CareCareer implements its own deterministic logic.
4. **Adapter code lives under `migration/connectors/{vendor}/`** — clearly separated
   from domain code.
5. **Adapters are unidirectional per concern:**
   - Inbound: legacy → CareCareer (read/import)
   - Outbound: CareCareer → legacy (propagation during coexistence)
6. **Each adapter has a documented retirement condition.**
7. **Legacy Kafka payloads are consumed only by adapters,** never by domain services.
8. **Adapters produce standard CareCareer events** — downstream consumers cannot tell
   if the event originated from a user action or a legacy import.
9. **Adapters handle:**
   - Schema mapping (vendor field names → canonical field names)
   - Status mapping (vendor statuses → CareCareer state machine states)
   - ID resolution (vendor IDs → canonical UUIDs)
   - Error translation (vendor errors → CareCareer error codes)
   - Idempotency (safe to replay/retry)
   - Reconciliation (comparison output for monitoring)

### Adapter Structure

```
migration/
├── connectors/
│   ├── symplr/
│   │   ├── schemas/          # Vendor DTO definitions
│   │   ├── mappers/          # Vendor → canonical translation
│   │   ├── readers/          # Read from Symplr replicated DB
│   │   ├── writers/          # Write to Symplr (coexistence only)
│   │   └── reconciliation/   # Comparison logic
│   ├── bullhorn/
│   │   ├── schemas/
│   │   ├── mappers/
│   │   ├── webhook-handler/  # Inbound webhooks
│   │   └── reconciliation/
│   ├── maestra/
│   │   ├── schemas/
│   │   ├── readers/          # Read from Maestra PostgreSQL
│   │   └── reconciliation/
│   └── kafka/
│       ├── consumers/        # Legacy topic consumers
│       └── translators/      # Kafka message → CareCareer event
├── mappings/                  # Field mapping documentation
├── reconciliation/            # Cross-system comparison tooling
└── backfills/                 # One-time data migration scripts
```

## Alternatives considered

| Option                                | Pros                                     | Cons                                                      |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| ACL with explicit adapters (chosen)   | Clean domain; vendor swap safe; testable | More code in adapter layer                                |
| Direct integration in domain services | Less code initially                      | Vendor concepts leak everywhere; hard to retire           |
| Reuse existing Maestra sync services  | Existing code                            | Built for Maestra patterns; would perpetuate legacy model |
| Integration platform (MuleSoft, etc.) | Visual flow design                       | Additional vendor; license cost; operational overhead     |

## Consequences

- Domain services remain clean and vendor-agnostic.
- Legacy retirement is a matter of removing adapters, not refactoring domain code.
- Adapter layer adds maintenance during coexistence (temporary).
- Reconciliation logic lives in one place (not scattered across services).

## Security implications

- Adapters validate/sanitize all legacy input (untrusted source).
- Legacy database credentials scoped to read-only where possible.
- Adapter access logged and auditable.
- No vendor API keys in domain service configuration.

## Operational implications

- Monitor adapter health independently from domain services.
- Alert on adapter failures (legacy system unavailable, schema mismatch).
- Adapter metrics: records imported, reconciliation match rate, errors.

## Migration implications

- This IS the migration architecture. Adapters enable controlled coexistence.
- Each adapter retirement removes a dependency without touching domain code.

## Validation criteria

- [ ] No vendor-specific types imported in domain service code
- [ ] No Kafka client library in domain service dependencies
- [ ] External IDs resolved via external_references table
- [ ] Adapter produces standard CareCareer events (indistinguishable from user-originated)
- [ ] Legacy input validated/sanitized before entering domain
- [ ] Each adapter has a documented retirement condition and milestone

## References

- Anti-corruption layer pattern (DDD)
- CARECAREER_MASTER_PACKAGE.md Section 3.2 (Strangler Migration Rule)
- Existing Maestra Kafka consumer services (reference for current behavior)
