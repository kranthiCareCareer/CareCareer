/**
 * Timekeeping domain entities.
 *
 * ClockEvent: Immutable record of clock-in, break-start, break-end, clock-out.
 * Timecard: Aggregation of clock events for approval workflow.
 *
 * Timecard state machine: DRAFT → SUBMITTED → APPROVED | REJECTED | CORRECTION_REQUESTED
 */

export type ClockEventType = 'CLOCK_IN' | 'BREAK_START' | 'BREAK_END' | 'CLOCK_OUT';

export interface ClockEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly assignmentId: string;
  readonly workerId: string;
  readonly eventType: ClockEventType;
  readonly occurredAt: Date;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly notes?: string | undefined;
  readonly createdAt: Date;
}

export type TimecardStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED';

export interface Timecard {
  readonly id: string;
  readonly tenantId: string;
  readonly assignmentId: string;
  readonly workerId: string;
  readonly shiftId: string;
  readonly status: TimecardStatus;
  readonly clockInAt?: Date | undefined;
  readonly clockOutAt?: Date | undefined;
  readonly totalHoursWorked?: number | undefined;
  readonly totalBreakMinutes: number;
  readonly submittedAt?: Date | undefined;
  readonly approvedAt?: Date | undefined;
  readonly approvedBy?: string | undefined;
  readonly rejectedAt?: Date | undefined;
  readonly rejectedBy?: string | undefined;
  readonly rejectionReason?: string | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const VALID_TIMECARD_TRANSITIONS: Record<TimecardStatus, TimecardStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED'],
  APPROVED: [],
  REJECTED: ['DRAFT'],
  CORRECTION_REQUESTED: ['DRAFT'],
};

/** Valid clock event sequence: CLOCK_IN → BREAK_START → BREAK_END → ... → CLOCK_OUT */
const VALID_NEXT_EVENTS: Record<ClockEventType, ClockEventType[]> = {
  CLOCK_IN: ['BREAK_START', 'CLOCK_OUT'],
  BREAK_START: ['BREAK_END'],
  BREAK_END: ['BREAK_START', 'CLOCK_OUT'],
  CLOCK_OUT: [],
};

export interface CreateClockEventInput {
  readonly tenantId: string;
  readonly assignmentId: string;
  readonly workerId: string;
  readonly eventType: ClockEventType;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly notes?: string | undefined;
}

/**
 * Create a clock event after validating the sequence.
 */
export function createClockEvent(
  input: CreateClockEventInput,
  existingEvents: ClockEvent[],
): ClockEvent {
  if (!input.tenantId) throw new Error('Tenant ID is required');
  if (!input.assignmentId) throw new Error('Assignment ID is required');
  if (!input.workerId) throw new Error('Worker ID is required');

  // Validate event sequence
  validateEventSequence(input.eventType, existingEvents);

  const now = new Date();

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    workerId: input.workerId,
    eventType: input.eventType,
    occurredAt: now,
    latitude: input.latitude,
    longitude: input.longitude,
    notes: input.notes?.trim(),
    createdAt: now,
  };
}

/**
 * Validate clock event sequence is valid.
 */
function validateEventSequence(
  eventType: ClockEventType,
  existingEvents: ClockEvent[],
): void {
  if (existingEvents.length === 0) {
    if (eventType !== 'CLOCK_IN') {
      throw new Error('First clock event must be CLOCK_IN');
    }
    return;
  }

  const sorted = [...existingEvents].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  const lastEvent = sorted[sorted.length - 1]!;

  // Check for duplicate CLOCK_IN
  if (eventType === 'CLOCK_IN') {
    throw new Error('Already clocked in');
  }

  // Check for duplicate CLOCK_OUT
  if (lastEvent.eventType === 'CLOCK_OUT') {
    throw new Error('Already clocked out');
  }

  const validNext = VALID_NEXT_EVENTS[lastEvent.eventType];
  if (!validNext.includes(eventType)) {
    throw new Error(
      `Invalid clock event sequence: ${lastEvent.eventType} → ${eventType}`,
    );
  }
}

export interface CreateTimecardInput {
  readonly tenantId: string;
  readonly assignmentId: string;
  readonly workerId: string;
  readonly shiftId: string;
}

/**
 * Create a timecard in DRAFT status from clock events.
 */
