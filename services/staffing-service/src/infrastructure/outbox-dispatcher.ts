import type { TransactionClient } from '@carecareer/database';

/**
 * Outbox Dispatcher — processes pending outbox events.
 *
 * Pattern: poll → lease → dispatch → publish/dead-letter
 *
 * - Lease: claim events with a worker ID and timeout
 * - Dispatch: send to downstream (event bus, webhook, etc.)
 * - Publish: mark as PUBLISHED with timestamp
 * - Dead-letter: mark as DEAD_LETTER after max attempts
 * - Retry: exponential backoff (1s, 2s, 4s, 8s, 16s)
 *
 * In production, this runs as a periodic job (cron or interval).
 * For now, provides the repository operations needed for dispatching.
 */

export interface OutboxEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAt: string;
}

export interface OutboxDispatcherOps {
  /** Claim up to N pending events for this worker */
  leaseEvents(tx: TransactionClient, workerId: string, limit: number): Promise<OutboxEvent[]>;

  /** Mark event as successfully published */
  markPublished(tx: TransactionClient, eventId: string): Promise<void>;

  /** Mark event as failed, schedule retry or dead-letter */
  markFailed(tx: TransactionClient, eventId: string, error: string): Promise<void>;

  /** Release expired leases (stale workers) */
  releaseExpiredLeases(tx: TransactionClient, maxLeaseSeconds: number): Promise<number>;
}

/**
 * PostgreSQL implementation of outbox dispatcher operations.
 */
export class PostgresOutboxDispatcher implements OutboxDispatcherOps {
  async leaseEvents(
    tx: TransactionClient,
    workerId: string,
    limit: number,
  ): Promise<OutboxEvent[]> {
    // Claim pending events that are ready for processing
    const rows = await tx.$queryRaw<OutboxRow>`
      UPDATE staffing.event_outbox
      SET status = 'LEASED', leased_by = ${workerId}, leased_at = NOW()
      WHERE id IN (
        SELECT id FROM staffing.event_outbox
        WHERE status = 'PENDING'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
    return rows.map(mapOutboxEvent);
  }

  async markPublished(tx: TransactionClient, eventId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE staffing.event_outbox
      SET status = 'PUBLISHED', published_at = NOW(), leased_by = NULL, leased_at = NULL
      WHERE id = ${eventId}::uuid`;
  }

  async markFailed(tx: TransactionClient, eventId: string, error: string): Promise<void> {
    // Increment attempts, schedule retry or dead-letter
    await tx.$executeRaw`
      UPDATE staffing.event_outbox
      SET
        status = CASE
          WHEN attempts + 1 >= max_attempts THEN 'DEAD_LETTER'
          ELSE 'PENDING'
        END,
        attempts = attempts + 1,
        last_error = ${error},
        failed_at = CASE WHEN attempts + 1 >= max_attempts THEN NOW() ELSE failed_at END,
        next_attempt_at = CASE
          WHEN attempts + 1 >= max_attempts THEN NULL
          ELSE NOW() + (POWER(2, attempts) || ' seconds')::interval
        END,
        leased_by = NULL,
        leased_at = NULL
      WHERE id = ${eventId}::uuid`;
  }

  async releaseExpiredLeases(
    tx: TransactionClient,
    maxLeaseSeconds: number,
  ): Promise<number> {
    const count = await tx.$executeRaw`
      UPDATE staffing.event_outbox
      SET status = 'PENDING', leased_by = NULL, leased_at = NULL
      WHERE status = 'LEASED'
        AND leased_at < NOW() - (${maxLeaseSeconds} || ' seconds')::interval`;
    return count;
  }
}

interface OutboxRow {
  id: string; tenant_id: string; event_type: string;
  aggregate_type: string; aggregate_id: string;
  payload: Record<string, unknown>; correlation_id: string;
  status: string; attempts: number; max_attempts: number;
  created_at: string;
}

function mapOutboxEvent(r: OutboxRow): OutboxEvent {
  return {
    id: r.id, tenantId: r.tenant_id, eventType: r.event_type,
    aggregateType: r.aggregate_type, aggregateId: r.aggregate_id,
    payload: r.payload, correlationId: r.correlation_id,
    status: r.status, attempts: r.attempts, maxAttempts: r.max_attempts,
    createdAt: r.created_at,
  };
}
