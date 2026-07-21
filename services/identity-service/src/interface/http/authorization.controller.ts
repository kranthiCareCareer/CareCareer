import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import type { ValidatedTokenContext } from '@carecareer/auth';
import type { PrismaLikeClient } from '@carecareer/database';

import {
  evaluateAuthorizationDecision,
  type AuthorizationRepository,
} from '../../application/commands/authorization-decision.command.js';

/**
 * Authorization decision endpoint.
 *
 * POST /v1/authorization/decisions
 *
 * Security boundary:
 * - Principal derived exclusively from validated authentication (IdentityAuthGuard)
 * - Tenant derived from validated session's selected_tenant_id
 * - Caller cannot supply userId, tenantId, roles, permissions or admin flags
 * - Request body contains only action + resource identification
 *
 * Response:
 * - Never reveals cross-tenant resource existence
 * - Never returns role topology, permission sets, policy internals
 * - Never returns tokens, secrets or sensitive context
 */

const DecisionRequestSchema = z.object({
  action: z.string().min(1).max(200),
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().uuid().optional(),
}).strict();

@Controller()
export class AuthorizationController {
  constructor(
    @Inject('AUTHORIZATION_PRISMA') private readonly prisma: PrismaLikeClient,
    @Inject('AUTHORIZATION_REPOSITORY') private readonly repo: AuthorizationRepository,
  ) {}

  @Post('v1/authorization/decisions')
  @HttpCode(HttpStatus.OK)
  async evaluate(
    @Body() body: unknown,
    @Req() req: { principal?: ValidatedTokenContext },
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{
    decisionId: string;
    allowed: boolean;
    reasonCode: string;
    evaluatedAt: string;
    policyVersion: number;
  }> {
    const principal = req.principal;
    if (!principal) {
      throw new ForbiddenException({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
    }

    // Validate request body — reject any attempt to override trusted fields
    const parsed = DecisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid authorization decision request',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    // Derive trusted context exclusively from validated authentication
    const userId = principal.subject;
    const tenantId = principal.selectedTenantId;
    const sessionId = principal.sessionId;

    if (!tenantId) {
      throw new ForbiddenException({
        code: 'NO_TENANT_CONTEXT',
        message: 'No active tenant selected',
      });
    }

    const corrId = correlationId ?? crypto.randomUUID();

    // Evaluate using authoritative server-side state
    const decision = await this.prisma.$transaction(async (tx) => {
      return evaluateAuthorizationDecision(tx, this.repo, {
        userId,
        tenantId,
        sessionId,
        tokenUserAuthVersion: principal.userAuthorizationVersion,
        tokenMembershipAuthVersion: principal.membershipAuthorizationVersion,
        action: parsed.data.action,
        resourceType: parsed.data.resourceType,
        resourceId: parsed.data.resourceId,
        correlationId: corrId,
      });
    });

    return {
      decisionId: decision.decisionId,
      allowed: decision.outcome === 'ALLOWED',
      reasonCode: decision.reasonCode,
      evaluatedAt: decision.evaluatedAt.toISOString(),
      policyVersion: decision.policyVersion,
    };
  }
}
