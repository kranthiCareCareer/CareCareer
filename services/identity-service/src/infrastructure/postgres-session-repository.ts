import type { TransactionClient } from '@carecareer/database';

import type { AuthSession, SessionClientInfo } from '../domain/session.js';

// Re-export signing-key types and implementation for backward compatibility
export type { SigningKeyRepository } from './postgres-signing-key-repository.js';
export { PostgresSigningKeyRepository } from './postgres-signing-key-repository.js';

/**
 * Session repository port — PostgreSQL-backed.
 * All refresh operations use row-level locking for concurrency safety.
 */
export interface SessionRepository {
  createSession(tx: TransactionClient, session: AuthSession): Promise<void>;
  getSessionById(tx: TransactionClient, id: string): Promise<AuthSession | null>;
  rotateRefreshToken(tx: TransactionClient, sessionId: string, newHash: string): Promise<void>;
  revokeSession(tx: TransactionClient, sessionId: string, reason: string): Promise<void>;
  revokeAllUserSessions(tx: TransactionClient, userId: string, reason: string): Promise<number>;
  revokeFamilySessions(tx: TransactionClient, tokenFamily: string, reason: string): Promise<void>;
  listUserSessions(tx: TransactionClient, userId: string): Promise<AuthSession[]>;
  countActiveUserSessions(tx: TransactionClient, userId: string): Promise<number>;
  revokeOldestSession(tx: TransactionClient, userId: string, reason: string): Promise<void>;
}

/**
 * PostgreSQL session repository implementation.
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
    return rows[0]!.count;
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

// ─── Row Types and Mappers ────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  user_id: string;
  external_identity_id: string | null;
  status: string;
  refresh_token_hash: string;
  token_family: string;
  selected_tenant_id: string | null;
  membership_id: string | null;
  user_authorization_version: number;
  membership_authorization_version: number | null;
  last_used_at: string | Date;
  expires_at: string | Date;
  client_info: SessionClientInfo | null;
  created_at: string | Date;
  revoked_at: string | Date | null;
}

function mapSessionRow(row: SessionRow): AuthSession {
  const clientInfo: SessionClientInfo | null = row.client_info
    ? (row.client_info as SessionClientInfo)
    : null;

  return {
    id: row.id,
    userId: row.user_id,
    externalIdentityId: row.external_identity_id,
    status: row.status as 'ACTIVE' | 'REVOKED',
    refreshTokenHash: row.refresh_token_hash,
    tokenFamily: row.token_family,
    selectedTenantId: row.selected_tenant_id,
    membershipId: row.membership_id,
    userAuthorizationVersion: row.user_authorization_version,
    membershipAuthorizationVersion: row.membership_authorization_version,
    lastUsedAt: new Date(row.last_used_at),
    expiresAt: new Date(row.expires_at),
    clientInfo,
    createdAt: new Date(row.created_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}
