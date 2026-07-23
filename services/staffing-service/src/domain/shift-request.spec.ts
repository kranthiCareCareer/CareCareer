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
  const now = new Date('2027-03-01T12:00:00Z');

  const validInput: CreateShiftRequestInput = {
    tenantId: 'tenant-1',
    shiftId: 'shift-1',
    workerId: 'worker-1',
    eligibilityEvaluationId: 'eval-1',
    correlationId: 'corr-1',
    asOf: now,
  };

  describe('createShiftRequest', () => {
    it('should create a request in REQUESTED status', () => {
      const req = createShiftRequest(validInput);
      expect(req.status).toBe('REQUESTED');
      expect(req.version).toBe(1);
      expect(req.shiftId).toBe('shift-1');
      expect(req.workerId).toBe('worker-1');
      expect(req.eligibilityEvaluationId).toBe('eval-1');
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

    it('should accept custom TTL within bounds', () => {
      const req = createShiftRequest({ ...validInput, ttlMs: 3600000 });
      const diff = req.expiresAt.getTime() - req.requestedAt.getTime();
      expect(diff).toBe(3600000);
    });

    it('should use injected asOf for deterministic timestamps', () => {
      const req = createShiftRequest(validInput);
      expect(req.requestedAt).toEqual(now);
      expect(req.createdAt).toEqual(now);
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

    it('should reject empty eligibility evaluation ID', () => {
      expect(() => createShiftRequest({ ...validInput, eligibilityEvaluationId: '' })).toThrow(
        'Eligibility evaluation ID',
      );
    });

    describe('TTL validation', () => {
      it('should reject TTL of zero', () => {
        expect(() => createShiftRequest({ ...validInput, ttlMs: 0 })).toThrow('at least');
      });

      it('should reject negative TTL', () => {
        expect(() => createShiftRequest({ ...validInput, ttlMs: -1000 })).toThrow('at least');
      });

      it('should reject NaN TTL', () => {
        expect(() => createShiftRequest({ ...validInput, ttlMs: NaN })).toThrow('finite positive');
      });

      it('should reject Infinity TTL', () => {
        expect(() => createShiftRequest({ ...validInput, ttlMs: Infinity })).toThrow(
          'finite positive',
        );
      });

      it('should reject non-integer TTL', () => {
        expect(() => createShiftRequest({ ...validInput, ttlMs: 3600000.5 })).toThrow(
          'finite positive',
        );
      });

      it('should reject TTL below minimum (5 minutes)', () => {
        expect(() => createShiftRequest({ ...validInput, ttlMs: 60000 })).toThrow('at least');
      });

      it('should reject TTL above maximum (7 days)', () => {
        const eightDays = 8 * 24 * 60 * 60 * 1000;
        expect(() => createShiftRequest({ ...validInput, ttlMs: eightDays })).toThrow(
          'must not exceed',
        );
      });

      it('should accept minimum TTL (5 minutes)', () => {
        const minTtl = 5 * 60 * 1000;
        const req = createShiftRequest({ ...validInput, ttlMs: minTtl });
        const diff = req.expiresAt.getTime() - req.requestedAt.getTime();
        expect(diff).toBe(minTtl);
      });

      it('should accept maximum TTL (7 days)', () => {
        const maxTtl = 7 * 24 * 60 * 60 * 1000;
        const req = createShiftRequest({ ...validInput, ttlMs: maxTtl });
        const diff = req.expiresAt.getTime() - req.requestedAt.getTime();
        expect(diff).toBe(maxTtl);
      });
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
    it('should confirm a REQUESTED request when not expired', () => {
      const req = createShiftRequest(validInput);
      const confirmTime = new Date(now.getTime() + 1000); // 1 second after creation
      const confirmed = confirmShiftRequest(req, 'scheduler-1', confirmTime);
      expect(confirmed.status).toBe('CONFIRMED');
      expect(confirmed.reviewedBy).toBe('scheduler-1');
      expect(confirmed.reviewedAt).toEqual(confirmTime);
      expect(confirmed.version).toBe(2);
    });

    it('should confirm an UNDER_REVIEW request', () => {
      const req = { ...createShiftRequest(validInput), status: 'UNDER_REVIEW' as const };
      const confirmTime = new Date(now.getTime() + 1000);
      const confirmed = confirmShiftRequest(req, 'scheduler-1', confirmTime);
      expect(confirmed.status).toBe('CONFIRMED');
    });

    it('should REJECT confirmation when TTL has expired', () => {
      const req = createShiftRequest(validInput);
      const afterExpiry = new Date(req.expiresAt.getTime() + 1);
      expect(() => confirmShiftRequest(req, 'scheduler-1', afterExpiry)).toThrow(
        'Cannot confirm expired request',
      );
    });

    it('should REJECT confirmation at exact expiry time', () => {
      const req = createShiftRequest(validInput);
      expect(() => confirmShiftRequest(req, 'scheduler-1', req.expiresAt)).toThrow(
        'Cannot confirm expired request',
      );
    });

    it('should reject confirmation of WITHDRAWN request', () => {
      const req = { ...createShiftRequest(validInput), status: 'WITHDRAWN' as const };
      expect(() => confirmShiftRequest(req, 'scheduler-1', now)).toThrow('Cannot confirm');
    });

    it('should reject confirmation of EXPIRED request', () => {
      const req = { ...createShiftRequest(validInput), status: 'EXPIRED' as const };
      expect(() => confirmShiftRequest(req, 'scheduler-1', now)).toThrow('Cannot confirm');
    });

    it('should require reviewer ID', () => {
      const req = createShiftRequest(validInput);
      expect(() => confirmShiftRequest(req, '', now)).toThrow('Reviewer ID');
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
      const req = createShiftRequest({ ...validInput, ttlMs: 300000 }); // 5 min
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
