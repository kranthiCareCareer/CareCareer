import type { TransactionClient } from '@carecareer/database';

import type { RefreshToken, RefreshTokenStatus } from '../domain/refresh-token.js';

/**
 * Refresh token lineage repository port.
 * All operations use transactional context for atomicity.
 * Row-level locking ensures safe concurrent rotation.
 */
export interface RefreshTokenRepository {
  /** Insert a new refresh token record */
  createRefreshToken(tx: TransactionClient, token: RefreshToken): Promise<void>;

  /** Find a token by its hash with FOR UPDATE lock */
  getRefreshTokenByHashForUpdate(
    tx: TransactionClient,
    tokenHash: string,
  ): Promise<RefreshToken | null>;

  /** Mark a token as ROTATED (used successfully) */
  rotateRefreshToken(tx: TransactionClient, tokenId: string): Promise<void>;

  /** Mark all ACTIVE/ROTATED tokens in a family as COMPROMISED */
  compromiseTokenFamily(tx: TransactionClient, tokenFamilyId: string): Promise<number>;

  /** Mark all ACTIVE tokens in a family as REVOKED (logout) */
  revokeTokenFamily(tx: TransactionClient, tokenFamilyId: string, reason: string): Promise<number>;
}

/**
 * PostgreSQL-backed refresh token lineage repository.
 */
export class PostgresRefreshTokenRepository implements RefreshTokenRepository {
  async createRefreshToken(tx: TransactionClient, token: RefreshToken): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.auth_refresh_tokens (
        id, session_id, token_family_id, token_hash,
        parent_token_id, status, issued_at, used_at,
        expires_at, revoked_at, revocation_reason, created_at
      ) VALUES (
        ${token.id}, ${token.sessionId}, ${token.tokenFamilyId},
        ${token.tokenHash}, ${token.parentTokenId}, ${token.status},
        ${token.issuedAt.toISOString()}, ${token.usedAt?.toISOString() ?? null},
        ${token.expiresAt.toISOString()}, ${token.revokedAt?.toISOString() ?? null},
        ${token.revocationReason}, ${token.createdAt.toISOString()}
      )
    `;
  }

  /**
   * Retrieve a refresh token by hash with row lock.
   * FOR UPDATE prevents concurrent rotation of the same token.
   */
  async getRefreshTokenByHashForUpdate(
    tx: TransactionClient,
    tokenHash: string,
  ): Promise<RefreshToken | null> {
    const rows = await tx.$queryRaw<RefreshTokenRow>`
      SELECT * FROM identity.auth_refresh_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE
    `;
    return rows.length > 0 ? mapRefreshTokenRow(rows[0]!) : null;
  }

  async rotateRefreshToken(tx: TransactionClient, tokenId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.auth_refresh_tokens
      SET status = 'ROTATED', used_at = NOW()
      WHERE id = ${tokenId} AND status = 'ACTIVE'
    `;
  }

  /**
   * Compromise all active/rotated tokens in a family.
   * Returns the count of affected rows.
   */
  async compromiseTokenFamily(tx: TransactionClient, tokenFamilyId: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE identity.auth_refresh_tokens
      SET status = 'COMPROMISED', revoked_at = NOW(), revocation_reason = 'family_replay_detected'
      WHERE token_family_id = ${tokenFamilyId}
        AND status IN ('ACTIVE', 'ROTATED')
    `;
  }

  async revokeTokenFamily(
    tx: TransactionClient,
    tokenFamilyId: string,
    reason: string,
  ): Promise<number> {
    return tx.$executeRaw`
      UPDATE identity.auth_refresh_tokens
      SET status = 'REVOKED', revoked_at = NOW(), revocation_reason = ${reason}
      WHERE token_family_id = ${tokenFamilyId}
        AND status = 'ACTIVE'
    `;
  }
}

// ─── Row Types and Mappers ────────────────────────────────────────────────────

interface RefreshTokenRow {
  id: string;
  session_id: string;
  token_family_id: string;
  token_hash: string;
  parent_token_id: string | null;
  status: string;
  issued_at: string | Date;
  used_at: string | Date | null;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  revocation_reason: string | null;
  created_at: string | Date;
}

function mapRefreshTokenRow(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    sessionId: row.session_id,
    tokenFamilyId: row.token_family_id,
    tokenHash: row.token_hash,
    parentTokenId: row.parent_token_id,
    status: row.status as RefreshTokenStatus,
    issuedAt: new Date(row.issued_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    revocationReason: row.revocation_reason,
    createdAt: new Date(row.created_at),
  };
}
