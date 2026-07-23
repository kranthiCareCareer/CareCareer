import type { TransactionClient } from '@carecareer/database';

import type { CredentialRepository } from '../application/ports/credential-repository.js';
import type { Credential } from '../domain/credential.js';

/**
 * PostgreSQL implementation of the CredentialRepository port.
 * All queries run within a tenant-scoped transaction (RLS enforced).
 */
export class PostgresCredentialRepository implements CredentialRepository {
  async createCredential(tx: TransactionClient, credential: Credential): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.worker_credentials (
        id, tenant_id, worker_id, credential_type, status,
        issuing_authority, credential_number, issued_at, expires_at,
        verified_at, verified_by, version, created_at, updated_at
      ) VALUES (
        ${credential.id}::uuid, ${credential.tenantId}::uuid, ${credential.workerId}::uuid,
        ${credential.credentialType}, ${credential.status},
        ${credential.issuingAuthority ?? null}, ${credential.credentialNumber ?? null},
        ${credential.issuedAt?.toISOString() ?? null}::timestamptz,
        ${credential.expiresAt?.toISOString() ?? null}::timestamptz,
        ${credential.verifiedAt?.toISOString() ?? null}::timestamptz,
        ${credential.verifiedBy ?? null},
        ${credential.version}, ${credential.createdAt.toISOString()}::timestamptz,
        ${credential.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getCredentialById(tx: TransactionClient, credentialId: string): Promise<Credential | null> {
    const rows = await tx.$queryRaw<CredentialRow>`
      SELECT id, tenant_id, worker_id, credential_type, status,
             issuing_authority, credential_number, issued_at, expires_at,
             verified_at, verified_by, version, created_at, updated_at
      FROM staffing.worker_credentials
      WHERE id = ${credentialId}::uuid`;

    if (rows.length === 0) return null;
    return this.mapRow(rows[0]!);
  }

  async getCredentialsByWorkerId(tx: TransactionClient, workerId: string): Promise<Credential[]> {
    const rows = await tx.$queryRaw<CredentialRow>`
      SELECT id, tenant_id, worker_id, credential_type, status,
             issuing_authority, credential_number, issued_at, expires_at,
             verified_at, verified_by, version, created_at, updated_at
      FROM staffing.worker_credentials
      WHERE worker_id = ${workerId}::uuid
      ORDER BY created_at DESC`;

    return rows.map((r) => this.mapRow(r));
  }

  async updateCredential(tx: TransactionClient, credential: Credential): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.worker_credentials SET
        status = ${credential.status},
        issuing_authority = ${credential.issuingAuthority ?? null},
        credential_number = ${credential.credentialNumber ?? null},
        issued_at = ${credential.issuedAt?.toISOString() ?? null}::timestamptz,
        expires_at = ${credential.expiresAt?.toISOString() ?? null}::timestamptz,
        verified_at = ${credential.verifiedAt?.toISOString() ?? null}::timestamptz,
        verified_by = ${credential.verifiedBy ?? null},
        version = ${credential.version},
        updated_at = ${credential.updatedAt.toISOString()}::timestamptz
      WHERE id = ${credential.id}::uuid AND version = ${credential.version - 1}`;

    if (count === 0) {
      throw new Error(`Version conflict updating credential ${credential.id}`);
    }
  }

  private mapRow(row: CredentialRow): Credential {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      workerId: row.worker_id,
      credentialType: row.credential_type,
      status: row.status as Credential['status'],
      issuingAuthority: row.issuing_authority ?? undefined,
      credentialNumber: row.credential_number ?? undefined,
      issuedAt: row.issued_at ? new Date(row.issued_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
      verifiedBy: row.verified_by ?? undefined,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

interface CredentialRow {
  id: string;
  tenant_id: string;
  worker_id: string;
  credential_type: string;
  status: string;
  issuing_authority: string | null;
  credential_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
