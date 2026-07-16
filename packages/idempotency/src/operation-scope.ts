/**
 * Builds the scoped operation key for idempotency.
 * Scope includes tenant, endpoint/method, and optionally actor.
 */
export class OperationScope {
  /**
   * Build a scoped operation string.
   * Format: {method}:{path}
   */
  static fromRequest(method: string, path: string): string {
    return `${method.toUpperCase()}:${path}`;
  }

  /**
   * Build a custom operation scope for non-HTTP contexts (queues, jobs).
   */
  static custom(domain: string, operation: string): string {
    return `${domain}:${operation}`;
  }
}
