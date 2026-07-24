import { describe, it, expect } from 'vitest';

import {
  createClockEvent,
  createTimecard,
  calculateTimecardFromEvents,
  submitTimecard,
  approveTimecard,
  rejectTimecard,
  requestTimecardCorrection,
  getValidTimecardTransitions,
} from './timekeeping.js';
import type { ClockEvent, Timecard } from './timekeeping.js';

function makeClockEvent(
  type: ClockEvent['eventType'],
  minutesOffset: number,
): ClockEvent {
  const base = new Date('2026-01-01T08:00:00Z');
  return {
    id: crypto.randomUUID(),
    tenantId: 'tenant-1',
    assignmentId: 'assign-1',
    workerId: 'worker-1',
    eventType: type,
    occurredAt: new Date(base.getTime() + minutesOffset * 60 * 1000),
    createdAt: new Date(base.getTime() + minutesOffset * 60 * 1000),
  };
}

function makeTimecard(overrides: Partial<Timecard> = {}): Timecard {
  return {
    id: 'tc-1',
    tenantId: 'tenant-1',
    assignmentId: 'assign-1',
    workerId: 'worker-1',
    shiftId: 'shift-1',
    status: 'DRAFT',
    clockInAt: new Date('2026-01-01T08:00:00Z'),
    clockOutAt: new Date('2026-01-01T16:00:00Z'),
    totalHoursWorked: 7.5,
    totalBreakMinutes: 30,
    submittedAt: undefined,
    approvedAt: undefined,
    approvedBy: undefined,
    rejectedAt: undefined,
    rejectedBy: undefined,
    rejectionReason: undefined,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('Timekeeping', () => {
  describe('createClockEvent', () => {
    it('should create CLOCK_IN as first event', () => {
      const event = createClockEvent(
        {
          tenantId: 'tenant-1',
          assignmentId: 'assign-1',
          workerId: 'worker-1',
          eventType: 'CLOCK_IN',
        },
        [],
      );
      expect(event.eventType).toBe('CLOCK_IN');
      expect(event.assignmentId).toBe('assign-1');
    });

    it('should reject non-CLOCK_IN as first event', () => {
      expect(() =>
        createClockEvent(
          {
            tenantId: 'tenant-1',
            assignmentId: 'assign-1',
            workerId: 'worker-1',
            eventType: 'BREAK_START',
          },
          [],
        ),
      ).toThrow('First clock event must be CLOCK_IN');
    });

    it('should reject duplicate CLOCK_IN', () => {
      const existing = [makeClockEvent('CLOCK_IN', 0)];
      expect(() =>
        createClockEvent(
          {
            tenantId: 'tenant-1',
            assignmentId: 'assign-1',
            workerId: 'worker-1',
            eventType: 'CLOCK_IN',
          },
          existing,
        ),
      ).toThrow('Already clocked in');
    });

    it('should allow BREAK_START after CLOCK_IN', () => {
      const existing = [makeClockEvent('CLOCK_IN', 0)];
      const event = createClockEvent(
        {
          tenantId: 'tenant-1',
          assignmentId: 'assign-1',
          workerId: 'worker-1',
          eventType: 'BREAK_START',
        },
        existing,
      );
      expect(event.eventType).toBe('BREAK_START');
    });

    it('should reject CLOCK_OUT directly after BREAK_START', () => {
      const existing = [makeClockEvent('CLOCK_IN', 0), makeClockEvent('BREAK_START', 60)];
      expect(() =>
        createClockEvent(
          {
            tenantId: 'tenant-1',
            assignmentId: 'assign-1',
            workerId: 'worker-1',
            eventType: 'CLOCK_OUT',
          },
          existing,
        ),
      ).toThrow('Invalid clock event sequence');
    });

    it('should allow CLOCK_OUT after BREAK_END', () => {
      const existing = [
        makeClockEvent('CLOCK_IN', 0),
        makeClockEvent('BREAK_START', 60),
        makeClockEvent('BREAK_END', 90),
      ];
      const event = createClockEvent(
        {
          tenantId: 'tenant-1',
          assignmentId: 'assign-1',
          workerId: 'worker-1',
          eventType: 'CLOCK_OUT',
        },
        existing,
      );
      expect(event.eventType).toBe('CLOCK_OUT');
    });

    it('should reject events after CLOCK_OUT', () => {
      const existing = [makeClockEvent('CLOCK_IN', 0), makeClockEvent('CLOCK_OUT', 480)];
      expect(() =>
        createClockEvent(
          {
            tenantId: 'tenant-1',
            assignmentId: 'assign-1',
            workerId: 'worker-1',
            eventType: 'BREAK_START',
          },
          existing,
        ),
      ).toThrow('Already clocked out');
    });

    it('should include geolocation data', () => {
      const event = createClockEvent(
        {
          tenantId: 'tenant-1',
          assignmentId: 'assign-1',
          workerId: 'worker-1',
          eventType: 'CLOCK_IN',
          latitude: 33.7490,
          longitude: -84.3880,
        },
        [],
      );
      expect(event.latitude).toBe(33.7490);
      expect(event.longitude).toBe(-84.3880);
    });
  });

  describe('createTimecard', () => {
    it('should create a timecard in DRAFT status', () => {
      const tc = createTimecard({
        tenantId: 'tenant-1',
        assignmentId: 'assign-1',
        workerId: 'worker-1',
        shiftId: 'shift-1',
      });
      expect(tc.status).toBe('DRAFT');
      expect(tc.version).toBe(1);
      expect(tc.totalBreakMinutes).toBe(0);
    });

    it('should reject missing fields', () => {
      expect(() =>
        createTimecard({ tenantId: '', assignmentId: 'a', workerId: 'w', shiftId: 's' }),
      ).toThrow();
    });
  });

  describe('calculateTimecardFromEvents', () => {
    it('should calculate total hours from events', () => {
      const events: ClockEvent[] = [
        makeClockEvent('CLOCK_IN', 0),
        makeClockEvent('CLOCK_OUT', 480), // 8 hours
      ];
      const tc = makeTimecard({ totalHoursWorked: undefined, totalBreakMinutes: 0 });
      const calculated = calculateTimecardFromEvents(tc, events);
      expect(calculated.totalHoursWorked).toBe(8);
      expect(calculated.totalBreakMinutes).toBe(0);
    });

    it('should subtract break time', () => {
      const events: ClockEvent[] = [
        makeClockEvent('CLOCK_IN', 0),
        makeClockEvent('BREAK_START', 240), // break at 4h
        makeClockEvent('BREAK_END', 270), // 30 min break
        makeClockEvent('CLOCK_OUT', 510), // clock out at 8.5h
      ];
      const tc = makeTimecard({ totalHoursWorked: undefined, totalBreakMinutes: 0 });
      const calculated = calculateTimecardFromEvents(tc, events);
      expect(calculated.totalHoursWorked).toBe(8);
      expect(calculated.totalBreakMinutes).toBe(30);
    });
  });

  describe('submitTimecard', () => {
    it('should transition DRAFT → SUBMITTED', () => {
      const tc = makeTimecard({ status: 'DRAFT' });
      const submitted = submitTimecard(tc);
      expect(submitted.status).toBe('SUBMITTED');
      expect(submitted.submittedAt).toBeInstanceOf(Date);
      expect(submitted.version).toBe(2);
    });

    it('should reject submission without clock-in', () => {
      const tc = makeTimecard({ status: 'DRAFT', clockInAt: undefined });
      expect(() => submitTimecard(tc)).toThrow('must have clock-in and clock-out');
    });

    it('should reject submission from APPROVED', () => {
      const tc = makeTimecard({ status: 'APPROVED' });
      expect(() => submitTimecard(tc)).toThrow('Invalid timecard transition');
    });
  });

  describe('approveTimecard', () => {
    it('should transition SUBMITTED → APPROVED', () => {
      const tc = makeTimecard({ status: 'SUBMITTED' });
      const approved = approveTimecard(tc, 'admin-1');
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedBy).toBe('admin-1');
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('should reject empty approver', () => {
      const tc = makeTimecard({ status: 'SUBMITTED' });
      expect(() => approveTimecard(tc, '')).toThrow('Approver is required');
    });

    it('should reject approval from DRAFT', () => {
      const tc = makeTimecard({ status: 'DRAFT' });
      expect(() => approveTimecard(tc, 'admin-1')).toThrow('Invalid timecard transition');
    });
  });

  describe('rejectTimecard', () => {
    it('should transition SUBMITTED → REJECTED', () => {
      const tc = makeTimecard({ status: 'SUBMITTED' });
      const rejected = rejectTimecard(tc, 'admin-1', 'Hours incorrect');
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectedBy).toBe('admin-1');
      expect(rejected.rejectionReason).toBe('Hours incorrect');
    });

    it('should reject empty reason', () => {
      const tc = makeTimecard({ status: 'SUBMITTED' });
      expect(() => rejectTimecard(tc, 'admin-1', '')).toThrow('Rejection reason is required');
    });
  });

  describe('requestTimecardCorrection', () => {
    it('should transition SUBMITTED → CORRECTION_REQUESTED', () => {
      const tc = makeTimecard({ status: 'SUBMITTED' });
      const corrected = requestTimecardCorrection(tc);
      expect(corrected.status).toBe('CORRECTION_REQUESTED');
    });
  });

  describe('getValidTimecardTransitions', () => {
    it('should return valid transitions for DRAFT', () => {
      expect(getValidTimecardTransitions('DRAFT')).toEqual(['SUBMITTED']);
    });

    it('should return valid transitions for SUBMITTED', () => {
      const transitions = getValidTimecardTransitions('SUBMITTED');
      expect(transitions).toContain('APPROVED');
      expect(transitions).toContain('REJECTED');
      expect(transitions).toContain('CORRECTION_REQUESTED');
    });

    it('should return empty for APPROVED', () => {
      expect(getValidTimecardTransitions('APPROVED')).toHaveLength(0);
    });

    it('should allow DRAFT from REJECTED', () => {
      expect(getValidTimecardTransitions('REJECTED')).toContain('DRAFT');
    });
  });
});
