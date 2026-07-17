import { describe, expect, it } from 'vitest';

import { signDemoToken, getDemoSecret } from '@carecareer/testing';

import { DemoTokenValidator } from './demo-token-validator.js';

describe('HTTP Authentication and Authorization', () => {
  const secret = getDemoSecret();
  const validator = new DemoTokenValidator({
    secret,
    issuer: 'carecareer-demo',
    audience: 'carecareer-api',
  });

  describe('Token Validation', () => {
    it('should validate a valid platform administrator token', async () => {
      const token = signDemoToken({
        sub: 'platform-admin-001',
        tenants: [
          { tenantId: 'platform', roles: ['PLATFORM_ADMIN'], branchIds: [], status: 'active' },
        ],
      });

      const principal = await validator.validate(token);

      expect(principal.subject).toBe('platform-admin-001');
      expect(principal.actorType).toBe('user');
      expect(principal.tenantMemberships).toHaveLength(1);
      expect(principal.tenantMemberships[0]?.roles).toContain('PLATFORM_ADMIN');
    });

    it('should reject missing token with InvalidTokenError', async () => {
      await expect(validator.validate('')).rejects.toThrow('Token is empty');
    });

    it('should reject malformed token', async () => {
      await expect(validator.validate('not.a.valid.token.format')).rejects.toThrow();
    });

    it('should reject token with invalid signature', async () => {
      const token = signDemoToken({ sub: 'user-1', tenants: [] });
      // Tamper with the signature
      const tampered = token.slice(0, -5) + 'XXXXX';
      await expect(validator.validate(tampered)).rejects.toThrow('Invalid signature');
    });

    it('should reject expired token', async () => {
      const token = signDemoToken({
        sub: 'user-1',
        tenants: [],
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      });
      await expect(validator.validate(token)).rejects.toThrow('expired');
    });

    it('should reject token with wrong issuer', async () => {
      const token = signDemoToken({
        sub: 'user-1',
        tenants: [],
        iss: 'wrong-issuer',
      });
      await expect(validator.validate(token)).rejects.toThrow('Invalid issuer');
    });

    it('should reject token with wrong audience', async () => {
      const token = signDemoToken({
        sub: 'user-1',
        tenants: [],
        aud: 'wrong-audience',
      });
      await expect(validator.validate(token)).rejects.toThrow('Invalid audience');
    });

    it('should reject token without subject', async () => {
      // Manually create a token without sub
      const { createHmac } = await import('node:crypto');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: 'carecareer-demo',
        aud: 'carecareer-api',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
        tenants: [],
      })).toString('base64url');
      const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${sig}`;

      await expect(validator.validate(token)).rejects.toThrow('Missing subject');
    });
  });

  describe('Authorization Decisions', () => {
    it('platform admin should have PLATFORM_ADMIN role', async () => {
      const token = signDemoToken({
        sub: 'platform-admin-001',
        tenants: [
          { tenantId: 'platform', roles: ['PLATFORM_ADMIN'], branchIds: [], status: 'active' },
        ],
      });

      const principal = await validator.validate(token);
      const membership = principal.tenantMemberships.find((m) => m.roles.includes('PLATFORM_ADMIN'));
      expect(membership).toBeDefined();
    });

    it('tenant admin should NOT have PLATFORM_ADMIN role', async () => {
      const token = signDemoToken({
        sub: 'tenant-admin-001',
        tenants: [
          { tenantId: 'tenant-a-id', roles: ['TENANT_ADMIN'], branchIds: [], status: 'active' },
        ],
      });

      const principal = await validator.validate(token);
      const platformMembership = principal.tenantMemberships.find((m) => m.roles.includes('PLATFORM_ADMIN'));
      expect(platformMembership).toBeUndefined();
    });

    it('suspended membership should be identifiable', async () => {
      const token = signDemoToken({
        sub: 'user-suspended',
        tenants: [
          { tenantId: 'tenant-x', roles: ['TENANT_ADMIN'], branchIds: [], status: 'suspended' },
        ],
      });

      const principal = await validator.validate(token);
      expect(principal.tenantMemberships[0]?.status).toBe('suspended');
    });

    it('cross-tenant access should find no membership for wrong tenant', async () => {
      const token = signDemoToken({
        sub: 'user-a',
        tenants: [
          { tenantId: 'tenant-a', roles: ['TENANT_ADMIN'], branchIds: [], status: 'active' },
        ],
      });

      const principal = await validator.validate(token);
      const crossTenantMembership = principal.tenantMemberships.find((m) => m.tenantId === 'tenant-b');
      expect(crossTenantMembership).toBeUndefined();
    });
  });
});
