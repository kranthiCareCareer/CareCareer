import { v7 as uuidv7 } from 'uuid';

import type {
  AdministrativeDatabase,
  TransactionClient,
  TenantAwareTransaction,
} from '@carecareer/database';
import { runWithContext } from '@carecareer/request-context';

import {
  DuplicateMembershipError,
  InvalidRoleAssignmentError,
  MembershipNotFoundError,
  UserNotFoundError,
} from '../../domain/errors.js';
import type { MembershipStatus } from '../../domain/membership-status.js';
import {
  changeMembershipStatus,
  createMembership,
  type TenantMembership,
} from '../../domain/membership.js';
import type { AuditRecord, IdentityRepository } from '../ports/identity-repository.js';
import type { MembershipRepository } from '../ports/membership-repository.js';

// ─── Create Membership ────────────────────────────────────────────────────────

export interface CreateMembershipInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly status?: MembershipStatus | undefined;
  readonly actorId: string;
  readonly correlationId: string;
}

export async function createMembershipCommand(
  tenantDb: TenantAwareTransaction,
  membershipRepo: MembershipRepository,
  identityRepo: IdentityRepository,
  adminDb: AdministrativeDatabase,
  input: CreateMembershipInput,
): Promise<TenantMembership> {
  // Verify user exists (admin path since user is not tenant-scoped)
  const user = await adminDb.execute(
    {
      actorId: input.actorId,
      reason: 'Verify user for membership creation',
      correlationId: input.correlationId,
    },
    async (tx) => identityRepo.findUserById(tx, input.userId),
  );
  if (!user) {
    throw new UserNotFoundError(input.userId);
  }

  // Create membership in tenant context
  return tenantDb.execute(input.tenantId, async (tx: TransactionClient) => {
    // Check duplicate
    const existing = await membershipRepo.findMembershipByUserAndTenant(
      tx,
      input.userId,
      input.tenantId,
    );
    if (existing) {
      throw new DuplicateMembershipError(input.userId, input.tenantId);
    }

    const membership = createMembership({
      id: uuidv7(),
      userId: input.userId,
      tenantId: input.tenantId,
      status: input.status,
    });

    await membershipRepo.createMembership(tx, membership);

    // Audit + Outbox
    await runWithContext(
      {
        requestId: uuidv7(),
        correlationId: input.correlationId,
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        startedAt: Date.now(),
      },
      async () => {
        await writeAudit(tx, {
          actorId: input.actorId,
          targetUserId: input.userId,
          action: 'identity.membership.created',
          beforeSummary: null,
          afterSummary: {
            membershipId: membership.id,
            status: membership.status,
            tenantId: input.tenantId,
          },
          reason: 'Membership creation',
          correlationId: input.correlationId,
          administrativeAccess: false,
        });

        await writeOutboxEvent(tx, {
          eventType: 'identity.membership.created',
          aggregateType: 'membership',
          aggregateId: membership.id,
          aggregateVersion: membership.version,
          payload: {
            membershipId: membership.id,
            userId: input.userId,
            tenantId: input.tenantId,
            status: membership.status,
          },
          correlationId: input.correlationId,
        });
      },
    );

    return membership;
  });
}

// ─── Change Membership Status ─────────────────────────────────────────────────

export interface ChangeMembershipStatusInput {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly targetStatus: MembershipStatus;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly actorId: string;
  readonly correlationId: string;
}

const MEMBERSHIP_EVENT_MAP: Record<string, string> = {
  ACTIVE: 'identity.membership.activated',
  SUSPENDED: 'identity.membership.suspended',
  DEACTIVATED: 'identity.membership.deactivated',
};

export async function changeMembershipStatusCommand(
  tenantDb: TenantAwareTransaction,
  membershipRepo: MembershipRepository,
  input: ChangeMembershipStatusInput,
): Promise<TenantMembership> {
  return tenantDb.execute(input.tenantId, async (tx: TransactionClient) => {
    const membership = await membershipRepo.findMembershipById(tx, input.membershipId);
    if (!membership) {
      throw new MembershipNotFoundError(input.membershipId);
    }

    const { updatedMembership, previousStatus } = changeMembershipStatus({
      membership,
      targetStatus: input.targetStatus,
      expectedVersion: input.expectedVersion,
    });

    await membershipRepo.updateMembership(tx, updatedMembership);

    const eventType =
      MEMBERSHIP_EVENT_MAP[input.targetStatus] ?? 'identity.membership.status_changed';

    await runWithContext(
      {
        requestId: uuidv7(),
        correlationId: input.correlationId,
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        startedAt: Date.now(),
      },
      async () => {
        await writeAudit(tx, {
          actorId: input.actorId,
          targetUserId: membership.userId,
          action: eventType,
          beforeSummary: { status: previousStatus },
          afterSummary: { status: updatedMembership.status },
          reason: input.reason,
          correlationId: input.correlationId,
          administrativeAccess: false,
        });

        await writeOutboxEvent(tx, {
          eventType,
          aggregateType: 'membership',
          aggregateId: updatedMembership.id,
          aggregateVersion: updatedMembership.version,
          payload: {
            membershipId: updatedMembership.id,
            userId: membership.userId,
            tenantId: input.tenantId,
            previousStatus,
            newStatus: updatedMembership.status,
            reason: input.reason,
          },
          correlationId: input.correlationId,
        });
      },
    );

    return updatedMembership;
  });
}

