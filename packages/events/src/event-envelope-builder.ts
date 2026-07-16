import { getContext } from '@carecareer/request-context';
import { v7 as uuidv7 } from 'uuid';


import type { EventEnvelope } from './event-envelope.js';

/**
 * Builds event envelopes with automatic context enrichment.
 * Derives correlation, tenant, and actor from request context.
 * Requires explicit aggregate details.
 */
export class EventEnvelopeBuilder {
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Build an event envelope.
   * Automatically enriches with correlation ID, tenant, and actor from request context.
   */
  build<TData>(params: {
    eventType: string;
    eventVersion?: number;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    data: TData;
    causationId?: string;
    tenantId?: string;
    correlationId?: string;
  }): EventEnvelope<TData> {
    const context = getContext();

    const tenantId = params.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new Error('Cannot build event envelope without tenant context');
    }

    const correlationId = params.correlationId ?? context?.correlationId ?? uuidv7();

    return {
      eventId: uuidv7(),
      eventType: params.eventType,
      eventVersion: params.eventVersion ?? 1,
      tenantId,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      occurredAt: new Date().toISOString(),
      correlationId,
      causationId: params.causationId,
      source: this.source,
      actor: context
        ? { type: context.actorType ?? 'system', id: context.actorId }
        : undefined,
      data: params.data,
    };
  }
}
