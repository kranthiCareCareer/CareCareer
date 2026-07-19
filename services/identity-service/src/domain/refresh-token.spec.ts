import { describe, it, expect } from 'vitest';

import {
  createRefreshTokenRecord,
  isReplayCandidate,
  isTokenUsable,
  markTokenCompromised,
  markTokenRotated,
} from './refresh-token.js';

describe('RefreshToken Domain', () => {
  const baseParams = {
    id: '00000000-0000-0000-0000-000000000001',
    sessionId: '00000000-0000-0000-0000-000000000002',
    tokenFamilyId: '00000000-0000-0000-0000-000000000003',
    tokenHash: 'abcdef1234567890',
    parentTokenId: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  describe('createRefreshTokenRecord', () => {
    it('should create a token with ACTIVE status', () => {
      const token = createRefreshTokenRecord(baseParams);
      expect(token.status).toBe('ACTIVE');
      expect(token.id).toBe(baseParams.id);
      expect(token.sessionId).toBe(baseParams.sessionId);
      expect(token.tokenFamilyId).toBe(baseParams.tokenFamilyId);
      expect(token.tokenHash).toBe(baseParams.tokenHash);
      expect(token.parentTokenId).toBeNull();
      expect(token.usedAt).toBeNull();
      expect(token.revokedAt).toBeNull();
      expect(token.revocationReason).toBeNull();
    });

    it('should set parentTokenId when provided', () => {
      const token = createRefreshTokenRecord({
        ...baseParams,
        parentTokenId: '00000000-0000-0000-0000-000000000099',
      });
      expect(token.parentTokenId).toBe('00000000-0000-0000-0000-000000000099');
    });
  });

  describe('markTokenRotated', () => {
    it('should set status to ROTATED and record usedAt', () => {
      const token = createRefreshTokenRecord(baseParams);
      const rotated = markTokenRotated(token);
      expect(rotated.status).toBe('ROTATED');
      expect(rotated.usedAt).toBeInstanceOf(Date);
    });
  });

  describe('markTokenCompromised', () => {
    it('should set status to COMPROMISED with reason', () => {
      const token = createRefreshTokenRecord(baseParams);
      const compromised = markTokenCompromised(token, 'replay_detected');
      expect(compromised.status).toBe('COMPROMISED');
      expect(compromised.revocationReason).toBe('replay_detected');
      expect(compromised.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('isReplayCandidate', () => {
    it('should return true for ROTATED status', () => {
      expect(isReplayCandidate('ROTATED')).toBe(true);
    });

    it('should return false for ACTIVE status', () => {
      expect(isReplayCandidate('ACTIVE')).toBe(false);
    });

    it('should return false for COMPROMISED status', () => {
      expect(isReplayCandidate('COMPROMISED')).toBe(false);
    });

    it('should return false for REVOKED status', () => {
      expect(isReplayCandidate('REVOKED')).toBe(false);
    });

    it('should return false for EXPIRED status', () => {
      expect(isReplayCandidate('EXPIRED')).toBe(false);
    });
  });

  describe('isTokenUsable', () => {
    it('should return true for ACTIVE token within expiry', () => {
      const token = createRefreshTokenRecord(baseParams);
      expect(isTokenUsable(token)).toBe(true);
    });

    it('should return false for ROTATED token', () => {
      const token = markTokenRotated(createRefreshTokenRecord(baseParams));
      expect(isTokenUsable(token)).toBe(false);
    });

    it('should return false for expired token', () => {
      const token = createRefreshTokenRecord({
        ...baseParams,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(isTokenUsable(token)).toBe(false);
    });

    it('should return false for COMPROMISED token', () => {
      const token = markTokenCompromised(createRefreshTokenRecord(baseParams), 'test');
      expect(isTokenUsable(token)).toBe(false);
    });
  });
});
