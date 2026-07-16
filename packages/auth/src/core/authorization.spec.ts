import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from './authenticated-principal.js';
import { InMemoryAuthorizationService } from './in-memory-authorization.js';

function createPrincipal(overrides: Partial<AuthenticatedPrincipal> = {}): AuthenticatedPrincipal {
  return {
    subject: 'user-1',
    actorId: 'user-1',
    actorType: 'user',
    tenantMemberships: [
      { tenantId: 'tenant-a', roles: ['SCHEDULER'], branchIds: ['branch-1'], status: 'active' },
    ],
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 900000),
    ...overrides,
  };
}

describe('InMemoryAuthorizationService', () => {
  const authz = new InMemoryAuthorizationService({
    rolePermissions: {
      SCHEDULER: ['shifts:create', 'shifts:publish', 'shifts:cancel'],
      WORKER: ['shift-requests:create', 'clock-events:create'],
    },
    denyRules: ['tenant-a:denied-user:shifts:create'],
  });

  it('should allow when role grants permission', async () => {
    const result = await authz.evaluate({
      principal: createPrincipal(),
      tenantId: 'tenant-a',
      permission: 'shifts:create',
    });

    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe('ROLE_GRANT');
  });

  it('should deny when no role grants permission', async () => {
    const result = await authz.evaluate({
      principal: createPrincipal(),
      tenantId: 'tenant-a',
      permission: 'timecards:approve',
    });

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('NO_MATCHING_GRANT');
  });

  it('should deny when no tenant membership exists', async () => {
    const result = await authz.evaluate({
      principal: createPrincipal(),
      tenantId: 'tenant-b',
      permission: 'shifts:create',
    });

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('NO_TENANT_MEMBERSHIP');
  });

  it('should deny when membership is inactive', async () => {
    const principal = createPrincipal({
      tenantMemberships: [
        { tenantId: 'tenant-a', roles: ['SCHEDULER'], branchIds: [], status: 'inactive' },
      ],
    });

    const result = await authz.evaluate({
      principal,
      tenantId: 'tenant-a',
      permission: 'shifts:create',
    });

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('MEMBERSHIP_INACTIVE');
  });

  it('should deny via explicit deny rule even with role grant', async () => {
    const principal = createPrincipal({ subject: 'denied-user' });

    const result = await authz.evaluate({
      principal,
      tenantId: 'tenant-a',
      permission: 'shifts:create',
    });

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('EXPLICIT_DENY');
  });

  it('should include policy version in decision', async () => {
    const result = await authz.evaluate({
      principal: createPrincipal(),
      tenantId: 'tenant-a',
      permission: 'shifts:create',
    });

    expect(result.policyVersion).toBe('in-memory-v1');
  });
});
