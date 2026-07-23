import type { TransactionClient } from '@carecareer/database';

import type { Shift } from '../domain/shift.js';
import { VersionConflictError } from '../domain/errors.js';

/**
 * Shift repository port.
 */
export interface ShiftRepository {
  createShift(tx: TransactionClient, shift: Shift): Promise<void>;
  getShiftById(tx: TransactionClient, shiftId: string): Promise<Shift | null>;
  listShifts(
    tx: TransactionClient,
    filters?: { status?: string; facilityId?: string },
  ): Promise<Shift[]>;
  updateShift(tx: TransactionClient, shift: Shift): Promise<void>;
}

/**
 * PostgreSQL shift repository implementation.
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
        ${shift.startTime.toISOString()}::timestamptz, ${shift.endTime.toISOString()}::timestamptz,
        ${shift.businessDate}::date, ${shift.requiredWorkerCount},
        ${shift.filledWorkerCount}, ${shift.payRateCents}, ${shift.billRateCents},
        ${shift.notes ?? null},
        ${shift.publishedAt?.toISOString() ?? null}::timestamptz,
        ${shift.cancelledAt?.toISOString() ?? null}::timestamptz,
        ${shift.cancellationReason ?? null},
        ${shift.version}, ${shift.createdBy},
        ${shift.createdAt.toISOString()}::timestamptz, ${shift.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getShiftById(tx: TransactionClient, shiftId: string): Promise<Shift | null> {
    const rows = await tx.$queryRaw<ShiftRow>`
      SELECT id, tenant_id, facility_id, department_id, status, role,
             start_time, end_time, business_date, required_worker_count,
             filled_worker_count, pay_rate_cents, bill_rate_cents, notes,
             published_at, cancelled_at, cancellation_reason,
             version, created_by, created_at, updated_at
      FROM staffing.shifts
      WHERE id = ${shiftId}::uuid`;

    if (rows.length === 0) return null;
    return this.mapRow(rows[0]!);
  }

  async listShifts(
    tx: TransactionClient,
    filters?: { status?: string; facilityId?: string },
  ): Promise<Shift[]> {
    if (filters?.status && filters?.facilityId) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts
        WHERE status = ${filters.status} AND facility_id = ${filters.facilityId}::uuid
        ORDER BY start_time ASC`;
      return rows.map((r) => this.mapRow(r));
    }
    if (filters?.status) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts WHERE status = ${filters.status} ORDER BY start_time ASC`;
      return rows.map((r) => this.mapRow(r));
    }
    if (filters?.facilityId) {
      const rows = await tx.$queryRaw<ShiftRow>`
        SELECT * FROM staffing.shifts WHERE facility_id = ${filters.facilityId}::uuid ORDER BY start_time ASC`;
      return rows.map((r) => this.mapRow(r));
    }
    const rows = await tx.$queryRaw<ShiftRow>`
      SELECT * FROM staffing.shifts ORDER BY start_time ASC`;
    return rows.map((r) => this.mapRow(r));
  }

  async updateShift(tx: TransactionClient, shift: Shift): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.shifts SET
        status = ${shift.status},
        filled_worker_count = ${shift.filledWorkerCount},
        published_at = ${shift.publishedAt?.toISOString() ?? null}::timestamptz,
        cancelled_at = ${shift.cancelledAt?.toISOString() ?? null}::timestamptz,
        cancellation_reason = ${shift.cancellationReason ?? null},
        notes = ${shift.notes ?? null},
        version = ${shift.version},
        updated_at = ${shift.updatedAt.toISOString()}::timestamptz
      WHERE id = ${shift.id}::uuid AND version = ${shift.version - 1}`;

    if (count === 0) {
      throw new VersionConflictError('shift', shift.id);
    }
  }

  private mapRow(row: ShiftRow): Shift {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      facilityId: row.facility_id,
      departmentId: row.department_id ?? undefined,
      status: row.status as Shift['status'],
      role: row.role as Shift['role'],
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
      businessDate: row.business_date,
      requiredWorkerCount: row.required_worker_count,
      filledWorkerCount: row.filled_worker_count,
      payRateCents: row.pay_rate_cents,
      billRateCents: row.bill_rate_cents,
      notes: row.notes ?? undefined,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
      cancellationReason: row.cancellation_reason ?? undefined,
      version: row.version,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
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
