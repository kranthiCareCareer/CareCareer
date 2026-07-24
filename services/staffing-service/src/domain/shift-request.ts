/**
 * ShiftRequest domain entity.
 *
 * Represents a worker's request to be assigned to a published shift.
 * State machine: REQUESTED → UNDER_REVIEW → CONFIRMED | REJECTED | WITHDRAWN | EXPIRED
 */

export type ShiftRequestStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export interface ShiftRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly shiftId: string;
  readonly workerId: string;
  readonly status: ShiftRequestStatus;
  readonly submittedAt: Date;
  readonly reviewedAt?: Date | undefined;
  readonly reviewedBy?: string | undefined;
  readonly rejectionReason?: string | undefined;
  readonly withdrawnAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const VALID_REQUEST_TRANSITIONS: Record<ShiftRequestStatus, ShiftRequestStatus[]> = {
  REQUESTED: ['UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  UNDER_REVIEW: ['CONFIRMED', 'REJECTED', 'WITHDRAWN'],
  CONFIRMED: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

export interface CreateShiftRequestInput {
  readonly tenantId: string;
  readonly shiftId: string;
  readonly workerId: string;
  readonly expiresAt?: Date | undefined;
}

/**
 * Create a new shift request in REQUESTED status.
 */
export function createShiftRequest(input: CreateShiftRequestInput): ShiftRequest {
  if (!input.tenantId || input.tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }
  if (!input.shiftId || input.shiftId.trim() === '') {
    throw new Error('Shift ID is required');
  }
  if (!input.workerId || input.workerId.trim() === '') {
    throw new Error('Worker ID is required');
  }

  const now = new Date();

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    shiftId: input.shiftId,
    workerId: input.workerId,
    status: 'REQUESTED',
    submittedAt: now,
    reviewedAt: undefined,
    reviewedBy: undefined,
    rejectionReason: undefined,
    withdrawnAt: undefined,
    expiresAt: input.expiresAt,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Confirm a shift request (moves to CONFIRMED).
 */
export function confirmShiftRequest(request: ShiftRequest, reviewedBy: string): ShiftRequest {
  assertTransition(request.status, 'CONFIRMED');
  if (!reviewedBy || reviewedBy.trim() === '') {
    throw new Error('Reviewer is required for confirmation');
  }

  return {
    ...request,
    status: 'CONFIRMED',
    reviewedAt: new Date(),
    reviewedBy,
    updatedAt: new Date(),
    version: request.version + 1,
  };
}

/**
 * Reject a shift request with a reason.
 */
export function rejectShiftRequest(
  request: ShiftRequest,
  reviewedBy: string,
  reason: string,
): ShiftRequest {
  assertTransition(request.status, 'REJECTED');
  if (!reviewedBy || reviewedBy.trim() === '') {
    throw new Error('Reviewer is required for rejection');
  }
  if (!reason || reason.trim() === '') {
    throw new Error('Rejection reason is required');
  }

  return {
    ...request,
    status: 'REJECTED',
    reviewedAt: new Date(),
    reviewedBy,
    rejectionReason: reason.trim(),
    updatedAt: new Date(),
    version: request.version + 1,
  };
}

/**
 * Withdraw a shift request (worker-initiated).
 */
export function withdrawShiftRequest(request: ShiftRequest): ShiftRequest {
  assertTransition(request.status, 'WITHDRAWN');

  return {
    ...request,
    status: 'WITHDRAWN',
    withdrawnAt: new Date(),
    updatedAt: new Date(),
    version: request.version + 1,
  };
}

/**
 * Expire a shift request.
 */
export function expireShiftRequest(request: ShiftRequest): ShiftRequest {
  assertTransition(request.status, 'EXPIRED');

  return {
    ...request,
    status: 'EXPIRED',
    updatedAt: new Date(),
    version: request.version + 1,
  };
}

/**
 * Get valid transitions from current status.
 */
export function getValidRequestTransitions(status: ShiftRequestStatus): ShiftRequestStatus[] {
  return [...VALID_REQUEST_TRANSITIONS[status]];
}

function assertTransition(current: ShiftRequestStatus, target: ShiftRequestStatus): void {
  const allowed = VALID_REQUEST_TRANSITIONS[current];
  if (!allowed.includes(target)) {
    throw new Error(`Invalid shift request transition: ${current} → ${target}`);
  }
}
