import { v7 as uuidv7 } from 'uuid';

import type { TransactionClient } from '@carecareer/database';
import { getContext } from '@carecareer/request-context';

import { OutboxWriteError } from './errors.js';
import type { EventEnvelope } from './event-envelope.js';

/**
 * Parameters for writing an event to the outbox.
 */
export interface OutboxWriteParams<TData = unknown> {
  readonly eventType: string;
  readonly eventVersion?: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly data: TData;
  readonly causationId?: string;
}

/**
 * Writes domain events to the transactional outbox.
 *
 * CRITICAL: Must use the SAME transaction client as the domain write.
 * This guarantees atomic commit of domain state + event publication intent.
 *
 * Usage:
 * ```typescript
 * await tenantDatabase.execute(tenantId, async (tx) => {
 *   const result = await repo.create(tx, data);
 *   await outboxWriter.write(tx, {
 *     eventType: 'carecareer.entity.created.v1',
 *     aggregateId: result.id,
 *     aggregateVersion: result.version,
 *     data: { ... },
 *   });
 *   return result;
 * });
 * ```
 */
export class OutboxWriter {
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Write an event to the outbox within the same transaction.
   * The event will be published asynchronously by the outbox publisher.
   */
  async write<TData>(
    tx: TransactionClient,
    params: OutboxWriteParams<TData>,
  ): Promise<EventEnvelope<TData>> {
    const context = getContext();
    const tenantId = context?.tenantId;

    if (!tenantId) {
      throw new OutboxWriteError('Cannot write outbox event without tenant context');
    }

    const envelope: EventEnvelope<TData> = {
      eventId: uuidv7(),
      eventType: params.eventType,
      eventVersion: params.eventVersion ?? 1,
      tenantId,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      occurredAt: new Date().toISOString(),
      correlationId: context.correlationId,
      causationId: params.causationId,
      source: this.source,
      actor: context.actorId
        ? { type: context.actorType ?? 'system', id: context.actorId }
        : undefined,
      data: params.data,
    };

    try {
      await tx.$executeRaw`
        INSERT INTO event_outbox (
          id, tenant_id, event_type, event_version,
          aggregate_type, aggregate_id, aggregate_version,
          payload, correlation_id, causation_id,
          occurred_at, status, attempt_count, created_at
        ) VALUES (
          ${envelope.eventId}, ${tenantId}, ${envelope.eventType}, ${envelope.eventVersion},
          ${envelope.aggregateType}, ${envelope.aggregateId}, ${envelope.aggregateVersion},
          ${JSON.stringify(envelope)}::jsonb, ${envelope.correlationId}, ${envelope.causationId ?? null},
          ${envelope.occurredAt}, 'PENDING', 0, NOW()
        )
      `;
    } catch (error: unknown) {
      throw new OutboxWriteError(
        `Failed to write outbox event: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    return envelope;
  }
}
