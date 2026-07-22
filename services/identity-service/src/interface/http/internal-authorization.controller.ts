import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { PrismaLikeClient } from '@carecareer/database';

import {
  evaluateAuthorizationDecision,
  type AuthorizationRepository,
} from '../../application/commands/authorization-decision.command.js';
import { RequireServiceScope, ServiceIdentityGuard } from '../../infrastructure/service-identity.guard.js';

/**
 * Internal Authorization Decision Endpoint
 *
 * POST /internal/v1/authorization/decisions
 *
 * Called by: staffing-service (and other internal services)
 * Auth: Service JWT with scope authorization.decide
 *
 * Reuses the GP-03.4 authorization policy engine.
 * The calling service provides validated principal context.
 * The authorization service loads current roles/permissions/denials from DB.
 */

const InternalDecisionSchema = z.object({
  principal: z.object({
    subject: z.string().uuid(),
    sessionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    membershipId: z.string().uuid(),
    userAuthorizationVersion: z.number().int(),
    membershipAuthorizationVersion: z.number().int(),
  }).strict(),
  action: z.string().min(1).max(200),
  resource: z.object({
    type: z.string().min(1).max(100),
    id: z.string().uuid().optional(),
    tenantId: z.string().uuid(),
  }).strict().optional(),
  context: z.object({
    facilityId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    correlationId: z.string().optional(),
  }).strict().optional(),
}).strict();

@Controller('internal/v1/authorization')
@UseGuards(ServiceIdentityGuard)
export class InternalAuthorizationController {
  constructor(
    @Inject('AUTHORIZATION_PRISMA') private readonly prisma: PrismaLikeClient,
    @Inject('AUTHORIZATION_REPOSITORY') private readonly repo: AuthorizationRepository,
  ) {}

  @Post('decisions')
  @HttpCode(HttpStatus.OK)
  @RequireServiceScope('authorization.decide')
  async decide(
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{
    decision: 'ALLOW' | 'DENY';
    decisionId: string;
    policyVersion: number;
    reasonCode: string;
  }> {
    const parsed = InternalDecisionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'Invalid authorization decision request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { principal, action, resource, context } = parsed.data;
    const corrId = context?.correlationId ?? correlationId ?? crypto.randomUUID();

    // Delegate to the existing GP-03.4 authorization policy engine
    const result = await this.prisma.$transaction(async (tx) => {
      return evaluateAuthorizationDecision(tx, this.repo, {
        userId: principal.subject,
        tenantId: principal.tenantId,
        sessionId: principal.sessionId,
        tokenUserAuthVersion: principal.userAuthorizationVersion,
        tokenMembershipAuthVersion: principal.membershipAuthorizationVersion,
        action,
        resourceType: resource?.type ?? 'general',
        resourceId: resource?.id,
        correlationId: corrId,
      });
    });

    return {
      decision: result.outcome === 'ALLOWED' ? 'ALLOW' : 'DENY',
      decisionId: result.decisionId,
      policyVersion: result.policyVersion,
      reasonCode: result.reasonCode,
    };
  }
}
