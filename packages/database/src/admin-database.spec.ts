import { describe, expect, it, vi } from 'vitest';

import { AdministrativeDatabase } from './admin-database.js';
import { DatabaseContextError } from './errors.js';
import type { PrismaLikeClient } from './tenant-transaction.js';

function createMockPrisma(): PrismaLikeClient {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };

  return {
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
        return fn(mockTx);
      }),
  };
}

describe('AdministrativeDatabase', () => {
  it('should execute without setting tenant context', async () => {
    const prisma = createMockPrisma();
    const adminDb = new AdministrativeDatabase(prisma);

    const result = await adminDb.execute(
      { actorId: 'admin-1', reason: 'Tenant provisioning', correlationId: 'corr-1' },
      async () => 'created',
    );

    expect(result).toBe('created');
  });

  it('should require actorId', async () => {
    const prisma = createMockPrisma();
    const adminDb = new AdministrativeDatabase(prisma);

    await expect(
      adminDb.execute(
        { actorId: '', reason: 'test', correlationId: 'corr-1' },
        async () => 'result',
      ),
    ).rejects.toThrow(DatabaseContextError);
  });

  it('should require reason', async () => {
    const prisma = createMockPrisma();
    const adminDb = new AdministrativeDatabase(prisma);

    await expect(
      adminDb.execute(
        { actorId: 'admin-1', reason: '', correlationId: 'corr-1' },
        async () => 'result',
      ),
    ).rejects.toThrow(DatabaseContextError);
  });

  it('should require correlationId', async () => {
    const prisma = createMockPrisma();
    const adminDb = new AdministrativeDatabase(prisma);

    await expect(
      adminDb.execute(
        { actorId: 'admin-1', reason: 'test', correlationId: '' },
        async () => 'result',
      ),
    ).rejects.toThrow(DatabaseContextError);
  });

  it('should propagate operation errors', async () => {
    const prisma = createMockPrisma();
    const adminDb = new AdministrativeDatabase(prisma);

    await expect(
      adminDb.execute({ actorId: 'admin-1', reason: 'test', correlationId: 'corr-1' }, async () => {
        throw new Error('DB failure');
      }),
    ).rejects.toThrow('DB failure');
  });
});
