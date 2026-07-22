import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AuthorizationController } from './authorization.controller.js';

/**
 * Authorization controller unit tests.
 * Covers error paths that can't be reached through HTTP integration tests
 * because the auth guard catches them first.
 */
describe('AuthorizationController', () => {
  let controller: AuthorizationController;
  const mockPrisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const mockRepo = {
    getUserState: vi.fn(),
    getMembershipState: vi.fn(),
    getPermissionsForRoles: vi.fn(),
    getExplicitDenials: vi.fn(),
    recordDecision: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuthorizationController(mockPrisma as never, mockRepo as never);
    mockRepo.getUserState.mockResolvedValue({ status: 'ACTIVE', authorizationVersion: 1 });
    mockRepo.getMembershipState.mockResolvedValue({
      id: 'mem-1',
      status: 'ACTIVE',
      authorizationVersion: 1,
      roleIds: ['role-1'],
    });
    mockRepo.getPermissionsForRoles.mockResolvedValue(['facility.read']);
    mockRepo.getExplicitDenials.mockResolvedValue([]);
    mockRepo.recordDecision.mockResolvedValue(undefined);
  });

  it('should throw ForbiddenException when principal is missing', async () => {
    await expect(
      controller.evaluate(
        { action: 'facility.read', resourceType: 'facility' },
        { principal: undefined as never },
        'corr-1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when selectedTenantId is missing', async () => {
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: undefined,
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: undefined,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    await expect(
      controller.evaluate(
        { action: 'facility.read', resourceType: 'facility' },
        { principal },
        'corr-2',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw BadRequestException for missing action', async () => {
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    await expect(
      controller.evaluate({ resourceType: 'facility' }, { principal }, 'corr-3'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for extra untrusted fields', async () => {
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    await expect(
      controller.evaluate(
        { action: 'x', resourceType: 'y', userId: 'attacker', isAdmin: true },
        { principal },
        'corr-4',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return allowed=true for matching permission', async () => {
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    const result = await controller.evaluate(
      { action: 'facility.read', resourceType: 'facility' },
      { principal },
      'corr-5',
    );
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe('GRANTED');
    expect(result.decisionId).toBeDefined();
    expect(result.policyVersion).toBe(1);
  });

  it('should return allowed=false for no matching permission', async () => {
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    const result = await controller.evaluate(
      { action: 'payroll.process', resourceType: 'payroll' },
      { principal },
      'corr-6',
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('NO_MATCHING_GRANT');
  });

  it('should generate correlation ID when not provided', async () => {
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    const result = await controller.evaluate(
      { action: 'facility.read', resourceType: 'facility' },
      { principal },
      undefined,
    );
    expect(result.allowed).toBe(true);
  });

  it('should fail closed when user not found in database', async () => {
    mockRepo.getUserState.mockResolvedValue(null);
    const principal = {
      subject: 'user-missing',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    const result = await controller.evaluate(
      { action: 'facility.read', resourceType: 'facility' },
      { principal },
      'corr-7',
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('USER_DEACTIVATED');
  });

  it('should fail closed when membership not found', async () => {
    mockRepo.getMembershipState.mockResolvedValue(null);
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    const result = await controller.evaluate(
      { action: 'facility.read', resourceType: 'facility' },
      { principal },
      'corr-8',
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('MEMBERSHIP_INVALID');
  });

  it('should handle membership with no roles (empty permissions)', async () => {
    mockRepo.getMembershipState.mockResolvedValue({
      id: 'mem-1',
      status: 'ACTIVE',
      authorizationVersion: 1,
      roleIds: [],
    });
    mockRepo.getPermissionsForRoles.mockResolvedValue([]);
    const principal = {
      subject: 'user-1',
      sessionId: 'session-1',
      selectedTenantId: 'tenant-1',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
      actorType: 'user' as const,
      tenantMemberships: [],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenId: 'token-1',
    };
    const result = await controller.evaluate(
      { action: 'facility.read', resourceType: 'facility' },
      { principal },
      'corr-9',
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('NO_MATCHING_GRANT');
  });
});
