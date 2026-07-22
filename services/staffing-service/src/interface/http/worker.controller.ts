import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { ChangeWorkerStatusHandler } from '../../application/commands/change-worker-status.command.js';
import { CreateWorkerHandler } from '../../application/commands/create-worker.command.js';
import type { StaffingRepository } from '../../application/ports/staffing-repository.js';
import {
  updateWorker,
  type Worker,
  type WorkerStatus,
} from '../../domain/worker.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';

const TENANT_DB = 'STAFFING_TENANT_DB';
const STAFFING_REPO = 'STAFFING_REPOSITORY';

/** Public worker summary — strips PII (email, phone, home coords) */
interface WorkerSummary {
  id: string;
  firstName: string;
  lastName: string;
  profession: string;
  status: string;
  specialty?: string | undefined;
  version: number;
}

function toWorkerSummary(w: Worker): WorkerSummary {
  return {
    id: w.id,
    firstName: w.firstName,
    lastName: w.lastName,
    profession: w.profession,
    status: w.status,
    specialty: w.specialty,
    version: w.version,
  };
}

interface AuthenticatedRequest {
  principal?: { subject: string; selectedTenantId?: string };
}

const CreateWorkerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(30).optional(),
  profession: z.enum(['RN', 'LPN', 'CNA', 'RT', 'ALLIED']),
  specialty: z.string().max(100).optional(),
  userId: z.string().uuid().optional(),
  homeLatitude: z.number().min(-90).max(90).optional(),
  homeLongitude: z.number().min(-180).max(180).optional(),
  homeCity: z.string().max(100).optional(),
  homeState: z.string().max(50).optional(),
  homeZip: z.string().max(20).optional(),
  externalReferences: z.array(z.object({
    systemName: z.enum(['symplr', 'bullhorn', 'labor-edge', 'maestra', 'auth0']),
    externalId: z.string().min(1).max(200),
  })).optional(),
}).strict();

const UpdateWorkerSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional(),
  specialty: z.string().max(100).optional(),
  homeLatitude: z.number().min(-90).max(90).optional(),
  homeLongitude: z.number().min(-180).max(180).optional(),
  homeCity: z.string().max(100).optional(),
  homeState: z.string().max(50).optional(),
  homeZip: z.string().max(20).optional(),
  expectedVersion: z.number().int().positive(),
}).strict();

const ChangeWorkerStatusSchema = z.object({
  status: z.enum([
    'APPLICANT', 'SCREENING', 'QUALIFIED', 'CREDENTIALING',
    'READY', 'ACTIVE', 'INACTIVE', 'BLOCKED', 'ALUMNI',
  ]),
  expectedVersion: z.number().int().positive(),
}).strict();

/**
 * Worker HTTP controller.
 * All operations are tenant-scoped through TenantAwareTransaction.
 * PII fields (name, email, phone) are NEVER logged.
 */
@Controller()
export class WorkerController {
  private readonly createWorkerHandler: CreateWorkerHandler;
  private readonly changeStatusHandler: ChangeWorkerStatusHandler;

  constructor(
    @Inject(TENANT_DB) private readonly tenantDb: TenantAwareTransaction,
    @Inject(STAFFING_REPO) private readonly repo: StaffingRepository,
  ) {
    this.createWorkerHandler = new CreateWorkerHandler(this.tenantDb, this.repo);
    this.changeStatusHandler = new ChangeWorkerStatusHandler(this.tenantDb, this.repo);
  }

  @Post('v1/workers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('worker.create')
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: { workerId: string } }> {
    const tenantId = this.requireTenant(req);
    const actorId = req.principal?.subject ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const parsed = CreateWorkerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid worker request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const result = await this.createWorkerHandler.execute({
      tenantId,
      actorId,
      correlationId: corrId,
      ...parsed.data,
    });

    return { data: { workerId: result.workerId } };
  }

