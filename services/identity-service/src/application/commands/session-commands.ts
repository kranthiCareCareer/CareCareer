import { v7 as uuidv7 } from 'uuid';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import { createRefreshTokenRecord } from '../../domain/refresh-token.js';
import {
  createSession,
  generateRefreshToken,
  hashToken,
  isSessionRefreshable,
  type AuthSession,
} from '../../domain/session.js';
import type { RefreshTokenRepository } from '../../infrastructure/postgres-refresh-token-repository.js';
import type { SessionRepository } from '../../infrastructure/postgres-session-repository.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { MembershipRepository } from '../ports/membership-repository.js';

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
 * Atomically writes session + refresh-token lineage + audit + outbox.
 */
export async function createSessionCommand(
  prisma: PrismaLikeClient,
  sessionRepo: SessionRepository,
  input: CreateSessionInput,
  refreshTokenRepo?: RefreshTokenRepository,
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

    // Write initial refresh token to lineage table
    if (refreshTokenRepo) {
      const tokenRecord = createRefreshTokenRecord({
        id: uuidv7(),
        sessionId: session.id,
        tokenFamilyId: tokenFamily,
        tokenHash: session.refreshTokenHash,
        parentTokenId: null,
        expiresAt: session.expiresAt,
      });
      await refreshTokenRepo.createRefreshToken(tx, tokenRecord);
    }

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
 * Refresh a session by rotating the token with durable lineage tracking.
 *
 * Uses the auth_refresh_tokens table for historical replay detection:
 * 1. Hash the presented token
 * 2. Lock the refresh-token record (FOR UPDATE)
 * 3. If status is ROTATED → replay detected → compromise entire family
 * 4. If status is ACTIVE → normal rotation
 * 5. If not found → unknown token → reject as invalid
 *
 * Within one transaction:
 * - Mark predecessor token ROTATED
 * - Create successor token record
 * - Update session hash
 * - Validate user + membership state
 * - Write audit + outbox
 *
 * For replay: the compromise is committed within the transaction, then
 * AUTH_REFRESH_REPLAY is thrown after commit so the state is durable.
 */
export async function refreshSessionCommand(
  prisma: PrismaLikeClient,
  sessionRepo: SessionRepository,
  identityRepo: IdentityRepository,
  input: RefreshSessionInput,
  refreshTokenRepo?: RefreshTokenRepository,
  membershipRepo?: MembershipRepository,
): Promise<RefreshSessionResult> {
  const tokenHash = hashToken(input.refreshToken);

  if (refreshTokenRepo) {
    // Durable lineage path — handles replay commit-then-throw
    return refreshWithDurableLineage(
      prisma,
      sessionRepo,
      identityRepo,
      refreshTokenRepo,
      tokenHash,
      input.correlationId,
      membershipRepo,
    );
  }

  // Legacy path
  return prisma.$transaction(async (tx: TransactionClient) => {
    return refreshLegacy(tx, sessionRepo, identityRepo, tokenHash, input);
  });
}

/**
 * Orchestrates the durable lineage refresh.
 * Uses a two-phase approach for replay detection:
 * - The transaction returns either a success result or a replay indicator
 * - If replay was detected, the compromise state was committed
 * - The AUTH_REFRESH_REPLAY error is thrown after the transaction commits
 */
async function refreshWithDurableLineage(
  prisma: PrismaLikeClient,
  sessionRepo: SessionRepository,
  identityRepo: IdentityRepository,
  refreshTokenRepo: RefreshTokenRepository,
  tokenHash: string,
  correlationId: string,
  membershipRepo?: MembershipRepository,
): Promise<RefreshSessionResult> {
  const result = await prisma.$transaction(async (tx: TransactionClient) => {
    return refreshWithLineage(
      tx,
      sessionRepo,
      identityRepo,
      refreshTokenRepo,
      tokenHash,
      correlationId,
      membershipRepo,
    );
  });

  // If the transaction returned a replay signal, throw after commit
  if (result.type === 'replay') {
    throw new RefreshError('AUTH_REFRESH_REPLAY', 'Refresh token replay detected');
  }

  return result.value;
}

/** Result from the lineage-based refresh transaction */
type LineageRefreshOutcome =
  | { type: 'success'; value: RefreshSessionResult }
  | { type: 'replay' };

/**
 * Refresh with durable lineage — the correct production path.
 * Returns a discriminated union so the caller can commit the transaction
 * regardless of whether it's a success or a replay compromise.
 * Replay compromise writes (tokens + session + audit + outbox) must be committed.
 */
async function refreshWithLineage(
  tx: TransactionClient,
  sessionRepo: SessionRepository,
  identityRepo: IdentityRepository,
  refreshTokenRepo: RefreshTokenRepository,
  tokenHash: string,
  correlationId: string,
  membershipRepo?: MembershipRepository,
): Promise<LineageRefreshOutcome> {
  // Step 1: Lock the refresh token record by hash
  const tokenRecord = await refreshTokenRepo.getRefreshTokenByHashForUpdate(tx, tokenHash);

  if (!tokenRecord) {
    // Unknown token — not in lineage at all
    throw new RefreshError('AUTH_REFRESH_INVALID', 'Invalid refresh token');
  }

  // Step 2: Check if this is a replay of a previously-rotated token
  if (tokenRecord.status === 'ROTATED') {
    // HISTORICAL REPLAY DETECTED
    // This token was already used and rotated — someone replayed it
    // Compromise the entire family (committed when transaction returns)
    await handleFamilyCompromise(
      tx,
      sessionRepo,
      refreshTokenRepo,
      tokenRecord.tokenFamilyId,
      tokenRecord.sessionId,
      correlationId,
    );
    // Return replay signal — transaction will COMMIT (compromise is durable)
    return { type: 'replay' };
  }

  // Step 3: Reject tokens that are not ACTIVE
  if (tokenRecord.status !== 'ACTIVE') {
    // Token is REVOKED, EXPIRED, or already COMPROMISED
    throw new RefreshError('AUTH_REFRESH_INVALID', 'Refresh token is no longer valid');
  }

  // Step 4: Check token expiration
  if (new Date() >= tokenRecord.expiresAt) {
    throw new RefreshError('AUTH_SESSION_EXPIRED', 'Refresh token expired');
  }

  // Step 5: Load and validate the session
  const session = await sessionRepo.getSessionById(tx, tokenRecord.sessionId);
  if (!session) {
    throw new RefreshError('AUTH_REFRESH_INVALID', 'Session not found');
  }

  if (!isSessionRefreshable(session)) {
    throw new RefreshError('AUTH_SESSION_EXPIRED', 'Session expired or revoked');
  }

  // Step 6: Validate user is still active
  const user = await identityRepo.findUserById(tx, session.userId);
  if (!user || user.status !== 'ACTIVE') {
    const code = user?.status === 'SUSPENDED' ? 'AUTH_USER_SUSPENDED' : 'AUTH_USER_DEACTIVATED';
    throw new RefreshError(code, `User is ${user?.status ?? 'unknown'}`);
  }

  // Step 6b: Validate membership (if session has a selected tenant)
  if (session.membershipId && membershipRepo) {
    const membership = await membershipRepo.findMembershipById(tx, session.membershipId);
    if (!membership) {
      throw new RefreshError('AUTH_MEMBERSHIP_INVALID', 'Membership not found');
    }
    if (membership.status !== 'ACTIVE') {
      const code =
        membership.status === 'SUSPENDED'
          ? 'AUTH_MEMBERSHIP_SUSPENDED'
          : 'AUTH_MEMBERSHIP_DEACTIVATED';
      throw new RefreshError(code, `Membership is ${membership.status}`);
    }
    // Stale membership authorization version check
    if (
      session.membershipAuthorizationVersion !== null &&
      membership.authorizationVersion !== session.membershipAuthorizationVersion
    ) {
      throw new RefreshError(
        'AUTH_MEMBERSHIP_VERSION_STALE',
        'Membership authorization has changed',
      );
    }
  }

  // Step 7: Rotate — mark current token as ROTATED, create successor
  await refreshTokenRepo.rotateRefreshToken(tx, tokenRecord.id);

  const { rawToken: newRawToken, hash: newHash } = generateRefreshToken();
  const successorId = uuidv7();

  const successorRecord = createRefreshTokenRecord({
    id: successorId,
    sessionId: session.id,
    tokenFamilyId: tokenRecord.tokenFamilyId,
    tokenHash: newHash,
    parentTokenId: tokenRecord.id,
    expiresAt: session.expiresAt,
  });
  await refreshTokenRepo.createRefreshToken(tx, successorRecord);

  // Step 8: Update session with new hash
  await sessionRepo.rotateRefreshToken(tx, session.id, newHash);

  // Step 9: Construct the updated session view
  const updatedSession: AuthSession = {
    ...session,
    refreshTokenHash: newHash,
    lastUsedAt: new Date(),
  };

  // Step 10: Audit refresh
  await writeSessionAudit(tx, {
    actorId: session.userId,
    targetUserId: session.userId,
    action: 'identity.session.refreshed',
    afterSummary: { sessionId: session.id },
    correlationId,
  });

  return { type: 'success', value: { session: updatedSession, newRefreshToken: newRawToken } };
}

/**
 * Handle family compromise: mark all tokens COMPROMISED, mark session COMPROMISED.
 */
async function handleFamilyCompromise(
  tx: TransactionClient,
  sessionRepo: SessionRepository,
  refreshTokenRepo: RefreshTokenRepository,
  tokenFamilyId: string,
  sessionId: string,
  correlationId: string,
): Promise<void> {
  // Compromise all tokens in the family
  await refreshTokenRepo.compromiseTokenFamily(tx, tokenFamilyId);

  // Mark the session as COMPROMISED
  await sessionRepo.revokeFamilySessions(tx, tokenFamilyId, 'replay_detected');

  // Load the session for audit context
  const session = await sessionRepo.getSessionById(tx, sessionId);
  const userId = session?.userId ?? 'unknown';

  // Security audit — no token hashes in the record
  await writeSessionAudit(tx, {
    actorId: userId,
    targetUserId: userId,
    action: 'identity.session.family-compromised',
    afterSummary: {
      sessionId,
      tokenFamily: tokenFamilyId,
      reason: 'replay_detected',
    },
    correlationId,
  });

  // Outbox event — no token hashes in the payload
  await writeSessionOutbox(tx, {
    eventType: 'identity.session.family-compromised',
    aggregateId: sessionId,
    payload: {
      sessionId,
      userId,
      tokenFamily: tokenFamilyId,
    },
    correlationId,
  });
}

/**
 * Legacy refresh path — uses only session-level hash comparison.
 * Retained for backward compatibility during migration.
 */
async function refreshLegacy(
  tx: TransactionClient,
  sessionRepo: SessionRepository,
  identityRepo: IdentityRepository,
  tokenHash: string,
  input: RefreshSessionInput,
): Promise<RefreshSessionResult> {
  // Find any active session with a matching token hash
  const sessions = await tx.$queryRaw<{ id: string; token_family: string }>`
    SELECT id, token_family FROM identity.auth_sessions
    WHERE refresh_token_hash = ${tokenHash} AND status = 'ACTIVE'
    FOR UPDATE
  `;

  if (sessions.length === 0) {
    throw new RefreshError('AUTH_REFRESH_INVALID', 'Invalid refresh token');
  }

  const sessionRow = sessions[0]!;
  const session = await sessionRepo.getSessionById(tx, sessionRow.id);
  if (!session) {
    throw new RefreshError('AUTH_REFRESH_INVALID', 'Session not found');
  }

  if (!isSessionRefreshable(session)) {
    throw new RefreshError('AUTH_SESSION_EXPIRED', 'Session expired or revoked');
  }

  // Validate user is still active
  const user = await identityRepo.findUserById(tx, session.userId);
  if (!user || user.status !== 'ACTIVE') {
    const code = user?.status === 'SUSPENDED' ? 'AUTH_USER_SUSPENDED' : 'AUTH_USER_DEACTIVATED';
    throw new RefreshError(code, `User is ${user?.status ?? 'unknown'}`);
  }

  // Rotate the refresh token
  const { rawToken: newRawToken, hash: newHash } = generateRefreshToken();
  await sessionRepo.rotateRefreshToken(tx, session.id, newHash);

  const updatedSession: AuthSession = {
    ...session,
    refreshTokenHash: newHash,
    lastUsedAt: new Date(),
  };

  // Audit refresh
  await writeSessionAudit(tx, {
    actorId: session.userId,
    targetUserId: session.userId,
    action: 'identity.session.refreshed',
    afterSummary: { sessionId: session.id },
    correlationId: input.correlationId,
  });

  return { session: updatedSession, newRefreshToken: newRawToken };
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
  refreshTokenRepo?: RefreshTokenRepository,
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

    // Revoke active tokens in the session's family
    if (refreshTokenRepo) {
      await refreshTokenRepo.revokeTokenFamily(tx, session.tokenFamily, 'user_logout');
    }

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
  refreshTokenRepo?: RefreshTokenRepository,
): Promise<number> {
  return prisma.$transaction(async (tx: TransactionClient) => {
    // If lineage tracking is active, revoke tokens for all active sessions
    if (refreshTokenRepo) {
      const sessions = await sessionRepo.listUserSessions(tx, input.userId);
      for (const session of sessions) {
        await refreshTokenRepo.revokeTokenFamily(tx, session.tokenFamily, 'user_logout_all');
      }
    }

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
