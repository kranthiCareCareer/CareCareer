import type { TransactionClient } from '@carecareer/database';

import type { AssignmentRepository } from '../application/ports/assignment-repository.js';
import type { Assignment } from '../domain/assignment.js';
import { VersionConflictError } from '../domain/errors.js';

/**
 * PostgreSQL implementation of the AssignmentRepository port.
 * All queries run within a tenant-scoped transaction (RLS enforced).
 */
export class PostgresAssignmentRepository implements AssignmentRepository {
  async createAssignment(tx: TransactionClient, assignment: Assignment): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.assignments (
        id, tenant_id, shift_id, worker_id, shift_request_id, status,
        confirmed_at, confirmed_by, checked_in_at, checked_out_at,
        cancelled_at, cancellation_reason, cancelled_by, no_show_at, completed_at,
        version, created_at, updated_at
      ) VALUES (
        ${assignment.id}::uuid, ${assignment.tenantId}::uuid,
        ${assignment.shiftId}::uuid, ${assignment.workerId}::uuid,
        ${assignment.shiftRequestId ?? null}::uuid, ${assignment.status},
        ${assignment.confirmedAt.toISOString()}::timestamptz,
        ${assignment.confirmedBy},
        ${assignment.checkedInAt?.toISOString() ?? null}::timestamptz,
        ${assignment.checkedOutAt?.toISOString() ?? null}::timestamptz,
        ${assignment.cancelledAt?.toISOString() ?? null}::timestamptz,
        ${assignment.cancellationReason ?? null},
        ${assignment.cancelledBy ?? null},
        ${assignment.noShowAt?.toISOString() ?? null}::timestamptz,
        ${assignment.completedAt?.toISOString() ?? null}::timestamptz,
        ${assignment.version},
        ${assignment.createdAt.toISOString()}::timestamptz,
        ${assignment.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getAssignmentById(
    tx: TransactionClient,
    assignmentId: string,
  ): Promise<Assignment | null> {
    const rows = await tx.$queryRaw<AssignmentRow>`
      SELECT * FROM staffing.assignments WHERE id = ${assignmentId}::uuid`;
    if (rows.length === 0) return null;
    return mapAssignment(rows[0]!);
  }

  async updateAssignment(tx: TransactionClient, assignment: Assignment): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.assignments SET
        status = ${assignment.status},
        checked_in_at = ${assignment.checkedInAt?.toISOString() ?? null}::timestamptz,
        checked_out_at = ${assignment.checkedOutAt?.toISOString() ?? null}::timestamptz,
        cancelled_at = ${assignment.cancelledAt?.toISOString() ?? null}::timestamptz,
        cancellation_reason = ${assignment.cancellationReason ?? null},
        cancelled_by = ${assignment.cancelledBy ?? null},
        no_show_at = ${assignment.noShowAt?.toISOString() ?? null}::timestamptz,
        completed_at = ${assignment.completedAt?.toISOString() ?? null}::timestamptz,
        version = ${assignment.version},
        updated_at = ${assignment.updatedAt.toISOString()}::timestamptz
      WHERE id = ${assignment.id}::uuid AND version = ${assignment.version - 1}`;

    if (count === 0) {
      throw new VersionConflictError('assignment', assignment.id);
    }
  }

  async listByShift(tx: TransactionClient, shiftId: string): Promise<Assignment[]> {
    const rows = await tx.$queryRaw<AssignmentRow>`
      SELECT * FROM staffing.assignments
      WHERE shift_id = ${shiftId}::uuid
      ORDER BY confirmed_at DESC`;
    return rows.map(mapAssignment);
  }

  async listByWorker(tx: TransactionClient, workerId: string): Promise<Assignment[]> {
    const rows = await tx.$queryRaw<AssignmentRow>`
      SELECT * FROM staffing.assignments
      WHERE worker_id = ${workerId}::uuid
      ORDER BY confirmed_at DESC`;
    return rows.map(mapAssignment);
  }

  async getActiveByShiftAndWorker(
    tx: TransactionClient,
    shiftId: string,
    workerId: string,
  ): Promise<Assignment | null> {
    const rows = await tx.$queryRaw<AssignmentRow>`
      SELECT * FROM staffing.assignments
      WHERE shift_id = ${shiftId}::uuid
        AND worker_id = ${workerId}::uuid
        AND status IN ('CONFIRMED', 'CHECKED_IN')
      LIMIT 1`;
    if (rows.length === 0) return null;
    return mapAssignment(rows[0]!);
  }

  async countActiveByShift(tx: TransactionClient, shiftId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ count: string }>`
      SELECT COUNT(*)::text as count FROM staffing.assignments
      WHERE shift_id = ${shiftId}::uuid
        AND status IN ('CONFIRMED', 'CHECKED_IN')`;
    return parseInt(rows[0]?.count ?? '0', 10);
  }
}

interface AssignmentRow {
  id: string;
  tenant_id: string;
  shift_id: string;
  worker_id: string;
  shift_request_id: string | null;
  status: string;
  confirmed_at: string;
  confirmed_by: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  no_show_at: string | null;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapAssignment(r: AssignmentRow): Assignment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    shiftId: r.shift_id,
    workerId: r.worker_id,
    shiftRequestId: r.shift_request_id ?? undefined,
    status: r.status as Assignment['status'],
    confirmedAt: new Date(r.confirmed_at),
    confirmedBy: r.confirmed_by,
    checkedInAt: r.checked_in_at ? new Date(r.checked_in_at) : undefined,
    checkedOutAt: r.checked_out_at ? new Date(r.checked_out_at) : undefined,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at) : undefined,
    cancellationReason: r.cancellation_reason ?? undefined,
    cancelledBy: r.cancelled_by ?? undefined,
    noShowAt: r.no_show_at ? new Date(r.no_show_at) : undefined,
    completedAt: r.completed_at ? new Date(r.completed_at) : undefined,
    version: r.version,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
