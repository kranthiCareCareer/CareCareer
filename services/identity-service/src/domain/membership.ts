import { InvalidStatusTransitionError, VersionConflictError } from './errors.js';
import { isValidMembershipTransition, type MembershipStatus } from './membership-status.js';

/**
 * Tenant membership domain entity.
 * Links a user to a tenant with lifecycle and role management.
 */
export interface TenantMembership {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly status: MembershipStatus;
  readonly authorizationVersion: number;
  readonly joinedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CreateMembershipParams {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly status?: MembershipStatus | undefined;
}

export interface ChangeMembershipStatusParams {
  readonly membership: TenantMembership;
  readonly targetStatus: MembershipStatus;
  readonly expectedVersion: number;
}

export interface ChangeMembershipStatusResult {
  readonly updatedMembership: TenantMembership;
  readonly previousStatus: MembershipStatus;
}

/**
 * Create a new tenant membership.
 * Defaults to INVITED status unless explicitly ACTIVE (for admin-initiated).
 */
export function createMembership(params: CreateMembershipParams): TenantMembership {
  const now = new Date();
  const status = params.status ?? 'INVITED';
  return {
    id: params.id,
    userId: params.userId,
    tenantId: params.tenantId,
    status,
    authorizationVersion: 1,
    joinedAt: status === 'ACTIVE' ? now : null,
    suspendedAt: null,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Transition a membership to a new status.
 * Increments authorization_version and version.
 */
export function changeMembershipStatus(
  params: ChangeMembershipStatusParams,
): ChangeMembershipStatusResult {
  const { membership, targetStatus, expectedVersion } = params;

  if (membership.version !== expectedVersion) {
    throw new VersionConflictError('membership', expectedVersion, membership.version);
  }

  if (!isValidMembershipTransition(membership.status, targetStatus)) {
    throw new InvalidStatusTransitionError(membership.status, targetStatus);
  }

  const now = new Date();
  const updatedMembership: TenantMembership = {
    ...membership,
    status: targetStatus,
    authorizationVersion: membership.authorizationVersion + 1,
    version: membership.version + 1,
    updatedAt: now,
    joinedAt: targetStatus === 'ACTIVE' && !membership.joinedAt ? now : membership.joinedAt,
    suspendedAt: targetStatus === 'SUSPENDED' ? now : membership.suspendedAt,
    deactivatedAt: targetStatus === 'DEACTIVATED' ? now : membership.deactivatedAt,
  };

  return {
    updatedMembership,
    previousStatus: membership.status,
  };
}
