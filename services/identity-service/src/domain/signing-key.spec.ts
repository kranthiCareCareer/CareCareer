import { describe, it, expect } from 'vitest';

import { createSigningKey, rotateSigningKey, revokeSigningKey } from './signing-key.js';

describe('SigningKey Domain', () => {
  const params = {
    id: '00000000-0000-0000-0000-000000000001',
    algorithm: 'RS256' as const,
    publicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
    privateKeyRef: 'arn:aws:kms:us-east-1:123456789:key/abc',
  };

  describe('createSigningKey', () => {
    it('should create a key with ACTIVE status', () => {
      const key = createSigningKey(params);
      expect(key.id).toBe(params.id);
      expect(key.algorithm).toBe('RS256');
      expect(key.publicKey).toBe(params.publicKey);
      expect(key.privateKeyRef).toBe(params.privateKeyRef);
      expect(key.status).toBe('ACTIVE');
      expect(key.activatedAt).toBeInstanceOf(Date);
      expect(key.rotatedAt).toBeNull();
      expect(key.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('rotateSigningKey', () => {
    it('should transition to ROTATED with rotatedAt timestamp', () => {
      const key = createSigningKey(params);
      const rotated = rotateSigningKey(key);
      expect(rotated.status).toBe('ROTATED');
      expect(rotated.rotatedAt).toBeInstanceOf(Date);
      expect(rotated.id).toBe(key.id);
      expect(rotated.publicKey).toBe(key.publicKey);
    });
  });

  describe('revokeSigningKey', () => {
    it('should transition to REVOKED', () => {
      const key = createSigningKey(params);
      const revoked = revokeSigningKey(key);
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.id).toBe(key.id);
    });

    it('should revoke a rotated key', () => {
      const key = createSigningKey(params);
      const rotated = rotateSigningKey(key);
      const revoked = revokeSigningKey(rotated);
      expect(revoked.status).toBe('REVOKED');
    });
  });
});
