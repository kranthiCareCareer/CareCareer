import type { TransactionClient } from '@carecareer/database';

import type { Shift } from '../../domain/shift.js';

/**
 * Shift repository port.
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface ShiftRepository {
  createShift(tx: TransactionClient, shift: Shift): Promise<void>;
  getShiftById(tx: TransactionClient, shiftId: string): Promise<Shift | null>;
  updateShift(tx: TransactionClient, shift: Shift): Promise<void>;
  listShifts(
    tx: TransactionClient,
    filters?: {
      facilityId?: string | undefined;
      status?: string | undefined;
      role?: string | undefined;
      fromDate?: string | undefined;
      toDate?: string | undefined;
    },
  ): Promise<Shift[]>;
  listPublishedShifts(
    tx: TransactionClient,
    filters?: {
      facilityId?: string | undefined;
      role?: string | undefined;
      fromDate?: string | undefined;
      toDate?: string | undefined;
    },
  ): Promise<Shift[]>;
  incrementFilledCount(
    tx: TransactionClient,
    shiftId: string,
    expectedVersion: number,
  ): Promise<void>;
  decrementFilledCount(tx: TransactionClient, shiftId: string): Promise<void>;
}
