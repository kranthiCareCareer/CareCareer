import type { TransactionClient } from '@carecareer/database';

import type { ShiftRequestRepository } from '../application/ports/shift-request-repository.js';
import type { ShiftRequest } from '../domain/shift-request.js';
import { VersionConflictError } from '../domain/errors.js';

/**
 * PostgreSQL implementation of the ShiftRequestRepository port.
 * All queries run within a tenant-scoped transaction (RLS enforced).
 */
export class PostgresShiftRequestRepository implements ShiftRequestRepository {
  async createShiftRequest(tx: TransactionClient, request: ShiftRequest): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.shift_requests (
        id, tenant_id, shift_id, worker_id, status,
        submitted_at, reviewed_at, reviewed_by, rejection_reason,
        withdrawn_at, expires_at, version, created_at, updated_at
      ) VALUES (
        ${request.id}::uuid, ${request.tenantId}::uuid,
        ${request.shiftId}::uuid, ${request.workerId}::uuid,
        ${request.status}, ${request.submittedAt.toISOString()}::timestamptz,
        ${request.reviewedAt?.toISOString() ?? null}::timestamptz,
        ${request.reviewedBy ?? null},
        ${request.rejectionReason ?? null},
        ${request.withdrawnAt?.toISOString() ?? null}::timestamptz,
        ${request.expiresAt?.toISOString() ?? null}::timestamptz,
        ${request.version},
        ${request.createdAt.toISOString()}::timestamptz,
        ${request.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getShiftRequestById(
    tx: TransactionClient,
    requestId: string,
  ): Promise<ShiftRequest | null> {
    const rows = await tx.$queryRaw<ShiftRequestRow>`
      SELECT * FROM staffing.shift_requests WHERE id = ${requestId}::uuid`;
    if (rows.length === 0) return null;
    return mapShiftRequest(rows[0]!);
  }

  async updateShiftRequest(tx: TransactionClient, request: ShiftRequest): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.shift_requests SET
        status = ${request.status},
        reviewed_at = ${request.reviewedAt?.toISOString() ?? null}::timestamptz,
        reviewed_by = ${request.reviewedBy ?? null},
        rejection_reason = ${request.rejectionReason ?? null},
        withdrawn_at = ${request.withdrawnAt?.toISOString() ?? null}::timestamptz,
        version = ${request.version},
        updated_at = ${request.updatedAt.toISOString()}::timestamptz
      WHERE id = ${request.id}::uuid AND version = ${request.version - 1}`;

    if (count === 0) {
      throw new VersionConflictError('shift_request', request.id);
    }
  }

  async listByShift(tx: TransactionClient, shiftId: string): Promise<ShiftRequest[]> {
    const rows = await tx.$queryRaw<ShiftRequestRow>`
      SELECT * FROM staffing.shift_requests
      WHERE shift_id = ${shiftId}::uuid
      ORDER BY submitted_at DESC`;
    return rows.map(mapShiftRequest);
  }

  async listByWorker(tx: TransactionClient, workerId: string): Promise<ShiftRequest[]> {
    const rows = await tx.$queryRaw<ShiftRequestRow>`
      SELECT * FROM staffing.shift_requests
      WHERE worker_id = ${workerId}::uuid
      ORDER BY submitted_at DESC`;
    return rows.map(mapShiftRequest);
  }

  async hasActiveRequest(
    tx: TransactionClient,
    shiftId: string,
    workerId: string,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ count: string }>`
      SELECT COUNT(*)::text as count FROM staffing.shift_requests
      WHERE shift_id = ${shiftId}::uuid
        AND worker_id = ${workerId}::uuid
        AND status IN ('REQUESTED', 'UNDER_REVIEW', 'CONFIRMED')`;
    return parseInt(rows[0]?.count ?? '0', 10) > 0;
  }
}

interface ShiftRequestRow {
  id: string;
  tenant_id: string;
  shift_id: string;
  worker_id: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  withdrawn_at: string | null;
  expires_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapShiftRequest(r: ShiftRequestRow): ShiftRequest {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    shiftId: r.shift_id,
    workerId: r.worker_id,
    status: r.status as ShiftRequest['status'],
    submittedAt: new Date(r.submitted_at),
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : undefined,
    reviewedBy: r.reviewed_by ?? undefined,
    rejectionReason: r.rejection_reason ?? undefined,
    withdrawnAt: r.withdrawn_at ? new Date(r.withdrawn_at) : undefined,
    expiresAt: r.expires_at ? new Date(r.expires_at) : undefined,
    version: r.version,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
