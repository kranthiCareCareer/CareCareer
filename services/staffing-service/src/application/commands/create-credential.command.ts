import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { createCredential, type Credential } from '../../domain/credential.js';
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
}

/**
 * CreateCredential command handler.
 *
 * Atomically within one TenantAwareTransaction:
 * 1. Create credential aggregate in UPLOADED status
 * 2. Persist audit record (NO PII)
 * 3. Persist outbox event (NO PII)
 */
export class CreateCredentialHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: CredentialRepository,
  ) {}

  async execute(input: CreateCredentialInput): Promise<{ credentialId: string }> {
    const credential = createCredential({
      tenantId: input.tenantId,
      workerId: input.workerId,
      credentialType: input.credentialType,
      issuingAuthority: input.issuingAuthority,
      credentialNumber: input.credentialNumber,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      await this.repo.createCredential(tx, credential);
      await this.emitAudit(tx, credential, input);
      await this.emitOutboxEvent(tx, credential, input);
    });

    return { credentialId: credential.id };
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
