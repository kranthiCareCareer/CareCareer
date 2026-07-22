import type { TransactionClient } from '@carecareer/database';

import {
  evaluateDecision,
  type AuthorizationDecision,
  type AuthorizationPrincipal,
} from '../../domain/authorization-decision.js';

/**
 * Authorization decision application service.
 *
 * Loads authoritative state from PostgreSQL and evaluates the decision.
 * The caller provides only the action and resource — never trusted identity state.
 *
 * Trust boundary:
 * - Principal (userId, tenantId, sessionId) comes from validated authentication
 * - Current user/membership state comes from the database (not JWT claims)
 * - Current roles and permissions come from the database
 * - Explicit denials come from the database
 * - The caller cannot override any of the above
 */

export interface AuthorizationDecisionInput {
  /** From validated principal — not from request body */
  readonly userId: string;
  /** From validated session's selected tenant — not from request */
  readonly tenantId: string;
  /** From validated session ID — not from request */
  readonly sessionId: string;
  /** From validated token — user authorization version at token issuance */
  readonly tokenUserAuthVersion: number;
  /** From validated token — membership authorization version at token issuance */
  readonly tokenMembershipAuthVersion?: number | undefined;
  /** From validated principal — membership ID from session */
  readonly membershipId?: string | undefined;
  /** From request body — the action to evaluate */
  readonly action: string;
  /** From request body — the resource type */
  readonly resourceType: string;
  /** From request body — optional resource ID */
  readonly resourceId?: string | undefined;
  /** Resource tenant (must match principal tenant for cross-tenant check) */
  readonly resourceTenantId?: string | undefined;
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

export interface AuthorizationRepository {
  /** Load current user status and authorization version */
  getUserState(
    tx: TransactionClient,
    userId: string,
  ): Promise<{ status: string; authorizationVersion: number } | null>;

  /** Load current membership for user in tenant */
  getMembershipState(
    tx: TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<{
    id: string;
    status: string;
    authorizationVersion: number;
    roleIds: string[];
  } | null>;

  /** Load effective permissions from roles */
  getPermissionsForRoles(
    tx: TransactionClient,
    roleIds: string[],
  ): Promise<string[]>;

  /** Load active explicit denials for user in tenant */
  getExplicitDenials(
    tx: TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<string[]>;

  /** Persist a decision record for audit */
  recordDecision(
    tx: TransactionClient,
    decision: AuthorizationDecision,
    sessionId: string,
    membershipAuthVersion: number,
    correlationId: string,
  ): Promise<void>;
}

/**
 * Execute an authorization decision using authoritative server-side state.
 *
 * Fail-closed: any infrastructure failure results in denial.
 */
export async function evaluateAuthorizationDecision(
  tx: TransactionClient,
  repo: AuthorizationRepository,
  input: AuthorizationDecisionInput,
): Promise<AuthorizationDecision> {
  const decisionId = crypto.randomUUID();

  // Load authoritative user state (not from JWT)
  const userState = await repo.getUserState(tx, input.userId);
  if (!userState) {
    const denied = failClosed(decisionId, input, 'USER_DEACTIVATED');
    await repo.recordDecision(tx, denied, input.sessionId, 0, input.correlationId);
    return denied;
  }

  // Load authoritative membership state (not from JWT)
  const membership = await repo.getMembershipState(tx, input.userId, input.tenantId);
  if (!membership) {
    const denied = failClosed(decisionId, input, 'MEMBERSHIP_INVALID');
    await repo.recordDecision(tx, denied, input.sessionId, 0, input.correlationId);
    return denied;
  }

  // Version enforcement: reject stale tokens where authorization changed since issuance
  if (userState.authorizationVersion !== input.tokenUserAuthVersion) {
    const denied = failClosed(decisionId, input, 'VERSION_STALE');
    await repo.recordDecision(tx, denied, input.sessionId, membership.authorizationVersion, input.correlationId);
    return denied;
  }
  if (
    input.tokenMembershipAuthVersion !== undefined &&
    membership.authorizationVersion !== input.tokenMembershipAuthVersion
  ) {
    const denied = failClosed(decisionId, input, 'VERSION_STALE');
    await repo.recordDecision(tx, denied, input.sessionId, membership.authorizationVersion, input.correlationId);
    return denied;
  }

  // Load current permissions from role assignments
  const permissions = await repo.getPermissionsForRoles(tx, membership.roleIds);

  // Load explicit denials
  const denials = await repo.getExplicitDenials(tx, input.userId, input.tenantId);

  // Build the authoritative principal (never from caller input)
  const principal: AuthorizationPrincipal = {
    userId: input.userId,
    userStatus: userState.status as AuthorizationPrincipal['userStatus'],
    userAuthorizationVersion: userState.authorizationVersion,
    tenantId: input.tenantId,
    membershipId: membership.id,
    membershipStatus: membership.status as AuthorizationPrincipal['membershipStatus'],
    membershipAuthorizationVersion: membership.authorizationVersion,
    permissions,
    explicitDenials: denials,
  };

  // Evaluate using the pure decision function
  const decision = evaluateDecision(principal, {
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  }, decisionId);

  // Record audit evidence for denials (and privileged allows in future)
  if (decision.outcome === 'DENIED') {
    await repo.recordDecision(
      tx,
      decision,
      input.sessionId,
      membership.authorizationVersion,
      input.correlationId,
    );
  }

  return decision;
}

function failClosed(
  decisionId: string,
  input: AuthorizationDecisionInput,
  reasonCode: AuthorizationDecision['reasonCode'],
): AuthorizationDecision {
  return {
    decisionId,
    outcome: 'DENIED',
    reasonCode,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    tenantId: input.tenantId,
    userId: input.userId,
    evaluatedAt: new Date(),
    policyVersion: 1,
  };
}
