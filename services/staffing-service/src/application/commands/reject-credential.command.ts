import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { rejectCredential } from '../../domain/credential.js';
import {
  CredentialNotFoundError,
  CredentialWorkerMismatchError,
  InvalidCredentialTransitionError,
  VersionConflictError,
} from '../../domain/errors.js';
import {
  claimIdempotencyKey,
  completeIdempotency,
  hashRequest,
  IdempotencyConsistencyError,
} from '../../infrastructure/credential-idempotency.js';
import type { CredentialRepository } from '../ports/credential-repository.js';

export interface RejectCredentialInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly workerId: string;
  readonly credentialId: string;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/**
 * RejectCredential command handler.
 * Transitions PENDING_VERIFICATION → REJECTED atomically with audit + outbox.
 */
export class RejectCredentialHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: CredentialRepository,
  ) {}

  async execute(input: RejectCredentialInput): Promise<{ credentialId: string; status: string }> {
    let resultStatus = '';

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      const reqHash = hashRequest({
        workerId: input.workerId,
        credentialId: input.credentialId,
        operation: 'reject',
        reason: input.reason,
      });

      const claim = await claimIdempotencyKey(
        tx,
        input.tenantId,
        'credential.reject',
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
      if (credential.version !== input.expectedVersion) {
        throw new VersionConflictError('credential', input.credentialId);
      }

      try {
        const updated = rejectCredential(credential);
        await this.repo.updateCredential(tx, updated);
        resultStatus = updated.status;
        await this.emitAudit(tx, input, updated.status);
        await this.emitOutbox(tx, input, credential.credentialType, updated.status);

        await completeIdempotency(
          tx,
          input.tenantId,
          'credential.reject',
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
        if (error instanceof Error && error.message.includes('Cannot reject')) {
          throw new InvalidCredentialTransitionError(credential.status, 'REJECTED');
        }
        throw error;
      }
    });

    return { credentialId: input.credentialId, status: resultStatus };
  }

  private async emitAudit(
    tx: TransactionClient,
    input: RejectCredentialInput,
    newStatus: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId}, ${'credential.rejected'},
        ${'credential'}, ${input.credentialId}::uuid,
        ${JSON.stringify({ status: newStatus, reason: input.reason })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutbox(
    tx: TransactionClient,
    input: RejectCredentialInput,
    credentialType: string,
    newStatus: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.credential.rejected.v1'},
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
