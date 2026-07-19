import { v7 as uuidv7 } from 'uuid';

import type { AdministrativeDatabase, TransactionClient } from '@carecareer/database';
import { runWithContext } from '@carecareer/request-context';

import { UserNotFoundError } from '../../domain/errors.js';
import type { UserStatus } from '../../domain/user-status.js';
import { changeUserStatus, type User } from '../../domain/user.js';
import type { AuditRecord, IdentityRepository } from '../ports/identity-repository.js';

export interface ChangeUserStatusInput {
  readonly userId: string;
  readonly targetStatus: UserStatus;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly actorId: string;
  readonly correlationId: string;
}

const EVENT_TYPE_MAP: Record<string, string> = {
  SUSPENDED: 'identity.user.suspended',
  ACTIVE: 'identity.user.reactivated',
  DEACTIVATED: 'identity.user.deactivated',
};

/**
 * Change user status.
 * Validates the state machine, increments auth version, records audit + outbox.
 */
export async function changeUserStatusCommand(
  adminDb: AdministrativeDatabase,
  repo: IdentityRepository,
  input: ChangeUserStatusInput,
): Promise<User> {
  return adminDb.execute(
    {
      actorId: input.actorId,
      reason: `User status change to ${input.targetStatus}: ${input.reason}`,
      correlationId: input.correlationId,
    },
    async (tx: TransactionClient) => {
      const user = await repo.findUserById(tx, input.userId);
      if (!user) {
        throw new UserNotFoundError(input.userId);
      }

      const { updatedUser, previousStatus } = changeUserStatus({
        user,
        targetStatus: input.targetStatus,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      });

      await repo.updateUser(tx, updatedUser);

      // Audit record
      const auditRecord: AuditRecord = {
        id: uuidv7(),
        actorId: input.actorId,
        actorType: 'user',
        targetUserId: updatedUser.id,
        action: EVENT_TYPE_MAP[input.targetStatus] ?? 'identity.user.status_changed',
        beforeSummary: { status: previousStatus },
        afterSummary: { status: updatedUser.status },
        reason: input.reason,
        correlationId: input.correlationId,
        administrativeAccess: true,
        timestamp: new Date(),
      };
      await repo.insertAuditRecord(tx, auditRecord);

      // Outbox event
      const eventType = EVENT_TYPE_MAP[input.targetStatus] ?? 'identity.user.status_changed';
      await runWithContext(
        {
          requestId: uuidv7(),
          correlationId: input.correlationId,
          tenantId: 'platform',
          actorId: input.actorId,
          actorType: 'user',
          startedAt: Date.now(),
        },
        async () => {
          await tx.$executeRaw`
            INSERT INTO identity.event_outbox (
              id, event_type, event_version,
              aggregate_type, aggregate_id, aggregate_version,
              payload, correlation_id, occurred_at, status
            ) VALUES (
              ${uuidv7()}, ${eventType}, ${1},
              ${'user'}, ${updatedUser.id}, ${updatedUser.version},
              ${JSON.stringify({
                userId: updatedUser.id,
                previousStatus,
                newStatus: updatedUser.status,
                reason: input.reason,
              })}::jsonb,
              ${input.correlationId}, ${new Date().toISOString()}, ${'PENDING'}
            )
          `;
        },
      );

      return updatedUser;
    },
  );
}
