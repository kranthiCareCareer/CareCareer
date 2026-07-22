import { describe, it, expect } from 'vitest';

import { createCredentialRequirement, VALID_WORKER_ROLES } from './credential-requirement.js';

describe('CredentialRequirement Domain', () => {
  const validInput = {
    tenantId: 'tenant-1',
    facilityId: 'facility-1',
    role: 'RN' as const,
    credentialType: 'RN_LICENSE',
  };

  describe('createCredentialRequirement', () => {
    it('should create a requirement with valid input', () => {
      const req = createCredentialRequirement(validInput);
      expect(req.id).toBeDefined();
      expect(req.tenantId).toBe('tenant-1');
      expect(req.facilityId).toBe('facility-1');
      expect(req.role).toBe('RN');
      expect(req.credentialType).toBe('RN_LICENSE');
      expect(req.required).toBe(true);
      expect(req.effectiveFrom).toBeInstanceOf(Date);
      expect(req.departmentId).toBeUndefined();
    });

    it('should default required to true', () => {
      const req = createCredentialRequirement(validInput);
      expect(req.required).toBe(true);
    });

    it('should allow required = false (optional credential)', () => {
      const req = createCredentialRequirement({ ...validInput, required: false });
      expect(req.required).toBe(false);
    });

    it('should accept department-scoped requirement', () => {
      const req = createCredentialRequirement({
        ...validInput,
        departmentId: 'dept-1',
      });
      expect(req.departmentId).toBe('dept-1');
    });

    it('should accept custom effectiveFrom date', () => {
      const futureDate = new Date('2026-09-01T00:00:00Z');
      const req = createCredentialRequirement({
        ...validInput,
        effectiveFrom: futureDate,
      });
      expect(req.effectiveFrom).toEqual(futureDate);
    });

    it('should reject empty credential type', () => {
      expect(() => createCredentialRequirement({ ...validInput, credentialType: '' })).toThrow(
        'Credential type is required',
      );
    });

    it('should reject whitespace-only credential type', () => {
      expect(() => createCredentialRequirement({ ...validInput, credentialType: '   ' })).toThrow(
        'Credential type is required',
      );
    });

    it('should trim credential type', () => {
      const req = createCredentialRequirement({
        ...validInput,
        credentialType: '  BLS_CERT  ',
      });
      expect(req.credentialType).toBe('BLS_CERT');
    });

    it('should reject invalid worker role', () => {
      expect(() =>
        createCredentialRequirement({ ...validInput, role: 'INVALID' as never }),
      ).toThrow('Invalid worker role');
    });

    it('should accept all valid worker roles', () => {
      for (const role of VALID_WORKER_ROLES) {
        const req = createCredentialRequirement({ ...validInput, role });
        expect(req.role).toBe(role);
      }
    });
  });
});
