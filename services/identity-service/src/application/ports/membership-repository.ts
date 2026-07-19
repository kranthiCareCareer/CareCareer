import type { TransactionClient } from '@carecareer/database';

import type { TenantMembership } from '../../domain/membership.js';
import type {
  MembershipRoleAssignment,
  Permission,
  PlatformRoleAssignment,
  Role,
  RolePermissionMapping,
} from '../../domain/permission.js';

/**
 * Membership repository port.
 * Handles persistence of memberships, roles, and platform role assignments.
 */
export interface MembershipRepository {
  // Memberships
  createMembership(tx: TransactionClient, membership: TenantMembership): Promise<void>;
  findMembershipById(tx: TransactionClient, id: string): Promise<TenantMembership | null>;
  findMembershipByUserAndTenant(
    tx: TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<TenantMembership | null>;
  listMembershipsByTenant(
    tx: TransactionClient,
    tenantId: string,
    params: ListMembershipsParams,
  ): Promise<{ memberships: TenantMembership[]; total: number }>;
  listMembershipsByUser(tx: TransactionClient, userId: string): Promise<TenantMembership[]>;
  updateMembership(tx: TransactionClient, membership: TenantMembership): Promise<void>;

  // Roles
  findRoleById(tx: TransactionClient, id: string): Promise<Role | null>;
  findRoleByName(tx: TransactionClient, name: string): Promise<Role | null>;
  listRoles(tx: TransactionClient, scope?: string | undefined): Promise<Role[]>;
  listTenantRoles(tx: TransactionClient): Promise<Role[]>;
  listPlatformRoles(tx: TransactionClient): Promise<Role[]>;

  // Permissions
  listPermissions(tx: TransactionClient, scope?: string | undefined): Promise<Permission[]>;
  listRolePermissions(tx: TransactionClient): Promise<RolePermissionMapping[]>;

  // Membership Roles
  assignMembershipRole(tx: TransactionClient, membershipId: string, roleId: string): Promise<void>;
  removeMembershipRole(tx: TransactionClient, membershipId: string, roleId: string): Promise<void>;
  listMembershipRoles(tx: TransactionClient, membershipId: string): Promise<Role[]>;
  listMembershipRoleAssignments(
    tx: TransactionClient,
    membershipId: string,
  ): Promise<MembershipRoleAssignment[]>;

  // Platform Role Assignments
  assignPlatformRole(
    tx: TransactionClient,
    userId: string,
    roleId: string,
    assignedBy: string,
  ): Promise<void>;
  removePlatformRole(tx: TransactionClient, userId: string, roleId: string): Promise<void>;
  listPlatformRoleAssignments(
    tx: TransactionClient,
    userId: string,
  ): Promise<PlatformRoleAssignment[]>;
}

export interface ListMembershipsParams {
  readonly offset: number;
  readonly limit: number;
  readonly status?: string | undefined;
}
