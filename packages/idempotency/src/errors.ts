/**
 * Thrown when the same idempotency key is used with a different payload.
 */
export class IdempotencyConflictError extends Error {
  public readonly code = 'IDEMPOTENCY_CONFLICT' as const;

  constructor(key: string) {
    super(`Idempotency conflict: key '${key}' was previously used with a different payload`);
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * Thrown when the idempotency store is unavailable.
 * Mutations MUST fail closed when storage is unavailable.
 */
export class IdempotencyStorageError extends Error {
  public readonly code = 'IDEMPOTENCY_STORAGE_FAILURE' as const;

  constructor(message: string) {
    super(`Idempotency storage failure: ${message}`);
    this.name = 'IdempotencyStorageError';
  }
}
