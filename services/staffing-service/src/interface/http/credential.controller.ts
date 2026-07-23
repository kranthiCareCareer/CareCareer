import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import type { TenantAwareTransaction } from '@carecareer/database';

import { CreateCredentialHandler } from '../../application/commands/create-credential.command.js';
import { EvaluateEligibilityHandler } from '../../application/commands/evaluate-eligibility.command.js';
import { RejectCredentialHandler } from '../../application/commands/reject-credential.command.js';
import { RevokeCredentialHandler } from '../../application/commands/revoke-credential.command.js';
import { SubmitCredentialHandler } from '../../application/commands/submit-credential.command.js';
import { VerifyCredentialHandler } from '../../application/commands/verify-credential.command.js';
import type { CredentialRepository } from '../../application/ports/credential-repository.js';
import type { StaffingRepository } from '../../application/ports/staffing-repository.js';
import type { Credential } from '../../domain/credential.js';
import type { EligibilityCheckpoint } from '../../domain/eligibility.js';
import {
  CredentialNotFoundError,
  CredentialWorkerMismatchError,
  InvalidCredentialTransitionError,
  InvalidRequestError,
  VersionConflictError,
  WorkerNotFoundError,
} from '../../domain/errors.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

import {
  toCredentialSummaryDto,
  toCredentialDetailDto,
  type CredentialSummaryDto,
  type CredentialDetailDto,
} from './dto/credential.dto.js';

/**
 * Credential and Eligibility HTTP Controller
 *
 * All principal context derived from validated authentication.
 * Actor identity fails closed: missing subject = deny.
 * Credential-worker binding enforced via application commands.
 * No business logic in the controller - delegates to command handlers.
 */
