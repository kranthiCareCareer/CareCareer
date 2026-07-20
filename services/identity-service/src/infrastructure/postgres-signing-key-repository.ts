import type { TransactionClient } from '@carecareer/database';

import type { SigningKey } from '../domain/signing-key.js';

/**
 * Signing key repository port.
 * GP-03.3 scope: read and create operations for JWT verification.
 * Key rotation and revocation are deferred to GP-15 (administrative key lifecycle).
 */
export interface SigningKeyRepository {
  getActiveKey(tx: TransactionClient): Promise<SigningKey | null>;
  getVerificationKeys(tx: TransactionClient): Promise<SigningKey[]>;
  createKey(tx: TransactionClient, key: SigningKey, privateKeyRef: string): Promise<void>;
}

/**
 * PostgreSQL signing key repository — GP-03.3 read/create operations.
 */
export class PostgresSigningKeyRepository implements SigningKeyRepository {
  async getActiveKey(tx: TransactionClient): Promise<SigningKey | null> {
    const rows = await tx.$queryRaw<SigningKeyRow>`
      SELECT * FROM identity.signing_keys WHERE status = 'ACTIVE' LIMIT 1
    `;
    return rows.length > 0 ? mapSigningKeyRow(rows[0]!) : null;
  }

  async getVerificationKeys(tx: TransactionClient): Promise<SigningKey[]> {
    const rows = await tx.$queryRaw<SigningKeyRow>`
      SELECT * FROM identity.signing_keys WHERE status IN ('ACTIVE', 'ROTATED')
      ORDER BY activated_at DESC
    `;
    return rows.map(mapSigningKeyRow);
  }

  async createKey(tx: TransactionClient, key: SigningKey, privateKeyRef: string): Promise<void> {
    const activatedAt = key.activatedAt ? key.activatedAt.toISOString() : null;
    await tx.$executeRaw`
      INSERT INTO identity.signing_keys (id, algorithm, public_key, private_key_ref, status, activated_at, created_at)
      VALUES (${key.id}, ${key.algorithm}, ${key.publicKey}, ${privateKeyRef}, ${key.status}, ${activatedAt}, ${key.createdAt.toISOString()})
    `;
  }
}

interface SigningKeyRow {
  id: string;
  algorithm: string;
  public_key: string;
  private_key_ref: string;
  status: string;
  activated_at: string | Date | null;
  rotated_at: string | Date | null;
  created_at: string | Date;
}

function mapSigningKeyRow(row: SigningKeyRow): SigningKey {
  return {
    id: row.id,
    algorithm: row.algorithm as 'RS256' | 'ES256',
    publicKey: row.public_key,
    privateKeyRef: row.private_key_ref,
    status: row.status as 'ACTIVE' | 'ROTATED' | 'REVOKED',
    activatedAt: row.activated_at ? new Date(row.activated_at) : null,
    rotatedAt: row.rotated_at ? new Date(row.rotated_at) : null,
    createdAt: new Date(row.created_at),
  };
}