// ─── Assign Membership Roles ──────────────────────────────────────────────────

export interface AssignMembershipRolesInput {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly roleIds: string[];
  readonly actorId: string;
  readonly correlationId: string;
  readonly expectedVersion: number;
}

export async function assignMembershipRolesCommand(
  tenantDb: TenantAwareTransaction,
  membershipRepo: MembershipRepository,
  input: AssignMembershipRolesInput,
): Promise<TenantMembership> {
  return tenantDb.execute(input.tenantId, async (tx: TransactionClient) => {
    const membership = await membershipRepo.findMembershipById(tx, input.membershipId);
    if (!membership) {
      throw new MembershipNotFoundError(input.membershipId);
    }

    if (membership.version !== input.expectedVersion) {
      throw new (await import('../../domain/errors.js')).VersionConflictError(
        'membership',
        input.expectedVersion,
        membership.version,
      );
    }

    // Validate all roles are TENANT-scoped system roles
    for (const roleId of input.roleIds) {
      const role = await membershipRepo.findRoleById(tx, roleId);
      if (!role) {
        throw new InvalidRoleAssignmentError(`Role not found: ${roleId}`);
      }
      if (role.scope !== 'TENANT') {
        throw new InvalidRoleAssignmentError(
          `Cannot assign platform role ${role.name} to tenant membership`,
        );
      }
      if (role.roleType === 'CUSTOM') {
        throw new InvalidRoleAssignmentError('Custom role operations are disabled');
      }
    }

    // Remove existing roles and assign new set (replacement semantics)
    const existingRoles = await membershipRepo.listMembershipRoleAssignments(
      tx,
      input.membershipId,
    );
    for (const existing of existingRoles) {
      await membershipRepo.removeMembershipRole(tx, input.membershipId, existing.roleId);
    }
    for (const roleId of input.roleIds) {
      await membershipRepo.assignMembershipRole(tx, input.membershipId, roleId);
    }

    // Increment membership authorization version
    const updatedMembership: TenantMembership = {
      ...membership,
      authorizationVersion: membership.authorizationVersion + 1,
      version: membership.version + 1,
      updatedAt: new Date(),
    };
    await membershipRepo.updateMembership(tx, updatedMembership);

    await runWithContext(
      {
        requestId: uuidv7(),
        correlationId: input.correlationId,
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'user',
        startedAt: Date.now(),
      },
      async () => {
        await writeAudit(tx, {
          actorId: input.actorId,
          targetUserId: membership.userId,
          action: 'identity.role.assigned',
          beforeSummary: { roleIds: existingRoles.map((r) => r.roleId) },
          afterSummary: { roleIds: input.roleIds },
          reason: 'Role assignment',
          correlationId: input.correlationId,
          administrativeAccess: false,
        });

        await writeOutboxEvent(tx, {
          eventType: 'identity.role.assigned',
          aggregateType: 'membership',
          aggregateId: membership.id,
          aggregateVersion: updatedMembership.version,
          payload: {
            membershipId: membership.id,
            userId: membership.userId,
            tenantId: input.tenantId,
            roleIds: input.roleIds,
          },
          correlationId: input.correlationId,
        });
      },
    );

    return updatedMembership;
  });
}

// ─── Platform Role Assignment ─────────────────────────────────────────────────

export interface AssignPlatformRoleInput {
  readonly userId: string;
  readonly roleId: string;
  readonly actorId: string;
  readonly correlationId: string;
}

