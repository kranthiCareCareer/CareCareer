import type { TransactionClient } from '@carecareer/database';

import type { ClockEvent, Timecard } from '../../domain/timekeeping.js';

/**
 * Timekeeping repository port.
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface TimekeepingRepository {
  createClockEvent(tx: TransactionClient, event: ClockEvent): Promise<void>;
  getClockEventsByAssignment(tx: TransactionClient, assignmentId: string): Promise<ClockEvent[]>;
  createTimecard(tx: TransactionClient, timecard: Timecard): Promise<void>;
  getTimecardById(tx: TransactionClient, timecardId: string): Promise<Timecard | null>;
  getTimecardByAssignment(tx: TransactionClient, assignmentId: string): Promise<Timecard | null>;
  updateTimecard(tx: TransactionClient, timecard: Timecard): Promise<void>;
  listTimecardsByWorker(tx: TransactionClient, workerId: string): Promise<Timecard[]>;
  listTimecards(
    tx: TransactionClient,
    filters?: { status?: string | undefined; workerId?: string | undefined },
  ): Promise<Timecard[]>;
}
