/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { TenantAwareTransaction } from '@carecareer/database';

import type { AuditRepository } from '../../application/ports/audit-repository.js';
import type { ShiftRepository } from '../../application/ports/shift-repository.js';
import { createShift, publishShift, cancelShift } from '../../domain/shift.js';
import type { ShiftRole } from '../../domain/shift.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

interface CreateShiftDto {
  facilityId: string;
  departmentId?: string;
  role: ShiftRole;
  startTime: string;
  endTime: string;
  businessDate: string;
  requiredWorkerCount: number;
  payRateCents: number;
  billRateCents: number;
  notes?: string;
}

interface PublishShiftDto {
  expectedVersion: number;
}

interface CancelShiftDto {
  reason: string;
  expectedVersion: number;
}

@Controller('v1/shifts')
export class ShiftController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    @Inject('SHIFT_REPOSITORY') private readonly shiftRepo: ShiftRepository,
    @Inject('AUDIT_REPOSITORY') private readonly auditRepo: AuditRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('shifts:create')
  async create(
    @Body() dto: CreateShiftDto,
    @Req() req: AuthenticatedStaffingRequest,
  ): Promise<{ id: string; status: string; version: number }> {
    const principal = requirePrincipal(req);

    const shift = createShift({
      tenantId: principal.selectedTenantId,
      facilityId: dto.facilityId,
      departmentId: dto.departmentId,
      role: dto.role,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      businessDate: dto.businessDate,
      requiredWorkerCount: dto.requiredWorkerCount,
      payRateCents: dto.payRateCents,
      billRateCents: dto.billRateCents,
      notes: dto.notes,
      createdBy: principal.subject,
    });

    await this.db.execute(principal.selectedTenantId, async (tx) => {
      await this.shiftRepo.createShift(tx, shift);
      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'shift.created',
        resourceType: 'shift',
        resourceId: shift.id,
        details: { facilityId: dto.facilityId, role: dto.role, status: 'DRAFT' },
        createdAt: new Date(),
      });
    });

    return { id: shift.id, status: shift.status, version: shift.version };
  }

  @Get(':shiftId')
  @RequirePermission('shifts:read')
  async getById(
    @Param('shiftId') shiftId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const shift = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.shiftRepo.getShiftById(tx, shiftId);
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    return shift;
  }

  @Get()
  @RequirePermission('shifts:read')
  async list(
    @Query('facilityId') facilityId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('role') role: string | undefined,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const shifts = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.shiftRepo.listShifts(tx, { facilityId, status, role });
    });

    return { data: shifts, total: shifts.length };
  }

  @Post(':shiftId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shifts:publish')
  async publish(
    @Param('shiftId') shiftId: string,
    @Body() dto: PublishShiftDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const shift = await this.shiftRepo.getShiftById(tx, shiftId);
      if (!shift) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (shift.version !== dto.expectedVersion) {
        return { error: 'VERSION_CONFLICT', currentVersion: shift.version } as const;
      }

      const published = publishShift(shift);
      await this.shiftRepo.updateShift(tx, published);
      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'shift.published',
        resourceType: 'shift',
        resourceId: shiftId,
        details: { previousStatus: shift.status },
        createdAt: new Date(),
      });
      return { shift: published };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        throw new NotFoundException('Shift not found');
      }
      throw new ConflictException({ error: 'VERSION_CONFLICT', currentVersion: result.currentVersion });
    }

    return { id: result.shift.id, status: result.shift.status, version: result.shift.version };
  }

  @Post(':shiftId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shifts:cancel')
  async cancel(
    @Param('shiftId') shiftId: string,
    @Body() dto: CancelShiftDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const shift = await this.shiftRepo.getShiftById(tx, shiftId);
      if (!shift) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (shift.version !== dto.expectedVersion) {
        return { error: 'VERSION_CONFLICT', currentVersion: shift.version } as const;
      }

      const cancelled = cancelShift(shift, dto.reason);
      await this.shiftRepo.updateShift(tx, cancelled);
      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'shift.cancelled',
        resourceType: 'shift',
        resourceId: shiftId,
        details: { reason: dto.reason, previousStatus: shift.status },
        createdAt: new Date(),
      });
      return { shift: cancelled };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        throw new NotFoundException('Shift not found');
      }
      throw new ConflictException({ error: 'VERSION_CONFLICT', currentVersion: result.currentVersion });
    }

    return { id: result.shift.id, status: result.shift.status, version: result.shift.version };
  }
}
