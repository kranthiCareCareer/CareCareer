import { createHash, randomBytes } from 'node:crypto';

/**
 * Auth session domain entity.
 * Manages refresh-token rotation and replay detection.
 *
 * Session lifecycle:
 *   ACTIVE → REVOKED (explicit logout or replay detection)
 *
 * Refresh-token rotation:
 *   Each refresh issues a new token and invalidates the old hash.
 *   If an old token is presented (replay), the entire token family is revoked.
 *
 * Rules:
 * - No raw refresh tokens stored (only SHA-256 hash)
 * - Maximum 5 active sessions per user
 * - Session expires at 7 days absolute
 * - Refresh rejected if session is revoked or expired
 * - Refresh rejected if user/membership authorization versions are stale
 */

export interface AuthSession {
  readonly id: string;
  readonly userId: string;
  readonly externalIdentityId: string | null;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly refreshTokenHash: string;
  readonly tokenFamily: string;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
  readonly clientInfo: SessionClientInfo | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export interface SessionClientInfo {
  readonly userAgent?: string | undefined;
  readonly ipHash?: string | undefined;
  readonly device?: string | undefined;
}

export interface CreateSessionParams {
  readonly id: string;
  readonly userId: string;
  readonly externalIdentityId?: string | null | undefined;
  readonly tokenFamily: string;
  readonly clientInfo?: SessionClientInfo | null | undefined;
}

/** Session absolute lifetime: 7 days */
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically random refresh token (32 bytes / 256 bits).
 * Returns both the raw token (sent to client) and its SHA-256 hash (stored).
 */
export function generateRefreshToken(): { rawToken: string; hash: string } {
  const rawToken = randomBytes(32).toString('base64url');
  const hash = hashToken(rawToken);
  return { rawToken, hash };
}

/**
 * Hash a refresh token for storage comparison.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new auth session with a fresh refresh token.
 */
export function createSession(params: CreateSessionParams): {
  session: AuthSession;
  refreshToken: string;
} {
  const { rawToken, hash } = generateRefreshToken();
  const now = new Date();

  const session: AuthSession = {
    id: params.id,
    userId: params.userId,
    externalIdentityId: params.externalIdentityId ?? null,
    status: 'ACTIVE',
    refreshTokenHash: hash,
    tokenFamily: params.tokenFamily,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
    clientInfo: params.clientInfo ?? null,
    createdAt: now,
    revokedAt: null,
  };

  return { session, refreshToken: rawToken };
}

/**
 * Rotate the refresh token for an active session.
 * Returns the updated session and the new raw token.
 */
export function rotateRefreshToken(session: AuthSession): {
  updatedSession: AuthSession;
  refreshToken: string;
} {
  const { rawToken, hash } = generateRefreshToken();

  const updatedSession: AuthSession = {
    ...session,
    refreshTokenHash: hash,
    lastUsedAt: new Date(),
  };

  return { updatedSession, refreshToken: rawToken };
}

/**
 * Revoke a session (logout or replay detection).
 */
export function revokeSession(session: AuthSession): AuthSession {
  return {
    ...session,
    status: 'REVOKED',
    revokedAt: new Date(),
  };
}

/**
 * Check if a session is valid for refresh.
 */
export function isSessionRefreshable(session: AuthSession): boolean {
  if (session.status !== 'ACTIVE') return false;
  if (new Date() > session.expiresAt) return false;
  return true;
}

/**
 * Verify a refresh token matches the session's stored hash.
 */
export function verifyRefreshToken(session: AuthSession, token: string): boolean {
  return session.refreshTokenHash === hashToken(token);
}
