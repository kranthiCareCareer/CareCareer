import { describe, expect, it, vi } from 'vitest';

import { DatabaseContextError } from './errors.js';
import { TenantAwareTransaction, type PrismaLikeClient } from './tenant-transaction.js';

// Mock PrismaClient for unit tests (integration tests use real DB)
function createMockPrisma(): {
  prisma: PrismaLikeClient;
  executedRaw: string[];
} {
  const executedRaw: string[] = [];

  const mockTx = {
    $executeRaw: vi
      .fn()
      .mockImplementation((_strings: TemplateStringsArray, ...values: unknown[]) => {
        executedRaw.push(`SET LOCAL [${String(values[0])}]`);
        return Promise.resolve(1);
      }),
  };

  const prisma: PrismaLikeClient = {
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
        return fn(mockTx);
      }),
  };

  return { prisma, executedRaw };
}

describe('TenantAwareTransaction', () => {
  const validTenantId = '01912345-6789-7abc-def0-123456789012';

  describe('execute', () => {
    it('should set tenant context via SET LOCAL', async () => {
      const { prisma, executedRaw } = createMockPrisma();
      const tenantTx = new TenantAwareTransaction(prisma);

      await tenantTx.execute(validTenantId, async () => 'result');

      expect(executedRaw.length).toBe(1);
      expect(executedRaw[0]).toContain(validTenantId);
    });

    it('should return the operation result', async () => {
      const { prisma } = createMockPrisma();
      const tenantTx = new TenantAwareTransaction(prisma);

      const result = await tenantTx.execute(validTenantId, async () => ({
        id: '123',
        name: 'test',
      }));

      expect(result).toEqual({ id: '123', name: 'test' });
    });

    it('should throw DatabaseContextError when tenantId is empty', async () => {
      const { prisma } = createMockPrisma();
      const tenantTx = new TenantAwareTransaction(prisma);

      await expect(tenantTx.execute('', async () => 'result')).rejects.toThrow(
        DatabaseContextError,
      );
    });

    it('should throw DatabaseContextError when tenantId is not a UUID', async () => {
      const { prisma } = createMockPrisma();
      const tenantTx = new TenantAwareTransaction(prisma);

      await expect(tenantTx.execute('not-a-uuid', async () => 'result')).rejects.toThrow(
        DatabaseContextError,
      );
    });

    it('should propagate operation errors', async () => {
      const { prisma } = createMockPrisma();
      const tenantTx = new TenantAwareTransaction(prisma);

      await expect(
        tenantTx.execute(validTenantId, async () => {
          throw new Error('operation failed');
        }),
      ).rejects.toThrow('operation failed');
    });
  });

  describe('query', () => {
    it('should delegate to execute with same tenant context', async () => {
      const { prisma, executedRaw } = createMockPrisma();
      const tenantTx = new TenantAwareTransaction(prisma);

      await tenantTx.query(validTenantId, async () => []);

      expect(executedRaw.length).toBe(1);
      expect(executedRaw[0]).toContain(validTenantId);
    });
  });
});