export function createTimecard(input: CreateTimecardInput): Timecard {
  if (!input.tenantId) throw new Error('Tenant ID is required');
  if (!input.assignmentId) throw new Error('Assignment ID is required');
  if (!input.workerId) throw new Error('Worker ID is required');
  if (!input.shiftId) throw new Error('Shift ID is required');

  const now = new Date();

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    workerId: input.workerId,
    shiftId: input.shiftId,
    status: 'DRAFT',
    clockInAt: undefined,
    clockOutAt: undefined,
    totalHoursWorked: undefined,
    totalBreakMinutes: 0,
    submittedAt: undefined,
    approvedAt: undefined,
    approvedBy: undefined,
    rejectedAt: undefined,
    rejectedBy: undefined,
    rejectionReason: undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Calculate timecard hours from clock events.
 */
export function calculateTimecardFromEvents(
  timecard: Timecard,
  events: ClockEvent[],
): Timecard {
  const sorted = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const clockIn = sorted.find((e) => e.eventType === 'CLOCK_IN');
  const clockOut = sorted.find((e) => e.eventType === 'CLOCK_OUT');

  let breakMinutes = 0;
  let breakStart: Date | undefined;

  for (const event of sorted) {
    if (event.eventType === 'BREAK_START') {
      breakStart = event.occurredAt;
    } else if (event.eventType === 'BREAK_END' && breakStart) {
      breakMinutes += (event.occurredAt.getTime() - breakStart.getTime()) / (1000 * 60);
      breakStart = undefined;
    }
  }

  let totalHoursWorked: number | undefined;
  if (clockIn && clockOut) {
    const totalMs = clockOut.occurredAt.getTime() - clockIn.occurredAt.getTime();
    const breakMs = breakMinutes * 60 * 1000;
    totalHoursWorked = Math.round(((totalMs - breakMs) / (1000 * 60 * 60)) * 100) / 100;
  }

  return {
    ...timecard,
    clockInAt: clockIn?.occurredAt,
    clockOutAt: clockOut?.occurredAt,
    totalHoursWorked,
    totalBreakMinutes: Math.round(breakMinutes),
    updatedAt: new Date(),
  };
}

/**
 * Submit a timecard for approval.
 */
export function submitTimecard(timecard: Timecard): Timecard {
  assertTimecardTransition(timecard.status, 'SUBMITTED');
  if (!timecard.clockInAt || !timecard.clockOutAt) {
    throw new Error('Timecard must have clock-in and clock-out before submission');
  }

  return {
    ...timecard,
    status: 'SUBMITTED',
    submittedAt: new Date(),
    updatedAt: new Date(),
    version: timecard.version + 1,
  };
}

/**
 * Approve a timecard.
 */
export function approveTimecard(timecard: Timecard, approvedBy: string): Timecard {
  assertTimecardTransition(timecard.status, 'APPROVED');
  if (!approvedBy || approvedBy.trim() === '') {
    throw new Error('Approver is required');
  }

  return {
    ...timecard,
    status: 'APPROVED',
    approvedAt: new Date(),
    approvedBy,
    updatedAt: new Date(),
    version: timecard.version + 1,
  };
}

/**
 * Reject a timecard.
 */
export function rejectTimecard(
  timecard: Timecard,
  rejectedBy: string,
  reason: string,
): Timecard {
  assertTimecardTransition(timecard.status, 'REJECTED');
  if (!rejectedBy || rejectedBy.trim() === '') {
    throw new Error('Rejector is required');
  }
  if (!reason || reason.trim() === '') {
    throw new Error('Rejection reason is required');
  }

  return {
    ...timecard,
    status: 'REJECTED',
    rejectedAt: new Date(),
    rejectedBy,
    rejectionReason: reason.trim(),
    updatedAt: new Date(),
    version: timecard.version + 1,
  };
}

/**
 * Request correction on a timecard.
 */
export function requestTimecardCorrection(timecard: Timecard): Timecard {
  assertTimecardTransition(timecard.status, 'CORRECTION_REQUESTED');

  return {
    ...timecard,
    status: 'CORRECTION_REQUESTED',
    updatedAt: new Date(),
    version: timecard.version + 1,
  };
}

/**
 * Get valid transitions from current status.
 */
export function getValidTimecardTransitions(status: TimecardStatus): TimecardStatus[] {
  return [...VALID_TIMECARD_TRANSITIONS[status]];
}

function assertTimecardTransition(current: TimecardStatus, target: TimecardStatus): void {
  const allowed = VALID_TIMECARD_TRANSITIONS[current];
  if (!allowed.includes(target)) {
    throw new Error(`Invalid timecard transition: ${current} → ${target}`);
  }
}
