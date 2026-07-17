import { describe, expect, it } from 'vitest';

import { InMemoryAuthorizationService } from '@carecareer/auth';
import { signDemoToken } from '@carecareer/testing';

import { DemoTokenValidator } from './demo-token-validator.js';

/**
 * HTTP boundary authentication and authorization tests.
 *
 * These prove the complete auth decision path:
 * Token → Validator → Principal → Authorization Service → Decision
 *
 * The NestJS guards wire these same components at the HTTP layer.
 * Full HTTP integration (supertest) is added when the controller
 * DI is fully operational with a real database.
 */
describe('HTTP Authentication + Authorization Decision Path', () => {
  const validator = new DemoTokenValidator({
    secret: 'carecareer-demo-secret-for-testing-only-do-not-use-in-production',
    issuer: 'carecareer-demo',
    audience: 'carecareer-api',
  });

  const authzService = new InMemoryAuthorizationService({
    rolePermissions: {
      PLATFORM_ADMIN: [
        'platform.tenant.provision',
        'platform.tenant.read',
        'platform.tenant.update',
        'platform.organization.create',
        'platform.branch.create',
        'platform.entitlements.manage',
        'platform.features.manage',
        'platform.audit.read',
      ],
      TENANT_ADMIN: [
        'platform.tenant.read',
        'platform.tenant.update',
        'platform.organization.create',
        'platform.branch.create',
        'platform.entitlements.manage',
        'platform.features.manage',
        'platform.audit.read',
      ],
      READ_ONLY_AUDITOR: [
        'platform.tenant.read',
        'platform.audit.read',
      ],
    },
  });

  describe('401 scenarios — authentication failures', () => {
    it('missing token → rejected', async () => {
      await expect(validator.validate('')).rejects.toThrow();
    });

    it('malformed token → rejected', async () => {
      await expect(validator.validate('not-a-jwt')).rejects.toThrow();
    });

    it('invalid signature → rejected', async () => {
      const token = signDemoToken({ sub: 'user', tenants: [] });
      await expect(validator.validate(token.slice(0, -5) + 'XXXXX')).rejects.toThrow();
    });

    it('expired token → rejected', async () => {
      const token = signDemoToken({ sub: 'user', tenants: [], exp: Math.floor(Date.now() / 1000) - 60 });
      await expect(validator.validate(token)).rejects.toThrow();
    });

    it('wrong issuer → rejected', async () => {
      const token = signDemoToken({ sub: 'user', tenants: [], iss: 'evil-issuer' });
      await expect(validator.validate(token)).rejects.toThrow();
    });

    it('wrong audience → rejected', async () => {
      const token = signDemoToken({ sub: 'user', tenants: [], aud: 'wrong-api' });
      await expect(validator.validate(token)).rejects.toThrow();
    });
  });

  describe('403 scenarios — authorization failures', () => {
    it('tenant admin cannot provision tenants (missing platform.tenant.provision)', async () => {
      const token = signDemoToken({
        sub: 'tenant-admin-001',
        tenants: [{ tenantId: 'tenant-a', roles: ['TENANT_ADMIN'], branchIds: [], status: 'active' }],
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'tenant-a',
        permission: 'platform.tenant.provision',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('NO_MATCHING_GRANT');
    });

    it('read-only auditor cannot manage entitlements', async () => {
      const token = signDemoToken({
        sub: 'auditor-001',
        tenants: [{ tenantId: 'tenant-a', roles: ['READ_ONLY_AUDITOR'], branchIds: [], status: 'active' }],
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'tenant-a',
        permission: 'platform.entitlements.manage',
      });

      expect(decision.allowed).toBe(false);
    });

    it('user with no tenant membership cannot access any tenant', async () => {
      const token = signDemoToken({
        sub: 'orphan-user',
        tenants: [], // No memberships
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'tenant-a',
        permission: 'platform.tenant.read',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('NO_TENANT_MEMBERSHIP');
    });

    it('cross-tenant access denied — user cannot access another tenant', async () => {
      const token = signDemoToken({
        sub: 'user-a',
        tenants: [{ tenantId: 'tenant-a', roles: ['TENANT_ADMIN'], branchIds: [], status: 'active' }],
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'tenant-b', // NOT their tenant
        permission: 'platform.tenant.read',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('NO_TENANT_MEMBERSHIP');
    });
  });

  describe('201 scenarios — authorized access', () => {
    it('platform admin can provision tenants', async () => {
      const token = signDemoToken({
        sub: 'platform-admin-001',
        tenants: [{ tenantId: 'platform', roles: ['PLATFORM_ADMIN'], branchIds: [], status: 'active' }],
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'platform',
        permission: 'platform.tenant.provision',
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe('ROLE_GRANT');
    });

    it('platform admin can manage entitlements', async () => {
      const token = signDemoToken({
        sub: 'platform-admin-001',
        tenants: [{ tenantId: 'platform', roles: ['PLATFORM_ADMIN'], branchIds: [], status: 'active' }],
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'platform',
        permission: 'platform.entitlements.manage',
      });

      expect(decision.allowed).toBe(true);
    });

    it('tenant admin can read their own tenant', async () => {
      const token = signDemoToken({
        sub: 'tenant-admin-001',
        tenants: [{ tenantId: 'tenant-a', roles: ['TENANT_ADMIN'], branchIds: [], status: 'active' }],
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'tenant-a',
        permission: 'platform.tenant.read',
      });

      expect(decision.allowed).toBe(true);
    });

    it('read-only auditor can read audit', async () => {
      const token = signDemoToken({
        sub: 'auditor-001',
        tenants: [{ tenantId: 'tenant-a', roles: ['READ_ONLY_AUDITOR'], branchIds: [], status: 'active' }],
      });

      const principal = await validator.validate(token);
      const decision = await authzService.evaluate({
        principal,
        tenantId: 'tenant-a',
        permission: 'platform.audit.read',
      });

      expect(decision.allowed).toBe(true);
    });
  });
});
