import { describe, it, expect } from 'vitest';

import {
  hashRequest,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from './credential-idempotency.js';

describe('Credential Idempotency', () => {
  describe('hashRequest', () => {
    it('should produce deterministic hash for same payload', () => {
      const payload = { credentialType: 'BLS', workerId: 'w-1' };
      expect(hashRequest(payload)).toBe(hashRequest(payload));
    });

    it('should produce same hash regardless of top-level key order', () => {
      const a = { x: '1', y: '2', z: '3' };
      const b = { z: '3', x: '1', y: '2' };
      expect(hashRequest(a)).toBe(hashRequest(b));
    });

    it('should produce same hash regardless of nested key order', () => {
      const a = { outer: { b: 2, a: 1 } };
      const b = { outer: { a: 1, b: 2 } };
      expect(hashRequest(a)).toBe(hashRequest(b));
    });

    it('should produce different hash for different payloads', () => {
      expect(hashRequest({ type: 'BLS' })).not.toBe(hashRequest({ type: 'ACLS' }));
    });

    it('should handle null values', () => {
      const hash = hashRequest({ a: null, b: 'value' });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle arrays', () => {
      const a = { items: [1, 2, 3] };
      const b = { items: [1, 2, 3] };
      expect(hashRequest(a)).toBe(hashRequest(b));
    });

    it('should differentiate array order', () => {
      expect(hashRequest({ items: [1, 2] })).not.toBe(hashRequest({ items: [2, 1] }));
    });

    it('should handle Date values', () => {
      const date = new Date('2027-01-01T00:00:00Z');
      const hash = hashRequest({ expiresAt: date });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce a 64-character hex string (SHA-256)', () => {
      expect(hashRequest({ test: 'value' })).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('IdempotencyConflictError', () => {
    it('should have correct code and status', () => {
      const err = new IdempotencyConflictError();
      expect(err.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(err.httpStatus).toBe(409);
    });
  });

  describe('IdempotencyInProgressError', () => {
    it('should have correct code and status', () => {
      const err = new IdempotencyInProgressError();
      expect(err.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(err.httpStatus).toBe(409);
    });
  });
});
