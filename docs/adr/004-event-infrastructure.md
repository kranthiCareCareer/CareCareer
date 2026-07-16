# ADR-004: Event Infrastructure

- Status: **Accepted**
- Date: 2026-07-16
- Owners: CTO, Platform Engineering Lead
- Decision deadline: N/A (accepted)
- Review trigger: Scale requires infrastructure change; new event pattern needed

## Context

CareCareer requires reliable asynchronous event delivery for domain propagation,
workflow continuation, and integration. The existing Maestra platform uses Kafka
for Bullhorn/Symplr synchronization and internal event routing.

## Decision

**Accepted.** CareCareer uses the following event infrastructure:

### Production (AWS)

1. **Transactional outbox** in the same PostgreSQL transaction as domain state change.
2. **Outbox poller** reads unpublished events and forwards to EventBridge.
3. **Amazon EventBridge** for domain-event routing and fan-out.
4. **Amazon SQS** for durable consumer queues (one queue per consumer per event type).
5. **SQS FIFO** only where ordering is required (per-aggregate ordering).
6. **Dead-letter queues (DLQ)** on every SQS queue.
7. **Retry policy:** Exponential backoff with jitter, max 5 retries before DLQ.
8. **Replay:** DLQ messages can be replayed to source queue after fix.
9. **Deduplication:** Consumers use inbox pattern (eventId-based).

### Local Development

1. **Transactional outbox** (same as production — runs against local PostgreSQL).
2. **BullMQ** (Redis-backed) as the local event transport (replaces EventBridge/SQS).
3. **BullMQ** also handles short-lived background jobs (notifications, scheduling).
4. BullMQ is NOT used in production for durable domain events.

### Legacy Kafka

1. Existing Kafka cluster remains operational for Maestra services.
2. Legacy Kafka topics are consumed ONLY by migration adapters under `migration/`.
3. No CareCareer domain service publishes to or directly consumes Kafka topics.
4. Migration adapters translate Kafka payloads → CareCareer commands/events.
5. CareCareer event names and schemas are completely isolated from Kafka topic schemas.

## Alternatives considered

| Option                     | Pros                                          | Cons                                                                    |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| EventBridge + SQS (chosen) | AWS-native; serverless; DLQ built-in; low ops | Not available locally (BullMQ bridges)                                  |
| Kafka (retain for new)     | Existing infrastructure                       | Operational burden; overkill for CareCareer event volumes; mixes legacy |
| SNS + SQS                  | Simple fan-out                                | Less flexible routing than EventBridge                                  |
| Redis Streams              | Fast; available locally                       | Not durable enough for financial events; no managed DLQ                 |

## Consequences

- Domain events are guaranteed delivered (outbox + durable queue).
- Local dev uses a different transport than production (BullMQ vs SQS).
- The outbox pattern is the same in both environments (portability).
- Migration adapters are the only Kafka touchpoint.

## Security implications

- Event payloads minimize sensitive data (reference IDs, not PII).
- SQS queues are encrypted at rest (SSE-SQS or SSE-KMS).
- EventBridge rules restrict which services can publish/consume.
- DLQ access is restricted and audited.

## Operational implications

- Monitor: outbox lag, queue depth, DLQ depth, consumer processing time.
- Alert: DLQ depth > 0, outbox lag > 60 seconds, consumer failure rate.
- Replay: documented runbook for DLQ replay.
- Scaling: SQS scales automatically; no capacity planning needed.

## Migration implications

- Existing Kafka topics continue undisturbed.
- Migration adapters consume from Kafka and emit CareCareer events.
- When a legacy topic is no longer consumed by any adapter, it can be retired.

## Validation criteria

- [ ] Domain state change + outbox write in one transaction (verified by test)
- [ ] Outbox poller delivers events within 5 seconds of commit
- [ ] Consumer processes event exactly once (inbox deduplication test)
- [ ] DLQ receives events after max retries (failure injection test)
- [ ] DLQ replay successfully reprocesses events
- [ ] No CareCareer service imports Kafka client library
- [ ] Migration adapters correctly translate Kafka → CareCareer event format
- [ ] Local BullMQ transport behaves consistently with SQS (integration test)

## References

- AWS EventBridge documentation
- AWS SQS best practices
- Transactional outbox pattern (microservices.io)
- CARECAREER_MASTER_PACKAGE.md Section 10.3 (Domain Events)
