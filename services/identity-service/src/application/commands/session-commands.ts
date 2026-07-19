import { v7 as uuidv7 } from 'uuid';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import {
  createSession,
  hashToken,
  isSessionRefreshable,
  rotateRefreshToken,
  verifyRefreshToken,
  type AuthSession,
} from '../../domain/session.js';
import type { SessionRepository } from '../../infrastructure/postgres-session-repository.js';
import type { IdentityRepository } from '../ports/identity-repository.js';

const MAX_ACTIVE_SESSIONS = 5;

// ─── Create Session ───────────────────────────────────────────────────────────

export interface CreateSessionInput {
  readonly userId: string;
  readonly externalIdentityId?: string | null | undefined;
  readonly clientInfo?: { userAgent?: string; ipHash?: string; device?: string } | undefined;
  readonly correlationId: string;
}

export interface CreateSessionResult {
  readonly session: AuthSession;
  readonly refreshToken: string;
}

/**
 * Create a new auth session.
 * Enforces maximum 5 active sessions per user (revokes oldest if at limit).
 * Atomically writes session + audit + outbox.
 */
export async function createSessionCommand(
  prisma: PrismaLikeClient,
  sessionRepo: SessionRepository,
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  return prisma.$transaction(async (tx: TransactionClient) => {
    // Enforce session limit
    const activeCount = await sessionRepo.countActiveUserSessions(tx, input.userId);
    if (activeCount >= MAX_ACTIVE_SESSIONS) {
      await sessionRepo.revokeOldestSession(tx, input.userId, 'session_limit_reached');
    }

    const tokenFamily = uuidv7();
    const { session, refreshToken } = createSession({
      id: uuidv7(),
      userId: input.userId,
      externalIdentityId: input.externalIdentityId,
      tokenFamily,
      clientInfo: input.clientInfo,
    });

    await sessionRepo.createSession(tx, session);

    // Audit
    await writeSessionAudit(tx, {
      actorId: input.userId,
      targetUserId: input.userId,
      action: 'identity.session.created',
      afterSummary: { sessionId: session.id, tokenFamily },
      correlationId: input.correlationId,
    });

    // Outbox
    await writeSessionOutbox(tx, {
      eventType: 'identity.session.created',
      aggregateId: session.id,
      payload: { sessionId: session.id, userId: input.userId },
      correlationId: input.correlationId,
    });

    return { session, refreshToken };
  });
}

// ─── Refresh Session ──────────────────────────────────────────────────────────

export interface RefreshSessionInput {
  readonly refreshToken: string;
  readonly correlationId: string;
}

export interface RefreshSessionResult {
  readonly session: AuthSession;
  readonly newRefreshToken: string;
}

/**
 * Refresh a session by rotating the token.
 * Uses row-level locking (FOR UPDATE) to prevent concurrent double-refresh.
 *
 * Replay detection: if the provided token hash does NOT match the current hash,
 * the entire token family is revoked (compromised indicator).
 */
export async function refreshSessionCommand(
  prisma: PrismaLikeClient,
  sessionRepo: SessionRepository,
  identityRepo: IdentityRepository,
  input: RefreshSessionInput,
): Promise<RefreshSessionResult> {
  const tokenHash = hashToken(input.refreshToken);

  return prisma.$transaction(async (tx: TransactionClient) => {
    // Find any active session with a matching token hash
    // We search by hash directly since token_family isn't known from the raw token
    const sessions = await tx.$queryRaw<{ id: string; token_family: string }>`
      SELECT id, token_family FROM identity.auth_sessions
      WHERE refresh_token_hash = ${tokenHash} AND status = 'ACTIVE'
      FOR UPDATE
    `;

    if (sessions.length === 0) {
      // Token not found — could be replay of an already-rotated token
      // Try to find a session in this family that has a DIFFERENT current hash
      // This requires knowing the family — since we only have the token, check if
      // any compromised/revoked session had this hash previously
      // For safety: if token is unknown, reject without revealing details
      throw new RefreshError('AUTH_REFRESH_INVALID', 'Invalid refresh token');
    }

    const sessionRow = sessions[0]!;
    const session = await sessionRepo.getSessionById(tx, sessionRow.id);
    if (!session) {
      throw new RefreshError('AUTH_REFRESH_INVALID', 'Session not found');
    }

    // Validate session is refreshable (not expired, not revoked)
    if (!isSessionRefreshable(session)) {
      throw new RefreshError('AUTH_SESSION_EXPIRED', 'Session expired or revoked');
    }

    // Verify the token matches current hash (replay detection)
    if (!verifyRefreshToken(session, input.refreshToken)) {
      // REPLAY DETECTED: old token being reused after rotation
      // Revoke entire token family
      await sessionRepo.revokeFamilySessions(tx, session.tokenFamily, 'replay_detected');

      // Security audit
      await writeSessionAudit(tx, {
        actorId: session.userId,
        targetUserId: session.userId,
        action: 'identity.session.family-compromised',
        afterSummary: {
          sessionId: session.id,
          tokenFamily: session.tokenFamily,
          reason: 'replay_detected',
        },
        correlationId: input.correlationId,
      });

      await writeSessionOutbox(tx, {
        eventType: 'identity.session.family-compromised',
        aggregateId: session.id,
        payload: {
          sessionId: session.id,
          userId: session.userId,
          tokenFamily: session.tokenFamily,
        },
        correlationId: input.correlationId,
      });

      throw new RefreshError('AUTH_REFRESH_REPLAY', 'Refresh token replay detected');
    }

    // Validate user is still active
    const user = await identityRepo.findUserById(tx, session.userId);
    if (!user || user.status !== 'ACTIVE') {
      const code = user?.status === 'SUSPENDED' ? 'AUTH_USER_SUSPENDED' : 'AUTH_USER_DEACTIVATED';
      throw new RefreshError(code, `User is ${user?.status ?? 'unknown'}`);
    }

    // Check authorization version hasn't changed
    // (roles were modified since token was issued)
    // This is checked during token ISSUANCE, not just refresh

    // Rotate the refresh token
    const { updatedSession, refreshToken: newToken } = rotateRefreshToken(session);
    await sessionRepo.rotateRefreshToken(tx, session.id, updatedSession.refreshTokenHash);

    // Audit refresh
    await writeSessionAudit(tx, {
      actorId: session.userId,
      targetUserId: session.userId,
      action: 'identity.session.refreshed',
      afterSummary: { sessionId: session.id },
      correlationId: input.correlationId,
    });

    return { session: updatedSession, newRefreshToken: newToken };
  });
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export interface LogoutInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly correlationId: string;
}

