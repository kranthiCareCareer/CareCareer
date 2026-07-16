import type { IdempotencyRecord } from './idempotency-record.js';

/**
 * Idempotency store interface.
 * In-memory for unit tests; PostgreSQL for integration/production.
 *
 * PostgreSQL implementation requirements (for integration suite):
 * - UNIQUE constraint on (tenant_id, operation, idempotency_key)
 * - SELECT ... FOR UPDATE SKIP LOCKED for atomic claim
 * - locked_until for lease-based concurrency control
 * - TTL-based expiration via expires_at
 */
export interface IdempotencyStore {
  /**
   * Atomically claim an idempotency key.
   * Returns existing record if already claimed, or creates a new PROCESSING record.
   *
   * Concurrent calls with the same key:
   * - First caller creates the record and returns { claimed: true }
   * - Second caller finds the record and returns { claimed: false, existing: record }
   */
  claim(params: {
    tenantId: string;
    actorId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
    expiresAt: Date;
    lockDurationMs: number;
  }): Promise<ClaimResult>;

  /**
   * Mark a claimed record as completed with the response.
   */
  complete(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
    responseStatus: number;
    responseBody: unknown;
    resourceType?: string;
    resourceId?: string;
  }): Promise<void>;

  /**
   * Mark a claimed record as failed (retryable or terminal).
   */
  fail(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
    status: 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';
    error?: string;
  }): Promise<void>;

  /**
   * Find an existing record by key.
   */
  find(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
  }): Promise<IdempotencyRecord | undefined>;
}

export type ClaimResult =
  | { readonly claimed: true; readonly record: IdempotencyRecord }
  | { readonly claimed: false; readonly existing: IdempotencyRecord };
