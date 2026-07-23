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
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import type { TenantAwareTransaction } from '@carecareer/database';

import { InvalidRequestError, VersionConflictError } from '../../domain/errors.js';
import { createShift, publishShift, cancelShift, type Shift } from '../../domain/shift.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import type { ShiftRepository } from '../../infrastructure/postgres-shift-repository.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

/**
 * Shift HTTP Controller
 *
 * Endpoints:
 * - POST /v1/shifts — Create shift in DRAFT
 * - GET /v1/shifts — List shifts (filterable)
 * - GET /v1/shifts/:shiftId — Get shift detail
 * - POST /v1/shifts/:shiftId/publish — Publish to marketplace
 * - POST /v1/shifts/:shiftId/cancel — Cancel shift
 */
@Controller('v1/shifts')
export class ShiftController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly tenantDb: TenantAwareTransaction,
    @Inject('SHIFT_REPOSITORY') private readonly shiftRepo: ShiftRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('shifts:create')
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
    @Headers('x-correlation-id') _correlationId?: string,
  ): Promise<{ data: { shiftId: string } }> {
    const principal = requirePrincipal(req);

    const parsed = CreateShiftSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError(
        'Invalid shift input',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    const shift = createShift({
      tenantId: principal.selectedTenantId,
      facilityId: parsed.data.facilityId,
      departmentId: parsed.data.departmentId,
      role: parsed.data.role as Shift['role'],
      startTime: new Date(parsed.data.startTime),
      endTime: new Date(parsed.data.endTime),
      businessDate: parsed.data.businessDate,
      requiredWorkerCount: parsed.data.requiredWorkerCount,
      payRateCents: parsed.data.payRateCents,
      billRateCents: parsed.data.billRateCents,
      notes: parsed.data.notes,
      createdBy: principal.subject,
    });

    await this.tenantDb.execute(principal.selectedTenantId, async (tx) => {
      await this.shiftRepo.createShift(tx, shift);
    });

    return { data: { shiftId: shift.id } };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shifts:read')
  async list(
    @Req() req: AuthenticatedStaffingRequest,
    @Query('status') status?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<{ data: ShiftSummaryDto[] }> {
    const principal = requirePrincipal(req);

    const shifts = await this.tenantDb.execute(principal.selectedTenantId, async (tx) => {
      const filters: { status?: string; facilityId?: string } = {};
      if (status) filters.status = status;
      if (facilityId) filters.facilityId = facilityId;
      return this.shiftRepo.listShifts(tx, filters);
    });

    return { data: shifts.map(toShiftSummary) };
  }

  @Get(':shiftId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shifts:read')
  async getById(
    @Param('shiftId') shiftId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ): Promise<{ data: ShiftSummaryDto }> {
    const principal = requirePrincipal(req);

    const shift = await this.tenantDb.execute(principal.selectedTenantId, async (tx) => {
      return this.shiftRepo.getShiftById(tx, shiftId);
    });

    if (!shift) {
      throw new InvalidRequestError('Shift not found');
    }

    return { data: toShiftSummary(shift) };
  }

  @Post(':shiftId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shifts:publish')
  async publish(
    @Param('shiftId') shiftId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
  ): Promise<{ data: { shiftId: string; status: string } }> {
    const principal = requirePrincipal(req);

    const parsed = VersionedMutationSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError('expectedVersion is required');
    }

    const result = await this.tenantDb.execute(principal.selectedTenantId, async (tx) => {
      const shift = await this.shiftRepo.getShiftById(tx, shiftId);
      if (!shift) throw new InvalidRequestError('Shift not found');
      if (shift.version !== parsed.data.expectedVersion) {
        throw new VersionConflictError('shift', shiftId);
      }
      const published = publishShift(shift);
      await this.shiftRepo.updateShift(tx, published);
      return published;
    });

    return { data: { shiftId, status: result.status } };
  }

  @Post(':shiftId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shifts:cancel')
  async cancel(
    @Param('shiftId') shiftId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedStaffingRequest,
  ): Promise<{ data: { shiftId: string; status: string } }> {
    const principal = requirePrincipal(req);

    const parsed = CancelShiftSchema.safeParse(body);
    if (!parsed.success) {
      throw new InvalidRequestError('expectedVersion and reason are required');
    }

    const result = await this.tenantDb.execute(principal.selectedTenantId, async (tx) => {
      const shift = await this.shiftRepo.getShiftById(tx, shiftId);
      if (!shift) throw new InvalidRequestError('Shift not found');
      if (shift.version !== parsed.data.expectedVersion) {
        throw new VersionConflictError('shift', shiftId);
      }
      const cancelled = cancelShift(shift, parsed.data.reason);
      await this.shiftRepo.updateShift(tx, cancelled);
      return cancelled;
    });

    return { data: { shiftId, status: result.status } };
  }
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

interface ShiftSummaryDto {
  id: string;
  facilityId: string;
  departmentId: string | null;
  status: string;
  role: string;
  startTime: string;
  endTime: string;
  businessDate: string;
  requiredWorkerCount: number;
  filledWorkerCount: number;
  payRateCents: number;
  billRateCents: number;
  version: number;
}

function toShiftSummary(shift: Shift): ShiftSummaryDto {
  return {
    id: shift.id,
    facilityId: shift.facilityId,
    departmentId: shift.departmentId ?? null,
    status: shift.status,
    role: shift.role,
    startTime: shift.startTime.toISOString(),
    endTime: shift.endTime.toISOString(),
    businessDate: shift.businessDate,
    requiredWorkerCount: shift.requiredWorkerCount,
    filledWorkerCount: shift.filledWorkerCount,
    payRateCents: shift.payRateCents,
    billRateCents: shift.billRateCents,
    version: shift.version,
  };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateShiftSchema = z
  .object({
    facilityId: z.string().uuid(),
    departmentId: z.string().uuid().optional(),
    role: z.enum(['RN', 'LPN', 'CNA', 'RT', 'ALLIED']),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requiredWorkerCount: z.number().int().min(1),
    payRateCents: z.number().int().min(1),
    billRateCents: z.number().int().min(1),
    notes: z.string().max(1000).optional(),
  })
  .strict();

const VersionedMutationSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();

const CancelShiftSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.string().min(1).max(500),
  })
  .strict();
