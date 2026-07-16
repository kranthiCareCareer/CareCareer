/**
 * Domain event type definitions.
 * All cross-service communication uses this event envelope format.
 * Pattern: <domain>.<entity>.<past-tense-verb>.v<major>
 */

/** Data classification levels for events */
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';

/** Who caused this event */
export interface EventActor {
  type: 'user' | 'service' | 'agent' | 'system';
  id: string;
}

/**
 * Standard domain event envelope.
 * Every event published in the system MUST use this structure.
 */
export interface DomainEvent<TPayload = unknown> {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** Event type following naming pattern: domain.entity.verb.v1 */
  eventType: string;
  /** When the event occurred (ISO 8601) */
  occurredAt: string;
  /** Tenant that owns this event */
  tenantId: string;
  /** Legal entity within tenant (optional) */
  legalEntityId: string | null;
  /** Type of aggregate that produced this event */
  aggregateType: string;
  /** ID of the aggregate that produced this event */
  aggregateId: string;
  /** Version of the aggregate after this event */
  aggregateVersion: number;
  /** Who caused this event */
  actor: EventActor;
  /** Request correlation ID for tracing */
  correlationId: string;
  /** ID of the event that caused this event (optional) */
  causationId: string | null;
  /** Data classification of the payload */
  dataClassification: DataClassification;
  /** Schema version of the payload */
  schemaVersion: number;
  /** Event-specific payload */
  payload: TPayload;
}

/** Metadata for the transactional outbox pattern */
export interface OutboxRecord {
  id: string;
  eventType: string;
  payload: string;
  tenantId: string;
  createdAt: Date;
  publishedAt: Date | null;
  retryCount: number;
  lastError: string | null;
}
