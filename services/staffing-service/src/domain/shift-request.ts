/**
 * ShiftRequest domain entity.
 *
 * Represents a worker's interest in working a specific shift.
 * State machine:
 *   REQUESTED → UNDER_REVIEW → CONFIRMED | REJECTED
 *   REQUESTED → WITHDRAWN
 *   REQUESTED → EXPIRED (TTL-based)
 *
 * Business rules:
 * - Worker must be eligible (evaluated at request time)
 * - Worker cannot request overlapping shifts
 * - Duplicate requests (same worker + shift) are idempotent
 * - Withdrawn requests cannot be re-confirmed
 * - Expired requests cannot be re-confirmed
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
  readonly eligibilityEvaluationId?: string | undefined;
  readonly requestedAt: Date;
  readonly reviewedAt?: Date | undefined;
  readonly reviewedBy?: string | undefined;
  readonly rejectionReason?: string | undefined;
  readonly withdrawnAt?: Date | undefined;
  readonly expiresAt: Date;
  readonly correlationId?: string | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Valid state transitions for shift requests.
 */
const VALID_REQUEST_TRANSITIONS: Record<ShiftRequestStatus, ShiftRequestStatus[]> = {
  REQUESTED: ['UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  UNDER_REVIEW: ['CONFIRMED', 'REJECTED', 'WITHDRAWN'],
  CONFIRMED: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

/** Default request TTL: 24 hours */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CreateShiftRequestInput {
  readonly tenantId: string;
  readonly shiftId: string;
  readonly workerId: string;
  readonly eligibilityEvaluationId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly ttlMs?: number | undefined;
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
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    shiftId: input.shiftId,
    workerId: input.workerId,
    status: 'REQUESTED',
    eligibilityEvaluationId: input.eligibilityEvaluationId,
    requestedAt: now,
    reviewedAt: undefined,
    reviewedBy: undefined,
    rejectionReason: undefined,
    withdrawnAt: undefined,
    expiresAt: new Date(now.getTime() + ttl),
    correlationId: input.correlationId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Withdraw a shift request. Only valid from REQUESTED or UNDER_REVIEW.
 */
export function withdrawShiftRequest(request: ShiftRequest): ShiftRequest {
  const allowed = VALID_REQUEST_TRANSITIONS[request.status];
  if (!allowed.includes('WITHDRAWN')) {
    throw new Error(`Cannot withdraw request in status ${request.status}`);
  }

  return {
    ...request,
    status: 'WITHDRAWN',
    withdrawnAt: new Date(),
    updatedAt: new Date(),
    version: request.version + 1,
  };
}

/**
 * Confirm a shift request. Only valid from REQUESTED or UNDER_REVIEW.
 */
export function confirmShiftRequest(request: ShiftRequest, reviewedBy: string): ShiftRequest {
  if (!reviewedBy || reviewedBy.trim() === '') {
    throw new Error('Reviewer ID is required');
  }
  const allowed = VALID_REQUEST_TRANSITIONS[request.status];
  if (!allowed.includes('CONFIRMED')) {
    throw new Error(`Cannot confirm request in status ${request.status}`);
  }

  return {
    ...request,
    status: 'CONFIRMED',
    reviewedAt: new Date(),
    reviewedBy: reviewedBy.trim(),
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
  if (!reviewedBy || reviewedBy.trim() === '') {
    throw new Error('Reviewer ID is required');
  }
  if (!reason || reason.trim() === '') {
    throw new Error('Rejection reason is required');
  }
  const allowed = VALID_REQUEST_TRANSITIONS[request.status];
  if (!allowed.includes('REJECTED')) {
    throw new Error(`Cannot reject request in status ${request.status}`);
  }

  return {
    ...request,
    status: 'REJECTED',
    reviewedAt: new Date(),
    reviewedBy: reviewedBy.trim(),
    rejectionReason: reason.trim(),
    updatedAt: new Date(),
    version: request.version + 1,
  };
}

/**
 * Expire a shift request (TTL exceeded).
 */
export function expireShiftRequest(request: ShiftRequest): ShiftRequest {
  if (request.status !== 'REQUESTED') {
    throw new Error(`Cannot expire request in status ${request.status}`);
  }

  return {
    ...request,
    status: 'EXPIRED',
    updatedAt: new Date(),
    version: request.version + 1,
  };
}

/**
 * Check if a request has expired based on current time.
 */
export function isRequestExpired(request: ShiftRequest, asOf: Date = new Date()): boolean {
  return request.status === 'REQUESTED' && asOf >= request.expiresAt;
}

/**
 * Get valid transitions from current status.
 */
export function getValidRequestTransitions(status: ShiftRequestStatus): ShiftRequestStatus[] {
  return [...VALID_REQUEST_TRANSITIONS[status]];
}
