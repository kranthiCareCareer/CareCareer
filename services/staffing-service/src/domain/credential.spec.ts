import { describe, it, expect } from 'vitest';

import {
  changeCredentialStatus,
  createCredential,
  getValidTransitions,
  isCredentialValid,
  verifyCredential,
  type Credential,
  type CredentialStatus,
} from './credential.js';

describe('Credential Domain', () => {
  const validInput = {
    tenantId: 'tenant-1',
    workerId: 'worker-1',
    credentialType: 'RN_LICENSE',
    issuingAuthority: 'State Board of Nursing',
    credentialNumber: 'RN-12345',
    issuedAt: new Date('2023-01-01'),
    expiresAt: new Date('2025-12-31'),
  };

  describe('createCredential', () => {
    it('should create a credential with valid input', () => {
      const cred = createCredential(validInput);

      expect(cred.id).toBeDefined();
      expect(cred.tenantId).toBe('tenant-1');
      expect(cred.workerId).toBe('worker-1');
      expect(cred.credentialType).toBe('RN_LICENSE');
      expect(cred.status).toBe('UPLOADED');
      expect(cred.issuingAuthority).toBe('State Board of Nursing');
      expect(cred.credentialNumber).toBe('RN-12345');
      expect(cred.issuedAt).toEqual(new Date('2023-01-01'));
      expect(cred.expiresAt).toEqual(new Date('2025-12-31'));
      expect(cred.verifiedAt).toBeUndefined();
      expect(cred.verifiedBy).toBeUndefined();
      expect(cred.version).toBe(1);
    });

    it('should trim credential type', () => {
      const cred = createCredential({ ...validInput, credentialType: '  BLS  ' });
      expect(cred.credentialType).toBe('BLS');
    });

    it('should trim issuing authority', () => {
      const cred = createCredential({ ...validInput, issuingAuthority: '  AHA  ' });
      expect(cred.issuingAuthority).toBe('AHA');
    });

    it('should create credential without optional fields', () => {
      const cred = createCredential({
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'BLS',
      });

      expect(cred.issuingAuthority).toBeUndefined();
      expect(cred.credentialNumber).toBeUndefined();
      expect(cred.issuedAt).toBeUndefined();
      expect(cred.expiresAt).toBeUndefined();
    });

    it('should reject empty credential type', () => {
      expect(() => createCredential({ ...validInput, credentialType: '' })).toThrow(
        'Credential type is required',
      );
    });

    it('should reject whitespace-only credential type', () => {
      expect(() => createCredential({ ...validInput, credentialType: '   ' })).toThrow(
        'Credential type is required',
      );
    });

    it('should reject empty worker ID', () => {
      expect(() => createCredential({ ...validInput, workerId: '' })).toThrow(
        'Worker ID is required',
      );
    });

    it('should reject empty tenant ID', () => {
      expect(() => createCredential({ ...validInput, tenantId: '' })).toThrow(
        'Tenant ID is required',
      );
    });
  });

  describe('changeCredentialStatus — state machine transitions', () => {
    const baseCred: Credential = {
      id: 'cred-1',
      tenantId: 'tenant-1',
      workerId: 'worker-1',
      credentialType: 'RN_LICENSE',
      status: 'UPLOADED',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe('valid transitions', () => {
      const validTransitions: Array<[CredentialStatus, CredentialStatus]> = [
        ['UPLOADED', 'PENDING_VERIFICATION'],
        ['UPLOADED', 'EXPIRED'],
        ['PENDING_VERIFICATION', 'VERIFIED'],
        ['PENDING_VERIFICATION', 'REJECTED'],
        ['PENDING_VERIFICATION', 'CORRECTION_REQUIRED'],
        ['PENDING_VERIFICATION', 'EXPIRED'],
        ['VERIFIED', 'EXPIRING'],
        ['VERIFIED', 'EXPIRED'],
        ['EXPIRING', 'EXPIRED'],
        ['EXPIRING', 'VERIFIED'],
        ['EXPIRED', 'UPLOADED'],
      ];

      for (const [from, to] of validTransitions) {
        it(`should allow ${from} → ${to}`, () => {
          const cred: Credential = { ...baseCred, status: from };
          const result = changeCredentialStatus(cred, to);
          expect(result.status).toBe(to);
          expect(result.version).toBe(baseCred.version + 1);
        });
      }
    });

    describe('invalid transitions', () => {
      const invalidTransitions: Array<[CredentialStatus, CredentialStatus]> = [
        ['UPLOADED', 'VERIFIED'],
        ['UPLOADED', 'EXPIRING'],
        ['PENDING_VERIFICATION', 'EXPIRING'],
        ['VERIFIED', 'UPLOADED'],
        ['VERIFIED', 'PENDING_VERIFICATION'],
        ['EXPIRING', 'UPLOADED'],
        ['EXPIRING', 'PENDING_VERIFICATION'],
        ['EXPIRED', 'VERIFIED'],
        ['EXPIRED', 'PENDING_VERIFICATION'],
        ['EXPIRED', 'EXPIRING'],
      ];

      for (const [from, to] of invalidTransitions) {
        it(`should reject ${from} → ${to}`, () => {
          const cred: Credential = { ...baseCred, status: from };
          expect(() => changeCredentialStatus(cred, to)).toThrow(
            'Invalid credential status transition',
          );
        });
      }
    });

    it('should not mutate the original credential', () => {
      const cred: Credential = { ...baseCred, status: 'UPLOADED' };
      const result = changeCredentialStatus(cred, 'PENDING_VERIFICATION');
      expect(cred.status).toBe('UPLOADED');
      expect(result.status).toBe('PENDING_VERIFICATION');
    });
  });

  describe('verifyCredential', () => {
    const pendingCred: Credential = {
      id: 'cred-1',
      tenantId: 'tenant-1',
      workerId: 'worker-1',
      credentialType: 'RN_LICENSE',
      status: 'PENDING_VERIFICATION',
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should verify a PENDING_VERIFICATION credential', () => {
      const result = verifyCredential(pendingCred, 'compliance-officer-1');
      expect(result.status).toBe('VERIFIED');
      expect(result.verifiedBy).toBe('compliance-officer-1');
      expect(result.verifiedAt).toBeDefined();
      expect(result.version).toBe(3);
    });

    it('should trim verifiedBy', () => {
      const result = verifyCredential(pendingCred, '  officer-1  ');
      expect(result.verifiedBy).toBe('officer-1');
    });

    it('should reject verification of UPLOADED credential', () => {
      const uploaded: Credential = { ...pendingCred, status: 'UPLOADED' };
      expect(() => verifyCredential(uploaded, 'officer-1')).toThrow('must be PENDING_VERIFICATION');
    });

    it('should reject verification of VERIFIED credential', () => {
      const verified: Credential = { ...pendingCred, status: 'VERIFIED' };
      expect(() => verifyCredential(verified, 'officer-1')).toThrow('must be PENDING_VERIFICATION');
    });

    it('should reject verification of EXPIRED credential', () => {
      const expired: Credential = { ...pendingCred, status: 'EXPIRED' };
      expect(() => verifyCredential(expired, 'officer-1')).toThrow('must be PENDING_VERIFICATION');
    });

    it('should reject empty verifiedBy', () => {
      expect(() => verifyCredential(pendingCred, '')).toThrow('Verified by is required');
    });

    it('should reject whitespace-only verifiedBy', () => {
      expect(() => verifyCredential(pendingCred, '   ')).toThrow('Verified by is required');
    });
  });

  describe('isCredentialValid', () => {
    const now = new Date('2024-06-15T12:00:00Z');

    it('should return true for VERIFIED credential without expiry', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'BLS',
        status: 'VERIFIED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(true);
    });

    it('should return true for VERIFIED credential with future expiry', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'RN_LICENSE',
        status: 'VERIFIED',
        expiresAt: new Date('2025-01-01'),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(true);
    });

    it('should return true for EXPIRING credential with future expiry', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'RN_LICENSE',
        status: 'EXPIRING',
        expiresAt: new Date('2024-07-01'),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(true);
    });

    it('should return false for VERIFIED credential with past expiry', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'RN_LICENSE',
        status: 'VERIFIED',
        expiresAt: new Date('2024-01-01'),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(false);
    });

    it('should return false for credential expiring exactly at asOf', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'RN_LICENSE',
        status: 'VERIFIED',
        expiresAt: now,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(false);
    });

    it('should return false for UPLOADED credential', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'BLS',
        status: 'UPLOADED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(false);
    });

    it('should return false for PENDING_VERIFICATION credential', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'BLS',
        status: 'PENDING_VERIFICATION',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(false);
    });

    it('should return false for EXPIRED credential', () => {
      const cred: Credential = {
        id: 'cred-1',
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        credentialType: 'BLS',
        status: 'EXPIRED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isCredentialValid(cred, now)).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('should return valid transitions for UPLOADED', () => {
      expect(getValidTransitions('UPLOADED')).toEqual(['PENDING_VERIFICATION', 'EXPIRED']);
    });

    it('should return valid transitions for PENDING_VERIFICATION', () => {
      expect(getValidTransitions('PENDING_VERIFICATION')).toEqual([
        'VERIFIED',
        'REJECTED',
        'CORRECTION_REQUIRED',
        'EXPIRED',
      ]);
    });

    it('should return valid transitions for VERIFIED', () => {
      expect(getValidTransitions('VERIFIED')).toEqual([
        'EXPIRING',
        'EXPIRED',
        'REVOKED',
        'SUPERSEDED',
      ]);
    });

    it('should return valid transitions for EXPIRING', () => {
      expect(getValidTransitions('EXPIRING')).toEqual(['EXPIRED', 'VERIFIED', 'REVOKED']);
    });

    it('should return valid transitions for EXPIRED', () => {
      expect(getValidTransitions('EXPIRED')).toEqual(['UPLOADED']);
    });

    it('should return a copy (not reference to internal state)', () => {
      const transitions = getValidTransitions('UPLOADED');
      transitions.push('VERIFIED');
      expect(getValidTransitions('UPLOADED')).toEqual(['PENDING_VERIFICATION', 'EXPIRED']);
    });
  });
});
