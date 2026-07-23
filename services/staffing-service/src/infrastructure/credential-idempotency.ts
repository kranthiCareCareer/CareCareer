import { createHash } from 'node:crypto';

import type { TransactionClient } from '@carecareer/database';

/**
 * Credential mutation idempotency guard.
 *
 * Ensures exactly-once semantics for credential operations.
 * Scoped by: tenant_id + operation + idempotency_key
 *
 * States:
 * - IN_PROGRESS: key claimed, mutation executing
 * - COMPLETED: mutation succeeded, response stored
 * - FAILED: mutation failed, key can be retried
 *
 * Flow:
 * 1. claimIdempotencyKey() — atomic INSERT ... ON CONFLICT DO NOTHING
 *    - If no existing record: inserts IN_PROGRESS, returns { claimed: true }
 *    - If existing COMPLETED + same hash: returns { claimed: false, replay: response }
 *    - If existing COMPLETED + different hash: throws IdempotencyConflictError
 *    - If existing IN_PROGRESS + not expired: throws IdempotencyInProgressError
 *    - If existing IN_PROGRESS + expired: reclaims the key
 *    - If existing FAILED: reclaims the key
 * 2. Execute business mutation within same transaction
 * 3. completeIdempotency() — updates status to COMPLETED with response
 *
 * On transaction failure: record remains IN_PROGRESS and will expire/be reclaimed.
 */

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  readonly httpStatus = 409;

  constructor() {
    super('Idempotency key already used with different request payload');
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyInProgressError extends Error {
  readonly code = 'IDEMPOTENCY_IN_PROGRESS';
  readonly httpStatus = 409;

  constructor() {
    super('Request with this idempotency key is currently being processed');
    this.name = 'IdempotencyInProgressError';
  }
}

export interface IdempotencyClaimResult {
  readonly claimed: boolean;
  readonly replay?: { httpStatus: number; response: unknown };
}

/** Stale IN_PROGRESS threshold: 5 minutes */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Attempt to claim an idempotency key atomically.
 * Must be called within a transaction BEFORE the business mutation.
 */
export async function claimIdempotencyKey(
  tx: TransactionClient,
  tenantId: string,
  operation: string,
  idempotencyKey: string,
  requestHash: string,
  now: Date = new Date(),
): Promise<IdempotencyClaimResult> {
  // Check for existing record
  const existing = await tx.$queryRaw<{
    status: string;
    request_hash: string;
    http_status: number | null;
    response_body: unknown;
    created_at: string;
    expires_at: string;
  }>`
    SELECT status, request_hash, http_status, response_body, created_at, expires_at
    FROM staffing.idempotency_records
    WHERE tenant_id = ${tenantId}::uuid
      AND operation = ${operation}
      AND idempotency_key = ${idempotencyKey}
    FOR UPDATE`;

  if (existing.length === 0) {
    // No existing record — claim the key
    await tx.$executeRaw`
      INSERT INTO staffing.idempotency_records (
        tenant_id, operation, idempotency_key, request_hash, status
      ) VALUES (
        ${tenantId}::uuid, ${operation}, ${idempotencyKey}, ${requestHash}, ${'IN_PROGRESS'}
      )`;
    return { claimed: true };
  }

  const record = existing[0]!;

  if (record.status === 'COMPLETED') {
    if (record.request_hash === requestHash) {
      // Replay — return original response
      return {
        claimed: false,
        replay: {
          httpStatus: record.http_status ?? 200,
          response: record.response_body,
        },
      };
    }
    // Different payload with same key
    throw new IdempotencyConflictError();
  }

  if (record.status === 'FAILED') {
    // Failed records can be reclaimed — update to IN_PROGRESS
    await tx.$executeRaw`
      UPDATE staffing.idempotency_records
      SET status = 'IN_PROGRESS', request_hash = ${requestHash}, created_at = NOW()
      WHERE tenant_id = ${tenantId}::uuid
        AND operation = ${operation}
        AND idempotency_key = ${idempotencyKey}`;
    return { claimed: true };
  }

  // IN_PROGRESS — check if stale
  const createdAt = new Date(record.created_at);
  if (now.getTime() - createdAt.getTime() > STALE_THRESHOLD_MS) {
    // Stale IN_PROGRESS — reclaim
    await tx.$executeRaw`
      UPDATE staffing.idempotency_records
      SET status = 'IN_PROGRESS', request_hash = ${requestHash}, created_at = NOW()
      WHERE tenant_id = ${tenantId}::uuid
        AND operation = ${operation}
        AND idempotency_key = ${idempotencyKey}`;
    return { claimed: true };
  }

  // Active IN_PROGRESS — another request is executing
  throw new IdempotencyInProgressError();
}

/**
 * Mark an idempotency key as completed with the response.
 * Must be called within the same transaction after the business mutation.
 */
export async function completeIdempotency(
  tx: TransactionClient,
  tenantId: string,
  operation: string,
  idempotencyKey: string,
  httpStatus: number,
  response: unknown,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE staffing.idempotency_records
    SET status = 'COMPLETED',
        http_status = ${httpStatus},
        response_body = ${JSON.stringify(response)}::jsonb,
        completed_at = NOW()
    WHERE tenant_id = ${tenantId}::uuid
      AND operation = ${operation}
      AND idempotency_key = ${idempotencyKey}`;
}

/**
 * Compute a deterministic hash of the request payload.
 * Uses recursive key sorting for nested objects.
 */
export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}

/** Recursive canonical JSON serialization */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k]));
    return '{' + entries.join(',') + '}';
  }
  return String(value);
}
