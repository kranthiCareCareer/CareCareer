import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { createCredential, type Credential } from '../../domain/credential.js';
import {
  claimIdempotencyKey,
  completeIdempotency,
  hashRequest,
} from '../../infrastructure/credential-idempotency.js';
import type { CredentialRepository } from '../ports/credential-repository.js';

export interface CreateCredentialInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly workerId: string;
  readonly credentialType: string;
  readonly issuingAuthority?: string | undefined;
  readonly credentialNumber?: string | undefined;
  readonly issuedAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly idempotencyKey?: string | undefined;
}

export interface CreateCredentialResult {
  readonly credentialId: string;
  readonly replayed?: boolean;
}

/**
 * CreateCredential command handler.
 *
 * Atomically within one TenantAwareTransaction:
 * 1. Claim idempotency key (if provided)
 * 2. Create credential aggregate in UPLOADED status
 * 3. Persist audit record (NO PII)
 * 4. Persist outbox event (NO PII)
 * 5. Complete idempotency record with response
 *
 * On replay: returns original result without re-executing.
 */
export class CreateCredentialHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: CredentialRepository,
  ) {}

  async execute(input: CreateCredentialInput): Promise<CreateCredentialResult> {
    const credential = createCredential({
      tenantId: input.tenantId,
      workerId: input.workerId,
      credentialType: input.credentialType,
      issuingAuthority: input.issuingAuthority,
      credentialNumber: input.credentialNumber,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });

    const result = await this.tenantDb.execute(input.tenantId, async (tx) => {
      // Idempotency check (if key provided)
      if (input.idempotencyKey) {
        const reqHash = hashRequest({
          workerId: input.workerId,
          credentialType: input.credentialType,
          issuingAuthority: input.issuingAuthority,
          credentialNumber: input.credentialNumber,
          issuedAt: input.issuedAt?.toISOString(),
          expiresAt: input.expiresAt?.toISOString(),
        });

        const claim = await claimIdempotencyKey(
          tx,
          input.tenantId,
          'credential.create',
          input.idempotencyKey,
          reqHash,
        );

        if (!claim.claimed && claim.replay) {
          return {
            credentialId: (claim.replay.response as { credentialId: string }).credentialId,
            replayed: true,
          };
        }

        // Execute mutation
        await this.repo.createCredential(tx, credential);
        await this.emitAudit(tx, credential, input);
        await this.emitOutboxEvent(tx, credential, input);

        // Complete idempotency (only this claim token can complete)
        await completeIdempotency(
          tx,
          input.tenantId,
          'credential.create',
          input.idempotencyKey,
          claim.claimToken!,
          201,
          { credentialId: credential.id },
        );

        return { credentialId: credential.id };
      }

      // No idempotency key — execute directly
      await this.repo.createCredential(tx, credential);
      await this.emitAudit(tx, credential, input);
      await this.emitOutboxEvent(tx, credential, input);
      return { credentialId: credential.id };
    });

    return result;
  }

  private async emitAudit(
    tx: TransactionClient,
    credential: Credential,
    input: CreateCredentialInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId}, ${'credential.created'},
        ${'credential'}, ${credential.id}::uuid,
        ${JSON.stringify({
          credentialType: credential.credentialType,
          status: credential.status,
          workerId: credential.workerId,
          hasExpiry: !!credential.expiresAt,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutboxEvent(
    tx: TransactionClient,
    credential: Credential,
    input: CreateCredentialInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.credential.created.v1'},
        ${'credential'}, ${credential.id}::uuid,
        ${JSON.stringify({
          credentialId: credential.id,
          workerId: credential.workerId,
          tenantId: credential.tenantId,
          credentialType: credential.credentialType,
          status: credential.status,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
