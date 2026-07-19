import { v7 as uuidv7 } from 'uuid';

import type { AdministrativeDatabase, TransactionClient } from '@carecareer/database';
import { runWithContext } from '@carecareer/request-context';

import { DuplicateUserError } from '../../domain/errors.js';
import { createUser, type User } from '../../domain/user.js';
import type { AuditRecord, IdentityRepository } from '../ports/identity-repository.js';

export interface CreateUserInput {
  readonly displayName: string;
  readonly primaryEmail: string;
  readonly actorId: string;
  readonly correlationId: string;
}

/**
 * Create a new platform user.
 * Uses administrative database path (platform-level operation).
 * Atomically creates user, audit record, and outbox event.
 */
export async function createUserCommand(
  adminDb: AdministrativeDatabase,
  repo: IdentityRepository,
  input: CreateUserInput,
): Promise<User> {
  const userId = uuidv7();

  return adminDb.execute(
    {
      actorId: input.actorId,
      reason: 'Platform user creation',
      correlationId: input.correlationId,
    },
    async (tx: TransactionClient) => {
      // Check duplicate email (soft rule — spec says no global uniqueness required)
      const existing = await repo.findUserByEmail(tx, input.primaryEmail.trim().toLowerCase());
      if (existing) {
        throw new DuplicateUserError(`A user with email ${input.primaryEmail} already exists`);
      }

      const user = createUser({
        id: userId,
        displayName: input.displayName,
        primaryEmail: input.primaryEmail,
      });

      await repo.createUser(tx, user);

      // Audit record
      const auditRecord: AuditRecord = {
        id: uuidv7(),
        actorId: input.actorId,
        actorType: 'user',
        targetUserId: user.id,
        action: 'identity.user.created',
        beforeSummary: null,
        afterSummary: { status: user.status, displayName: user.displayName },
        reason: 'User creation',
        correlationId: input.correlationId,
        administrativeAccess: true,
        timestamp: new Date(),
      };
      await repo.insertAuditRecord(tx, auditRecord);

      // Outbox event (uses request context for envelope metadata)
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
              ${uuidv7()}, ${'identity.user.created'}, ${1},
              ${'user'}, ${user.id}, ${user.version},
              ${JSON.stringify({
                userId: user.id,
                displayName: user.displayName,
                status: user.status,
              })}::jsonb,
              ${input.correlationId}, ${new Date().toISOString()}, ${'PENDING'}
            )
          `;
        },
      );

      return user;
    },
  );
}
