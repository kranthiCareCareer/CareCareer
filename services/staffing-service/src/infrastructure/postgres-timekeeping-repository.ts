import type { TransactionClient } from '@carecareer/database';

import type { TimekeepingRepository } from '../application/ports/timekeeping-repository.js';
import { VersionConflictError } from '../domain/errors.js';
import type { ClockEvent, Timecard } from '../domain/timekeeping.js';

/**
 * PostgreSQL implementation of the TimekeepingRepository port.
 * All queries run within a tenant-scoped transaction (RLS enforced).
 */
export class PostgresTimekeepingRepository implements TimekeepingRepository {
  async createClockEvent(tx: TransactionClient, event: ClockEvent): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.clock_events (
        id, tenant_id, assignment_id, worker_id, event_type,
        occurred_at, latitude, longitude, notes, created_at
      ) VALUES (
        ${event.id}::uuid, ${event.tenantId}::uuid,
        ${event.assignmentId}::uuid, ${event.workerId}::uuid,
        ${event.eventType}, ${event.occurredAt.toISOString()}::timestamptz,
        ${event.latitude ?? null}::decimal, ${event.longitude ?? null}::decimal,
        ${event.notes ?? null}, ${event.createdAt.toISOString()}::timestamptz
      )`;
  }

  async getClockEventsByAssignment(
    tx: TransactionClient,
    assignmentId: string,
  ): Promise<ClockEvent[]> {
    const rows = await tx.$queryRaw<ClockEventRow>`
      SELECT * FROM staffing.clock_events
      WHERE assignment_id = ${assignmentId}::uuid
      ORDER BY occurred_at`;
    return rows.map(mapClockEvent);
  }

  async createTimecard(tx: TransactionClient, timecard: Timecard): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.timecards (
        id, tenant_id, assignment_id, worker_id, shift_id, status,
        clock_in_at, clock_out_at, total_hours_worked, total_break_minutes,
        submitted_at, approved_at, approved_by, rejected_at, rejected_by,
        rejection_reason, version, created_at, updated_at
      ) VALUES (
        ${timecard.id}::uuid, ${timecard.tenantId}::uuid,
        ${timecard.assignmentId}::uuid, ${timecard.workerId}::uuid,
        ${timecard.shiftId}::uuid, ${timecard.status},
        ${timecard.clockInAt?.toISOString() ?? null}::timestamptz,
        ${timecard.clockOutAt?.toISOString() ?? null}::timestamptz,
        ${timecard.totalHoursWorked ?? null}::decimal,
        ${timecard.totalBreakMinutes},
        ${timecard.submittedAt?.toISOString() ?? null}::timestamptz,
        ${timecard.approvedAt?.toISOString() ?? null}::timestamptz,
        ${timecard.approvedBy ?? null},
        ${timecard.rejectedAt?.toISOString() ?? null}::timestamptz,
        ${timecard.rejectedBy ?? null},
        ${timecard.rejectionReason ?? null},
        ${timecard.version},
        ${timecard.createdAt.toISOString()}::timestamptz,
        ${timecard.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getTimecardById(tx: TransactionClient, timecardId: string): Promise<Timecard | null> {
    const rows = await tx.$queryRaw<TimecardRow>`
      SELECT * FROM staffing.timecards WHERE id = ${timecardId}::uuid`;
    if (rows.length === 0) return null;
    return mapTimecard(rows[0]!);
  }

  async getTimecardByAssignment(
    tx: TransactionClient,
    assignmentId: string,
  ): Promise<Timecard | null> {
    const rows = await tx.$queryRaw<TimecardRow>`
      SELECT * FROM staffing.timecards WHERE assignment_id = ${assignmentId}::uuid LIMIT 1`;
    if (rows.length === 0) return null;
    return mapTimecard(rows[0]!);
  }

  async updateTimecard(tx: TransactionClient, timecard: Timecard): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.timecards SET
        status = ${timecard.status},
        clock_in_at = ${timecard.clockInAt?.toISOString() ?? null}::timestamptz,
        clock_out_at = ${timecard.clockOutAt?.toISOString() ?? null}::timestamptz,
        total_hours_worked = ${timecard.totalHoursWorked ?? null}::decimal,
        total_break_minutes = ${timecard.totalBreakMinutes},
        submitted_at = ${timecard.submittedAt?.toISOString() ?? null}::timestamptz,
        approved_at = ${timecard.approvedAt?.toISOString() ?? null}::timestamptz,
        approved_by = ${timecard.approvedBy ?? null},
        rejected_at = ${timecard.rejectedAt?.toISOString() ?? null}::timestamptz,
        rejected_by = ${timecard.rejectedBy ?? null},
        rejection_reason = ${timecard.rejectionReason ?? null},
        version = ${timecard.version},
        updated_at = ${timecard.updatedAt.toISOString()}::timestamptz
      WHERE id = ${timecard.id}::uuid AND version = ${timecard.version - 1}`;

