import { describe, expect, it } from 'vitest';

import { InvalidTokenError } from '../core/errors.js';

import { ClaimsMapper } from './claims-mapper.js';

describe('ClaimsMapper', () => {
  const mapper = new ClaimsMapper();

  it('should map a valid payload to canonical principal', () => {
    const payload = {
      sub: 'auth0|user123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      tenants: [
        { tenantId: 'tenant-a', roles: ['SCHEDULER'], branchIds: ['branch-1'], status: 'active' },
      ],
    };

    const principal = mapper.toPrincipal(payload);

    expect(principal.subject).toBe('auth0|user123');
    expect(principal.actorType).toBe('user');
    expect(principal.tenantMemberships).toHaveLength(1);
    expect(principal.tenantMemberships[0]?.tenantId).toBe('tenant-a');
    expect(principal.tenantMemberships[0]?.roles).toEqual(['SCHEDULER']);
    expect(principal.tenantMemberships[0]?.status).toBe('active');
  });

  it('should throw when subject is missing', () => {
    expect(() => mapper.toPrincipal({ iat: 123 })).toThrow(InvalidTokenError);
  });

  it('should handle missing tenants claim gracefully', () => {
    const principal = mapper.toPrincipal({ sub: 'user1', iat: 123, exp: 999 });

    expect(principal.tenantMemberships).toHaveLength(0);
  });

  it('should map service actor type', () => {
    const principal = mapper.toPrincipal({
      sub: 'svc-clock',
      actor_type: 'service',
      iat: 123,
      exp: 999,
    });

    expect(principal.actorType).toBe('service');
  });

  it('should default actor type to user', () => {
    const principal = mapper.toPrincipal({ sub: 'user1', iat: 123, exp: 999 });

    expect(principal.actorType).toBe('user');
  });

  it('should use actorId claim when present', () => {
    const principal = mapper.toPrincipal({
      sub: 'auth0|ext-id',
      actor_id: 'carecareer-user-uuid',
      iat: 123,
      exp: 999,
    });

    expect(principal.actorId).toBe('carecareer-user-uuid');
  });

  it('should default actorId to subject when not present', () => {
    const principal = mapper.toPrincipal({ sub: 'user1', iat: 123, exp: 999 });

    expect(principal.actorId).toBe('user1');
  });

  it('should handle snake_case tenant fields', () => {
    const payload = {
      sub: 'user1',
      iat: 123,
      exp: 999,
      tenants: [
        { tenant_id: 'tenant-b', roles: ['WORKER'], branch_ids: ['b1'], status: 'active' },
      ],
    };

    const principal = mapper.toPrincipal(payload);

    expect(principal.tenantMemberships[0]?.tenantId).toBe('tenant-b');
    expect(principal.tenantMemberships[0]?.roles).toEqual(['WORKER']);
  });

  it('should default membership status to active', () => {
    const payload = {
      sub: 'user1',
      iat: 123,
      exp: 999,
      tenants: [{ tenantId: 'tenant-a', roles: ['WORKER'], branchIds: [] }],
    };

    const principal = mapper.toPrincipal(payload);

    expect(principal.tenantMemberships[0]?.status).toBe('active');
  });

  it('should support custom claims mapper config', () => {
    const customMapper = new ClaimsMapper({ tenantsClaim: 'organizations' });

    const principal = customMapper.toPrincipal({
      sub: 'user1',
      iat: 123,
      exp: 999,
      organizations: [{ tenantId: 'org-1', roles: ['ADMIN'], branchIds: [], status: 'active' }],
    });

    expect(principal.tenantMemberships[0]?.tenantId).toBe('org-1');
  });

  it('should not expose raw provider claims in the principal', () => {
    const principal = mapper.toPrincipal({
      sub: 'user1',
      iat: 123,
      exp: 999,
      'https://custom.claim/secret': 'should-not-appear',
      internal_metadata: { sensitive: true },
    });

    // Principal should only have canonical fields
    expect(principal).not.toHaveProperty('https://custom.claim/secret');
    expect(principal).not.toHaveProperty('internal_metadata');
  });
});
