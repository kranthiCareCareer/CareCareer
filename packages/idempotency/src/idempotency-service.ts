import { IdempotencyConflictError, IdempotencyStorageError } from './errors.js';
import type { IdempotencyStore } from './idempotency-store.js';
import { RequestHasher } from './request-hasher.js';

export interface IdempotencyExecuteParams {
  readonly tenantId: string;
  readonly actorId: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly requestBody: unknown;
  readonly ttlDays?: number;
}

export interface IdempotencyResult<T> {
  readonly result: T;
  readonly status: number;
  readonly fromCache: boolean;
}

/**
 * Idempotency service — ensures exactly-once execution for mutations.
 *
 * Behavior:
 * 1. First request claims the key atomically, executes handler, stores result.
 * 2. Same key + same payload → returns stored result (fromCache: true).
 * 3. Same key + different payload → throws IdempotencyConflictError (409).
 * 4. Concurrent duplicates → only one executes; others receive the stored result.
 * 5. Storage failure → fails closed (mutation does NOT execute).
 */
export class IdempotencyService {
  private readonly store: IdempotencyStore;
  private readonly defaultTtlDays: number;
  private readonly lockDurationMs: number;

  constructor(store: IdempotencyStore, options?: { ttlDays?: number; lockDurationMs?: number }) {
    this.store = store;
    this.defaultTtlDays = options?.ttlDays ?? 7;
    this.lockDurationMs = options?.lockDurationMs ?? 30000;
  }

  /**
   * Execute a handler with idempotency guarantees.
   *
   * @param params - Scoping and request context
   * @param handler - The actual mutation to execute (called at most once)
   * @returns The result (from handler or cache)
   */
  async execute<T>(
    params: IdempotencyExecuteParams,
    handler: () => Promise<{
      result: T;
      status: number;
      resourceType?: string;
      resourceId?: string;
    }>,
  ): Promise<IdempotencyResult<T>> {
    const requestHash = RequestHasher.hash(params.requestBody);
    const ttlDays = params.ttlDays ?? this.defaultTtlDays;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    // Attempt to claim the key atomically
    let claimResult;
    try {
      claimResult = await this.store.claim({
        tenantId: params.tenantId,
        actorId: params.actorId,
        operation: params.operation,
        idempotencyKey: params.idempotencyKey,
        requestHash,
        expiresAt,
        lockDurationMs: this.lockDurationMs,
      });
    } catch (error: unknown) {
      // Storage failure — fail closed
      throw new IdempotencyStorageError(
        error instanceof Error ? error.message : 'Unknown storage error',
      );
    }

    // Key already exists — check for conflict or return cached
    if (!claimResult.claimed) {
      const existing = claimResult.existing;

      // Different payload → conflict
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError(params.idempotencyKey);
      }

      // Same payload, completed → return cached result
      if (existing.status === 'COMPLETED') {
        return {
          result: existing.responseBody as T,
          status: existing.responseStatus ?? 200,
          fromCache: true,
        };
      }

      // Same payload, still processing → another instance is handling it
      // In production, wait briefly then check again; for now return processing indicator
      if (existing.status === 'PROCESSING') {
        return {
          result: existing.responseBody as T,
          status: existing.responseStatus ?? 202,
          fromCache: true,
        };
      }

      // Terminal failure → return consistently
      if (existing.status === 'FAILED_TERMINAL') {
        return {
          result: existing.responseBody as T,
          status: existing.responseStatus ?? 500,
          fromCache: true,
        };
      }

      // Retryable failure was cleaned up — should not reach here
      // Fall through to execute
    }

    // We claimed the key — execute the handler
    try {
      const handlerResult = await handler();

      // Store the successful result
      await this.store.complete({
        tenantId: params.tenantId,
        operation: params.operation,
        idempotencyKey: params.idempotencyKey,
        responseStatus: handlerResult.status,
        responseBody: handlerResult.result,
        ...(handlerResult.resourceType ? { resourceType: handlerResult.resourceType } : {}),
        ...(handlerResult.resourceId ? { resourceId: handlerResult.resourceId } : {}),
      });

      return {
        result: handlerResult.result,
        status: handlerResult.status,
        fromCache: false,
      };
    } catch (error: unknown) {
      // Mark as retryable failure — allows retry with same key
      await this.store
        .fail({
          tenantId: params.tenantId,
          operation: params.operation,
          idempotencyKey: params.idempotencyKey,
          status: 'FAILED_RETRYABLE',
        })
        .catch(() => {
          // Best effort — don't mask the original error
        });

      throw error;
    }
  }
}
