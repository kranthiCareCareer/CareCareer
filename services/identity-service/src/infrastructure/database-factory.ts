import { Pool } from 'pg';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

/**
 * Creates a PrismaLikeClient backed by a real PostgreSQL connection pool.
 * Targets the identity schema.
 */
export function createPgPrismaClient(databaseUrl: string): PrismaLikeClient {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });

  return {
    async $transaction<T>(
      fn: (tx: TransactionClient) => Promise<T>,
      _options?: { maxWait?: number; timeout?: number },
    ): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Set search path to identity schema
        await client.query('SET LOCAL search_path TO identity, public');

        const txClient: TransactionClient = {
          async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
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
          async $queryRaw<T = Record<string, unknown>>(
            strings: TemplateStringsArray,
            ...values: unknown[]
          ): Promise<T[]> {
            let query = '';
            for (let i = 0; i < strings.length; i++) {
              query += strings[i];
              if (i < values.length) {
                query += `$${String(i + 1)}`;
              }
            }
            const result = await client.query(query, values);
            return result.rows as T[];
          },
        };

        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
