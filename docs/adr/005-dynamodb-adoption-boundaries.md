# ADR-005: DynamoDB Adoption Boundaries

- Status: **Deferred**
- Date: 2026-07-16
- Owners: CTO, Database Lead
- Decision deadline: After pilot load testing demonstrates PostgreSQL limitations
- Review trigger: Clock event write volume exceeds PostgreSQL capacity at pilot scale

## Context

DynamoDB offers sub-millisecond latency and automatic scaling for high-throughput
workloads. However, introducing two data stores on day one creates dual consistency
models, cross-store reconciliation, additional backup strategies, more testing paths,
and harder transactional workflows.

PostgreSQL can handle pilot-scale clock events and availability data. DynamoDB
should be introduced only when measured workload demonstrates PostgreSQL is unsuitable.

## Decision

**Deferred.** PostgreSQL is the sole data store for the golden-path pilot.

### Permitted Future Uses (When Measured Need Exists)

- High-volume immutable clock telemetry (thousands of writes/second)
- Availability indexes (real-time worker availability projections)
- Idempotency records at extreme scale (millions of keys)
- Short-lived materialized views (hot projections with TTL)
- Session/rate-limiting data (if Redis is insufficient)

### Explicitly Prohibited Initial Uses

- Worker master records
- Credential records
- Assignment records
- Timecard records (authoritative)
- Pay/bill calculation records
- Any financially authoritative state
- Any record requiring multi-table ACID transactions

### Introduction Criteria

DynamoDB may be introduced when ALL of the following are true:

1. Measured write volume exceeds PostgreSQL provisioned IOPS at acceptable cost
2. Access pattern is key-value or time-series (not relational joins)
3. Data does not require multi-table ACID transactions
4. An ADR documents the specific use case, access pattern, and consistency model
5. Reconciliation between PostgreSQL and DynamoDB is designed
6. Backup and restore procedures are tested
7. Local development uses DynamoDB Local (Docker) for parity

## Alternatives considered

| Option                           | Pros                                      | Cons                                                      |
| -------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| PostgreSQL only (chosen for now) | One consistency model; simpler operations | May hit write limits at scale                             |
| DynamoDB from day one            | Future-proof for scale                    | Premature complexity; dual consistency; harder testing    |
| TimescaleDB                      | Time-series on PostgreSQL                 | Additional extension; limited community for this use case |

## Consequences

- Pilot is simpler: one database, one consistency model, one backup strategy.
- If pilot proves PostgreSQL is sufficient at expected volumes, DynamoDB may never be needed.
- If scale requires it, the migration path from PostgreSQL to DynamoDB for specific tables is well-understood.

## Security implications

- Single database simplifies access control and audit.
- If DynamoDB is added later, RLS-equivalent controls must be implemented via IAM and attribute filtering.

## Operational implications

- One database to monitor, backup, and restore in pilot.
- Reduced cognitive load for the engineering team.

## Migration implications

- No impact on pilot. DynamoDB introduction would be a future migration.

## Validation criteria

- [ ] All golden-path data stored in PostgreSQL
- [ ] Load tests demonstrate PostgreSQL handles pilot write volume
- [ ] No DynamoDB client library in golden-path service dependencies
- [ ] Decision revisited after pilot load testing results

## References

- DynamoDB documentation
- PostgreSQL performance tuning for high-write workloads
- CARECAREER_MASTER_PACKAGE.md Section 6 (DynamoDB usage)
