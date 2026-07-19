import { describe, it, expect } from 'vitest';

import {
  createSession,
  generateRefreshToken,
  hashToken,
  isSessionRefreshable,
  revokeSession,
  rotateRefreshToken,
  verifyRefreshToken,
} from './session.js';

describe('Session Domain', () => {
  describe('generateRefreshToken', () => {
    it('should generate a random token and its SHA-256 hash', () => {
      const { rawToken, hash } = generateRefreshToken();
      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBeGreaterThan(20);
      expect(hash).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(hash).toBe(hashToken(rawToken));
    });

    it('should generate unique tokens', () => {
      const t1 = generateRefreshToken();
      const t2 = generateRefreshToken();
      expect(t1.rawToken).not.toBe(t2.rawToken);
      expect(t1.hash).not.toBe(t2.hash);
    });
  });

  describe('createSession', () => {
    it('should create an active session with 7-day expiry', () => {
      const { session, refreshToken } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      expect(session.status).toBe('ACTIVE');
      expect(session.userId).toBe('22222222-2222-2222-2222-222222222222');
      expect(session.tokenFamily).toBe('33333333-3333-3333-3333-333333333333');
      expect(refreshToken.length).toBeGreaterThan(20);
      expect(session.refreshTokenHash).toBe(hashToken(refreshToken));

      // Expiry should be ~7 days from now
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const diff = session.expiresAt.getTime() - session.createdAt.getTime();
      expect(diff).toBeCloseTo(sevenDays, -3); // within 1 second
    });

    it('should not store raw refresh token in session', () => {
      const { session, refreshToken } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      // The raw token should not appear anywhere in the session object
      const sessionJson = JSON.stringify(session);
      expect(sessionJson).not.toContain(refreshToken);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify correct token', () => {
      const { session, refreshToken } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      expect(verifyRefreshToken(session, refreshToken)).toBe(true);
    });

    it('should reject incorrect token', () => {
      const { session } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      expect(verifyRefreshToken(session, 'wrong-token')).toBe(false);
    });
  });

  describe('rotateRefreshToken', () => {
    it('should generate a new token and update the hash', () => {
      const { session, refreshToken: oldToken } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      const { updatedSession, refreshToken: newToken } = rotateRefreshToken(session);

      expect(newToken).not.toBe(oldToken);
      expect(updatedSession.refreshTokenHash).not.toBe(session.refreshTokenHash);
      expect(verifyRefreshToken(updatedSession, newToken)).toBe(true);
      expect(verifyRefreshToken(updatedSession, oldToken)).toBe(false);
    });
  });

  describe('isSessionRefreshable', () => {
    it('should return true for active non-expired session', () => {
      const { session } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      expect(isSessionRefreshable(session)).toBe(true);
    });

    it('should return false for revoked session', () => {
      const { session } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      const revoked = revokeSession(session);
      expect(isSessionRefreshable(revoked)).toBe(false);
    });

    it('should return false for expired session', () => {
      const { session } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      // Force expire
      const expired = { ...session, expiresAt: new Date(Date.now() - 1000) };
      expect(isSessionRefreshable(expired)).toBe(false);
    });
  });

  describe('revokeSession', () => {
    it('should set status to REVOKED with timestamp', () => {
      const { session } = createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tokenFamily: '33333333-3333-3333-3333-333333333333',
      });

      const revoked = revokeSession(session);
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revokedAt).not.toBeNull();
    });
  });

  describe('Maximum sessions enforcement', () => {
    it('should support creating up to 5 sessions (enforcement at application level)', () => {
      // Domain creates individual sessions; max-5 is enforced in the command handler
      const sessions = Array.from({ length: 5 }, (_, i) =>
        createSession({
          id: `1111111${i}-1111-1111-1111-111111111111`,
          userId: '22222222-2222-2222-2222-222222222222',
          tokenFamily: `3333333${i}-3333-3333-3333-333333333333`,
        }),
      );
      expect(sessions).toHaveLength(5);
    });
  });
});
