import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import { RequireServiceScope, ServiceIdentityGuard } from '../../infrastructure/service-identity.guard.js';
import type { SessionRepository } from '../../infrastructure/postgres-session-repository.js';

/**
 * Internal Identity State Validation Endpoint
 *
 * POST /internal/v1/identity/state-validations
 *
 * Called by: staffing-service (and other internal services)
 * Auth: Service JWT with scope identity.state.validate
 *
 * Validates current session, user, and membership state from the database.
 * Returns structured validation result.
 */

const StateValidationSchema = z.object({
  subject: z.string().uuid(),
  sessionId: z.string().uuid(),
  selectedTenantId: z.string().uuid().optional(),
  membershipId: z.string().uuid().optional(),
  userAuthorizationVersion: z.number().int(),
  membershipAuthorizationVersion: z.number().int().optional(),
}).strict();

@Controller('internal/v1/identity')
@UseGuards(ServiceIdentityGuard)
export class InternalIdentityController {
  constructor(
    @Inject('IDENTITY_PRISMA') private readonly prisma: PrismaLikeClient,
    @Inject('SESSION_REPOSITORY') private readonly sessionRepo: SessionRepository,
  ) {}

  @Post('state-validations')
  @HttpCode(HttpStatus.OK)
  @RequireServiceScope('identity.state.validate')
  async validateState(@Body() body: unknown): Promise<{
    valid: boolean;
    code?: string;
    user?: { status: string; authorizationVersion: number };
    session?: { status: string; expiresAt: string };
    membership?: { status: string; tenantId: string; authorizationVersion: number };
  }> {
    const parsed = StateValidationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'Invalid state validation request',
      });
    }

    const { subject, sessionId, userAuthorizationVersion, membershipAuthorizationVersion } = parsed.data;

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      // 1. Check session
      const session = await this.sessionRepo.getSessionById(tx, sessionId);
      if (!session) {
        return { valid: false, code: 'SESSION_NOT_FOUND' };
      }
      if (session.userId !== subject) {
        return { valid: false, code: 'SESSION_USER_MISMATCH' };
      }
      if (session.status === 'REVOKED') {
        return { valid: false, code: 'SESSION_REVOKED' };
      }
      if (session.status !== 'ACTIVE') {
        return { valid: false, code: 'SESSION_INACTIVE' };
      }
      if (new Date() > session.expiresAt) {
        return { valid: false, code: 'SESSION_EXPIRED' };
      }

      // 2. Check user authorization version
      if (session.userAuthorizationVersion !== userAuthorizationVersion) {
        return { valid: false, code: 'USER_AUTHORIZATION_VERSION_STALE' };
      }

      // 3. Check membership authorization version if provided
      if (
        membershipAuthorizationVersion !== undefined &&
        session.membershipAuthorizationVersion !== null &&
        session.membershipAuthorizationVersion !== membershipAuthorizationVersion
      ) {
        return { valid: false, code: 'MEMBERSHIP_AUTHORIZATION_VERSION_STALE' };
      }

      return {
        valid: true,
        session: {
          status: session.status,
          expiresAt: session.expiresAt.toISOString(),
        },
      };
    });
  }
}
