import type { TransactionClient } from '@carecareer/database';

import type {
  ListMembershipsParams,
  MembershipRepository,
} from '../application/ports/membership-repository.js';
import type { TenantMembership } from '../domain/membership.js';
import type {
  MembershipRoleAssignment,
  Permission,
  PlatformRoleAssignment,
  Role,
  RolePermissionMapping,
} from '../domain/permission.js';

/**
 * PostgreSQL implementation of the membership repository.
 * Operates within the identity schema.
 */
export class PostgresMembershipRepository implements MembershipRepository {
  // ─── Memberships ────────────────────────────────────────────────────────────

  async createMembership(tx: TransactionClient, m: TenantMembership): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.tenant_memberships (
        id, user_id, tenant_id, status, authorization_version,
        joined_at, suspended_at, deactivated_at,
        created_at, updated_at, version
      ) VALUES (
        ${m.id}, ${m.userId}, ${m.tenantId}, ${m.status}, ${m.authorizationVersion},
        ${m.joinedAt?.toISOString() ?? null}, ${m.suspendedAt?.toISOString() ?? null},
        ${m.deactivatedAt?.toISOString() ?? null},
        ${m.createdAt.toISOString()}, ${m.updatedAt.toISOString()}, ${m.version}
      )
    `;
  }

  async findMembershipById(tx: TransactionClient, id: string): Promise<TenantMembership | null> {
    const rows = await tx.$queryRaw<MembershipRow>`
      SELECT * FROM identity.tenant_memberships WHERE id = ${id}
    `;
    return rows.length > 0 ? mapMembershipRow(rows[0]!) : null;
  }

  async findMembershipByUserAndTenant(
    tx: TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<TenantMembership | null> {
    const rows = await tx.$queryRaw<MembershipRow>`
      SELECT * FROM identity.tenant_memberships
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}
    `;
    return rows.length > 0 ? mapMembershipRow(rows[0]!) : null;
  }

  async listMembershipsByTenant(
    tx: TransactionClient,
    tenantId: string,
    params: ListMembershipsParams,
  ): Promise<{ memberships: TenantMembership[]; total: number }> {
    let rows: MembershipRow[];
    let countRows: { total: number }[];

    if (params.status) {
      countRows = await tx.$queryRaw<{ total: number }>`
        SELECT count(*)::int as total FROM identity.tenant_memberships
        WHERE tenant_id = ${tenantId} AND status = ${params.status}
      `;
      rows = await tx.$queryRaw<MembershipRow>`
        SELECT * FROM identity.tenant_memberships
        WHERE tenant_id = ${tenantId} AND status = ${params.status}
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `;
    } else {
      countRows = await tx.$queryRaw<{ total: number }>`
        SELECT count(*)::int as total FROM identity.tenant_memberships
        WHERE tenant_id = ${tenantId}
      `;
      rows = await tx.$queryRaw<MembershipRow>`
        SELECT * FROM identity.tenant_memberships
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `;
    }

    return {
      memberships: rows.map(mapMembershipRow),
      total: countRows[0]?.total ?? 0,
    };
  }

  async listMembershipsByUser(tx: TransactionClient, userId: string): Promise<TenantMembership[]> {
    const rows = await tx.$queryRaw<MembershipRow>`
      SELECT * FROM identity.tenant_memberships
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return rows.map(mapMembershipRow);
  }

  async updateMembership(tx: TransactionClient, m: TenantMembership): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.tenant_memberships
      SET status = ${m.status},
          authorization_version = ${m.authorizationVersion},
          joined_at = ${m.joinedAt?.toISOString() ?? null},
          suspended_at = ${m.suspendedAt?.toISOString() ?? null},
          deactivated_at = ${m.deactivatedAt?.toISOString() ?? null},
          updated_at = ${m.updatedAt.toISOString()},
          version = ${m.version}
      WHERE id = ${m.id}
    `;
  }

  // ─── Roles ──────────────────────────────────────────────────────────────────

  async findRoleById(tx: TransactionClient, id: string): Promise<Role | null> {
    const rows = await tx.$queryRaw<RoleRow>`
      SELECT * FROM identity.roles WHERE id = ${id}
    `;
    return rows.length > 0 ? mapRoleRow(rows[0]!) : null;
  }

  async findRoleByName(tx: TransactionClient, name: string): Promise<Role | null> {
    const rows = await tx.$queryRaw<RoleRow>`
      SELECT * FROM identity.roles WHERE name = ${name}
    `;
    return rows.length > 0 ? mapRoleRow(rows[0]!) : null;
  }

  async listRoles(tx: TransactionClient, scope?: string | undefined): Promise<Role[]> {
    if (scope) {
      const rows = await tx.$queryRaw<RoleRow>`
        SELECT * FROM identity.roles WHERE scope = ${scope} ORDER BY name
      `;
      return rows.map(mapRoleRow);
    }
    const rows = await tx.$queryRaw<RoleRow>`
      SELECT * FROM identity.roles ORDER BY name
    `;
    return rows.map(mapRoleRow);
  }

  async listTenantRoles(tx: TransactionClient): Promise<Role[]> {
    return this.listRoles(tx, 'TENANT');
  }

  async listPlatformRoles(tx: TransactionClient): Promise<Role[]> {
    return this.listRoles(tx, 'PLATFORM');
  }

  // ─── Permissions ────────────────────────────────────────────────────────────

  async listPermissions(tx: TransactionClient, scope?: string | undefined): Promise<Permission[]> {
    if (scope) {
      const rows = await tx.$queryRaw<PermissionRow>`
        SELECT * FROM identity.permissions WHERE scope = ${scope} ORDER BY identifier
      `;
      return rows.map(mapPermissionRow);
    }
    const rows = await tx.$queryRaw<PermissionRow>`
      SELECT * FROM identity.permissions ORDER BY identifier
    `;
    return rows.map(mapPermissionRow);
  }

  async listRolePermissions(tx: TransactionClient): Promise<RolePermissionMapping[]> {
    const rows = await tx.$queryRaw<{ role_id: string; permission_id: string }>`
      SELECT role_id, permission_id FROM identity.role_permissions
    `;
    return rows.map((r) => ({ roleId: r.role_id, permissionId: r.permission_id }));
  }

  // ─── Membership Roles ───────────────────────────────────────────────────────

  async assignMembershipRole(
    tx: TransactionClient,
    membershipId: string,
    roleId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.membership_roles (membership_id, role_id)
      VALUES (${membershipId}, ${roleId})
      ON CONFLICT DO NOTHING
    `;
  }

  async removeMembershipRole(
    tx: TransactionClient,
    membershipId: string,
    roleId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      DELETE FROM identity.membership_roles
      WHERE membership_id = ${membershipId} AND role_id = ${roleId}
    `;
  }

  async listMembershipRoles(tx: TransactionClient, membershipId: string): Promise<Role[]> {
    const rows = await tx.$queryRaw<RoleRow>`
      SELECT r.* FROM identity.roles r
      INNER JOIN identity.membership_roles mr ON mr.role_id = r.id
      WHERE mr.membership_id = ${membershipId}
      ORDER BY r.name
    `;
    return rows.map(mapRoleRow);
  }

  async listMembershipRoleAssignments(
    tx: TransactionClient,
    membershipId: string,
  ): Promise<MembershipRoleAssignment[]> {
    const rows = await tx.$queryRaw<{ membership_id: string; role_id: string }>`
      SELECT membership_id, role_id FROM identity.membership_roles
      WHERE membership_id = ${membershipId}
    `;
    return rows.map((r) => ({ membershipId: r.membership_id, roleId: r.role_id }));
  }

  // ─── Platform Role Assignments ──────────────────────────────────────────────

  async assignPlatformRole(
    tx: TransactionClient,
    userId: string,
    roleId: string,
    assignedBy: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.platform_role_assignments (user_id, role_id, assigned_by, assigned_at)
      VALUES (${userId}, ${roleId}, ${assignedBy}, ${new Date().toISOString()})
      ON CONFLICT (user_id, role_id) DO NOTHING
    `;
  }

  async removePlatformRole(tx: TransactionClient, userId: string, roleId: string): Promise<void> {
    await tx.$executeRaw`
      DELETE FROM identity.platform_role_assignments
      WHERE user_id = ${userId} AND role_id = ${roleId}
    `;
  }

  async listPlatformRoleAssignments(
    tx: TransactionClient,
    userId: string,
  ): Promise<PlatformRoleAssignment[]> {
    const rows = await tx.$queryRaw<{
      user_id: string;
      role_id: string;
      assigned_by: string | null;
      assigned_at: string | Date;
    }>`
      SELECT user_id, role_id, assigned_by, assigned_at
      FROM identity.platform_role_assignments
      WHERE user_id = ${userId}
    `;
    return rows.map((r) => ({
      userId: r.user_id,
      roleId: r.role_id,
      assignedBy: r.assigned_by,
      assignedAt: new Date(r.assigned_at),
    }));
  }
}

// ─── Row Types and Mappers ────────────────────────────────────────────────────

interface MembershipRow {
  id: string;
  user_id: string;
  tenant_id: string;
  status: string;
  authorization_version: number;
  joined_at: string | Date | null;
  suspended_at: string | Date | null;
  deactivated_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  version: number;
}

interface RoleRow {
  id: string;
  name: string;
  scope: string;
  role_type: string;
  description: string | null;
}

interface PermissionRow {
  id: string;
  identifier: string;
  scope: string;
  description: string | null;
}

function mapMembershipRow(row: MembershipRow): TenantMembership {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    status: row.status as TenantMembership['status'],
    authorizationVersion: row.authorization_version,
    joinedAt: row.joined_at ? new Date(row.joined_at) : null,
    suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
    deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    version: row.version,
  };
}

function mapRoleRow(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as 'PLATFORM' | 'TENANT',
    roleType: row.role_type as 'SYSTEM' | 'CUSTOM',
    description: row.description,
  };
}

function mapPermissionRow(row: PermissionRow): Permission {
  return {
    id: row.id,
    identifier: row.identifier,
    scope: row.scope as 'PLATFORM' | 'TENANT',
    description: row.description,
  };
}