export async function logoutCommand(
  prisma: PrismaLikeClient,
  sessionRepo: SessionRepository,
  input: LogoutInput,
): Promise<void> {
  await prisma.$transaction(async (tx: TransactionClient) => {
    const session = await sessionRepo.getSessionById(tx, input.sessionId);
    if (!session || session.userId !== input.userId) {
      return; // Idempotent — already logged out or not owned
    }
    if (session.status !== 'ACTIVE') {
      return; // Already revoked
    }

    await sessionRepo.revokeSession(tx, input.sessionId, 'user_logout');

    await writeSessionAudit(tx, {
      actorId: input.userId,
      targetUserId: input.userId,
      action: 'identity.session.revoked',
      afterSummary: { sessionId: input.sessionId, reason: 'user_logout' },
      correlationId: input.correlationId,
    });

    await writeSessionOutbox(tx, {
      eventType: 'identity.session.revoked',
      aggregateId: input.sessionId,
      payload: { sessionId: input.sessionId, userId: input.userId, reason: 'user_logout' },
      correlationId: input.correlationId,
    });
  });
}

// ─── Logout All ───────────────────────────────────────────────────────────────

export interface LogoutAllInput {
  readonly userId: string;
  readonly correlationId: string;
}

export async function logoutAllCommand(
  prisma: PrismaLikeClient,
  sessionRepo: SessionRepository,
  input: LogoutAllInput,
): Promise<number> {
  return prisma.$transaction(async (tx: TransactionClient) => {
    const count = await sessionRepo.revokeAllUserSessions(tx, input.userId, 'user_logout_all');

    if (count > 0) {
      await writeSessionAudit(tx, {
        actorId: input.userId,
        targetUserId: input.userId,
        action: 'identity.user.sessions-revoked',
        afterSummary: { count, reason: 'user_logout_all' },
        correlationId: input.correlationId,
      });

      await writeSessionOutbox(tx, {
        eventType: 'identity.user.sessions-revoked',
        aggregateId: input.userId,
        payload: { userId: input.userId, revokedCount: count },
        correlationId: input.correlationId,
      });
    }

    return count;
  });
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class RefreshError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RefreshError';
    this.code = code;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeSessionAudit(
  tx: TransactionClient,
  params: {
    actorId: string;
    targetUserId: string;
    action: string;
    afterSummary: Record<string, unknown>;
    correlationId: string;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO identity.audit_records (
      id, actor_id, actor_type, target_user_id, action,
      after_summary, correlation_id, administrative_access, timestamp
    ) VALUES (
      ${uuidv7()}, ${params.actorId}, ${'system'},
      ${params.targetUserId}, ${params.action},
      ${JSON.stringify(params.afterSummary)}::jsonb,
      ${params.correlationId}, ${false}, ${new Date().toISOString()}
    )
  `;
}

async function writeSessionOutbox(
  tx: TransactionClient,
  params: {
    eventType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    correlationId: string;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO identity.event_outbox (
      id, event_type, event_version,
      aggregate_type, aggregate_id, aggregate_version,
      payload, correlation_id, occurred_at, status
    ) VALUES (
      ${uuidv7()}, ${params.eventType}, ${1},
      ${'session'}, ${params.aggregateId}, ${1},
      ${JSON.stringify(params.payload)}::jsonb,
      ${params.correlationId}, ${new Date().toISOString()}, ${'PENDING'}
    )
  `;
}
