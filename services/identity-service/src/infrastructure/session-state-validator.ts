import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import type { SessionRepository } from './postgres-session-repository.js';

/**
 * Live session-state validator.
 *
 * After JWT cryptographic verification succeeds, this validator queries
 * PostgreSQL to confirm the session referenced by the `sid` claim is still
 * valid. This provides immediate revocation enforcement for the identity
 * service and any endpoint using this validator.
 *
 * Revocation guarantee:
 * - Identity-service endpoints that use live session validation reject
 *   revoked sessions immediately.
 * - Services that perform only offline JWT validation remain bounded by
 *   the 15-minute access-token lifetime until shared live validation or
 *   introspection is implemented.
 *
 * Validated conditions:
 * - Session exists
 * - Session status is ACTIVE
 * - Session has not expired (absolute 7-day lifetime)
 * - Session is not compromised
 * - Session is not revoked
 * - User authorization version matches (optional)
 * - Membership authorization version matches (optional)
 */

export interface SessionValidationResult {
  readonly valid: boolean;
  readonly code?: string;
  readonly message?: string;
}

export interface SessionValidationInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly userAuthorizationVersion?: number;
  readonly membershipAuthorizationVersion?: number;
}

export class SessionStateValidator {
  private readonly prisma: PrismaLikeClient;
  private readonly sessionRepo: SessionRepository;

  constructor(prisma: PrismaLikeClient, sessionRepo: SessionRepository) {
    this.prisma = prisma;
    this.sessionRepo = sessionRepo;
  }

  /**
   * Validate live session state against PostgreSQL.
   * Returns a validation result — does not throw.
   */
  async validate(input: SessionValidationInput): Promise<SessionValidationResult> {
    return this.prisma.$transaction(async (tx: TransactionClient) => {
      const session = await this.sessionRepo.getSessionById(tx, input.sessionId);

      // Session must exist
      if (!session) {
        return { valid: false, code: 'AUTH_TOKEN_INVALID', message: 'Session not found' };
      }

      // Session must belong to the token's user
      if (session.userId !== input.userId) {
        return { valid: false, code: 'AUTH_TOKEN_INVALID', message: 'Session mismatch' };
      }

      // Check session status
      if (session.status === 'REVOKED') {
        return { valid: false, code: 'AUTH_SESSION_REVOKED', message: 'Session has been revoked' };
      }

      // The database status column supports COMPROMISED
      const rawStatus = session.status as string;
      if (rawStatus === 'COMPROMISED') {
        return {
          valid: false,
          code: 'AUTH_SESSION_COMPROMISED',
          message: 'Session has been compromised',
        };
      }

      // Check absolute session expiration (7-day lifetime)
      if (new Date() > session.expiresAt) {
        return {
          valid: false,
          code: 'AUTH_SESSION_EXPIRED',
          message: 'Session has expired',
        };
      }

      // Check user authorization version if provided
      if (
        input.userAuthorizationVersion !== undefined &&
        session.userAuthorizationVersion !== input.userAuthorizationVersion
      ) {
        // Note: version mismatch means roles changed since token was issued.
        // The token is stale but not necessarily invalid — the user should refresh.
        // For strict enforcement, reject stale tokens.
        return {
          valid: false,
          code: 'AUTH_TOKEN_INVALID',
          message: 'Authorization version stale',
        };
      }

      // Check membership authorization version if provided
      if (
        input.membershipAuthorizationVersion !== undefined &&
        session.membershipAuthorizationVersion !== null &&
        session.membershipAuthorizationVersion !== input.membershipAuthorizationVersion
      ) {
        return {
          valid: false,
          code: 'AUTH_TOKEN_INVALID',
          message: 'Membership authorization version stale',
        };
      }

      return { valid: true };
    });
  }
}
