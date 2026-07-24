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
  UnprocessableEntityException,
} from '@nestjs/common';

import type { TenantAwareTransaction } from '@carecareer/database';

import type { AssignmentRepository } from '../../application/ports/assignment-repository.js';
import type { AuditRepository } from '../../application/ports/audit-repository.js';
import type { ShiftRepository } from '../../application/ports/shift-repository.js';
import type { ShiftRequestRepository } from '../../application/ports/shift-request-repository.js';
import { createAssignment } from '../../domain/assignment.js';
import {
  createShiftRequest,
  confirmShiftRequest,
  rejectShiftRequest,
  withdrawShiftRequest,
} from '../../domain/shift-request.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

interface SubmitRequestDto {
  shiftId: string;
  workerId: string;
}

interface ConfirmRequestDto {
  expectedVersion: number;
}

interface RejectRequestDto {
  reason: string;
  expectedVersion: number;
}

@Controller('v1/marketplace')
export class MarketplaceController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    @Inject('SHIFT_REPOSITORY') private readonly shiftRepo: ShiftRepository,
    @Inject('SHIFT_REQUEST_REPOSITORY') private readonly requestRepo: ShiftRequestRepository,
    @Inject('ASSIGNMENT_REPOSITORY') private readonly assignmentRepo: AssignmentRepository,
    @Inject('AUDIT_REPOSITORY') private readonly auditRepo: AuditRepository,
  ) {}

  /** List published, available shifts (marketplace view). */
  @Get('shifts')
  @RequirePermission('marketplace:read')
  async listAvailableShifts(
    @Query('facilityId') facilityId: string | undefined,
    @Query('role') role: string | undefined,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const shifts = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.shiftRepo.listPublishedShifts(tx, { facilityId, role });
    });

    return { data: shifts, total: shifts.length };
  }

  /** Submit a shift request (worker requests a shift). */
  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('shift-requests:create')
  async submitRequest(
    @Body() dto: SubmitRequestDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      // Check shift exists and is available
      const shift = await this.shiftRepo.getShiftById(tx, dto.shiftId);
      if (!shift) {
        return { error: 'SHIFT_NOT_FOUND' } as const;
      }
      if (shift.status !== 'PUBLISHED' && shift.status !== 'PARTIALLY_FILLED') {
        return { error: 'SHIFT_NOT_AVAILABLE' } as const;
      }
      if (shift.filledWorkerCount >= shift.requiredWorkerCount) {
        return { error: 'SHIFT_FULL' } as const;
      }

      // Check duplicate active request
      const hasActive = await this.requestRepo.hasActiveRequest(tx, dto.shiftId, dto.workerId);
      if (hasActive) {
        return { error: 'DUPLICATE_REQUEST' } as const;
      }

      const request = createShiftRequest({
        tenantId: principal.selectedTenantId,
        shiftId: dto.shiftId,
        workerId: dto.workerId,
      });

      await this.requestRepo.createShiftRequest(tx, request);
      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'shift_request.created',
        resourceType: 'shift_request',
        resourceId: request.id,
        details: { shiftId: dto.shiftId, workerId: dto.workerId },
        createdAt: new Date(),
      });

      return { request };
    });

    if ('error' in result) {
      switch (result.error) {
        case 'SHIFT_NOT_FOUND':
          throw new NotFoundException('Shift not found');
        case 'SHIFT_NOT_AVAILABLE':
          throw new UnprocessableEntityException('Shift is not available for requests');
        case 'SHIFT_FULL':
          throw new UnprocessableEntityException('Shift is fully staffed');
        case 'DUPLICATE_REQUEST':
          throw new ConflictException('Active request already exists for this shift');
      }
    }

    return { id: result.request.id, status: result.request.status };
  }

  /** Get shift requests for a shift (client/admin view). */
  @Get('shifts/:shiftId/requests')
  @RequirePermission('shift-requests:read')
  async listRequestsByShift(
    @Param('shiftId') shiftId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const requests = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.requestRepo.listByShift(tx, shiftId);
    });

    return { data: requests, total: requests.length };
  }

  /** Get shift requests for a worker. */
  @Get('workers/:workerId/requests')
  @RequirePermission('shift-requests:read')
  async listRequestsByWorker(
    @Param('workerId') workerId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const requests = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.requestRepo.listByWorker(tx, workerId);
    });

    return { data: requests, total: requests.length };
  }

  /** Confirm a shift request (creates assignment atomically). */
  @Post('requests/:requestId/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shift-requests:confirm')
  async confirmRequest(
    @Param('requestId') requestId: string,
    @Body() dto: ConfirmRequestDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const request = await this.requestRepo.getShiftRequestById(tx, requestId);
      if (!request) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (request.version !== dto.expectedVersion) {
        return { error: 'VERSION_CONFLICT', currentVersion: request.version } as const;
      }
      if (request.status !== 'REQUESTED' && request.status !== 'UNDER_REVIEW') {
        return {
          error: 'INVALID_STATUS',
          message: `Cannot confirm from ${request.status}`,
        } as const;
      }

      // Check shift capacity atomically
      const shift = await this.shiftRepo.getShiftById(tx, request.shiftId);
      if (!shift) {
        return { error: 'SHIFT_NOT_FOUND' } as const;
      }
      if (shift.filledWorkerCount >= shift.requiredWorkerCount) {
        return { error: 'SHIFT_FULL' } as const;
      }

      // Confirm request
      const confirmed = confirmShiftRequest(request, principal.subject);
      await this.requestRepo.updateShiftRequest(tx, confirmed);

      // Create assignment
      const assignment = createAssignment({
        tenantId: principal.selectedTenantId,
        shiftId: request.shiftId,
        workerId: request.workerId,
        shiftRequestId: request.id,
        confirmedBy: principal.subject,
      });
      await this.assignmentRepo.createAssignment(tx, assignment);

      // Increment shift fill count atomically
      await this.shiftRepo.incrementFilledCount(tx, request.shiftId, shift.version);

      // Audit
      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'shift_request.confirmed',
        resourceType: 'shift_request',
        resourceId: requestId,
        details: { assignmentId: assignment.id, shiftId: request.shiftId },
        createdAt: new Date(),
      });

      return { request: confirmed, assignment };
    });

    if ('error' in result) {
      switch (result.error) {
        case 'NOT_FOUND':
        case 'SHIFT_NOT_FOUND':
          throw new NotFoundException('Not found');
        case 'VERSION_CONFLICT':
          throw new ConflictException({
            error: 'VERSION_CONFLICT',
            currentVersion: result.currentVersion,
          });
        case 'INVALID_STATUS':
          throw new UnprocessableEntityException(result.message);
        case 'SHIFT_FULL':
          throw new UnprocessableEntityException('Shift is fully staffed');
      }
    }

    return {
      requestId: result.request.id,
      requestStatus: result.request.status,
      assignmentId: result.assignment.id,
      assignmentStatus: result.assignment.status,
    };
  }

  /** Reject a shift request. */
  @Post('requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shift-requests:reject')
  async rejectRequest(
    @Param('requestId') requestId: string,
    @Body() dto: RejectRequestDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const request = await this.requestRepo.getShiftRequestById(tx, requestId);
      if (!request) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (request.version !== dto.expectedVersion) {
        return { error: 'VERSION_CONFLICT', currentVersion: request.version } as const;
      }

      const rejected = rejectShiftRequest(request, principal.subject, dto.reason);
      await this.requestRepo.updateShiftRequest(tx, rejected);

      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'shift_request.rejected',
        resourceType: 'shift_request',
        resourceId: requestId,
        details: { reason: dto.reason },
        createdAt: new Date(),
      });

      return { request: rejected };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        throw new NotFoundException('Request not found');
      }
      throw new ConflictException({
        error: 'VERSION_CONFLICT',
        currentVersion: result.currentVersion,
      });
    }

    return { id: result.request.id, status: result.request.status };
  }

  /** Withdraw a shift request (worker-initiated). */
  @Post('requests/:requestId/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('shift-requests:withdraw')
  async withdrawRequest(
    @Param('requestId') requestId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const request = await this.requestRepo.getShiftRequestById(tx, requestId);
      if (!request) {
        return { error: 'NOT_FOUND' } as const;
      }

      const withdrawn = withdrawShiftRequest(request);
      await this.requestRepo.updateShiftRequest(tx, withdrawn);

      return { request: withdrawn };
    });

    if ('error' in result) {
      throw new NotFoundException('Request not found');
    }

    return { id: result.request.id, status: result.request.status };
  }
}
