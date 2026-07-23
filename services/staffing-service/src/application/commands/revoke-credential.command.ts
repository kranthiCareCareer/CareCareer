import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { revokeCredential } from '../../domain/credential.js';
import {
  CredentialNotFoundError,
  CredentialWorkerMismatchError,
  InvalidCredentialTransitionError,
} from '../../domain/errors.js';
import {
  claimIdempotencyKey,
  completeIdempotency,
  hashRequest,
  IdempotencyConsistencyError,
} from '../../infrastructure/credential-idempotency.js';
import type { CredentialRepository } from '../ports/credential-repository.js';

export interface RevokeCredentialInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly workerId: string;
  readonly credentialId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/**
 * RevokeCredential command handler.
 * Transitions VERIFIED/EXPIRING → REVOKED atomically with audit + outbox.
 */
export class RevokeCredentialHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: CredentialRepository,
  ) {}

  async execute(input: RevokeCredentialInput): Promise<{ credentialId: string; status: string }> {
    let resultStatus = '';

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      const reqHash = hashRequest({
        workerId: input.workerId,
        credentialId: input.credentialId,
        operation: 'revoke',
        reason: input.reason,
      });

      const claim = await claimIdempotencyKey(
        tx,
        input.tenantId,
        'credential.revoke',
        input.idempotencyKey,
        reqHash,
      );

      if (!claim.claimed && claim.replay) {
        resultStatus = (claim.replay.response as { status: string }).status;
        return;
      }

      const token = claim.claimToken;
      if (!token) throw new IdempotencyConsistencyError();

      const credential = await this.repo.getCredentialById(tx, input.credentialId);
      if (!credential) {
        throw new CredentialNotFoundError(input.credentialId);
      }
      if (credential.workerId !== input.workerId) {
        throw new CredentialWorkerMismatchError();
      }

      try {
        const updated = revokeCredential(credential);
        await this.repo.updateCredential(tx, updated);
        resultStatus = updated.status;
        await this.emitAudit(tx, input, updated.status);
        await this.emitOutbox(tx, input, credential.credentialType, updated.status);

        await completeIdempotency(
          tx,
          input.tenantId,
          'credential.revoke',
          input.idempotencyKey,
          token,
          200,
          { credentialId: input.credentialId, status: updated.status },
        );
      } catch (error: unknown) {
        if (
          error instanceof InvalidCredentialTransitionError ||
          error instanceof IdempotencyConsistencyError
        )
          throw error;
        if (error instanceof Error && error.message.includes('Cannot revoke')) {
          throw new InvalidCredentialTransitionError(credential.status, 'REVOKED');
        }
        throw error;
      }
    });

    return { credentialId: input.credentialId, status: resultStatus };
  }

  private async emitAudit(
    tx: TransactionClient,
    input: RevokeCredentialInput,
    newStatus: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId}, ${'credential.revoked'},
        ${'credential'}, ${input.credentialId}::uuid,
        ${JSON.stringify({ status: newStatus, reason: input.reason })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutbox(
    tx: TransactionClient,
    input: RevokeCredentialInput,
    credentialType: string,
    newStatus: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.credential.revoked.v1'},
        ${'credential'}, ${input.credentialId}::uuid,
        ${JSON.stringify({
          credentialId: input.credentialId,
          workerId: input.workerId,
          credentialType,
          status: newStatus,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
