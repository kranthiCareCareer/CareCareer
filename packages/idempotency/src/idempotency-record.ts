/**
 * Idempotency record lifecycle states.
 */
export type IdempotencyStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';

/**
 * Stored idempotency record.
 */
export interface IdempotencyRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly status: IdempotencyStatus;
  readonly responseStatus: number | null;
  readonly responseBody: unknown | null;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date;
  readonly lockedUntil: Date | null;
}
