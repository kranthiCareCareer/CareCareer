import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';

import type { TenantAwareTransaction } from '@carecareer/database';

import { CreateCredentialHandler } from '../../application/commands/create-credential.command.js';
import { EvaluateEligibilityHandler } from '../../application/commands/evaluate-eligibility.command.js';
import { VerifyCredentialHandler } from '../../application/commands/verify-credential.command.js';
import type { CredentialRepository } from '../../application/ports/credential-repository.js';
import type { StaffingRepository } from '../../application/ports/staffing-repository.js';
import type { EligibilityCheckpoint } from '../../domain/eligibility.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';

/**
 * Credential and Eligibility HTTP Controller
 *
 * Endpoints:
 * - POST   /v1/workers/:workerId/credentials          — Add credential
 * - GET    /v1/workers/:workerId/credentials          — List credentials
 * - POST   /v1/workers/:workerId/credentials/:id/verify — Verify credential
 * - POST   /v1/workers/:workerId/eligibility-evaluations — Evaluate eligibility
 * - GET    /v1/workers/:workerId/eligibility-evaluations — List evaluations
 */
@Controller('v1/workers')
export class CredentialController {
  private readonly createHandler: CreateCredentialHandler;
  private readonly verifyHandler: VerifyCredentialHandler;
  private readonly evaluateHandler: EvaluateEligibilityHandler;

  constructor(
    @Inject('STAFFING_TENANT_DB') tenantDb: TenantAwareTransaction,
    @Inject('STAFFING_REPOSITORY') staffingRepo: StaffingRepository,
    @Inject('CREDENTIAL_REPOSITORY') credentialRepo: CredentialRepository,
  ) {
    this.createHandler = new CreateCredentialHandler(tenantDb, credentialRepo);
    this.verifyHandler = new VerifyCredentialHandler(tenantDb, credentialRepo);
    this.evaluateHandler = new EvaluateEligibilityHandler(tenantDb, staffingRepo, credentialRepo);
  }

  @Post(':workerId/credentials')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('credentials:create')
  async createCredential(
    @Param('workerId') workerId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-actor-id') actorId?: string,
  ): Promise<{ data: { credentialId: string } }> {
    const parsed = CreateCredentialSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid credential input',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const request = (body as Record<string, unknown>)['__request'] as
      | { principal?: { selectedTenantId?: string; actorId?: string } }
      | undefined;
    const tenantId = request?.principal?.selectedTenantId ?? '';
    const actor = actorId ?? request?.principal?.actorId ?? 'system';

    const result = await this.createHandler.execute({
      tenantId,
      actorId: actor,
      correlationId: correlationId ?? crypto.randomUUID(),
      workerId,
      credentialType: parsed.data.credentialType,
      issuingAuthority: parsed.data.issuingAuthority,
      credentialNumber: parsed.data.credentialNumber,
      issuedAt: parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : undefined,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });

    return { data: { credentialId: result.credentialId } };
  }

  @Get(':workerId/credentials')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:read')
  async listCredentials(
    @Param('workerId') _workerId: string,
  ): Promise<{ data: CredentialResponse[] }> {
    // TODO: Implement credential listing within tenant context
    return { data: [] };
  }

  @Post(':workerId/credentials/:credentialId/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:verify')
  async verifyCredential(
    @Param('workerId') _workerId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-actor-id') actorId?: string,
  ): Promise<{ data: { credentialId: string } }> {
    const parsed = VerifyCredentialSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid verification input',
      });
    }

    const request = (body as Record<string, unknown>)['__request'] as
      | { principal?: { selectedTenantId?: string; actorId?: string } }
      | undefined;
    const tenantId = request?.principal?.selectedTenantId ?? '';
    const actor = actorId ?? request?.principal?.actorId ?? 'system';

    const result = await this.verifyHandler.execute({
      tenantId,
      actorId: actor,
      correlationId: correlationId ?? crypto.randomUUID(),
      credentialId,
      verifiedBy: parsed.data.verifiedBy,
    });

    return { data: { credentialId: result.credentialId } };
  }

  @Post(':workerId/eligibility-evaluations')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('eligibility:evaluate')
  async evaluateEligibility(
    @Param('workerId') workerId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-actor-id') actorId?: string,
  ): Promise<{
    data: {
      outcome: string;
      checkpoint: string;
      reasons: Array<{ code: string; message: string; credentialType: string }>;
      evaluatedAt: string;
    };
  }> {
    const parsed = EvaluateEligibilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid eligibility evaluation input',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const request = (body as Record<string, unknown>)['__request'] as
      | { principal?: { selectedTenantId?: string; actorId?: string } }
      | undefined;
    const tenantId = request?.principal?.selectedTenantId ?? '';
    const actor = actorId ?? request?.principal?.actorId ?? 'system';

    try {
      const result = await this.evaluateHandler.execute({
        tenantId,
        actorId: actor,
        correlationId: correlationId ?? crypto.randomUUID(),
        workerId,
        facilityId: parsed.data.facilityId,
        checkpoint: parsed.data.checkpoint as EligibilityCheckpoint,
      });

      return {
        data: {
          outcome: result.outcome,
          checkpoint: result.checkpoint,
          reasons: result.reasons,
          evaluatedAt: result.evaluatedAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: error.message });
      }
      throw error;
    }
  }
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateCredentialSchema = z
  .object({
    credentialType: z.string().min(1).max(100),
    issuingAuthority: z.string().min(1).max(200).optional(),
    credentialNumber: z.string().min(1).max(100).optional(),
    issuedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

const VerifyCredentialSchema = z
  .object({
    verifiedBy: z.string().min(1).max(200),
  })
  .strict();

const EvaluateEligibilitySchema = z
  .object({
    facilityId: z.string().uuid(),
    checkpoint: z.enum([
      'MARKETPLACE_DISPLAY',
      'REQUEST_SUBMISSION',
      'ASSIGNMENT_CONFIRMATION',
      'CLOCK_IN',
    ]),
  })
  .strict();

interface CredentialResponse {
  id: string;
  credentialType: string;
  status: string;
  expiresAt?: string;
}
