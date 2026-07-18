import { describe, expect, it, vi } from 'vitest';

import type { TransactionClient } from '@carecareer/database';

import { TenantInactiveError, TenantNotFoundError } from '../../domain/errors.js';
import type { Tenant } from '../../domain/tenant.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

import { requireActiveTenant } from './tenant-status-guard.js';

function createMockRepo(tenant: Tenant | undefined): PlatformRepository {
  return {
    createTenant: vi.fn(),
    findTenantById: vi.fn().mockResolvedValue(tenant),
    updateTenantStatus: vi.fn(),
    createOrganization: vi.fn(),
    findOrganizationsByTenant: vi.fn(),
    createBranch: vi.fn(),
    findBranchesByOrganization: vi.fn(),
    saveEntitlements: vi.fn(),
    getEntitlements: vi.fn(),
    saveFeature: vi.fn(),
    getFeatureValue: vi.fn(),
    getAllFeatures: vi.fn(),
  };
}

function createTenantFixture(status: Tenant['status']): Tenant {
  return {
    id: '01912345-0000-7000-8000-000000000001',
    name: 'Test Tenant',
    slug: 'test-tenant',
    status,
    version: 1,
    createdAt: new Date(),
    createdBy: 'admin',
    updatedAt: new Date(),
    updatedBy: 'admin',
  };
}

const mockTx = {
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn().mockResolvedValue([]),
} as unknown as TransactionClient;

describe('requireActiveTenant', () => {
  it('should succeed for ACTIVE tenant', async () => {
    const repo = createMockRepo(createTenantFixture('ACTIVE'));

    await expect(
      requireActiveTenant(repo, mockTx, '01912345-0000-7000-8000-000000000001'),
    ).resolves.toBeUndefined();
  });

  it('should throw TenantNotFoundError when tenant does not exist', async () => {
    const repo = createMockRepo(undefined);

    await expect(
      requireActiveTenant(repo, mockTx, '01912345-0000-7000-8000-000000000099'),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should throw TenantInactiveError for SUSPENDED tenant', async () => {
    const repo = createMockRepo(createTenantFixture('SUSPENDED'));

    await expect(
      requireActiveTenant(repo, mockTx, '01912345-0000-7000-8000-000000000001'),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should throw TenantInactiveError for DEACTIVATED tenant', async () => {
    const repo = createMockRepo(createTenantFixture('DEACTIVATED'));

    await expect(
      requireActiveTenant(repo, mockTx, '01912345-0000-7000-8000-000000000001'),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should throw TenantInactiveError for PROVISIONING tenant', async () => {
    const repo = createMockRepo(createTenantFixture('PROVISIONING'));

    await expect(
      requireActiveTenant(repo, mockTx, '01912345-0000-7000-8000-000000000001'),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('should include tenant status in error message', async () => {
    const repo = createMockRepo(createTenantFixture('SUSPENDED'));

    try {
      await requireActiveTenant(repo, mockTx, '01912345-0000-7000-8000-000000000001');
      expect.fail('Should have thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(TenantInactiveError);
      if (error instanceof TenantInactiveError) {
        expect(error.message).toContain('SUSPENDED');
        expect(error.code).toBe('TENANT_INACTIVE');
      }
    }
  });

  it('denied mutations should not create any side effects', async () => {
    const repo = createMockRepo(createTenantFixture('SUSPENDED'));

    await expect(
      requireActiveTenant(repo, mockTx, '01912345-0000-7000-8000-000000000001'),
    ).rejects.toThrow();

    // No other repository methods were called
    expect(repo.createOrganization).not.toHaveBeenCalled();
    expect(repo.createBranch).not.toHaveBeenCalled();
    expect(repo.saveEntitlements).not.toHaveBeenCalled();
    expect(repo.saveFeature).not.toHaveBeenCalled();
  });
});