@Controller('v1/workers')
export class CredentialController {
  private readonly createHandler: CreateCredentialHandler;
  private readonly submitHandler: SubmitCredentialHandler;
  private readonly verifyHandler: VerifyCredentialHandler;
  private readonly rejectHandler: RejectCredentialHandler;
  private readonly revokeHandler: RevokeCredentialHandler;
  private readonly evaluateHandler: EvaluateEligibilityHandler;

  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly tenantDb: TenantAwareTransaction,
    @Inject('STAFFING_REPOSITORY') private readonly staffingRepo: StaffingRepository,
    @Inject('CREDENTIAL_REPOSITORY') private readonly credentialRepo: CredentialRepository,
  ) {
    this.createHandler = new CreateCredentialHandler(tenantDb, this.credentialRepo);
    this.submitHandler = new SubmitCredentialHandler(tenantDb, this.credentialRepo);
    this.verifyHandler = new VerifyCredentialHandler(tenantDb, this.credentialRepo);
    this.rejectHandler = new RejectCredentialHandler(tenantDb, this.credentialRepo);
    this.revokeHandler = new RevokeCredentialHandler(tenantDb, this.credentialRepo);
    this.evaluateHandler = new EvaluateEligibilityHandler(
      tenantDb,
      this.staffingRepo,
      this.credentialRepo,
    );
  }

  @Post(':workerId/credentials')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('credentials:create')
  async createCredential(
    @Param('workerId') workerId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: { credentialId: string } }> {
    const principal = requirePrincipal(req);
    const validatedKey = this.validateIdempotencyKey(idempotencyKey);

    const parsed = CreateCredentialSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError(
        'Invalid credential input',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    await this.verifyWorkerExists(principal.selectedTenantId, workerId);

    const result = await this.createHandler.execute({
      tenantId: principal.selectedTenantId,
      actorId: principal.subject,
      correlationId: correlationId ?? crypto.randomUUID(),
      workerId,
      credentialType: parsed.data.credentialType,
      issuingAuthority: parsed.data.issuingAuthority,
      credentialNumber: parsed.data.credentialNumber,
      issuedAt: parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : undefined,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
      idempotencyKey: validatedKey,
    });

    return { data: { credentialId: result.credentialId } };
  }

  @Get(':workerId/credentials')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:read')
  async listCredentials(
    @Param('workerId') workerId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ): Promise<{ data: CredentialSummaryDto[] }> {
    const principal = requirePrincipal(req);

    // Validate worker exists in authenticated tenant before listing
    await this.verifyWorkerExists(principal.selectedTenantId, workerId);

    const credentials = await this.tenantDb.execute(principal.selectedTenantId, async (tx) => {
      return this.credentialRepo.getCredentialsByWorkerId(tx, workerId);
    });

    return { data: credentials.map(toCredentialSummaryDto) };
  }

  @Get(':workerId/credentials/:credentialId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:read')
  async getCredentialDetail(
    @Param('workerId') workerId: string,
    @Param('credentialId') credentialId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ): Promise<{ data: CredentialDetailDto }> {
    const principal = requirePrincipal(req);
    const credential = await this.loadAndValidateCredential(
      principal.selectedTenantId,
      workerId,
      credentialId,
    );
    return { data: toCredentialDetailDto(credential) };
  }

  @Post(':workerId/credentials/:credentialId/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:submit')
  async submitForVerification(
    @Param('workerId') workerId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: { credentialId: string; status: string } }> {
    const principal = requirePrincipal(req);
    const validatedKey = this.validateIdempotencyKey(idempotencyKey);

    const parsed = VersionedMutationSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError('expectedVersion is required');
    }

    const result = await this.submitHandler.execute({
      tenantId: principal.selectedTenantId,
      actorId: principal.subject,
      correlationId: correlationId ?? crypto.randomUUID(),
      workerId,
      credentialId,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: validatedKey,
    });

    return { data: result };
  }

  @Post(':workerId/credentials/:credentialId/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:verify')
  async verifyCredential(
    @Param('workerId') workerId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: { credentialId: string; status: string } }> {
    const principal = requirePrincipal(req);
    const validatedKey = this.validateIdempotencyKey(idempotencyKey);

    const parsed = VersionedMutationSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError('expectedVersion is required');
    }

    const result = await this.verifyHandler.execute({
      tenantId: principal.selectedTenantId,
      actorId: principal.subject,
      correlationId: correlationId ?? crypto.randomUUID(),
      workerId,
      credentialId,
      expectedVersion: parsed.data.expectedVersion,
      verifiedBy: principal.subject,
      idempotencyKey: validatedKey,
    });

    return { data: { credentialId: result.credentialId, status: 'VERIFIED' } };
  }

  @Post(':workerId/credentials/:credentialId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:verify')
  async rejectCredential(
    @Param('workerId') workerId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: { credentialId: string; status: string } }> {
    const principal = requirePrincipal(req);
    const validatedKey = this.validateIdempotencyKey(idempotencyKey);

    const parsed = ReasonSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError('Rejection reason is required');
    }

    const result = await this.rejectHandler.execute({
      tenantId: principal.selectedTenantId,
      actorId: principal.subject,
      correlationId: correlationId ?? crypto.randomUUID(),
      workerId,
      credentialId,
      expectedVersion: parsed.data.expectedVersion,
      reason: parsed.data.reason,
      idempotencyKey: validatedKey,
    });

    return { data: result };
  }

  @Post(':workerId/credentials/:credentialId/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:revoke')
  async revokeCredential(
    @Param('workerId') workerId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: { credentialId: string; status: string } }> {
    const principal = requirePrincipal(req);
    const validatedKey = this.validateIdempotencyKey(idempotencyKey);

    const parsed = ReasonSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError('Revocation reason is required');
    }

    const result = await this.revokeHandler.execute({
      tenantId: principal.selectedTenantId,
      actorId: principal.subject,
      correlationId: correlationId ?? crypto.randomUUID(),
      workerId,
      credentialId,
      expectedVersion: parsed.data.expectedVersion,
      reason: parsed.data.reason,
      idempotencyKey: validatedKey,
    });

    return { data: result };
  }

  @Post(':workerId/credentials/:credentialId/request-correction')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('credentials:verify')
  async requestCorrection(
    @Param('workerId') workerId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') _correlationId?: string,
    @Headers('idempotency-key') _idempotencyKey?: string,
  ): Promise<{ data: { credentialId: string; status: string } }> {
    const principal = requirePrincipal(req);

    const parsed = ReasonSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError('expectedVersion and reason are required');
    }

    const credential = await this.loadAndValidateCredential(
      principal.selectedTenantId,
      workerId,
      credentialId,
    );

    if (credential.version !== parsed.data.expectedVersion) {
      throw new VersionConflictError('credential', credentialId);
    }

    if (credential.status !== 'PENDING_VERIFICATION') {
      throw new InvalidCredentialTransitionError(credential.status, 'CORRECTION_REQUIRED');
    }

    await this.tenantDb.execute(principal.selectedTenantId, async (tx) => {
      await this.credentialRepo.updateCredential(tx, {
        ...credential,
        status: 'CORRECTION_REQUIRED',
        updatedAt: new Date(),
        version: credential.version + 1,
      });
    });

    return { data: { credentialId, status: 'CORRECTION_REQUIRED' } };
  }

  @Post(':workerId/eligibility-evaluations')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('eligibility:evaluate')
  async evaluateEligibility(
    @Param('workerId') workerId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{
    data: {
      outcome: string;
      checkpoint: string;
      reasons: Array<{ code: string; message: string; credentialType: string }>;
      evaluatedAt: string;
    };
  }> {
    const principal = requirePrincipal(req);

    const parsed = EvaluateEligibilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError(
        'Invalid eligibility evaluation input',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    await this.verifyWorkerExists(principal.selectedTenantId, workerId);

    const result = await this.evaluateHandler.execute({
      tenantId: principal.selectedTenantId,
      actorId: principal.subject,
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
  }

  /** Load credential and validate it belongs to the correct tenant and worker */
  private async loadAndValidateCredential(
    tenantId: string,
    workerId: string,
    credentialId: string,
  ): Promise<Credential> {
    const credential = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.credentialRepo.getCredentialById(tx, credentialId);
    });
    if (!credential) {
      throw new CredentialNotFoundError(credentialId);
    }
    if (credential.workerId !== workerId) {
      throw new CredentialWorkerMismatchError();
    }
    return credential;
  }

  /** Verify worker exists in the authenticated tenant */
  private async verifyWorkerExists(tenantId: string, workerId: string): Promise<void> {
    const worker = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.staffingRepo.getWorkerById(tx, workerId);
    });
    if (!worker) {
      throw new WorkerNotFoundError(workerId);
    }
  }

  /** Validate and normalize the Idempotency-Key header */
  private validateIdempotencyKey(key: string | undefined): string {
    if (!key) {
      throw new InvalidRequestError('Idempotency-Key header is required');
    }
    const trimmed = key.trim();
    if (trimmed.length < 16 || trimmed.length > 128) {
      throw new InvalidRequestError('Idempotency-Key must be 16-128 characters');
    }
    // Reject control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      throw new InvalidRequestError('Idempotency-Key contains invalid characters');
    }
    return trimmed;
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

const ReasonSchema = z
  .object({
    reason: z.string().min(1).max(500),
    expectedVersion: z.number().int().min(1),
  })
  .strict();

const VersionedMutationSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
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
