/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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

import type { AssignmentRepository } from '../../application/ports/assignment-repository.js';
import type { AuditRepository } from '../../application/ports/audit-repository.js';
import type { ShiftRepository } from '../../application/ports/shift-repository.js';
import {
  cancelAssignment,
  checkInAssignment,
  completeAssignment,
} from '../../domain/assignment.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

interface CancelAssignmentDto {
  reason: string;
  expectedVersion: number;
}

@Controller('v1/assignments')
export class AssignmentController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    @Inject('ASSIGNMENT_REPOSITORY') private readonly assignmentRepo: AssignmentRepository,
    @Inject('SHIFT_REPOSITORY') private readonly shiftRepo: ShiftRepository,
    @Inject('AUDIT_REPOSITORY') private readonly auditRepo: AuditRepository,
  ) {}

  @Get(':assignmentId')
  @RequirePermission('assignments:read')
  async getById(
    @Param('assignmentId') assignmentId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const assignment = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.assignmentRepo.getAssignmentById(tx, assignmentId);
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Worker ownership: workers can only see their own assignments
    if (
      this.isWorkerRole(principal) &&
      assignment.workerId !== this.getWorkerIdForPrincipal(principal)
    ) {
      throw new ForbiddenException("Cannot access another worker's assignment");
    }

    return assignment;
  }

  @Get()
  @RequirePermission('assignments:read')
  async list(
    @Query('workerId') workerId: string | undefined,
    @Query('shiftId') shiftId: string | undefined,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const assignments = await this.db.execute(principal.selectedTenantId, async (tx) => {
      if (workerId) {
        return this.assignmentRepo.listByWorker(tx, workerId);
      }
      if (shiftId) {
        return this.assignmentRepo.listByShift(tx, shiftId);
      }
      return this.assignmentRepo.listByWorker(tx, principal.subject);
    });

    return { data: assignments, total: assignments.length };
  }

  @Post(':assignmentId/check-in')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('assignments:check-in')
  async checkIn(
    @Param('assignmentId') assignmentId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const assignment = await this.assignmentRepo.getAssignmentById(tx, assignmentId);
      if (!assignment) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (assignment.status !== 'CONFIRMED') {
        return {
          error: 'INVALID_STATUS',
          message: `Cannot check in from ${assignment.status}`,
        } as const;
      }

      const checkedIn = checkInAssignment(assignment);
      await this.assignmentRepo.updateAssignment(tx, checkedIn);

      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'assignment.checked_in',
        resourceType: 'assignment',
        resourceId: assignmentId,
        details: { shiftId: assignment.shiftId },
        createdAt: new Date(),
      });

      return { assignment: checkedIn };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        throw new NotFoundException('Assignment not found');
      }
      throw new ForbiddenException(result.message);
    }

    return { id: result.assignment.id, status: result.assignment.status };
  }

  @Post(':assignmentId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('assignments:complete')
  async complete(
    @Param('assignmentId') assignmentId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const assignment = await this.assignmentRepo.getAssignmentById(tx, assignmentId);
      if (!assignment) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (assignment.status !== 'CHECKED_IN') {
        return {
          error: 'INVALID_STATUS',
          message: `Cannot complete from ${assignment.status}`,
        } as const;
      }

      const completed = completeAssignment(assignment);
      await this.assignmentRepo.updateAssignment(tx, completed);

      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'assignment.completed',
        resourceType: 'assignment',
        resourceId: assignmentId,
        details: { shiftId: assignment.shiftId },
        createdAt: new Date(),
      });

      return { assignment: completed };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        throw new NotFoundException('Assignment not found');
      }
      throw new ForbiddenException(result.message);
    }

    return { id: result.assignment.id, status: result.assignment.status };
  }

  @Post(':assignmentId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('assignments:cancel')
  async cancel(
    @Param('assignmentId') assignmentId: string,
    @Body() dto: CancelAssignmentDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const assignment = await this.assignmentRepo.getAssignmentById(tx, assignmentId);
      if (!assignment) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (assignment.version !== dto.expectedVersion) {
        return { error: 'VERSION_CONFLICT', currentVersion: assignment.version } as const;
      }

      const cancelled = cancelAssignment(assignment, principal.subject, dto.reason);
      await this.assignmentRepo.updateAssignment(tx, cancelled);

      // Decrement shift fill count
      await this.shiftRepo.decrementFilledCount(tx, assignment.shiftId);

      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'assignment.cancelled',
        resourceType: 'assignment',
        resourceId: assignmentId,
        details: { reason: dto.reason, shiftId: assignment.shiftId },
        createdAt: new Date(),
      });

      return { assignment: cancelled };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        throw new NotFoundException('Assignment not found');
      }
      throw new ConflictException({
        error: 'VERSION_CONFLICT',
        currentVersion: result.currentVersion,
      });
    }

    return { id: result.assignment.id, status: result.assignment.status };
  }

  /** Check if the principal has worker role (not admin/client). */
  private isWorkerRole(principal: { subject: string }): boolean {
    // Workers have 'worker-' prefix in demo; in production check tenantMemberships
    return principal.subject.startsWith('worker-');
  }

  /** Map principal subject to worker ID for ownership checks. */
  private getWorkerIdForPrincipal(principal: { subject: string }): string {
    // In demo: worker-sarah maps to the seeded worker UUID
    // In production: look up worker by user_id from principal.subject
    const WORKER_MAP: Record<string, string> = {
      'worker-sarah': '00000000-0000-4000-a000-000000000020',
    };
    return WORKER_MAP[principal.subject] ?? '';
  }
}