  @Get('v1/workers/:workerId')
  @RequirePermission('worker.read')
  async getById(
    @Param('workerId') workerId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: Worker }> {
    const tenantId = this.requireTenant(req);
    const worker = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.getWorkerById(tx, workerId);
    });
    if (!worker) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Worker not found' });
    return { data: worker };
  }

  @Get('v1/workers')
  @RequirePermission('worker.list')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
  ): Promise<{ data: WorkerSummary[] }> {
    const tenantId = this.requireTenant(req);
    const workers = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.listWorkers(tx, { status });
    });
    // Project to summary (strip PII: email, phone, home coordinates)
    return { data: workers.map(toWorkerSummary) };
  }

  @Patch('v1/workers/:workerId')
  @RequirePermission('worker.update')
  async update(
    @Param('workerId') workerId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: Worker }> {
    const tenantId = this.requireTenant(req);
    const actorId = req.principal?.subject ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const parsed = UpdateWorkerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid update request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const updated = await this.tenantDb.execute(tenantId, async (tx) => {
      const worker = await this.repo.getWorkerById(tx, workerId);
      if (!worker) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Worker not found' });
      if (worker.version !== parsed.data.expectedVersion) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Worker was modified' });
      }

      const fields = {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
        specialty: parsed.data.specialty,
        homeLatitude: parsed.data.homeLatitude,
        homeLongitude: parsed.data.homeLongitude,
        homeCity: parsed.data.homeCity,
        homeState: parsed.data.homeState,
        homeZip: parsed.data.homeZip,
      };
      const updatedWorker = updateWorker(worker, fields);
      await this.repo.updateWorker(tx, updatedWorker);
      await this.emitAudit(tx, {
        tenantId, actorId, action: 'worker.updated',
        aggregateType: 'worker', aggregateId: worker.id,
        afterSummary: { version: updatedWorker.version },
        correlationId: corrId,
      });
      return updatedWorker;
    });

    return { data: updated };
  }

  @Post('v1/workers/:workerId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('worker.change-status')
  async changeStatus(
    @Param('workerId') workerId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: Worker }> {
    const tenantId = this.requireTenant(req);
    const actorId = req.principal?.subject ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const parsed = ChangeWorkerStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid status change',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const updated = await this.changeStatusHandler.execute({
        tenantId,
        actorId,
        correlationId: corrId,
        workerId,
        newStatus: parsed.data.status as WorkerStatus,
        expectedVersion: parsed.data.expectedVersion,
      });
      return { data: updated };
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.message === 'WORKER_NOT_FOUND') {
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Worker not found' });
        }
        if (e.message === 'VERSION_CONFLICT') {
          throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Worker was modified' });
        }
        if (e.message.startsWith('Invalid worker status')) {
          throw new BadRequestException({ code: 'INVALID_TRANSITION', message: e.message });
        }
      }
      throw e;
    }
  }

  /**
   * Worker self-service: read own profile.
   * Uses principal.subject (user ID) to find the linked worker record.
   * No worker.read permission required — workers always access their own profile.
   */
  @Get('v1/my-profile')
  async getMyProfile(@Req() req: AuthenticatedRequest): Promise<{ data: Worker }> {
    const tenantId = this.requireTenant(req);
    const userId = req.principal?.subject;
    if (!userId) {
      throw new BadRequestException({ code: 'NO_IDENTITY', message: 'No authenticated identity' });
    }

    const worker = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.getWorkerByUserId(tx, userId);
    });
    if (!worker) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'No worker profile linked to this account' });
    }
    return { data: worker };
  }

  /**
   * Worker self-service: update own profile (permitted fields only).
   * Workers cannot change: email, profession, status, userId.
   * No worker.update permission required — workers always update their own profile.
   */
  @Patch('v1/my-profile')
  async updateMyProfile(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: Worker }> {
    const tenantId = this.requireTenant(req);
    const userId = req.principal?.subject;
    if (!userId) {
      throw new BadRequestException({ code: 'NO_IDENTITY', message: 'No authenticated identity' });
    }
    const corrId = correlationId ?? crypto.randomUUID();

    const parsed = UpdateWorkerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid profile update',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const updated = await this.tenantDb.execute(tenantId, async (tx) => {
      const worker = await this.repo.getWorkerByUserId(tx, userId);
      if (!worker) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'No worker profile linked' });
      }
      if (worker.version !== parsed.data.expectedVersion) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Profile was modified' });
      }

      const fields = {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
        specialty: parsed.data.specialty,
        homeLatitude: parsed.data.homeLatitude,
        homeLongitude: parsed.data.homeLongitude,
        homeCity: parsed.data.homeCity,
        homeState: parsed.data.homeState,
        homeZip: parsed.data.homeZip,
      };
      const updatedWorker = updateWorker(worker, fields);
      await this.repo.updateWorker(tx, updatedWorker);
      await this.emitAudit(tx, {
        tenantId, actorId: userId, action: 'worker.self-updated',
        aggregateType: 'worker', aggregateId: worker.id,
        afterSummary: { version: updatedWorker.version },
        correlationId: corrId,
      });
      return updatedWorker;
    });

    return { data: updated };
  }

  private requireTenant(req: AuthenticatedRequest): string {
    const tenantId = req.principal?.selectedTenantId;
    if (!tenantId) {
      throw new BadRequestException({ code: 'NO_TENANT', message: 'No active tenant' });
    }
    return tenantId;
  }

  private async emitAudit(
    tx: TransactionClient,
    params: {
      tenantId: string;
      actorId: string;
      action: string;
      aggregateType: string;
      aggregateId: string;
      beforeSummary?: Record<string, unknown>;
      afterSummary?: Record<string, unknown>;
      correlationId: string;
    },
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        before_summary, after_summary, correlation_id
      ) VALUES (
        ${params.tenantId}::uuid, ${params.actorId}, ${params.action},
        ${params.aggregateType}, ${params.aggregateId}::uuid,
        ${params.beforeSummary ? JSON.stringify(params.beforeSummary) : null}::jsonb,
        ${params.afterSummary ? JSON.stringify(params.afterSummary) : null}::jsonb,
        ${params.correlationId}
      )`;
  }
}
