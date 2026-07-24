import type { TransactionClient } from '@carecareer/database';

import type { Assignment } from '../../domain/assignment.js';

/**
 * Assignment repository port.
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface AssignmentRepository {
  createAssignment(tx: TransactionClient, assignment: Assignment): Promise<void>;
  getAssignmentById(tx: TransactionClient, assignmentId: string): Promise<Assignment | null>;
  updateAssignment(tx: TransactionClient, assignment: Assignment): Promise<void>;
  listByShift(tx: TransactionClient, shiftId: string): Promise<Assignment[]>;
  listByWorker(tx: TransactionClient, workerId: string): Promise<Assignment[]>;
  getActiveByShiftAndWorker(
    tx: TransactionClient,
    shiftId: string,
    workerId: string,
  ): Promise<Assignment | null>;
  countActiveByShift(tx: TransactionClient, shiftId: string): Promise<number>;
}
