/**
 * Thrown when a database operation is attempted without tenant context.
 * Indicates a programming error — all tenant-scoped operations must have context.
 */
export class DatabaseContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseContextError';
  }
}

/**
 * Thrown when a tenant isolation violation is detected.
 * This is a critical security event that should be alerted on.
 */
export class TenantIsolationError extends Error {
  public readonly attemptedTenantId: string;

  constructor(message: string, attemptedTenantId: string) {
    super(message);
    this.name = 'TenantIsolationError';
    this.attemptedTenantId = attemptedTenantId;
  }
}
