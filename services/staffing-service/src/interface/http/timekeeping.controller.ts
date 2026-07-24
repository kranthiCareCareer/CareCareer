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

import type { AssignmentRepository } from '../../application/ports/assignment-repository.js';
import type { AuditRepository } from '../../application/ports/audit-repository.js';
import type { NotificationRepository } from '../../application/ports/notification-repository.js';
import type { TimekeepingRepository } from '../../application/ports/timekeeping-repository.js';
import {
  createClockEvent,
  createTimecard,
  calculateTimecardFromEvents,
  submitTimecard,
  approveTimecard,
  rejectTimecard,
} from '../../domain/timekeeping.js';
import type { ClockEventType } from '../../domain/timekeeping.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { createNotificationForEvent } from '../../infrastructure/notification-worker.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

interface ClockEventDto {
  assignmentId: string;
  eventType: ClockEventType;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

interface SubmitTimecardDto {
  assignmentId: string;
}

interface ApproveTimecardDto {
  expectedVersion: number;
}

interface RejectTimecardDto {
  reason: string;
  expectedVersion: number;
}

@Controller('v1/timekeeping')
export class TimekeepingController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    @Inject('TIMEKEEPING_REPOSITORY') private readonly timekeepingRepo: TimekeepingRepository,
    @Inject('ASSIGNMENT_REPOSITORY') private readonly assignmentRepo: AssignmentRepository,
    @Inject('AUDIT_REPOSITORY') private readonly auditRepo: AuditRepository,
    @Inject('NOTIFICATION_REPOSITORY') private readonly notificationRepo: NotificationRepository,
  ) {}

  /** Record a clock event (clock-in, break-start, break-end, clock-out). */
  @Post('clock-events')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('timekeeping:clock')
  async recordClockEvent(@Body() dto: ClockEventDto, @Req() req: AuthenticatedStaffingRequest) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      // Verify assignment exists
      const assignment = await this.assignmentRepo.getAssignmentById(tx, dto.assignmentId);
      if (!assignment) {
        return { error: 'ASSIGNMENT_NOT_FOUND' } as const;
      }
      if (assignment.status !== 'CONFIRMED' && assignment.status !== 'CHECKED_IN') {
        return {
          error: 'INVALID_ASSIGNMENT_STATUS',
          message: `Assignment is ${assignment.status}`,
        } as const;
      }

      // Get existing events
      const existingEvents = await this.timekeepingRepo.getClockEventsByAssignment(
        tx,
        dto.assignmentId,
      );

      // Create event (validates sequence)
      const event = createClockEvent(
        {
          tenantId: principal.selectedTenantId,
          assignmentId: dto.assignmentId,
          workerId: assignment.workerId,
          eventType: dto.eventType,
          latitude: dto.latitude,
          longitude: dto.longitude,
          notes: dto.notes,
        },
        existingEvents,
      );

      await this.timekeepingRepo.createClockEvent(tx, event);

      // Audit
      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: `timekeeping.${dto.eventType.toLowerCase()}`,
        resourceType: 'clock_event',
        resourceId: event.id,
        details: { assignmentId: dto.assignmentId, eventType: dto.eventType },
        createdAt: new Date(),
      });

      return { event };
    });

    if ('error' in result) {
      if (result.error === 'ASSIGNMENT_NOT_FOUND') {
        return { statusCode: 404, message: 'Assignment not found' };
      }
      return { statusCode: 422, message: result.message };
    }

    return {
      id: result.event.id,
      eventType: result.event.eventType,
      occurredAt: result.event.occurredAt,
    };
  }

  /** Get clock events for an assignment. */
  @Get('assignments/:assignmentId/events')
  @RequirePermission('timekeeping:read')
  async getClockEvents(
    @Param('assignmentId') assignmentId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const events = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.timekeepingRepo.getClockEventsByAssignment(tx, assignmentId);
    });

    return { data: events, total: events.length };
  }

  /** Submit a timecard for approval (calculates from clock events). */
  @Post('timecards/submit')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('timekeeping:submit')
  async submitTimecardForApproval(
    @Body() dto: SubmitTimecardDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const assignment = await this.assignmentRepo.getAssignmentById(tx, dto.assignmentId);
      if (!assignment) {
        return { error: 'ASSIGNMENT_NOT_FOUND' } as const;
      }

      // Get clock events
      const events = await this.timekeepingRepo.getClockEventsByAssignment(tx, dto.assignmentId);
      const clockIn = events.find((e) => e.eventType === 'CLOCK_IN');
      const clockOut = events.find((e) => e.eventType === 'CLOCK_OUT');

      if (!clockIn || !clockOut) {
        return {
          error: 'INCOMPLETE_EVENTS',
          message: 'Clock-in and clock-out required before submitting timecard',
        } as const;
      }

      // Check if timecard already exists
      let timecard = await this.timekeepingRepo.getTimecardByAssignment(tx, dto.assignmentId);

      if (!timecard) {
        timecard = createTimecard({
          tenantId: principal.selectedTenantId,
          assignmentId: dto.assignmentId,
          workerId: assignment.workerId,
          shiftId: assignment.shiftId,
        });
        timecard = calculateTimecardFromEvents(timecard, events);
        timecard = submitTimecard(timecard);
        await this.timekeepingRepo.createTimecard(tx, timecard);
      } else {
        timecard = calculateTimecardFromEvents(timecard, events);
        timecard = submitTimecard(timecard);
        await this.timekeepingRepo.updateTimecard(tx, timecard);
      }

      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'timecard.submitted',
        resourceType: 'timecard',
        resourceId: timecard.id,
        details: {
          assignmentId: dto.assignmentId,
          totalHoursWorked: timecard.totalHoursWorked,
          totalBreakMinutes: timecard.totalBreakMinutes,
        },
        createdAt: new Date(),
      });

      return { timecard };
    });

    if ('error' in result) {
      if (result.error === 'ASSIGNMENT_NOT_FOUND') {
        return { statusCode: 404, message: 'Assignment not found' };
      }
      return { statusCode: 422, message: result.message };
    }

    return {
      id: result.timecard.id,
      status: result.timecard.status,
      totalHoursWorked: result.timecard.totalHoursWorked,
      totalBreakMinutes: result.timecard.totalBreakMinutes,
    };
  }

  /** Approve a timecard. */
  @Post('timecards/:timecardId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timekeeping:approve')
  async approve(
    @Param('timecardId') timecardId: string,
    @Body() dto: ApproveTimecardDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const timecard = await this.timekeepingRepo.getTimecardById(tx, timecardId);
      if (!timecard) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (timecard.version !== dto.expectedVersion) {
        return { error: 'VERSION_CONFLICT', currentVersion: timecard.version } as const;
      }

      const approved = approveTimecard(timecard, principal.subject);
      await this.timekeepingRepo.updateTimecard(tx, approved);

      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'timecard.approved',
        resourceType: 'timecard',
        resourceId: timecardId,
        details: { totalHoursWorked: timecard.totalHoursWorked },
        createdAt: new Date(),
      });

      // Notification to worker
      const notification = createNotificationForEvent(
        principal.selectedTenantId,
        timecard.workerId,
        'timecard.approved',
        { timecardId, totalHoursWorked: timecard.totalHoursWorked },
      );
      await this.notificationRepo.createNotification(tx, notification);

      return { timecard: approved };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        throw new NotFoundException('Timecard not found');
      }
      throw new ConflictException({
        error: 'VERSION_CONFLICT',
        currentVersion: result.currentVersion,
      });
    }

    return { id: result.timecard.id, status: result.timecard.status };
  }

  /** Reject a timecard. */
  @Post('timecards/:timecardId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timekeeping:reject')
  async reject(
    @Param('timecardId') timecardId: string,
    @Body() dto: RejectTimecardDto,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const timecard = await this.timekeepingRepo.getTimecardById(tx, timecardId);
      if (!timecard) {
        return { error: 'NOT_FOUND' } as const;
      }
      if (timecard.version !== dto.expectedVersion) {
        return { error: 'VERSION_CONFLICT', currentVersion: timecard.version } as const;
      }

      const rejected = rejectTimecard(timecard, principal.subject, dto.reason);
      await this.timekeepingRepo.updateTimecard(tx, rejected);

      await this.auditRepo.createEntry(tx, {
        id: crypto.randomUUID(),
        tenantId: principal.selectedTenantId,
        actorId: principal.subject,
        actorType: 'USER',
        action: 'timecard.rejected',
        resourceType: 'timecard',
        resourceId: timecardId,
        details: { reason: dto.reason },
        createdAt: new Date(),
      });

      return { timecard: rejected };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        return { statusCode: 404, message: 'Timecard not found' };
      }
      return {
        statusCode: 409,
        error: 'VERSION_CONFLICT',
        currentVersion: result.currentVersion,
      };
    }

    return { id: result.timecard.id, status: result.timecard.status };
  }

  /** List timecards (admin/client view). */
  @Get('timecards')
  @RequirePermission('timekeeping:read')
  async listTimecards(
    @Query('status') status: string | undefined,
    @Query('workerId') workerId: string | undefined,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const timecards = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.timekeepingRepo.listTimecards(tx, { status, workerId });
    });

    return { data: timecards, total: timecards.length };
  }

  /** Get a specific timecard. */
  @Get('timecards/:timecardId')
  @RequirePermission('timekeeping:read')
  async getTimecard(
    @Param('timecardId') timecardId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const timecard = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.timekeepingRepo.getTimecardById(tx, timecardId);
    });

    if (!timecard) {
      return { statusCode: 404, message: 'Timecard not found' };
    }

    return timecard;
  }
}
