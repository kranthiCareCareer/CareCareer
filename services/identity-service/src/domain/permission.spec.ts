import { describe, it, expect } from 'vitest';

import {
  deriveEffectivePermissions,
  derivePlatformPermissions,
  type Permission,
  type Role,
  type RolePermissionMapping,
} from './permission.js';

describe('Permission Derivation', () => {
  const tenantAdminRole: Role = {
    id: 'role-tenant-admin',
    name: 'TENANT_ADMIN',
    scope: 'TENANT',
    roleType: 'SYSTEM',
    description: null,
  };

  const tenantOperatorRole: Role = {
    id: 'role-tenant-operator',
    name: 'TENANT_OPERATOR',
    scope: 'TENANT',
    roleType: 'SYSTEM',
    description: null,
  };

  const platformAdminRole: Role = {
    id: 'role-platform-admin',
    name: 'PLATFORM_ADMIN',
    scope: 'PLATFORM',
    roleType: 'SYSTEM',
    description: null,
  };

  const tenantPermissions: Permission[] = [
    { id: 'perm-1', identifier: 'tenant.members.read', scope: 'TENANT', description: null },
    { id: 'perm-2', identifier: 'tenant.members.invite', scope: 'TENANT', description: null },
    { id: 'perm-3', identifier: 'tenant.members.manage', scope: 'TENANT', description: null },
    { id: 'perm-4', identifier: 'tenant.organizations.read', scope: 'TENANT', description: null },
  ];

  const platformPermissions: Permission[] = [
    { id: 'perm-p1', identifier: 'platform.users.read', scope: 'PLATFORM', description: null },
    { id: 'perm-p2', identifier: 'platform.users.manage', scope: 'PLATFORM', description: null },
  ];

  const allPermissions = [...tenantPermissions, ...platformPermissions];

  const rolePermissions: RolePermissionMapping[] = [
    // TENANT_ADMIN has all tenant permissions
    { roleId: 'role-tenant-admin', permissionId: 'perm-1' },
    { roleId: 'role-tenant-admin', permissionId: 'perm-2' },
    { roleId: 'role-tenant-admin', permissionId: 'perm-3' },
    { roleId: 'role-tenant-admin', permissionId: 'perm-4' },
    // TENANT_OPERATOR has read + org
    { roleId: 'role-tenant-operator', permissionId: 'perm-1' },
    { roleId: 'role-tenant-operator', permissionId: 'perm-4' },
    // PLATFORM_ADMIN has platform perms
    { roleId: 'role-platform-admin', permissionId: 'perm-p1' },
    { roleId: 'role-platform-admin', permissionId: 'perm-p2' },
  ];

  const allRoles = [tenantAdminRole, tenantOperatorRole, platformAdminRole];

  describe('deriveEffectivePermissions', () => {
    it('should return permissions for ACTIVE membership with roles', () => {
      const perms = deriveEffectivePermissions(
        'ACTIVE',
        ['role-tenant-admin'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      expect(perms).toHaveLength(4);
      expect(perms.map((p) => p.identifier)).toContain('tenant.members.read');
      expect(perms.map((p) => p.identifier)).toContain('tenant.members.invite');
    });

    it('should return empty for SUSPENDED membership', () => {
      const perms = deriveEffectivePermissions(
        'SUSPENDED',
        ['role-tenant-admin'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      expect(perms).toHaveLength(0);
    });

    it('should return empty for DEACTIVATED membership', () => {
      const perms = deriveEffectivePermissions(
        'DEACTIVATED',
        ['role-tenant-admin'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      expect(perms).toHaveLength(0);
    });

    it('should return empty for INVITED membership', () => {
      const perms = deriveEffectivePermissions(
        'INVITED',
        ['role-tenant-admin'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      expect(perms).toHaveLength(0);
    });

    it('should not include platform permissions in tenant derivation', () => {
      const perms = deriveEffectivePermissions(
        'ACTIVE',
        ['role-platform-admin'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      // Platform role should not grant tenant permissions
      expect(perms).toHaveLength(0);
    });

    it('should combine permissions from multiple roles', () => {
      const perms = deriveEffectivePermissions(
        'ACTIVE',
        ['role-tenant-operator'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      expect(perms).toHaveLength(2);
      expect(perms.map((p) => p.identifier)).toContain('tenant.members.read');
      expect(perms.map((p) => p.identifier)).toContain('tenant.organizations.read');
    });
  });

  describe('derivePlatformPermissions', () => {
    it('should derive platform permissions from platform roles', () => {
      const perms = derivePlatformPermissions(
        ['role-platform-admin'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      expect(perms).toHaveLength(2);
      expect(perms.map((p) => p.identifier)).toContain('platform.users.read');
      expect(perms.map((p) => p.identifier)).toContain('platform.users.manage');
    });

    it('should not include tenant permissions', () => {
      const perms = derivePlatformPermissions(
        ['role-tenant-admin'],
        allRoles,
        rolePermissions,
        allPermissions,
      );

      expect(perms).toHaveLength(0);
    });

    it('should return empty for no roles', () => {
      const perms = derivePlatformPermissions([], allRoles, rolePermissions, allPermissions);
      expect(perms).toHaveLength(0);
    });
  });
});
