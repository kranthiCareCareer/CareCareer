import { describe, it, expect } from 'vitest';

import {
  createShiftRequest,
  withdrawShiftRequest,
  confirmShiftRequest,
  rejectShiftRequest,
  expireShiftRequest,
  isRequestExpired,
  getValidRequestTransitions,
  type CreateShiftRequestInput,
} from './shift-request.js';

describe('ShiftRequest Domain', () => {
  const validInput: CreateShiftRequestInput = {
    tenantId: 'tenant-1',
    shiftId: 'shift-1',
    workerId: 'worker-1',
    correlationId: 'corr-1',
  };

  describe('createShiftRequest', () => {
    it('should create a request in REQUESTED status', () => {
      const req = createShiftRequest(validInput);
      expect(req.status).toBe('REQUESTED');
      expect(req.version).toBe(1);
      expect(req.shiftId).toBe('shift-1');
      expect(req.workerId).toBe('worker-1');
    });

    it('should generate a UUID id', () => {
      const req = createShiftRequest(validInput);
      expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should set default TTL of 24 hours', () => {
      const req = createShiftRequest(validInput);
      const diff = req.expiresAt.getTime() - req.requestedAt.getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    });

    it('should accept custom TTL', () => {
      const req = createShiftRequest({ ...validInput, ttlMs: 3600000 });
      const diff = req.expiresAt.getTime() - req.requestedAt.getTime();
      expect(diff).toBe(3600000);
    });

    it('should store eligibility evaluation ID', () => {
      const req = createShiftRequest({ ...validInput, eligibilityEvaluationId: 'eval-1' });
      expect(req.eligibilityEvaluationId).toBe('eval-1');
    });

    it('should reject empty tenant ID', () => {
      expect(() => createShiftRequest({ ...validInput, tenantId: '' })).toThrow('Tenant ID');
    });

    it('should reject empty shift ID', () => {
      expect(() => createShiftRequest({ ...validInput, shiftId: '' })).toThrow('Shift ID');
    });

    it('should reject empty worker ID', () => {
      expect(() => createShiftRequest({ ...validInput, workerId: '' })).toThrow('Worker ID');
    });
  });

  describe('withdrawShiftRequest', () => {
    it('should withdraw a REQUESTED request', () => {
      const req = createShiftRequest(validInput);
      const withdrawn = withdrawShiftRequest(req);
      expect(withdrawn.status).toBe('WITHDRAWN');
      expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);
      expect(withdrawn.version).toBe(2);
    });

    it('should withdraw an UNDER_REVIEW request', () => {
      const req = { ...createShiftRequest(validInput), status: 'UNDER_REVIEW' as const };
      const withdrawn = withdrawShiftRequest(req);
      expect(withdrawn.status).toBe('WITHDRAWN');
    });

    it('should reject withdrawal from CONFIRMED', () => {
      const req = { ...createShiftRequest(validInput), status: 'CONFIRMED' as const };
      expect(() => withdrawShiftRequest(req)).toThrow('Cannot withdraw');
    });

    it('should reject withdrawal from REJECTED', () => {
      const req = { ...createShiftRequest(validInput), status: 'REJECTED' as const };
      expect(() => withdrawShiftRequest(req)).toThrow('Cannot withdraw');
    });

    it('should reject withdrawal from EXPIRED', () => {
      const req = { ...createShiftRequest(validInput), status: 'EXPIRED' as const };
      expect(() => withdrawShiftRequest(req)).toThrow('Cannot withdraw');
    });
  });

  describe('confirmShiftRequest', () => {
    it('should confirm a REQUESTED request', () => {
      const req = createShiftRequest(validInput);
      const confirmed = confirmShiftRequest(req, 'scheduler-1');
      expect(confirmed.status).toBe('CONFIRMED');
      expect(confirmed.reviewedBy).toBe('scheduler-1');
      expect(confirmed.reviewedAt).toBeInstanceOf(Date);
      expect(confirmed.version).toBe(2);
    });

    it('should confirm an UNDER_REVIEW request', () => {
      const req = { ...createShiftRequest(validInput), status: 'UNDER_REVIEW' as const };
      const confirmed = confirmShiftRequest(req, 'scheduler-1');
      expect(confirmed.status).toBe('CONFIRMED');
    });

    it('should reject confirmation of WITHDRAWN request', () => {
      const req = { ...createShiftRequest(validInput), status: 'WITHDRAWN' as const };
      expect(() => confirmShiftRequest(req, 'scheduler-1')).toThrow('Cannot confirm');
    });

    it('should reject confirmation of EXPIRED request', () => {
      const req = { ...createShiftRequest(validInput), status: 'EXPIRED' as const };
      expect(() => confirmShiftRequest(req, 'scheduler-1')).toThrow('Cannot confirm');
    });

    it('should require reviewer ID', () => {
      const req = createShiftRequest(validInput);
      expect(() => confirmShiftRequest(req, '')).toThrow('Reviewer ID');
    });
  });

  describe('rejectShiftRequest', () => {
    it('should reject a REQUESTED request with reason', () => {
      const req = createShiftRequest(validInput);
      const rejected = rejectShiftRequest(req, 'scheduler-1', 'Position filled');
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('Position filled');
      expect(rejected.reviewedBy).toBe('scheduler-1');
    });

    it('should reject an UNDER_REVIEW request', () => {
      const req = { ...createShiftRequest(validInput), status: 'UNDER_REVIEW' as const };
      const rejected = rejectShiftRequest(req, 'admin', 'Not qualified');
      expect(rejected.status).toBe('REJECTED');
    });

    it('should not reject a CONFIRMED request', () => {
      const req = { ...createShiftRequest(validInput), status: 'CONFIRMED' as const };
      expect(() => rejectShiftRequest(req, 'admin', 'reason')).toThrow('Cannot reject');
    });

    it('should require reason', () => {
      const req = createShiftRequest(validInput);
      expect(() => rejectShiftRequest(req, 'admin', '')).toThrow('Rejection reason');
    });

    it('should require reviewer ID', () => {
      const req = createShiftRequest(validInput);
      expect(() => rejectShiftRequest(req, '', 'reason')).toThrow('Reviewer ID');
    });
  });

  describe('expireShiftRequest', () => {
    it('should expire a REQUESTED request', () => {
      const req = createShiftRequest(validInput);
      const expired = expireShiftRequest(req);
      expect(expired.status).toBe('EXPIRED');
      expect(expired.version).toBe(2);
    });

    it('should not expire an UNDER_REVIEW request', () => {
      const req = { ...createShiftRequest(validInput), status: 'UNDER_REVIEW' as const };
      expect(() => expireShiftRequest(req)).toThrow('Cannot expire');
    });

    it('should not expire a CONFIRMED request', () => {
      const req = { ...createShiftRequest(validInput), status: 'CONFIRMED' as const };
      expect(() => expireShiftRequest(req)).toThrow('Cannot expire');
    });
  });

  describe('isRequestExpired', () => {
    it('should return true when past expiry and REQUESTED', () => {
      const req = createShiftRequest({ ...validInput, ttlMs: 1000 });
      const future = new Date(req.expiresAt.getTime() + 1);
      expect(isRequestExpired(req, future)).toBe(true);
    });

    it('should return false when before expiry', () => {
      const req = createShiftRequest(validInput);
      expect(isRequestExpired(req, req.requestedAt)).toBe(false);
    });

    it('should return false for non-REQUESTED status', () => {
      const req = { ...createShiftRequest(validInput), status: 'CONFIRMED' as const };
      const future = new Date(req.expiresAt.getTime() + 1);
      expect(isRequestExpired(req, future)).toBe(false);
    });
  });

  describe('getValidRequestTransitions', () => {
    it('should return all transitions from REQUESTED', () => {
      const transitions = getValidRequestTransitions('REQUESTED');
      expect(transitions).toContain('UNDER_REVIEW');
      expect(transitions).toContain('CONFIRMED');
      expect(transitions).toContain('REJECTED');
      expect(transitions).toContain('WITHDRAWN');
      expect(transitions).toContain('EXPIRED');
    });

    it('should return empty for terminal states', () => {
      expect(getValidRequestTransitions('CONFIRMED')).toEqual([]);
      expect(getValidRequestTransitions('REJECTED')).toEqual([]);
      expect(getValidRequestTransitions('WITHDRAWN')).toEqual([]);
      expect(getValidRequestTransitions('EXPIRED')).toEqual([]);
    });
  });
});