export async function assignPlatformRoleCommand(
  adminDb: AdministrativeDatabase,
  membershipRepo: MembershipRepository,
  identityRepo: IdentityRepository,
  input: AssignPlatformRoleInput,
): Promise<void> {
  await adminDb.execute(
    {
      actorId: input.actorId,
      reason: 'Platform role assignment',
      correlationId: input.correlationId,
    },
    async (tx: TransactionClient) => {
      // Verify user exists
      const user = await identityRepo.findUserById(tx, input.userId);
      if (!user) {
        throw new UserNotFoundError(input.userId);
      }

      // Verify role is PLATFORM-scoped
      const role = await membershipRepo.findRoleById(tx, input.roleId);
      if (!role) {
        throw new InvalidRoleAssignmentError(`Role not found: ${input.roleId}`);
      }
      if (role.scope !== 'PLATFORM') {
        throw new InvalidRoleAssignmentError(
          `Cannot assign tenant role ${role.name} as platform role`,
        );
      }

      await membershipRepo.assignPlatformRole(tx, input.userId, input.roleId, input.actorId);

      // Increment user authorization version
      const updatedUser = {
        ...user,
        authorizationVersion: user.authorizationVersion + 1,
        version: user.version + 1,
        updatedAt: new Date(),
      };
      await identityRepo.updateUser(tx, updatedUser);

      // Audit + Outbox
      await writeAudit(tx, {
        actorId: input.actorId,
        targetUserId: input.userId,
        action: 'identity.platform-role.assigned',
        beforeSummary: null,
        afterSummary: { roleId: input.roleId, roleName: role.name },
        reason: 'Platform role assignment',
        correlationId: input.correlationId,
        administrativeAccess: true,
      });

      await writeOutboxEvent(tx, {
        eventType: 'identity.platform-role.assigned',
        aggregateType: 'user',
        aggregateId: input.userId,
        aggregateVersion: updatedUser.version,
        payload: { userId: input.userId, roleId: input.roleId, roleName: role.name },
        correlationId: input.correlationId,
      });
    },
  );
}

export interface RemovePlatformRoleInput {
  readonly userId: string;
  readonly roleId: string;
  readonly actorId: string;
  readonly correlationId: string;
}

export async function removePlatformRoleCommand(
  adminDb: AdministrativeDatabase,
  membershipRepo: MembershipRepository,
  identityRepo: IdentityRepository,
  input: RemovePlatformRoleInput,
): Promise<void> {
  await adminDb.execute(
    { actorId: input.actorId, reason: 'Platform role removal', correlationId: input.correlationId },
    async (tx: TransactionClient) => {
      const user = await identityRepo.findUserById(tx, input.userId);
      if (!user) {
        throw new UserNotFoundError(input.userId);
      }

      const role = await membershipRepo.findRoleById(tx, input.roleId);
      if (!role) {
        throw new InvalidRoleAssignmentError(`Role not found: ${input.roleId}`);
      }

      await membershipRepo.removePlatformRole(tx, input.userId, input.roleId);

      // Increment user authorization version
      const updatedUser = {
        ...user,
        authorizationVersion: user.authorizationVersion + 1,
        version: user.version + 1,
        updatedAt: new Date(),
      };
      await identityRepo.updateUser(tx, updatedUser);

      await writeAudit(tx, {
        actorId: input.actorId,
        targetUserId: input.userId,
        action: 'identity.platform-role.removed',
        beforeSummary: { roleId: input.roleId, roleName: role.name },
        afterSummary: null,
        reason: 'Platform role removal',
        correlationId: input.correlationId,
        administrativeAccess: true,
      });

      await writeOutboxEvent(tx, {
        eventType: 'identity.platform-role.removed',
        aggregateType: 'user',
        aggregateId: input.userId,
        aggregateVersion: updatedUser.version,
        payload: { userId: input.userId, roleId: input.roleId, roleName: role.name },
        correlationId: input.correlationId,
      });
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAudit(
  tx: TransactionClient,
  params: Omit<AuditRecord, 'id' | 'actorType' | 'timestamp'>,
): Promise<void> {
  const id = uuidv7();
  await tx.$executeRaw`
    INSERT INTO identity.audit_records (
      id, actor_id, actor_type, target_user_id, action,
      before_summary, after_summary, reason,
      correlation_id, administrative_access, timestamp
    ) VALUES (
      ${id}, ${params.actorId}, ${'user'},
      ${params.targetUserId}, ${params.action},
      ${params.beforeSummary ? JSON.stringify(params.beforeSummary) : null}::jsonb,
      ${params.afterSummary ? JSON.stringify(params.afterSummary) : null}::jsonb,
      ${params.reason}, ${params.correlationId},
      ${params.administrativeAccess}, ${new Date().toISOString()}
    )
  `;
}

async function writeOutboxEvent(
  tx: TransactionClient,
  params: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    payload: Record<string, unknown>;
    correlationId: string;
  },
): Promise<void> {
  const id = uuidv7();
  await tx.$executeRaw`
    INSERT INTO identity.event_outbox (
      id, event_type, event_version,
      aggregate_type, aggregate_id, aggregate_version,
      payload, correlation_id, occurred_at, status
    ) VALUES (
      ${id}, ${params.eventType}, ${1},
      ${params.aggregateType}, ${params.aggregateId}, ${params.aggregateVersion},
      ${JSON.stringify(params.payload)}::jsonb,
      ${params.correlationId}, ${new Date().toISOString()}, ${'PENDING'}
    )
  `;
}
