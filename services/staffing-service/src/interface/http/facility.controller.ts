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
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { CreateDepartmentHandler } from '../../application/commands/create-department.command.js';
import { CreateFacilityHandler } from '../../application/commands/create-facility.command.js';
import type { StaffingRepository } from '../../application/ports/staffing-repository.js';
import {
  createCredentialRequirement,
  VALID_WORKER_ROLES,
  type CredentialRequirement,
} from '../../domain/credential-requirement.js';
import type { Department } from '../../domain/department.js';
import type { Facility } from '../../domain/facility.js';

const TENANT_DB = 'STAFFING_TENANT_DB';
const STAFFING_REPO = 'STAFFING_REPOSITORY';

interface AuthenticatedRequest {
  principal?: { subject: string; selectedTenantId?: string };
}

const CreateFacilitySchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  timezone: z.string().min(1).max(50),
  addressLine1: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.number().int().positive().optional(),
}).strict();

const CreateDepartmentSchema = z.object({
  name: z.string().min(1).max(200),
}).strict();

const CreateCredentialRequirementSchema = z.object({
  departmentId: z.string().uuid().optional(),
  role: z.enum(['RN', 'LPN', 'CNA', 'RT', 'ALLIED']),
  credentialType: z.string().min(1).max(100),
  required: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional(),
}).strict();

/**
 * Facility and Department HTTP controller.
 * All operations are tenant-scoped through TenantAwareTransaction.
 * Principal derived from validated authentication only.
 */
@Controller()
export class FacilityController {
  private readonly createFacilityHandler: CreateFacilityHandler;
  private readonly createDepartmentHandler: CreateDepartmentHandler;

  constructor(
    @Inject(TENANT_DB) private readonly tenantDb: TenantAwareTransaction,
    @Inject(STAFFING_REPO) private readonly repo: StaffingRepository,
  ) {
    this.createFacilityHandler = new CreateFacilityHandler(this.tenantDb, this.repo);
    this.createDepartmentHandler = new CreateDepartmentHandler(this.tenantDb, this.repo);
  }

  @Post('v1/facilities')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: { facilityId: string } }> {
    const tenantId = this.requireTenant(req);
    const actorId = req.principal?.subject ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const parsed = CreateFacilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid facility request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const result = await this.createFacilityHandler.execute({
      tenantId,
      actorId,
      correlationId: corrId,
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      timezone: parsed.data.timezone,
      addressLine1: parsed.data.addressLine1,
      city: parsed.data.city,
      state: parsed.data.state,
      zip: parsed.data.zip,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      geofenceRadiusMeters: parsed.data.geofenceRadiusMeters,
    });

    return { data: { facilityId: result.facilityId } };
  }

  @Get('v1/facilities')
  async list(@Req() req: AuthenticatedRequest): Promise<{ data: Facility[] }> {
    const tenantId = this.requireTenant(req);
    const facilities = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.listFacilities(tx);
    });
    return { data: facilities };
  }

  @Get('v1/facilities/:facilityId')
  async getById(
    @Param('facilityId') facilityId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: Facility }> {
    const tenantId = this.requireTenant(req);
    const facility = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.getFacilityById(tx, facilityId);
    });
    if (!facility) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Facility not found' });
    return { data: facility };
  }

  @Post('v1/facilities/:facilityId/departments')
  @HttpCode(HttpStatus.CREATED)
  async createDepartment(
    @Param('facilityId') facilityId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: { departmentId: string } }> {
    const tenantId = this.requireTenant(req);
    const actorId = req.principal?.subject ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const parsed = CreateDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid department request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const result = await this.createDepartmentHandler.execute({
        tenantId,
        actorId,
        correlationId: corrId,
        facilityId,
        name: parsed.data.name,
      });
      return { data: { departmentId: result.departmentId } };
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FACILITY_NOT_FOUND') {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Facility not found' });
      }
      throw e;
    }
  }

  @Get('v1/facilities/:facilityId/departments')
  async listDepartments(
    @Param('facilityId') facilityId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: Department[] }> {
    const tenantId = this.requireTenant(req);
    const departments = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.listDepartmentsByFacility(tx, facilityId);
    });
    return { data: departments };
  }

  @Post('v1/facilities/:facilityId/credential-requirements')
  @HttpCode(HttpStatus.CREATED)
  async createCredentialRequirement(
    @Param('facilityId') facilityId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: { requirementId: string } }> {
    const tenantId = this.requireTenant(req);
    const actorId = req.principal?.subject ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const parsed = CreateCredentialRequirementSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid credential requirement request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const requirement = createCredentialRequirement({
      tenantId,
      facilityId,
      departmentId: parsed.data.departmentId,
      role: parsed.data.role,
      credentialType: parsed.data.credentialType,
      required: parsed.data.required,
      effectiveFrom: parsed.data.effectiveFrom
        ? new Date(parsed.data.effectiveFrom)
        : undefined,
    });

    await this.tenantDb.execute(tenantId, async (tx) => {
      const facility = await this.repo.getFacilityById(tx, facilityId);
      if (!facility) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Facility not found' });
      }
      await this.repo.createCredentialRequirement(tx, requirement);
      await this.emitAudit(tx, {
        tenantId,
        actorId,
        action: 'credential_requirement.created',
        aggregateType: 'credential_requirement',
        aggregateId: requirement.id,
        afterSummary: {
          facilityId,
          role: requirement.role,
          credentialType: requirement.credentialType,
          required: requirement.required,
          effectiveFrom: requirement.effectiveFrom.toISOString(),
        },
        correlationId: corrId,
      });
    });

    return { data: { requirementId: requirement.id } };
  }

  @Get('v1/facilities/:facilityId/credential-requirements')
  async listCredentialRequirements(
    @Param('facilityId') facilityId: string,
    @Req() req: AuthenticatedRequest,
    @Query('role') role?: string,
    @Query('departmentId') departmentId?: string,
  ): Promise<{ data: CredentialRequirement[] }> {
    const tenantId = this.requireTenant(req);

    // Validate role filter if provided
    if (role && !VALID_WORKER_ROLES.includes(role as never)) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: `Invalid role filter. Valid values: ${VALID_WORKER_ROLES.join(', ')}`,
      });
    }

    const requirements = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.repo.listCredentialRequirements(tx, facilityId, { role, departmentId });
    });
    return { data: requirements };
  }

  private requireTenant(req: AuthenticatedRequest): string {
    const tenantId = req.principal?.selectedTenantId;
    if (!tenantId) {
      throw new BadRequestException({ code: 'NO_TENANT', message: 'No active tenant' });
    }
    return tenantId;
  }

  /** Emit an audit record atomically within the current transaction */
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
