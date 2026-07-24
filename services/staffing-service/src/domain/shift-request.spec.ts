import { describe, it, expect } from 'vitest';

import {
  createShiftRequest,
  confirmShiftRequest,
  rejectShiftRequest,
  withdrawShiftRequest,
  expireShiftRequest,
  getValidRequestTransitions,
} from './shift-request.js';
import type { ShiftRequest } from './shift-request.js';

function makeRequest(overrides: Partial<ShiftRequest> = {}): ShiftRequest {
  return {
    id: 'req-1',
    tenantId: 'tenant-1',
    shiftId: 'shift-1',
    workerId: 'worker-1',
    status: 'REQUESTED',
    submittedAt: new Date('2026-01-01'),
    reviewedAt: undefined,
    reviewedBy: undefined,
    rejectionReason: undefined,
    withdrawnAt: undefined,
    expiresAt: undefined,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('ShiftRequest', () => {
  describe('createShiftRequest', () => {
    it('should create a request in REQUESTED status', () => {
      const request = createShiftRequest({
        tenantId: 'tenant-1',
        shiftId: 'shift-1',
        workerId: 'worker-1',
      });
      expect(request.status).toBe('REQUESTED');
      expect(request.version).toBe(1);
      expect(request.tenantId).toBe('tenant-1');
      expect(request.shiftId).toBe('shift-1');
      expect(request.workerId).toBe('worker-1');
    });

    it('should reject missing tenantId', () => {
      expect(() =>
        createShiftRequest({ tenantId: '', shiftId: 'shift-1', workerId: 'worker-1' }),
      ).toThrow('Tenant ID is required');
    });

    it('should reject missing shiftId', () => {
      expect(() =>
        createShiftRequest({ tenantId: 'tenant-1', shiftId: '', workerId: 'worker-1' }),
      ).toThrow('Shift ID is required');
    });

    it('should reject missing workerId', () => {
      expect(() =>
        createShiftRequest({ tenantId: 'tenant-1', shiftId: 'shift-1', workerId: '' }),
      ).toThrow('Worker ID is required');
    });
  });

  describe('confirmShiftRequest', () => {
    it('should transition REQUESTED → CONFIRMED', () => {
      const request = makeRequest({ status: 'REQUESTED' });
      const confirmed = confirmShiftRequest(request, 'admin-1');
      expect(confirmed.status).toBe('CONFIRMED');
      expect(confirmed.reviewedBy).toBe('admin-1');
      expect(confirmed.reviewedAt).toBeInstanceOf(Date);
      expect(confirmed.version).toBe(2);
    });

    it('should transition UNDER_REVIEW → CONFIRMED', () => {
      const request = makeRequest({ status: 'UNDER_REVIEW' });
      const confirmed = confirmShiftRequest(request, 'admin-1');
      expect(confirmed.status).toBe('CONFIRMED');
    });

    it('should reject confirmation from CONFIRMED', () => {
      const request = makeRequest({ status: 'CONFIRMED' });
      expect(() => confirmShiftRequest(request, 'admin-1')).toThrow(
        'Invalid shift request transition',
      );
    });

    it('should reject confirmation from REJECTED', () => {
      const request = makeRequest({ status: 'REJECTED' });
      expect(() => confirmShiftRequest(request, 'admin-1')).toThrow();
    });

    it('should reject empty reviewer', () => {
      const request = makeRequest({ status: 'REQUESTED' });
      expect(() => confirmShiftRequest(request, '')).toThrow('Reviewer is required');
    });
  });

  describe('rejectShiftRequest', () => {
    it('should transition REQUESTED → REJECTED with reason', () => {
      const request = makeRequest({ status: 'REQUESTED' });
      const rejected = rejectShiftRequest(request, 'admin-1', 'Not eligible');
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('Not eligible');
      expect(rejected.reviewedBy).toBe('admin-1');
    });

    it('should reject empty reason', () => {
      const request = makeRequest({ status: 'REQUESTED' });
      expect(() => rejectShiftRequest(request, 'admin-1', '')).toThrow(
        'Rejection reason is required',
      );
    });

    it('should reject from terminal state', () => {
      const request = makeRequest({ status: 'WITHDRAWN' });
      expect(() => rejectShiftRequest(request, 'admin-1', 'reason')).toThrow();
    });
  });

  describe('withdrawShiftRequest', () => {
    it('should transition REQUESTED → WITHDRAWN', () => {
      const request = makeRequest({ status: 'REQUESTED' });
      const withdrawn = withdrawShiftRequest(request);
      expect(withdrawn.status).toBe('WITHDRAWN');
      expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);
    });

    it('should reject withdrawal from CONFIRMED', () => {
      const request = makeRequest({ status: 'CONFIRMED' });
      expect(() => withdrawShiftRequest(request)).toThrow();
    });
  });

  describe('expireShiftRequest', () => {
    it('should transition REQUESTED → EXPIRED', () => {
      const request = makeRequest({ status: 'REQUESTED' });
      const expired = expireShiftRequest(request);
      expect(expired.status).toBe('EXPIRED');
    });

    it('should reject expiry from CONFIRMED', () => {
      const request = makeRequest({ status: 'CONFIRMED' });
      expect(() => expireShiftRequest(request)).toThrow();
    });
  });

  describe('getValidRequestTransitions', () => {
    it('should return valid transitions for REQUESTED', () => {
      const transitions = getValidRequestTransitions('REQUESTED');
      expect(transitions).toContain('CONFIRMED');
      expect(transitions).toContain('REJECTED');
      expect(transitions).toContain('WITHDRAWN');
      expect(transitions).toContain('EXPIRED');
    });

    it('should return empty for terminal states', () => {
      expect(getValidRequestTransitions('CONFIRMED')).toHaveLength(0);
      expect(getValidRequestTransitions('REJECTED')).toHaveLength(0);
      expect(getValidRequestTransitions('WITHDRAWN')).toHaveLength(0);
      expect(getValidRequestTransitions('EXPIRED')).toHaveLength(0);
    });
  });
});
