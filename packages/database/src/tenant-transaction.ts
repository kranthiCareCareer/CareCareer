import { DatabaseContextError } from './errors.js';

/**
 * Minimal interface representing a Prisma-like transaction client.
 * This avoids depending on a generated @prisma/client at the package level.
 * Actual Prisma types are provided by the consuming service.
 */
export interface TransactionClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T = Record<string, unknown>>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
}

/**
 * Minimal interface for a Prisma-like client with $transaction support.
 */
export interface PrismaLikeClient {
  $transaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

/**
 * The transaction client type available within a tenant-scoped transaction.
 * Services should use their generated Prisma client type for full model access.
 */
export type TenantTransactionClient = TransactionClient;

/**
 * Tenant-aware database transaction wrapper.
 *
 * CRITICAL SECURITY COMPONENT:
 * - Sets RLS context using SET LOCAL (transaction-scoped only)
 * - SET LOCAL ensures context is cleared on transaction end (commit or rollback)
 * - Connection pool reuse cannot leak tenant context
 * - All tenant-scoped database access MUST go through this wrapper
 *
 * Usage:
 * ```typescript
 * const tenantTx = new TenantAwareTransaction(prisma);
 * const result = await tenantTx.execute(tenantId, async (tx) => {
 *   return tx.worker.findMany(); // RLS automatically filters by tenant
 * });
 * ```
 */
export class TenantAwareTransaction {
  private readonly prisma: PrismaLikeClient;
  private readonly maxTimeout: number;

  constructor(prisma: PrismaLikeClient, maxTimeout: number = 30000) {
    this.prisma = prisma;
    this.maxTimeout = maxTimeout;
  }

  /**
   * Execute a database operation within a tenant-scoped transaction.
   *
   * Security guarantees:
   * 1. Tenant context is set using SET LOCAL (transaction-scoped)
   * 2. Context is automatically cleared on transaction end
   * 3. Pooled connections cannot retain previous tenant state
   * 4. Exceptions cause rollback (clearing context)
   * 5. Missing tenant ID throws immediately (fail-closed)
   *
   * @param tenantId - The tenant ID to scope this transaction to
   * @param operation - The database operation to execute
   * @returns The result of the operation
   * @throws DatabaseContextError if tenantId is missing or invalid
   */
  async execute<T>(tenantId: string, operation: (tx: TransactionClient) => Promise<T>): Promise<T> {
    if (!tenantId) {
      throw new DatabaseContextError(
        'Tenant ID is required for database operations. ' +
          'Ensure the request has been authenticated and tenant context resolved.',
      );
    }

    if (!isValidUuid(tenantId)) {
      throw new DatabaseContextError(
        `Invalid tenant ID format: '${tenantId.substring(0, 8)}...' is not a valid UUID.`,
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        // SET LOCAL ensures the setting is scoped to THIS transaction only.
        // When the transaction commits or rolls back, the setting is cleared.
        // This prevents tenant context leaking to other connections in the pool.
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`;

        return operation(tx);
      },
      {
        maxWait: 5000,
        timeout: this.maxTimeout,
      },
    );
  }

  /**
   * Execute a read-only query within tenant context.
   * Same isolation guarantees as execute, but signals read-only intent.
   */
  async query<T>(tenantId: string, operation: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.execute(tenantId, operation);
  }
}

/**
 * Validate UUID format (v4 or v7).
 * Does not allow arbitrary strings — only valid UUIDs.
 */
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
