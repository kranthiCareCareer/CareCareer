import { createHash } from 'node:crypto';

import type { TransactionClient } from '@carecareer/database';

/**
 * Credential mutation idempotency guard.
 *
 * Ensures exactly-once semantics for credential operations.
 * Scoped by tenant_id + idempotency_key + request_hash.
 *
 * Behavior:
 * - Same key + same request → returns original result (replay)
 * - Same key + different request → throws IdempotencyConflictError
 * - New key → executes operation and stores result
 * - Failed transaction → no idempotency record persisted
 */

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  readonly httpStatus = 409;

  constructor() {
    super('Idempotency key exists with different request payload');
    this.name = 'IdempotencyConflictError';
  }
}

export interface IdempotencyCheckResult {
  readonly found: boolean;
  readonly response?: unknown;
}

/**
 * Check if an idempotent request has already been processed.
 * Must be called within a transaction.
 */
export async function checkIdempotency(
  tx: TransactionClient,
  tenantId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<IdempotencyCheckResult> {
  const rows = await tx.$queryRaw<{
    request_hash: string;
    response_body: unknown;
    status: string;
  }>`
    SELECT request_hash, response_body, status
    FROM staffing.idempotency_records
    WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${idempotencyKey}`;

  if (rows.length === 0) {
    return { found: false };
  }

  const existing = rows[0]!;

  // Same key but different request → conflict
  if (existing.request_hash !== requestHash) {
    throw new IdempotencyConflictError();
  }

  // Same key and same request → replay
  return { found: true, response: existing.response_body };
}

/**
 * Record a completed idempotent operation.
 * Must be called within the same transaction as the mutation.
 */
export async function recordIdempotency(
  tx: TransactionClient,
  tenantId: string,
  idempotencyKey: string,
  operation: string,
  requestHash: string,
  response: unknown,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO staffing.idempotency_records (
      tenant_id, idempotency_key, operation, request_hash, response_body
    ) VALUES (
      ${tenantId}::uuid, ${idempotencyKey}, ${operation},
      ${requestHash}, ${JSON.stringify(response)}::jsonb
    )`;
}

/**
 * Compute a deterministic hash of the request payload for comparison.
 */
export function hashRequest(payload: Record<string, unknown>): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sorted).digest('hex');
}
