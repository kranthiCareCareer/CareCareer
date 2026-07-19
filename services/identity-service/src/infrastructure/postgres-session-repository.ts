import type { TransactionClient } from '@carecareer/database';

import type { AuthSession, SessionClientInfo } from '../domain/session.js';
import type { SigningKey } from '../domain/signing-key.js';

/**
 * Session repository port — PostgreSQL-backed.
 * All refresh operations use row-level locking for concurrency safety.
 */
export interface SessionRepository {
  createSession(tx: TransactionClient, session: AuthSession): Promise<void>;
  getSessionById(tx: TransactionClient, id: string): Promise<AuthSession | null>;
  getSessionForRefreshLocked(
    tx: TransactionClient,
    tokenFamily: string,
  ): Promise<AuthSession | null>;
  rotateRefreshToken(tx: TransactionClient, sessionId: string, newHash: string): Promise<void>;
  revokeSession(tx: TransactionClient, sessionId: string, reason: string): Promise<void>;
  revokeAllUserSessions(tx: TransactionClient, userId: string, reason: string): Promise<number>;
  revokeFamilySessions(tx: TransactionClient, tokenFamily: string, reason: string): Promise<void>;
  listUserSessions(tx: TransactionClient, userId: string): Promise<AuthSession[]>;
  countActiveUserSessions(tx: TransactionClient, userId: string): Promise<number>;
  revokeOldestSession(tx: TransactionClient, userId: string, reason: string): Promise<void>;
}

export interface SigningKeyRepository {
  getActiveKey(tx: TransactionClient): Promise<SigningKey | null>;
  getVerificationKeys(tx: TransactionClient): Promise<SigningKey[]>;
  createKey(tx: TransactionClient, key: SigningKey, privateKeyRef: string): Promise<void>;
  rotateKey(tx: TransactionClient, keyId: string): Promise<void>;
  revokeKey(tx: TransactionClient, keyId: string): Promise<void>;
}

/**
 * PostgreSQL session repository implementation.
 * Uses SELECT ... FOR UPDATE for concurrency-safe refresh rotation.
 */
