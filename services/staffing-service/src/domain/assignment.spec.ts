import { describe, it, expect } from 'vitest';

import {
  createAssignment,
  checkInAssignment,
  completeAssignment,
  cancelAssignment,
  markNoShow,
  getValidAssignmentTransitions,
} from './assignment.js';
import type { Assignment } from './assignment.js';

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'assign-1',
    tenantId: 'tenant-1',
    shiftId: 'shift-1',
    workerId: 'worker-1',
    shiftRequestId: 'req-1',
    status: 'CONFIRMED',
    confirmedAt: new Date('2026-01-01'),
    confirmedBy: 'admin-1',
    checkedInAt: undefined,
    checkedOutAt: undefined,
    cancelledAt: undefined,
    cancellationReason: undefined,
    cancelledBy: undefined,
    noShowAt: undefined,
    completedAt: undefined,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('Assignment', () => {
  describe('createAssignment', () => {
    it('should create assignment in CONFIRMED status', () => {
      const assignment = createAssignment({
        tenantId: 'tenant-1',
        shiftId: 'shift-1',
        workerId: 'worker-1',
        confirmedBy: 'admin-1',
      });
      expect(assignment.status).toBe('CONFIRMED');
      expect(assignment.version).toBe(1);
      expect(assignment.confirmedBy).toBe('admin-1');
    });

    it('should reject missing tenantId', () => {
      expect(() =>
        createAssignment({
          tenantId: '',
          shiftId: 'shift-1',
          workerId: 'worker-1',
          confirmedBy: 'admin-1',
        }),
      ).toThrow('Tenant ID is required');
    });

    it('should reject missing shiftId', () => {
      expect(() =>
        createAssignment({
          tenantId: 'tenant-1',
          shiftId: '',
          workerId: 'worker-1',
          confirmedBy: 'admin-1',
        }),
      ).toThrow('Shift ID is required');
    });

    it('should reject missing workerId', () => {
      expect(() =>
        createAssignment({
          tenantId: 'tenant-1',
          shiftId: 'shift-1',
          workerId: '',
          confirmedBy: 'admin-1',
        }),
      ).toThrow('Worker ID is required');
    });

    it('should reject missing confirmedBy', () => {
      expect(() =>
        createAssignment({
          tenantId: 'tenant-1',
          shiftId: 'shift-1',
          workerId: 'worker-1',
          confirmedBy: '',
        }),
      ).toThrow('Confirmed by is required');
    });
  });

  describe('checkInAssignment', () => {
    it('should transition CONFIRMED → CHECKED_IN', () => {
      const assignment = makeAssignment({ status: 'CONFIRMED' });
      const checkedIn = checkInAssignment(assignment);
      expect(checkedIn.status).toBe('CHECKED_IN');
      expect(checkedIn.checkedInAt).toBeInstanceOf(Date);
      expect(checkedIn.version).toBe(2);
    });

    it('should reject check-in from CHECKED_IN', () => {
      const assignment = makeAssignment({ status: 'CHECKED_IN' });
      expect(() => checkInAssignment(assignment)).toThrow('Invalid assignment transition');
    });

    it('should reject check-in from COMPLETED', () => {
      const assignment = makeAssignment({ status: 'COMPLETED' });
      expect(() => checkInAssignment(assignment)).toThrow();
    });
  });

  describe('completeAssignment', () => {
    it('should transition CHECKED_IN → COMPLETED', () => {
      const assignment = makeAssignment({ status: 'CHECKED_IN' });
      const completed = completeAssignment(assignment);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).toBeInstanceOf(Date);
      expect(completed.checkedOutAt).toBeInstanceOf(Date);
    });

    it('should reject completion from CONFIRMED', () => {
      const assignment = makeAssignment({ status: 'CONFIRMED' });
      expect(() => completeAssignment(assignment)).toThrow('Invalid assignment transition');
    });
  });

  describe('cancelAssignment', () => {
    it('should transition CONFIRMED → CANCELLED', () => {
      const assignment = makeAssignment({ status: 'CONFIRMED' });
      const cancelled = cancelAssignment(assignment, 'admin-1', 'Worker unavailable');
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('Worker unavailable');
      expect(cancelled.cancelledBy).toBe('admin-1');
    });

    it('should transition CHECKED_IN → CANCELLED', () => {
      const assignment = makeAssignment({ status: 'CHECKED_IN' });
      const cancelled = cancelAssignment(assignment, 'admin-1', 'Emergency');
      expect(cancelled.status).toBe('CANCELLED');
    });

    it('should reject empty reason', () => {
      const assignment = makeAssignment({ status: 'CONFIRMED' });
      expect(() => cancelAssignment(assignment, 'admin-1', '')).toThrow(
        'Cancellation reason is required',
      );
    });

    it('should reject cancellation from COMPLETED', () => {
      const assignment = makeAssignment({ status: 'COMPLETED' });
      expect(() => cancelAssignment(assignment, 'admin-1', 'reason')).toThrow();
    });
  });

  describe('markNoShow', () => {
    it('should transition CONFIRMED → NO_SHOW', () => {
      const assignment = makeAssignment({ status: 'CONFIRMED' });
      const noShow = markNoShow(assignment);
      expect(noShow.status).toBe('NO_SHOW');
      expect(noShow.noShowAt).toBeInstanceOf(Date);
    });

    it('should reject no-show from CHECKED_IN', () => {
      const assignment = makeAssignment({ status: 'CHECKED_IN' });
      expect(() => markNoShow(assignment)).toThrow();
    });
  });

  describe('getValidAssignmentTransitions', () => {
    it('should return valid transitions for CONFIRMED', () => {
      const transitions = getValidAssignmentTransitions('CONFIRMED');
      expect(transitions).toContain('CHECKED_IN');
      expect(transitions).toContain('CANCELLED');
      expect(transitions).toContain('NO_SHOW');
    });

    it('should return valid transitions for CHECKED_IN', () => {
      const transitions = getValidAssignmentTransitions('CHECKED_IN');
      expect(transitions).toContain('COMPLETED');
      expect(transitions).toContain('CANCELLED');
    });

    it('should return empty for terminal states', () => {
      expect(getValidAssignmentTransitions('COMPLETED')).toHaveLength(0);
      expect(getValidAssignmentTransitions('CANCELLED')).toHaveLength(0);
      expect(getValidAssignmentTransitions('NO_SHOW')).toHaveLength(0);
    });
  });
});
