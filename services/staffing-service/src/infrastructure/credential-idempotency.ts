import { createHash, randomUUID } from 'node:crypto';

import type { TransactionClient } from '@carecareer/database';

/**
 * Credential mutation idempotency guard.
 *
 * Concurrency-safe design using INSERT ON CONFLICT:
 *
 * 1. INSERT ... ON CONFLICT DO NOTHING — atomic upsert attempt
 * 2. SELECT FOR UPDATE — lock the winner row
 * 3. Inspect status + claim_token + request_hash
 * 4. Decide: claimed | replay | conflict | in-progress | reclaim
 *
 * This guarantees exactly one transaction executes the business mutation,
 * even under concurrent duplicate requests.
 *
 * States:
 * - IN_PROGRESS: key claimed, mutation executing, owned by claim_token
 * - COMPLETED: mutation succeeded, response stored
 * - FAILED: mutation failed, key can be retried
 *
 * Lease: IN_PROGRESS records older than STALE_THRESHOLD can be reclaimed.
 * Completion: only the holder of the claim_token can complete.
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

export class IdempotencyOwnershipError extends Error {
  readonly code = 'IDEMPOTENCY_OWNERSHIP_LOST';
  readonly httpStatus = 500;

  constructor() {
    super('Idempotency claim ownership was lost — transaction must roll back');
    this.name = 'IdempotencyOwnershipError';
  }
}

export interface IdempotencyClaimResult {
  readonly claimed: boolean;
  readonly claimToken?: string;
  readonly replay?: { httpStatus: number; response: unknown };
}

/** Stale IN_PROGRESS threshold: 5 minutes */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Attempt to claim an idempotency key atomically.
 * Uses INSERT ON CONFLICT to guarantee only one winner.
 * Must be called within a serializable or at least a FOR UPDATE transaction.
 */
export async function claimIdempotencyKey(
  tx: TransactionClient,
  tenantId: string,
  operation: string,
  idempotencyKey: string,
  requestHash: string,
  now: Date = new Date(),
): Promise<IdempotencyClaimResult> {
  const claimToken = randomUUID();

  // Atomic INSERT attempt — only succeeds if no existing record
  const inserted = await tx.$executeRaw`
    INSERT INTO staffing.idempotency_records (
      tenant_id, operation, idempotency_key, request_hash, status, claim_token
    ) VALUES (
      ${tenantId}::uuid, ${operation}, ${idempotencyKey},
      ${requestHash}, ${'IN_PROGRESS'}, ${claimToken}
    ) ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING`;

  if (inserted > 0) {
    // We are the winner — key claimed successfully
    return { claimed: true, claimToken };
  }

  // Record exists — lock it and inspect
  const existing = await tx.$queryRaw<{
    status: string;
    request_hash: string;
    claim_token: string | null;
    http_status: number | null;
    response_body: unknown;
    created_at: string;
  }>`
    SELECT status, request_hash, claim_token, http_status, response_body, created_at
    FROM staffing.idempotency_records
    WHERE tenant_id = ${tenantId}::uuid
      AND operation = ${operation}
      AND idempotency_key = ${idempotencyKey}
    FOR UPDATE`;

  if (existing.length === 0) {
    // Shouldn't happen after ON CONFLICT — defensive
    return { claimed: true, claimToken };
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
    // Failed records can be reclaimed only with the same payload
    if (record.request_hash !== requestHash) {
      throw new IdempotencyConflictError();
    }
    const reclaimed = await tx.$executeRaw`
      UPDATE staffing.idempotency_records
      SET status = 'IN_PROGRESS',
          claim_token = ${claimToken},
          created_at = NOW()
      WHERE tenant_id = ${tenantId}::uuid
        AND operation = ${operation}
        AND idempotency_key = ${idempotencyKey}
        AND status = 'FAILED'`;
    if (reclaimed > 0) {
      return { claimed: true, claimToken };
    }
    throw new IdempotencyInProgressError();
  }

  // IN_PROGRESS — check if stale (lease expired)
  const createdAt = new Date(record.created_at);
  if (now.getTime() - createdAt.getTime() > STALE_THRESHOLD_MS) {
    // Stale — reclaim only with same payload
    if (record.request_hash !== requestHash) {
      throw new IdempotencyConflictError();
    }
    const reclaimed = await tx.$executeRaw`
      UPDATE staffing.idempotency_records
      SET status = 'IN_PROGRESS',
          claim_token = ${claimToken},
          created_at = NOW()
      WHERE tenant_id = ${tenantId}::uuid
        AND operation = ${operation}
        AND idempotency_key = ${idempotencyKey}
        AND status = 'IN_PROGRESS'`;
    if (reclaimed > 0) {
      return { claimed: true, claimToken };
    }
  }

  // Active IN_PROGRESS by another request — reject
  throw new IdempotencyInProgressError();
}

/**
 * Mark an idempotency key as completed.
 * Only the holder of the claim_token can complete.
 * Throws IdempotencyOwnershipError if ownership was lost (forces rollback).
 */
export async function completeIdempotency(
  tx: TransactionClient,
  tenantId: string,
  operation: string,
  idempotencyKey: string,
  claimToken: string,
  httpStatus: number,
  response: unknown,
): Promise<void> {
  const affected = await tx.$executeRaw`
    UPDATE staffing.idempotency_records
    SET status = 'COMPLETED',
        http_status = ${httpStatus},
        response_body = ${JSON.stringify(response)}::jsonb,
        completed_at = NOW()
    WHERE tenant_id = ${tenantId}::uuid
      AND operation = ${operation}
      AND idempotency_key = ${idempotencyKey}
      AND claim_token = ${claimToken}
      AND status = 'IN_PROGRESS'`;
  if (affected === 0) {
    throw new IdempotencyOwnershipError();
  }
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
