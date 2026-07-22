import type { TransactionClient } from '@carecareer/database';

import type { AuthorizationRepository } from '../application/commands/authorization-decision.command.js';
import type { AuthorizationDecision } from '../domain/authorization-decision.js';

/**
 * PostgreSQL implementation of the authorization repository.
 *
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 * The application role (carecareer_app) cannot bypass RLS.
 */
export class PostgresAuthorizationRepository implements AuthorizationRepository {
  async getUserState(
    tx: TransactionClient,
    userId: string,
  ): Promise<{ status: string; authorizationVersion: number } | null> {
    const rows = await tx.$queryRaw<{ status: string; authorization_version: number }>`
      SELECT status, authorization_version
      FROM identity.users
      WHERE id = ${userId}::uuid`;
    if (rows.length === 0) return null;
    return {
      status: rows[0]!.status,
      authorizationVersion: rows[0]!.authorization_version,
    };
  }

  async getMembershipState(
    tx: TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<{
    id: string;
    status: string;
    authorizationVersion: number;
    roleIds: string[];
  } | null> {
    const rows = await tx.$queryRaw<{
      id: string;
      status: string;
      authorization_version: number;
    }>`
      SELECT id, status, authorization_version
      FROM identity.tenant_memberships
      WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (rows.length === 0) return null;
    const membership = rows[0]!;

    // Load role assignments for this membership
    const roleRows = await tx.$queryRaw<{ role_id: string }>`
      SELECT role_id FROM identity.membership_roles
      WHERE membership_id = ${membership.id}::uuid`;

    return {
      id: membership.id,
      status: membership.status,
      authorizationVersion: membership.authorization_version,
      roleIds: roleRows.map((r) => r.role_id),
    };
  }

  async getPermissionsForRoles(tx: TransactionClient, roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];

    // Build a safe parameterized query for role IDs
    // Using a single query with array membership check
    const rows = await tx.$queryRaw<{ identifier: string }>`
      SELECT DISTINCT p.identifier
      FROM identity.role_permissions rp
      JOIN identity.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ANY(${roleIds}::uuid[])`;

    return rows.map((r) => r.identifier);
  }

  async getExplicitDenials(
    tx: TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    // Load denials targeting this user or their membership in this tenant
    const rows = await tx.$queryRaw<{ action: string }>`
      SELECT DISTINCT action
      FROM identity.explicit_denials
      WHERE tenant_id = ${tenantId}::uuid
        AND active = true
        AND (
          (principal_type = 'USER' AND principal_id = ${userId}::uuid)
          OR (principal_type = 'MEMBERSHIP' AND principal_id IN (
            SELECT id FROM identity.tenant_memberships
            WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid
          ))
        )`;

    return rows.map((r) => r.action);
  }

  async recordDecision(
    tx: TransactionClient,
    decision: AuthorizationDecision,
    sessionId: string,
    membershipAuthVersion: number,
    correlationId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.authorization_decisions (
        id, tenant_id, user_id, session_id, action, resource_type, resource_id,
        outcome, reason_code, policy_version, user_authorization_version,
        membership_authorization_version, correlation_id, evaluated_at
      ) VALUES (
        ${decision.decisionId}::uuid, ${decision.tenantId}::uuid,
        ${decision.userId}::uuid, ${sessionId}::uuid,
        ${decision.action}, ${decision.resourceType},
        ${decision.resourceId ?? null}::uuid,
        ${decision.outcome}, ${decision.reasonCode},
        ${decision.policyVersion}, ${decision.policyVersion},
        ${membershipAuthVersion}, ${correlationId},
        ${decision.evaluatedAt.toISOString()}::timestamptz
      )`;
  }
}
