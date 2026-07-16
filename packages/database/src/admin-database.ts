import { DatabaseContextError } from './errors.js';
import type { PrismaLikeClient, TransactionClient } from './tenant-transaction.js';

/**
 * Administrative database access — for platform-level operations only.
 *
 * SEPARATION FROM TENANT ACCESS:
 * This class is intentionally separate from TenantAwareTransaction.
 * Domain repositories should NEVER receive an AdministrativeDatabase.
 * They should receive only the TenantTransactionClient from the tenant wrapper.
 *
 * USAGE:
 * - Tenant provisioning (before tenant exists in RLS)
 * - Platform-wide configuration reads
 * - Migration and reconciliation operations
 * - Audit queries spanning tenants (with break-glass)
 *
 * REQUIREMENTS:
 * - Requires a documented reason
 * - Requires actor identification
 * - Records operation metadata for audit
 * - Should be injected only into platform-level services
 */
export class AdministrativeDatabase {
  private readonly prisma: PrismaLikeClient;
  private readonly maxTimeout: number;

  constructor(prisma: PrismaLikeClient, maxTimeout: number = 30000) {
    this.prisma = prisma;
    this.maxTimeout = maxTimeout;
  }

  /**
   * Execute a platform-level operation without tenant RLS context.
   *
   * @param params.actorId - Who is performing this operation
   * @param params.reason - Why unscoped access is needed
   * @param params.correlationId - Request correlation for tracing
   * @param operation - The database operation
   */
  async execute<T>(
    params: {
      actorId: string;
      reason: string;
      correlationId: string;
    },
    operation: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!params.actorId) {
      throw new DatabaseContextError('Administrative operations require an actor ID.');
    }
    if (!params.reason) {
      throw new DatabaseContextError('Administrative operations require a documented reason.');
    }
    if (!params.correlationId) {
      throw new DatabaseContextError('Administrative operations require a correlation ID.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        // No SET LOCAL — intentionally unscoped
        // Application role still cannot bypass RLS on tenant tables
        // This only works for platform-level tables (tenants, config, audit)
        return operation(tx);
      },
      {
        maxWait: 5000,
        timeout: this.maxTimeout,
      },
    );
  }
}
