/**
 * Refresh token lineage domain entity.
 * Tracks the full history of refresh tokens within a token family.
 *
 * Lifecycle:
 *   ACTIVE → ROTATED (normal rotation — predecessor becomes ROTATED)
 *   ACTIVE → REVOKED (explicit logout or session revocation)
 *   ACTIVE → EXPIRED (TTL exceeded)
 *   ACTIVE → COMPROMISED (family compromise from replay detection)
 *   ROTATED → COMPROMISED (family compromise propagation)
 *
 * Security rules:
 * - Raw token values are NEVER stored — only SHA-256 hashes
 * - Each token hash is globally unique
 * - Replay of a ROTATED token triggers family-wide compromise
 * - All ACTIVE/ROTATED successors in the family are revoked on compromise
 * - Audit and outbox events never contain token hashes
 */

export type RefreshTokenStatus = 'ACTIVE' | 'ROTATED' | 'REVOKED' | 'EXPIRED' | 'COMPROMISED';

export interface RefreshToken {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenFamilyId: string;
  readonly tokenHash: string;
  readonly parentTokenId: string | null;
  readonly status: RefreshTokenStatus;
  readonly issuedAt: Date;
  readonly usedAt: Date | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revocationReason: string | null;
  readonly createdAt: Date;
}

export interface CreateRefreshTokenParams {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenFamilyId: string;
  readonly tokenHash: string;
  readonly parentTokenId: string | null;
  readonly expiresAt: Date;
}

/**
 * Create a new refresh token record for lineage tracking.
 */
export function createRefreshTokenRecord(params: CreateRefreshTokenParams): RefreshToken {
  const now = new Date();
  return {
    id: params.id,
    sessionId: params.sessionId,
    tokenFamilyId: params.tokenFamilyId,
    tokenHash: params.tokenHash,
    parentTokenId: params.parentTokenId,
    status: 'ACTIVE',
    issuedAt: now,
    usedAt: null,
    expiresAt: params.expiresAt,
    revokedAt: null,
    revocationReason: null,
    createdAt: now,
  };
}

/**
 * Mark a refresh token as ROTATED (used successfully, successor issued).
 */
export function markTokenRotated(token: RefreshToken): RefreshToken {
  return {
    ...token,
    status: 'ROTATED',
    usedAt: new Date(),
  };
}

/**
 * Mark a refresh token as COMPROMISED (family replay detected).
 */
export function markTokenCompromised(token: RefreshToken, reason: string): RefreshToken {
  return {
    ...token,
    status: 'COMPROMISED',
    revokedAt: new Date(),
    revocationReason: reason,
  };
}

/**
 * Determine if a token status indicates it was previously used (replay indicator).
 */
export function isReplayCandidate(status: RefreshTokenStatus): boolean {
  return status === 'ROTATED';
}

/**
 * Determine if a token can still be used for refresh.
 */
export function isTokenUsable(token: RefreshToken): boolean {
  return token.status === 'ACTIVE' && new Date() < token.expiresAt;
}
