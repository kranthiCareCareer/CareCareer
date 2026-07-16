/**
 * Outbox record status.
 */
export type OutboxStatus = 'PENDING' | 'PUBLISHED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';

/**
 * Transactional outbox record.
 * Written in the same transaction as the domain state change.
 */
export interface OutboxRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly payload: string;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: string;
  readonly status: OutboxStatus;
  readonly publishedAt?: string | undefined;
  readonly attemptCount: number;
  readonly lastError?: string | undefined;
  readonly createdAt: string;
  readonly lockedUntil?: string | undefined;
}
