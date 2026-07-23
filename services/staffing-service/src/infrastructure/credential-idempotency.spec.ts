import { describe, it, expect } from 'vitest';

import { hashRequest, IdempotencyConflictError } from './credential-idempotency.js';

describe('Credential Idempotency', () => {
  describe('hashRequest', () => {
    it('should produce deterministic hash for same payload', () => {
      const payload = { credentialType: 'BLS', workerId: 'w-1' };
      const hash1 = hashRequest(payload);
      const hash2 = hashRequest(payload);
      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of key order', () => {
      const payload1 = { a: '1', b: '2', c: '3' };
      const payload2 = { c: '3', a: '1', b: '2' };
      expect(hashRequest(payload1)).toBe(hashRequest(payload2));
    });

    it('should produce different hash for different payloads', () => {
      const hash1 = hashRequest({ credentialType: 'BLS' });
      const hash2 = hashRequest({ credentialType: 'ACLS' });
      expect(hash1).not.toBe(hash2);
    });

    it('should produce a 64-character hex string (SHA-256)', () => {
      const hash = hashRequest({ test: 'value' });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('IdempotencyConflictError', () => {
    it('should have correct code and status', () => {
      const err = new IdempotencyConflictError();
      expect(err.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(err.httpStatus).toBe(409);
      expect(err.message).toContain('different request');
    });
  });
});