export class PostgresSessionRepository implements SessionRepository {
  async createSession(tx: TransactionClient, session: AuthSession): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.auth_sessions (
        id, user_id, external_identity_id, status,
        refresh_token_hash, token_family,
        selected_tenant_id, membership_id,
        user_authorization_version, membership_authorization_version,
        last_used_at, expires_at, client_info, created_at
      ) VALUES (
        ${session.id}, ${session.userId}, ${session.externalIdentityId},
        ${session.status}, ${session.refreshTokenHash}, ${session.tokenFamily},
        ${null}, ${null},
        ${1}, ${null},
        ${session.lastUsedAt.toISOString()}, ${session.expiresAt.toISOString()},
        ${session.clientInfo ? JSON.stringify(session.clientInfo) : null}::jsonb,
        ${session.createdAt.toISOString()}
      )
    `;
  }

  async getSessionById(tx: TransactionClient, id: string): Promise<AuthSession | null> {
    const rows = await tx.$queryRaw<SessionRow>`
      SELECT * FROM identity.auth_sessions WHERE id = ${id}
    `;
    return rows.length > 0 ? mapSessionRow(rows[0]!) : null;
  }

  /**
   * Lock the session row for safe refresh rotation.
   * Uses FOR UPDATE to prevent concurrent refresh from creating duplicate successors.
   */
  async getSessionForRefreshLocked(
    tx: TransactionClient,
    tokenFamily: string,
  ): Promise<AuthSession | null> {
    const rows = await tx.$queryRaw<SessionRow>`
      SELECT * FROM identity.auth_sessions
      WHERE token_family = ${tokenFamily} AND status = 'ACTIVE'
      FOR UPDATE
    `;
    return rows.length > 0 ? mapSessionRow(rows[0]!) : null;
  }

  async rotateRefreshToken(
    tx: TransactionClient,
    sessionId: string,
    newHash: string,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.auth_sessions
      SET refresh_token_hash = ${newHash},
          last_used_at = NOW()
      WHERE id = ${sessionId}
    `;
  }

  async revokeSession(tx: TransactionClient, sessionId: string, reason: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.auth_sessions
      SET status = 'REVOKED', revoked_at = NOW(), revocation_reason = ${reason}
      WHERE id = ${sessionId} AND status = 'ACTIVE'
    `;
  }

  async revokeAllUserSessions(
    tx: TransactionClient,
    userId: string,
    reason: string,
  ): Promise<number> {
    return tx.$executeRaw`
      UPDATE identity.auth_sessions
      SET status = 'REVOKED', revoked_at = NOW(), revocation_reason = ${reason}
      WHERE user_id = ${userId} AND status = 'ACTIVE'
    `;
  }

  async revokeFamilySessions(
    tx: TransactionClient,
    tokenFamily: string,
    reason: string,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.auth_sessions
      SET status = 'COMPROMISED', revoked_at = NOW(), revocation_reason = ${reason}
      WHERE token_family = ${tokenFamily} AND status = 'ACTIVE'
    `;
  }

  async listUserSessions(tx: TransactionClient, userId: string): Promise<AuthSession[]> {
    const rows = await tx.$queryRaw<SessionRow>`
      SELECT * FROM identity.auth_sessions
      WHERE user_id = ${userId} AND status = 'ACTIVE'
      ORDER BY last_used_at DESC
    `;
    return rows.map(mapSessionRow);
  }

  async countActiveUserSessions(tx: TransactionClient, userId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ count: number }>`
      SELECT count(*)::int as count FROM identity.auth_sessions
      WHERE user_id = ${userId} AND status = 'ACTIVE'
    `;
    return rows[0]?.count ?? 0;
  }

  async revokeOldestSession(tx: TransactionClient, userId: string, reason: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.auth_sessions
      SET status = 'REVOKED', revoked_at = NOW(), revocation_reason = ${reason}
      WHERE id = (
        SELECT id FROM identity.auth_sessions
        WHERE user_id = ${userId} AND status = 'ACTIVE'
        ORDER BY last_used_at ASC
        LIMIT 1
      )
    `;
  }
}

/**
 * PostgreSQL signing key repository.
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
    await tx.$executeRaw`
      INSERT INTO identity.signing_keys (id, algorithm, public_key, private_key_ref, status, activated_at, created_at)
      VALUES (${key.id}, ${key.algorithm}, ${key.publicKey}, ${privateKeyRef}, ${key.status}, ${key.activatedAt?.toISOString() ?? null}, ${key.createdAt.toISOString()})
    `;
  }

  async rotateKey(tx: TransactionClient, keyId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.signing_keys SET status = 'ROTATED', rotated_at = NOW() WHERE id = ${keyId}
    `;
  }

  async revokeKey(tx: TransactionClient, keyId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.signing_keys SET status = 'REVOKED' WHERE id = ${keyId}
    `;
  }
}

// ─── Row Types and Mappers ────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  user_id: string;
  external_identity_id: string | null;
  status: string;
  refresh_token_hash: string;
  token_family: string;
  last_used_at: string | Date;
  expires_at: string | Date;
  client_info: SessionClientInfo | string | null;
  created_at: string | Date;
  revoked_at: string | Date | null;
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

function mapSessionRow(row: SessionRow): AuthSession {
  let clientInfo: SessionClientInfo | null = null;
  if (row.client_info) {
    clientInfo =
      typeof row.client_info === 'string'
        ? (JSON.parse(row.client_info) as SessionClientInfo)
        : row.client_info;
  }

  return {
    id: row.id,
    userId: row.user_id,
    externalIdentityId: row.external_identity_id,
    status: row.status as 'ACTIVE' | 'REVOKED',
    refreshTokenHash: row.refresh_token_hash,
    tokenFamily: row.token_family,
    lastUsedAt: new Date(row.last_used_at),
    expiresAt: new Date(row.expires_at),
    clientInfo,
    createdAt: new Date(row.created_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
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
