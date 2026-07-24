/**
 * Assignment domain entity.
 *
 * Represents a confirmed worker-to-shift assignment.
 * State machine: CONFIRMED → CHECKED_IN → COMPLETED | CANCELLED | NO_SHOW
 */

export type AssignmentStatus = 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Assignment {
  readonly id: string;
  readonly tenantId: string;
  readonly shiftId: string;
  readonly workerId: string;
  readonly shiftRequestId?: string | undefined;
  readonly status: AssignmentStatus;
  readonly confirmedAt: Date;
  readonly confirmedBy: string;
  readonly checkedInAt?: Date | undefined;
  readonly checkedOutAt?: Date | undefined;
  readonly cancelledAt?: Date | undefined;
  readonly cancellationReason?: string | undefined;
  readonly cancelledBy?: string | undefined;
  readonly noShowAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const VALID_ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export interface CreateAssignmentInput {
  readonly tenantId: string;
  readonly shiftId: string;
  readonly workerId: string;
  readonly shiftRequestId?: string | undefined;
  readonly confirmedBy: string;
}

/**
 * Create a new assignment in CONFIRMED status.
 */
export function createAssignment(input: CreateAssignmentInput): Assignment {
  if (!input.tenantId || input.tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }
  if (!input.shiftId || input.shiftId.trim() === '') {
    throw new Error('Shift ID is required');
  }
  if (!input.workerId || input.workerId.trim() === '') {
    throw new Error('Worker ID is required');
  }
  if (!input.confirmedBy || input.confirmedBy.trim() === '') {
    throw new Error('Confirmed by is required');
  }

  const now = new Date();

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    shiftId: input.shiftId,
    workerId: input.workerId,
    shiftRequestId: input.shiftRequestId,
    status: 'CONFIRMED',
    confirmedAt: now,
    confirmedBy: input.confirmedBy,
    checkedInAt: undefined,
    checkedOutAt: undefined,
    cancelledAt: undefined,
    cancellationReason: undefined,
    cancelledBy: undefined,
    noShowAt: undefined,
    completedAt: undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Check in to an assignment.
 */
export function checkInAssignment(assignment: Assignment): Assignment {
  assertTransition(assignment.status, 'CHECKED_IN');

  return {
    ...assignment,
    status: 'CHECKED_IN',
    checkedInAt: new Date(),
    updatedAt: new Date(),
    version: assignment.version + 1,
  };
}

/**
 * Complete an assignment (clock out).
 */
export function completeAssignment(assignment: Assignment): Assignment {
  assertTransition(assignment.status, 'COMPLETED');

  return {
    ...assignment,
    status: 'COMPLETED',
    completedAt: new Date(),
    checkedOutAt: new Date(),
    updatedAt: new Date(),
    version: assignment.version + 1,
  };
}

/**
 * Cancel an assignment.
 */
export function cancelAssignment(
  assignment: Assignment,
  cancelledBy: string,
  reason: string,
): Assignment {
  assertTransition(assignment.status, 'CANCELLED');
  if (!reason || reason.trim() === '') {
    throw new Error('Cancellation reason is required');
  }

  return {
    ...assignment,
    status: 'CANCELLED',
    cancelledAt: new Date(),
    cancellationReason: reason.trim(),
    cancelledBy,
    updatedAt: new Date(),
    version: assignment.version + 1,
  };
}

/**
 * Mark an assignment as no-show.
 */
export function markNoShow(assignment: Assignment): Assignment {
  assertTransition(assignment.status, 'NO_SHOW');

  return {
    ...assignment,
    status: 'NO_SHOW',
    noShowAt: new Date(),
    updatedAt: new Date(),
    version: assignment.version + 1,
  };
}

/**
 * Get valid transitions from current status.
 */
export function getValidAssignmentTransitions(status: AssignmentStatus): AssignmentStatus[] {
  return [...VALID_ASSIGNMENT_TRANSITIONS[status]];
}

function assertTransition(current: AssignmentStatus, target: AssignmentStatus): void {
  const allowed = VALID_ASSIGNMENT_TRANSITIONS[current];
  if (!allowed.includes(target)) {
    throw new Error(`Invalid assignment transition: ${current} → ${target}`);
  }
}
