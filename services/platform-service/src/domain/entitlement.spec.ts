import { describe, expect, it } from 'vitest';

import { createDefaultEntitlements, isEntitled } from './entitlement.js';

describe('Entitlement Domain', () => {
  describe('createDefaultEntitlements', () => {
    it('should create entitlements with only core enabled', () => {
      const ent = createDefaultEntitlements('tenant-1', 'admin-1');

      expect(ent.tenantId).toBe('tenant-1');
      expect(ent.modules.core).toBe(true);
      expect(ent.modules.workforce).toBe(false);
      expect(ent.modules.scheduling).toBe(false);
      expect(ent.modules.timekeeping).toBe(false);
      expect(ent.modules.recruiting).toBe(false);
      expect(ent.version).toBe(1);
    });
  });

  describe('isEntitled', () => {
    const entitlements = createDefaultEntitlements('tenant-1', 'admin-1');

    it('should return true for entitled modules', () => {
      expect(isEntitled(entitlements, 'core')).toBe(true);
    });

    it('should return false for unentitled modules', () => {
      expect(isEntitled(entitlements, 'scheduling')).toBe(false);
      expect(isEntitled(entitlements, 'workforce')).toBe(false);
    });

    it('should return false for unknown module keys (fail-closed)', () => {
      expect(isEntitled(entitlements, 'unknown_module')).toBe(false);
      expect(isEntitled(entitlements, '')).toBe(false);
    });

    it('should return true when module is explicitly enabled', () => {
      const ent = {
        ...entitlements,
        modules: { ...entitlements.modules, scheduling: true },
      };
      expect(isEntitled(ent, 'scheduling')).toBe(true);
    });
  });
});
