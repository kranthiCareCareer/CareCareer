import type { TransactionClient } from '@carecareer/database';

import type { ShiftRequest } from '../../domain/shift-request.js';

/**
 * Shift request repository port.
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface ShiftRequestRepository {
  createShiftRequest(tx: TransactionClient, request: ShiftRequest): Promise<void>;
  getShiftRequestById(tx: TransactionClient, requestId: string): Promise<ShiftRequest | null>;
  updateShiftRequest(tx: TransactionClient, request: ShiftRequest): Promise<void>;
  listByShift(tx: TransactionClient, shiftId: string): Promise<ShiftRequest[]>;
  listByWorker(tx: TransactionClient, workerId: string): Promise<ShiftRequest[]>;
  hasActiveRequest(tx: TransactionClient, shiftId: string, workerId: string): Promise<boolean>;
}
