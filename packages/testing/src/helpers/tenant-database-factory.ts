import { Client } from 'pg';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';
import { TenantAwareTransaction } from '@carecareer/database';

/**
 * Creates a real TenantAwareTransaction backed by a live PostgreSQL connection.
 * Used in integration tests to prove RLS, pooling, and atomicity behaviors.
 */
export function createTestTenantDatabase(connectionUri: string): {
  tenantDb: TenantAwareTransaction;
  prismaLike: PrismaLikeClient;
  disconnect: () => Promise<void>;
} {
  const client = new Client({ connectionString: connectionUri });
  let connected = false;

  const ensureConnected = async (): Promise<void> => {
    if (!connected) {
      await client.connect();
      connected = true;
    }
  };

  /**
   * A minimal PrismaLikeClient implementation backed by pg.Client.
   * Simulates Prisma's $transaction behavior for integration testing.
   */
  const prismaLike: PrismaLikeClient = {
    async $transaction<T>(
      fn: (tx: TransactionClient) => Promise<T>,
      _options?: { maxWait?: number; timeout?: number },
    ): Promise<T> {
      await ensureConnected();
      await client.query('BEGIN');

      const txClient: TransactionClient = {
        async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
          // Build parameterized query from template literal
          let query = '';
          for (let i = 0; i < strings.length; i++) {
            query += strings[i];
            if (i < values.length) {
              query += `$${String(i + 1)}`;
            }
          }
          const result = await client.query(query, values);
          return result.rowCount ?? 0;
        },
      };

      try {
        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
  };

  const tenantDb = new TenantAwareTransaction(prismaLike);

  return {
    tenantDb,
    prismaLike,
    disconnect: async () => {
      if (connected) {
        await client.end();
        connected = false;
      }
    },
  };
}
