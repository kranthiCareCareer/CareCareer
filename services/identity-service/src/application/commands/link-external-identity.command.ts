import { v7 as uuidv7 } from 'uuid';

import type { AdministrativeDatabase, TransactionClient } from '@carecareer/database';
import { runWithContext } from '@carecareer/request-context';

import { DuplicateExternalIdentityError, UserNotFoundError } from '../../domain/errors.js';
import { createExternalIdentity, type ExternalIdentity } from '../../domain/external-identity.js';
import type { AuditRecord, IdentityRepository } from '../ports/identity-repository.js';

export interface LinkExternalIdentityInput {
  readonly userId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly providerType: string;
  readonly emailClaim?: string | null | undefined;
  readonly displayNameClaim?: string | null | undefined;
  readonly actorId: string;
  readonly correlationId: string;
}

/**
 * Link an external identity to an existing user.
 * Enforces UNIQUE(issuer, subject) constraint.
 * Same email from different issuers does NOT auto-merge.
 */
export async function linkExternalIdentityCommand(
  adminDb: AdministrativeDatabase,
  repo: IdentityRepository,
  input: LinkExternalIdentityInput,
): Promise<ExternalIdentity> {
  return adminDb.execute(
    {
      actorId: input.actorId,
      reason: 'Link external identity to user',
      correlationId: input.correlationId,
    },
    async (tx: TransactionClient) => {
      // Verify user exists
      const user = await repo.findUserById(tx, input.userId);
      if (!user) {
        throw new UserNotFoundError(input.userId);
      }

      // Check duplicate issuer+subject
      const existing = await repo.findExternalIdentityByIssuerSubject(
        tx,
        input.issuer,
        input.subject,
      );
      if (existing) {
        throw new DuplicateExternalIdentityError(input.issuer, input.subject);
      }

      const identity = createExternalIdentity({
        id: uuidv7(),
        userId: input.userId,
        issuer: input.issuer,
        subject: input.subject,
        providerType: input.providerType,
        emailClaim: input.emailClaim,
        displayNameClaim: input.displayNameClaim,
      });

      await repo.createExternalIdentity(tx, identity);

      // Audit record (redact email from before/after for security)
      const auditRecord: AuditRecord = {
        id: uuidv7(),
        actorId: input.actorId,
        actorType: 'user',
        targetUserId: input.userId,
        action: 'identity.external-identity.linked',
        beforeSummary: null,
        afterSummary: {
          identityId: identity.id,
          issuer: identity.issuer,
          providerType: identity.providerType,
        },
        reason: 'External identity link',
        correlationId: input.correlationId,
        administrativeAccess: true,
        timestamp: new Date(),
      };
      await repo.insertAuditRecord(tx, auditRecord);

      // Outbox event
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
              ${uuidv7()}, ${'identity.external-identity.linked'}, ${1},
              ${'external_identity'}, ${identity.id}, ${1},
              ${JSON.stringify({
                identityId: identity.id,
                userId: input.userId,
                issuer: identity.issuer,
                providerType: identity.providerType,
              })}::jsonb,
              ${input.correlationId}, ${new Date().toISOString()}, ${'PENDING'}
            )
          `;
        },
      );

      return identity;
    },
  );
}
