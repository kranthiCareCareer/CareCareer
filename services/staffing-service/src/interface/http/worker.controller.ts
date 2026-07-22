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

import type { StaffingRepository } from '../../application/ports/staffing-repository.js';
import {
  changeWorkerStatus,
  createWorker,
  updateWorker,
  type ExternalReference,
  type Worker,
  type WorkerStatus,
} from '../../domain/worker.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';

const TENANT_DB = 'STAFFING_TENANT_DB';
const STAFFING_REPO = 'STAFFING_REPOSITORY';

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
  homeLatitude: z.number().min(-90).max(90).optional(),
  homeLongitude: z.number().min(-180).max(180).optional(),
  homeCity: z.string().max(100).optional(),
  homeState: z.string().max(50).optional(),
  homeZip: z.string().max(20).optional(),
  externalReferences: z.array(z.object({
    systemName: z.string().min(1).max(50),
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
  constructor(
    @Inject(TENANT_DB) private readonly tenantDb: TenantAwareTransaction,
    @Inject(STAFFING_REPO) private readonly repo: StaffingRepository,
  ) {}

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

    const worker = createWorker({ tenantId, ...parsed.data });

    await this.tenantDb.execute(tenantId, async (tx) => {
      await this.repo.createWorker(tx, worker);

      // Create external references if provided
      if (parsed.data.externalReferences) {
        for (const ref of parsed.data.externalReferences) {
          const extRef: ExternalReference = {
            id: crypto.randomUUID(),
            tenantId,
            workerId: worker.id,
            systemName: ref.systemName,
            externalId: ref.externalId,
            createdAt: new Date(),
          };
          await this.repo.createExternalReference(tx, extRef);
        }
      }

      await this.emitAudit(tx, {
        tenantId, actorId, action: 'worker.created',
        aggregateType: 'worker', aggregateId: worker.id,
        afterSummary: { profession: worker.profession, status: worker.status },
        correlationId: corrId,
      });
    });

    return { data: { workerId: worker.id } };
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
  ): Promise<{ data: Worker[] }> {
    const tenantId = this.requireTenant(req);
    const workers = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.listWorkers(tx, { status });
    });
    return { data: workers };
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

    const updated = await this.tenantDb.execute(tenantId, async (tx) => {
      const worker = await this.repo.getWorkerById(tx, workerId);
      if (!worker) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Worker not found' });
      if (worker.version !== parsed.data.expectedVersion) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Worker was modified' });
      }

      try {
        const changed = changeWorkerStatus(worker, parsed.data.status as WorkerStatus);
        await this.repo.updateWorker(tx, changed);
        await this.emitAudit(tx, {
          tenantId, actorId, action: `worker.${parsed.data.status.toLowerCase()}`,
          aggregateType: 'worker', aggregateId: worker.id,
          beforeSummary: { status: worker.status },
          afterSummary: { status: changed.status },
          correlationId: corrId,
        });
        return changed;
      } catch (e: unknown) {
        if (e instanceof Error && e.message.startsWith('Invalid worker status')) {
          throw new BadRequestException({ code: 'INVALID_TRANSITION', message: e.message });
        }
        throw e;
      }
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
