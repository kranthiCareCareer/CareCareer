/**
 * Permission derivation for CareCareer authorization model.
 *
 * Rules:
 * - Suspended membership has no tenant permissions.
 * - Deactivated membership has no tenant permissions.
 * - INVITED membership has no operational tenant permissions.
 * - Tenant roles cannot contain platform permissions.
 * - Platform roles cannot be assigned through tenant APIs.
 * - Custom roles remain disabled.
 * - Provider/external IdP groups are not permission sources.
 */

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly scope: 'PLATFORM' | 'TENANT';
  readonly roleType: 'SYSTEM' | 'CUSTOM';
  readonly description: string | null;
}

export interface Permission {
  readonly id: string;
  readonly identifier: string;
  readonly scope: 'PLATFORM' | 'TENANT';
  readonly description: string | null;
}

export interface RolePermissionMapping {
  readonly roleId: string;
  readonly permissionId: string;
}

export interface MembershipRoleAssignment {
  readonly membershipId: string;
  readonly roleId: string;
}

export interface PlatformRoleAssignment {
  readonly userId: string;
  readonly roleId: string;
  readonly assignedBy: string | null;
  readonly assignedAt: Date;
}

/**
 * Derive effective permissions for a tenant membership.
 * Returns empty set for non-ACTIVE memberships.
 */
export function deriveEffectivePermissions(
  membershipStatus: string,
  membershipRoleIds: string[],
  allRoles: Role[],
  rolePermissions: RolePermissionMapping[],
  allPermissions: Permission[],
): Permission[] {
  // Only ACTIVE memberships have operational permissions
  if (membershipStatus !== 'ACTIVE') {
    return [];
  }

  // Collect permission IDs from membership roles
  const permissionIds = new Set<string>();

  for (const roleId of membershipRoleIds) {
    const role = allRoles.find((r) => r.id === roleId);
    if (!role || role.scope !== 'TENANT') continue;

    const mappings = rolePermissions.filter((rp) => rp.roleId === roleId);
    for (const mapping of mappings) {
      permissionIds.add(mapping.permissionId);
    }
  }

  // Map permission IDs to full Permission objects (only TENANT-scoped)
  return allPermissions.filter((p) => permissionIds.has(p.id) && p.scope === 'TENANT');
}

/**
 * Derive effective platform permissions for a user.
 */
export function derivePlatformPermissions(
  platformRoleIds: string[],
  allRoles: Role[],
  rolePermissions: RolePermissionMapping[],
  allPermissions: Permission[],
): Permission[] {
  const permissionIds = new Set<string>();

  for (const roleId of platformRoleIds) {
    const role = allRoles.find((r) => r.id === roleId);
    if (!role || role.scope !== 'PLATFORM') continue;

    const mappings = rolePermissions.filter((rp) => rp.roleId === roleId);
    for (const mapping of mappings) {
      permissionIds.add(mapping.permissionId);
    }
  }

  return allPermissions.filter((p) => permissionIds.has(p.id) && p.scope === 'PLATFORM');
}
