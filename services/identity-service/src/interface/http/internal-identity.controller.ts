import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import { RequireServiceScope, ServiceIdentityGuard } from '../../infrastructure/service-identity.guard.js';
import { InternalService } from '../../infrastructure/internal-service.decorator.js';
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
  selectedTenantId: z.string().uuid(),
  membershipId: z.string().uuid(),
  userAuthorizationVersion: z.number().int(),
  membershipAuthorizationVersion: z.number().int(),
}).strict();

@Controller('internal/v1/identity')
@UseGuards(ServiceIdentityGuard)
@InternalService()
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

    const {
      subject, sessionId, selectedTenantId, membershipId,
      userAuthorizationVersion, membershipAuthorizationVersion,
    } = parsed.data;

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      // 1. Check session exists and is active
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

      // 2. Check user is active
      const userRows = await tx.$queryRaw<{ status: string; authorization_version: number }>`
        SELECT status, authorization_version FROM identity.users WHERE id = ${subject}::uuid`;
      if (userRows.length === 0) {
        return { valid: false, code: 'USER_NOT_FOUND' };
      }
      const user = userRows[0]!;
      if (user.status !== 'ACTIVE') {
        return { valid: false, code: 'USER_INACTIVE' };
      }

      // 3. Check user authorization version is current
      if (user.authorization_version !== userAuthorizationVersion) {
        return { valid: false, code: 'USER_AUTHORIZATION_VERSION_STALE' };
      }

      // 4. Check membership is active and matches
      const memberRows = await tx.$queryRaw<{
        status: string; tenant_id: string; authorization_version: number;
      }>`
        SELECT status, tenant_id, authorization_version
        FROM identity.tenant_memberships
        WHERE id = ${membershipId}::uuid AND user_id = ${subject}::uuid`;

      if (memberRows.length === 0) {
        return { valid: false, code: 'MEMBERSHIP_NOT_FOUND' };
      }
      const membership = memberRows[0]!;
      if (membership.status !== 'ACTIVE') {
        return { valid: false, code: 'MEMBERSHIP_INACTIVE' };
      }
      if (membership.tenant_id !== selectedTenantId) {
        return { valid: false, code: 'MEMBERSHIP_TENANT_MISMATCH' };
      }
      if (membership.authorization_version !== membershipAuthorizationVersion) {
        return { valid: false, code: 'MEMBERSHIP_AUTHORIZATION_VERSION_STALE' };
      }

      return {
        valid: true,
        user: { status: user.status, authorizationVersion: user.authorization_version },
        session: { status: session.status, expiresAt: session.expiresAt.toISOString() },
        membership: {
          status: membership.status,
          tenantId: membership.tenant_id,
          authorizationVersion: membership.authorization_version,
        },
      };
    });
  }
}
