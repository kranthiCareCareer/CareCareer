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
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import type { TenantAwareTransaction } from '@carecareer/database';

import { createFacility, type Facility } from '../../domain/facility.js';
import { createDepartment, type Department } from '../../domain/department.js';
import type { StaffingRepository } from '../../application/ports/staffing-repository.js';

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

/**
 * Facility and Department HTTP controller.
 * All operations are tenant-scoped through TenantAwareTransaction.
 * Principal derived from validated authentication only.
 */
@Controller()
export class FacilityController {
  constructor(
    @Inject(TENANT_DB) private readonly tenantDb: TenantAwareTransaction,
    @Inject(STAFFING_REPO) private readonly repo: StaffingRepository,
  ) {}

  @Post('v1/facilities')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('x-correlation-id') _correlationId?: string,
  ): Promise<{ data: { facilityId: string } }> {
    const tenantId = this.requireTenant(req);

    const parsed = CreateFacilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid facility request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const facility = createFacility({
      tenantId,
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

    await this.tenantDb.execute(tenantId, async (tx) => {
      await this.repo.createFacility(tx, facility);
    });

    return { data: { facilityId: facility.id } };
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
  ): Promise<{ data: { departmentId: string } }> {
    const tenantId = this.requireTenant(req);

    const parsed = CreateDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid department request',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const department = createDepartment({
      tenantId,
      facilityId,
      name: parsed.data.name,
    });

    await this.tenantDb.execute(tenantId, async (tx) => {
      // Verify facility exists in this tenant
      const facility = await this.repo.getFacilityById(tx, facilityId);
      if (!facility) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Facility not found' });
      await this.repo.createDepartment(tx, department);
    });

    return { data: { departmentId: department.id } };
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

  private requireTenant(req: AuthenticatedRequest): string {
    const tenantId = req.principal?.selectedTenantId;
    if (!tenantId) {
      throw new BadRequestException({ code: 'NO_TENANT', message: 'No active tenant' });
    }
    return tenantId;
  }
}
