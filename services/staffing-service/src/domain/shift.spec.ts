import { describe, it, expect } from 'vitest';

import {
  createShift,
  publishShift,
  cancelShift,
  changeShiftStatus,
  getValidShiftTransitions,
  hasCapacity,
  getShiftDurationHours,
  type CreateShiftInput,
} from './shift.js';

describe('Shift Domain', () => {
  const validInput: CreateShiftInput = {
    tenantId: 'tenant-1',
    facilityId: 'facility-1',
    role: 'RN',
    startTime: new Date('2027-01-15T07:00:00Z'),
    endTime: new Date('2027-01-15T19:00:00Z'),
    businessDate: '2027-01-15',
    requiredWorkerCount: 2,
    payRateCents: 5000,
    billRateCents: 7500,
    createdBy: 'scheduler-1',
  };

  describe('createShift', () => {
    it('should create a shift in DRAFT status', () => {
      const shift = createShift(validInput);
      expect(shift.status).toBe('DRAFT');
      expect(shift.role).toBe('RN');
      expect(shift.requiredWorkerCount).toBe(2);
      expect(shift.filledWorkerCount).toBe(0);
      expect(shift.version).toBe(1);
    });

    it('should generate a UUID id', () => {
      const shift = createShift(validInput);
      expect(shift.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should accept optional department and notes', () => {
      const shift = createShift({
        ...validInput,
        departmentId: 'dept-1',
        notes: 'Night shift coverage',
      });
      expect(shift.departmentId).toBe('dept-1');
      expect(shift.notes).toBe('Night shift coverage');
    });

    it('should reject empty facility ID', () => {
      expect(() => createShift({ ...validInput, facilityId: '' })).toThrow('Facility ID');
    });

    it('should reject empty tenant ID', () => {
      expect(() => createShift({ ...validInput, tenantId: '' })).toThrow('Tenant ID');
    });

    it('should reject invalid role', () => {
      expect(() => createShift({ ...validInput, role: 'INVALID' as never })).toThrow(
        'Invalid role',
      );
    });

    it('should reject end time before start time', () => {
      expect(() =>
        createShift({
          ...validInput,
          startTime: new Date('2027-01-15T19:00:00Z'),
          endTime: new Date('2027-01-15T07:00:00Z'),
        }),
      ).toThrow('End time must be after start time');
    });

    it('should reject end time equal to start time', () => {
      const same = new Date('2027-01-15T07:00:00Z');
      expect(() => createShift({ ...validInput, startTime: same, endTime: same })).toThrow(
        'End time must be after start time',
      );
    });

    it('should reject zero required worker count', () => {
      expect(() => createShift({ ...validInput, requiredWorkerCount: 0 })).toThrow('at least 1');
    });

    it('should reject negative required worker count', () => {
      expect(() => createShift({ ...validInput, requiredWorkerCount: -1 })).toThrow('at least 1');
    });

    it('should reject zero pay rate', () => {
      expect(() => createShift({ ...validInput, payRateCents: 0 })).toThrow('Pay rate');
    });

    it('should reject negative pay rate', () => {
      expect(() => createShift({ ...validInput, payRateCents: -100 })).toThrow('Pay rate');
    });

    it('should reject zero bill rate', () => {
      expect(() => createShift({ ...validInput, billRateCents: 0 })).toThrow('Bill rate');
    });

    it('should reject invalid business date format', () => {
      expect(() => createShift({ ...validInput, businessDate: '01-15-2027' })).toThrow(
        'YYYY-MM-DD',
      );
    });

    it('should reject empty business date', () => {
      expect(() => createShift({ ...validInput, businessDate: '' })).toThrow('YYYY-MM-DD');
    });

    it('should support overnight shifts (end time next day)', () => {
      const shift = createShift({
        ...validInput,
        startTime: new Date('2027-01-15T23:00:00Z'),
        endTime: new Date('2027-01-16T07:00:00Z'),
        businessDate: '2027-01-15',
      });
      expect(shift.startTime.getDate()).not.toBe(shift.endTime.getDate());
    });

    it('should support all valid roles', () => {
      const roles = ['RN', 'LPN', 'CNA', 'RT', 'ALLIED'] as const;
      for (const role of roles) {
        const shift = createShift({ ...validInput, role });
        expect(shift.role).toBe(role);
      }
    });
  });

  describe('publishShift', () => {
    it('should transition DRAFT → PUBLISHED', () => {
      const draft = createShift(validInput);
      const published = publishShift(draft);
      expect(published.status).toBe('PUBLISHED');
      expect(published.publishedAt).toBeInstanceOf(Date);
      expect(published.version).toBe(2);
    });

    it('should reject publishing non-DRAFT shift', () => {
      const draft = createShift(validInput);
      const published = publishShift(draft);
      expect(() => publishShift(published)).toThrow('must be DRAFT');
    });
  });

  describe('cancelShift', () => {
    it('should cancel a DRAFT shift', () => {
      const shift = createShift(validInput);
      const cancelled = cancelShift(shift, 'Client cancelled');
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('Client cancelled');
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    });

    it('should cancel a PUBLISHED shift', () => {
      const shift = publishShift(createShift(validInput));
      const cancelled = cancelShift(shift, 'No workers available');
      expect(cancelled.status).toBe('CANCELLED');
    });

    it('should not cancel a COMPLETED shift', () => {
      const shift = { ...createShift(validInput), status: 'COMPLETED' as const };
      expect(() => cancelShift(shift, 'Too late')).toThrow('Cannot cancel');
    });

    it('should not cancel an already CANCELLED shift', () => {
      const shift = { ...createShift(validInput), status: 'CANCELLED' as const };
      expect(() => cancelShift(shift, 'Again')).toThrow('Cannot cancel');
    });

    it('should require a cancellation reason', () => {
      const shift = createShift(validInput);
      expect(() => cancelShift(shift, '')).toThrow('reason is required');
    });

    it('should trim the cancellation reason', () => {
      const shift = createShift(validInput);
      const cancelled = cancelShift(shift, '  spaces  ');
      expect(cancelled.cancellationReason).toBe('spaces');
    });
  });

  describe('changeShiftStatus', () => {
    it('should allow PUBLISHED → PARTIALLY_FILLED', () => {
      const shift = { ...createShift(validInput), status: 'PUBLISHED' as const };
      const changed = changeShiftStatus(shift, 'PARTIALLY_FILLED');
      expect(changed.status).toBe('PARTIALLY_FILLED');
    });

    it('should allow PARTIALLY_FILLED → FILLED', () => {
      const shift = { ...createShift(validInput), status: 'PARTIALLY_FILLED' as const };
      const changed = changeShiftStatus(shift, 'FILLED');
      expect(changed.status).toBe('FILLED');
    });

    it('should allow FILLED → IN_PROGRESS', () => {
      const shift = { ...createShift(validInput), status: 'FILLED' as const };
      const changed = changeShiftStatus(shift, 'IN_PROGRESS');
      expect(changed.status).toBe('IN_PROGRESS');
    });

    it('should allow IN_PROGRESS → COMPLETED', () => {
      const shift = { ...createShift(validInput), status: 'IN_PROGRESS' as const };
      const changed = changeShiftStatus(shift, 'COMPLETED');
      expect(changed.status).toBe('COMPLETED');
    });

    it('should reject invalid transition DRAFT → FILLED', () => {
      const shift = createShift(validInput);
      expect(() => changeShiftStatus(shift, 'FILLED')).toThrow('Invalid shift status transition');
    });

    it('should reject any transition from COMPLETED', () => {
      const shift = { ...createShift(validInput), status: 'COMPLETED' as const };
      expect(() => changeShiftStatus(shift, 'CANCELLED')).toThrow(
        'Invalid shift status transition',
      );
    });

    it('should reject any transition from CANCELLED', () => {
      const shift = { ...createShift(validInput), status: 'CANCELLED' as const };
      expect(() => changeShiftStatus(shift, 'DRAFT')).toThrow('Invalid shift status transition');
    });

    it('should increment version on valid transition', () => {
      const shift = { ...createShift(validInput), status: 'PUBLISHED' as const, version: 3 };
      const changed = changeShiftStatus(shift, 'PARTIALLY_FILLED');
      expect(changed.version).toBe(4);
    });
  });

  describe('getValidShiftTransitions', () => {
    it('should return valid transitions for DRAFT', () => {
      expect(getValidShiftTransitions('DRAFT')).toEqual(['PUBLISHED', 'CANCELLED']);
    });

    it('should return empty array for COMPLETED', () => {
      expect(getValidShiftTransitions('COMPLETED')).toEqual([]);
    });

    it('should return empty array for CANCELLED', () => {
      expect(getValidShiftTransitions('CANCELLED')).toEqual([]);
    });
  });

  describe('hasCapacity', () => {
    it('should return true when filled < required', () => {
      const shift = createShift(validInput);
      expect(hasCapacity(shift)).toBe(true);
    });

    it('should return false when filled = required', () => {
      const shift = { ...createShift(validInput), filledWorkerCount: 2 };
      expect(hasCapacity(shift)).toBe(false);
    });
  });

  describe('getShiftDurationHours', () => {
    it('should calculate 12 hours for 7am-7pm shift', () => {
      const shift = createShift(validInput);
      expect(getShiftDurationHours(shift)).toBe(12);
    });

    it('should calculate 8 hours for overnight shift', () => {
      const shift = createShift({
        ...validInput,
        startTime: new Date('2027-01-15T23:00:00Z'),
        endTime: new Date('2027-01-16T07:00:00Z'),
      });
      expect(getShiftDurationHours(shift)).toBe(8);
    });
  });
});