    if (count === 0) {
      throw new VersionConflictError('timecard', timecard.id);
    }
  }

  async listTimecardsByWorker(tx: TransactionClient, workerId: string): Promise<Timecard[]> {
    const rows = await tx.$queryRaw<TimecardRow>`
      SELECT * FROM staffing.timecards
      WHERE worker_id = ${workerId}::uuid
      ORDER BY created_at DESC`;
    return rows.map(mapTimecard);
  }

  async listTimecards(
    tx: TransactionClient,
    filters?: { status?: string | undefined; workerId?: string | undefined },
  ): Promise<Timecard[]> {
    if (filters?.status && filters.workerId) {
      const rows = await tx.$queryRaw<TimecardRow>`
        SELECT * FROM staffing.timecards
        WHERE status = ${filters.status} AND worker_id = ${filters.workerId}::uuid
        ORDER BY created_at DESC`;
      return rows.map(mapTimecard);
    }
    if (filters?.status) {
      const rows = await tx.$queryRaw<TimecardRow>`
        SELECT * FROM staffing.timecards
        WHERE status = ${filters.status}
        ORDER BY created_at DESC`;
      return rows.map(mapTimecard);
    }
    if (filters?.workerId) {
      const rows = await tx.$queryRaw<TimecardRow>`
        SELECT * FROM staffing.timecards
        WHERE worker_id = ${filters.workerId}::uuid
        ORDER BY created_at DESC`;
      return rows.map(mapTimecard);
    }
    const rows = await tx.$queryRaw<TimecardRow>`
      SELECT * FROM staffing.timecards ORDER BY created_at DESC`;
    return rows.map(mapTimecard);
  }
}

interface ClockEventRow {
  id: string;
  tenant_id: string;
  assignment_id: string;
  worker_id: string;
  event_type: string;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_at: string;
}

interface TimecardRow {
  id: string;
  tenant_id: string;
  assignment_id: string;
  worker_id: string;
  shift_id: string;
  status: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  total_hours_worked: number | null;
  total_break_minutes: number;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapClockEvent(r: ClockEventRow): ClockEvent {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    assignmentId: r.assignment_id,
    workerId: r.worker_id,
    eventType: r.event_type as ClockEvent['eventType'],
    occurredAt: new Date(r.occurred_at),
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: new Date(r.created_at),
  };
}

function mapTimecard(r: TimecardRow): Timecard {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    assignmentId: r.assignment_id,
    workerId: r.worker_id,
    shiftId: r.shift_id,
    status: r.status as Timecard['status'],
    clockInAt: r.clock_in_at ? new Date(r.clock_in_at) : undefined,
    clockOutAt: r.clock_out_at ? new Date(r.clock_out_at) : undefined,
    totalHoursWorked: r.total_hours_worked ?? undefined,
    totalBreakMinutes: r.total_break_minutes,
    submittedAt: r.submitted_at ? new Date(r.submitted_at) : undefined,
    approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
    approvedBy: r.approved_by ?? undefined,
    rejectedAt: r.rejected_at ? new Date(r.rejected_at) : undefined,
    rejectedBy: r.rejected_by ?? undefined,
    rejectionReason: r.rejection_reason ?? undefined,
    version: r.version,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
