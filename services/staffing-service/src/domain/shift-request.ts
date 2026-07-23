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
 * - Worker must be eligible (evaluated at request time, evaluation ID stored)
 * - Worker cannot request overlapping shifts
 * - Only one active request (REQUESTED/UNDER_REVIEW/CONFIRMED) per worker+shift
 * - After REJECTED/WITHDRAWN/EXPIRED, worker may re-request (new row)
 * - Confirmation checks expiration time (fail if expired regardless of status)
 * - TTL is bounded (min 5 min, max 7 days)
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
  readonly eligibilityEvaluationId: string;
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

/** TTL bounds */
const MIN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CreateShiftRequestInput {
  readonly tenantId: string;
  readonly shiftId: string;
  readonly workerId: string;
  readonly eligibilityEvaluationId: string;
  readonly correlationId?: string | undefined;
  readonly ttlMs?: number | undefined;
  readonly asOf?: Date | undefined;
}

/**
 * Validate and bound TTL value.
 */
function validateTtl(ttlMs: number | undefined): number {
  if (ttlMs === undefined || ttlMs === null) return DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || !Number.isInteger(ttlMs)) {
    throw new Error('TTL must be a finite positive integer');
  }
  if (ttlMs < MIN_TTL_MS) {
    throw new Error(`TTL must be at least ${MIN_TTL_MS}ms (5 minutes)`);
  }
  if (ttlMs > MAX_TTL_MS) {
    throw new Error(`TTL must not exceed ${MAX_TTL_MS}ms (7 days)`);
  }
  return ttlMs;
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
  if (!input.eligibilityEvaluationId || input.eligibilityEvaluationId.trim() === '') {
    throw new Error('Eligibility evaluation ID is required');
  }

  const ttl = validateTtl(input.ttlMs);
  const now = input.asOf ?? new Date();

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
 * Confirm a shift request.
 * MUST check expiration: if asOf >= expiresAt, reject even if status is REQUESTED.
 * This prevents confirming stale requests when the expiration worker is delayed.
 */
export function confirmShiftRequest(
  request: ShiftRequest,
  reviewedBy: string,
  asOf: Date = new Date(),
): ShiftRequest {
  if (!reviewedBy || reviewedBy.trim() === '') {
    throw new Error('Reviewer ID is required');
  }
  const allowed = VALID_REQUEST_TRANSITIONS[request.status];
  if (!allowed.includes('CONFIRMED')) {
    throw new Error(`Cannot confirm request in status ${request.status}`);
  }
  // P0 fix: reject if TTL has expired regardless of status
  if (asOf >= request.expiresAt) {
    throw new Error('Cannot confirm expired request — TTL exceeded');
  }

  return {
    ...request,
    status: 'CONFIRMED',
    reviewedAt: asOf,
    reviewedBy: reviewedBy.trim(),
    updatedAt: asOf,
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
