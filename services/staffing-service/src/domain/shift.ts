/**
 * Shift domain entity.
 *
 * Represents a work opportunity at a healthcare facility.
 * Shifts follow a state machine:
 *   DRAFT → PUBLISHED → PARTIALLY_FILLED → FILLED → IN_PROGRESS → COMPLETED
 *   Any pre-completion state → CANCELLED
 *
 * Supports multi-worker requirements (requiredWorkerCount >= 1).
 * Uses UTC times with businessDate for overnight shift support.
 * Optimistic concurrency via version field.
 */

export type ShiftStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ShiftRole = 'RN' | 'LPN' | 'CNA' | 'RT' | 'ALLIED';

export interface Shift {
  readonly id: string;
  readonly tenantId: string;
  readonly facilityId: string;
  readonly departmentId?: string | undefined;
  readonly status: ShiftStatus;
  readonly role: ShiftRole;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly businessDate: string;
  readonly requiredWorkerCount: number;
  readonly filledWorkerCount: number;
  readonly payRateCents: number;
  readonly billRateCents: number;
  readonly notes?: string | undefined;
  readonly publishedAt?: Date | undefined;
  readonly cancelledAt?: Date | undefined;
  readonly cancellationReason?: string | undefined;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Valid state transitions for the shift lifecycle.
 */
const VALID_SHIFT_TRANSITIONS: Record<ShiftStatus, ShiftStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['PARTIALLY_FILLED', 'FILLED', 'CANCELLED'],
  PARTIALLY_FILLED: ['FILLED', 'CANCELLED'],
  FILLED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export interface CreateShiftInput {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly departmentId?: string | undefined;
  readonly role: ShiftRole;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly businessDate: string;
  readonly requiredWorkerCount: number;
  readonly payRateCents: number;
  readonly billRateCents: number;
  readonly notes?: string | undefined;
  readonly createdBy: string;
}

const VALID_ROLES: ShiftRole[] = ['RN', 'LPN', 'CNA', 'RT', 'ALLIED'];

/**
 * Create a new shift in DRAFT status.
 */
export function createShift(input: CreateShiftInput): Shift {
  if (!input.facilityId || input.facilityId.trim() === '') {
    throw new Error('Facility ID is required');
  }
  if (!input.tenantId || input.tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }
  if (!VALID_ROLES.includes(input.role)) {
    throw new Error(`Invalid role: ${input.role}`);
  }
  if (input.endTime <= input.startTime) {
    throw new Error('End time must be after start time');
  }
  if (input.requiredWorkerCount < 1) {
    throw new Error('Required worker count must be at least 1');
  }
  if (input.payRateCents <= 0) {
    throw new Error('Pay rate must be positive');
  }
  if (input.billRateCents <= 0) {
    throw new Error('Bill rate must be positive');
  }
  if (!input.businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) {
    throw new Error('Business date must be in YYYY-MM-DD format');
  }

  const now = new Date();

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    status: 'DRAFT',
    role: input.role,
    startTime: input.startTime,
    endTime: input.endTime,
    businessDate: input.businessDate,
    requiredWorkerCount: input.requiredWorkerCount,
    filledWorkerCount: 0,
    payRateCents: input.payRateCents,
    billRateCents: input.billRateCents,
    notes: input.notes?.trim(),
    publishedAt: undefined,
    cancelledAt: undefined,
    cancellationReason: undefined,
    version: 1,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Publish a shift (DRAFT → PUBLISHED).
 */
export function publishShift(shift: Shift): Shift {
  if (shift.status !== 'DRAFT') {
    throw new Error(`Cannot publish shift in status ${shift.status}; must be DRAFT`);
  }

  return {
    ...shift,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    updatedAt: new Date(),
    version: shift.version + 1,
  };
}

/**
 * Cancel a shift from any pre-completion state.
 */
export function cancelShift(shift: Shift, reason: string): Shift {
  if (shift.status === 'COMPLETED' || shift.status === 'CANCELLED') {
    throw new Error(`Cannot cancel shift in status ${shift.status}`);
  }
  if (!reason || reason.trim() === '') {
    throw new Error('Cancellation reason is required');
  }

  return {
    ...shift,
    status: 'CANCELLED',
    cancelledAt: new Date(),
    cancellationReason: reason.trim(),
    updatedAt: new Date(),
    version: shift.version + 1,
  };
}

/**
 * Transition a shift to a new status.
 * Validates the transition is allowed by the state machine.
 */
export function changeShiftStatus(shift: Shift, newStatus: ShiftStatus): Shift {
  const allowed = VALID_SHIFT_TRANSITIONS[shift.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid shift status transition: ${shift.status} → ${newStatus}`);
  }

  return {
    ...shift,
    status: newStatus,
    updatedAt: new Date(),
    version: shift.version + 1,
  };
}

/**
 * Get all valid transitions from the current status.
 */
export function getValidShiftTransitions(status: ShiftStatus): ShiftStatus[] {
  return [...VALID_SHIFT_TRANSITIONS[status]];
}

/**
 * Check if a shift can accept more workers.
 */
export function hasCapacity(shift: Shift): boolean {
  return shift.filledWorkerCount < shift.requiredWorkerCount;
}

/**
 * Calculate shift duration in hours.
 */
export function getShiftDurationHours(shift: Shift): number {
  const ms = shift.endTime.getTime() - shift.startTime.getTime();
  return ms / (1000 * 60 * 60);
}
