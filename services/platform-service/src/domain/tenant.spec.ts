import { describe, expect, it } from 'vitest';

import { createTenant, isValidTransition, type TenantStatus } from './tenant.js';

describe('Tenant Domain', () => {
  describe('createTenant', () => {
    it('should create tenant in PROVISIONING state', () => {
      const tenant = createTenant({ name: 'Acme Staffing', slug: 'acme', createdBy: 'admin-1' });

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe('Acme Staffing');
      expect(tenant.slug).toBe('acme');
      expect(tenant.status).toBe('PROVISIONING');
      expect(tenant.version).toBe(1);
      expect(tenant.createdBy).toBe('admin-1');
    });

    it('should generate unique IDs', () => {
      const t1 = createTenant({ name: 'A', slug: 'a', createdBy: 'x' });
      const t2 = createTenant({ name: 'B', slug: 'b', createdBy: 'x' });
      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('isValidTransition', () => {
    const allowed: [TenantStatus, TenantStatus][] = [
      ['PROVISIONING', 'ACTIVE'],
      ['ACTIVE', 'SUSPENDED'],
      ['ACTIVE', 'DEACTIVATED'],
      ['SUSPENDED', 'ACTIVE'],
      ['SUSPENDED', 'DEACTIVATED'],
    ];

    const denied: [TenantStatus, TenantStatus][] = [
      ['PROVISIONING', 'SUSPENDED'],
      ['PROVISIONING', 'DEACTIVATED'],
      ['ACTIVE', 'PROVISIONING'],
      ['SUSPENDED', 'PROVISIONING'],
      ['DEACTIVATED', 'ACTIVE'],
      ['DEACTIVATED', 'SUSPENDED'],
      ['DEACTIVATED', 'PROVISIONING'],
    ];

    it.each(allowed)('should allow %s → %s', (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    });

    it.each(denied)('should deny %s → %s', (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    });

    it('DEACTIVATED is terminal — no transitions allowed', () => {
      const targets: TenantStatus[] = ['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];
      for (const target of targets) {
        expect(isValidTransition('DEACTIVATED', target)).toBe(false);
      }
    });
  });
});
