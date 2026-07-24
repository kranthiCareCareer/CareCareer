import type { TransactionClient } from '@carecareer/database';

import type { ShiftRepository } from '../application/ports/shift-repository.js';
import { VersionConflictError } from '../domain/errors.js';
import type { Shift } from '../domain/shift.js';

/**
 * PostgreSQL implementation of the ShiftRepository port.
 * All queries run within a tenant-scoped transaction (RLS enforced).
 */
export class PostgresShiftRepository implements ShiftRepository {
  async createShift(tx: TransactionClient, shift: Shift): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.shifts (
        id, tenant_id, facility_id, department_id, status, role,
        start_time, end_time, business_date, required_worker_count,
        filled_worker_count, pay_rate_cents, bill_rate_cents, notes,
        published_at, cancelled_at, cancellation_reason,
        version, created_by, created_at, updated_at
      ) VALUES (
        ${shift.id}::uuid, ${shift.tenantId}::uuid, ${shift.facilityId}::uuid,
        ${shift.departmentId ?? null}::uuid, ${shift.status}, ${shift.role},
        ${shift.startTime.toISOString()}::timestamptz,
        ${shift.endTime.toISOString()}::timestamptz,
        ${shift.businessDate}::date, ${shift.requiredWorkerCount},
        ${shift.filledWorkerCount}, ${shift.payRateCents}, ${shift.billRateCents},
        ${shift.notes ?? null},
        ${shift.publishedAt?.toISOString() ?? null}::timestamptz,
        ${shift.cancelledAt?.toISOString() ?? null}::timestamptz,
        ${shift.cancellationReason ?? null},
        ${shift.version}, ${shift.createdBy},
        ${shift.createdAt.toISOString()}::timestamptz,
        ${shift.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getShiftById(tx: TransactionClient, shiftId: string): Promise<Shift | null> {
    const rows = await tx.$queryRaw<ShiftRow>`
      SELECT * FROM staffing.shifts WHERE id = ${shiftId}::uuid`;
    if (rows.length === 0) return null;
    return mapShift(rows[0]!);
  }

  async updateShift(tx: TransactionClient, shift: Shift): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.shifts SET
        status = ${shift.status},
        filled_worker_count = ${shift.filledWorkerCount},
        notes = ${shift.notes ?? null},
        published_at = ${shift.publishedAt?.toISOString() ?? null}::timestamptz,
        cancelled_at = ${shift.cancelledAt?.toISOString() ?? null}::timestamptz,
        cancellation_reason = ${shift.cancellationReason ?? null},
        version = ${shift.version},
        updated_at = ${shift.updatedAt.toISOString()}::timestamptz
      WHERE id = ${shift.id}::uuid AND version = ${shift.version - 1}`;

    if (count === 0) {
      throw new VersionConflictError('shift', shift.id);
    }
  }

  async listShifts(
    tx: TransactionClient,
    filters?: {
      facilityId?: string | undefined;
      status?: string | undefined;
      role?: string | undefined;
      fromDate?: string | undefined;
      toDate?: string | undefined;
    },
  ): Promise<Shift[]> {
    // Build query conditionally — simple approach for clarity
    if (filters?.facilityId && filters.status) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts
        WHERE facility_id = ${filters.facilityId}::uuid AND status = ${filters.status}
        ORDER BY start_time`;
      return rows.map(mapShift);
    }
    if (filters?.facilityId) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts
        WHERE facility_id = ${filters.facilityId}::uuid
        ORDER BY start_time`;
      return rows.map(mapShift);
    }
    if (filters?.status) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts
        WHERE status = ${filters.status}
        ORDER BY start_time`;
      return rows.map(mapShift);
    }
    const rows = await tx.$queryRaw<ShiftRow>`
      SELECT * FROM staffing.shifts ORDER BY start_time`;
    return rows.map(mapShift);
  }

  async listPublishedShifts(
    tx: TransactionClient,
    filters?: {
      facilityId?: string | undefined;
      role?: string | undefined;
      fromDate?: string | undefined;
      toDate?: string | undefined;
    },
  ): Promise<Shift[]> {
    if (filters?.facilityId && filters.role) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts
        WHERE status IN ('PUBLISHED', 'PARTIALLY_FILLED')
          AND facility_id = ${filters.facilityId}::uuid
          AND role = ${filters.role}
          AND start_time > NOW()
        ORDER BY start_time`;
      return rows.map(mapShift);
    }
    if (filters?.facilityId) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts
        WHERE status IN ('PUBLISHED', 'PARTIALLY_FILLED')
          AND facility_id = ${filters.facilityId}::uuid
          AND start_time > NOW()
        ORDER BY start_time`;
      return rows.map(mapShift);
    }
    if (filters?.role) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts
        WHERE status IN ('PUBLISHED', 'PARTIALLY_FILLED')
          AND role = ${filters.role}
          AND start_time > NOW()
        ORDER BY start_time`;
      return rows.map(mapShift);
    }
    const rows = await tx.$queryRaw<ShiftRow>`
      SELECT * FROM staffing.shifts
      WHERE status IN ('PUBLISHED', 'PARTIALLY_FILLED')
        AND start_time > NOW()
      ORDER BY start_time`;
    return rows.map(mapShift);
  }

  async incrementFilledCount(
    tx: TransactionClient,
    shiftId: string,
    expectedVersion: number,
  ): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.shifts SET
        filled_worker_count = filled_worker_count + 1,
        status = CASE
          WHEN filled_worker_count + 1 >= required_worker_count THEN 'FILLED'
          WHEN filled_worker_count + 1 > 0 THEN 'PARTIALLY_FILLED'
          ELSE status
        END,
        version = version + 1,
        updated_at = NOW()
      WHERE id = ${shiftId}::uuid
        AND version = ${expectedVersion}
        AND filled_worker_count < required_worker_count`;

    if (count === 0) {
      throw new VersionConflictError('shift', shiftId);
    }
  }

  async decrementFilledCount(tx: TransactionClient, shiftId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE staffing.shifts SET
        filled_worker_count = GREATEST(filled_worker_count - 1, 0),
        status = CASE
          WHEN filled_worker_count - 1 <= 0 THEN 'PUBLISHED'
          ELSE 'PARTIALLY_FILLED'
        END,
        version = version + 1,
        updated_at = NOW()
      WHERE id = ${shiftId}::uuid AND filled_worker_count > 0`;
  }
}

interface ShiftRow {
  id: string;
  tenant_id: string;
  facility_id: string;
  department_id: string | null;
  status: string;
  role: string;
  start_time: string;
  end_time: string;
  business_date: string;
  required_worker_count: number;
  filled_worker_count: number;
  pay_rate_cents: number;
  bill_rate_cents: number;
  notes: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapShift(r: ShiftRow): Shift {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    facilityId: r.facility_id,
    departmentId: r.department_id ?? undefined,
    status: r.status as Shift['status'],
    role: r.role as Shift['role'],
    startTime: new Date(r.start_time),
    endTime: new Date(r.end_time),
    businessDate: r.business_date,
    requiredWorkerCount: r.required_worker_count,
    filledWorkerCount: r.filled_worker_count,
    payRateCents: r.pay_rate_cents,
    billRateCents: r.bill_rate_cents,
    notes: r.notes ?? undefined,
    publishedAt: r.published_at ? new Date(r.published_at) : undefined,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at) : undefined,
    cancellationReason: r.cancellation_reason ?? undefined,
    version: r.version,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
