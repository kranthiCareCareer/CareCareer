import { describe, it, expect } from 'vitest';

import type { CredentialRequirement } from './credential-requirement.js';
import type { Credential } from './credential.js';
import { evaluateEligibility, type EligibilityCheckpoint } from './eligibility.js';

describe('Eligibility Evaluation', () => {
  const asOf = new Date('2024-06-15T12:00:00Z');
  const tenantId = 'tenant-1';
  const facilityId = 'facility-1';
  const workerId = 'worker-1';

  /** Helper to create a credential requirement */
  function makeRequirement(overrides: Partial<CredentialRequirement> = {}): CredentialRequirement {
    return {
      id: crypto.randomUUID(),
      tenantId,
      facilityId,
      departmentId: undefined,
      role: 'RN',
      credentialType: 'RN_LICENSE',
      required: true,
      effectiveFrom: new Date('2024-01-01'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    };
  }

  /** Helper to create a worker credential */
  function makeCredential(overrides: Partial<Credential> = {}): Credential {
    return {
      id: crypto.randomUUID(),
      tenantId,
      workerId,
      credentialType: 'RN_LICENSE',
      status: 'VERIFIED',
      expiresAt: new Date('2025-12-31'),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe('basic eligibility', () => {
    it('should return ELIGIBLE when worker has all required credentials verified', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
      const credentials = [makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' })];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
      expect(result.reasons).toHaveLength(0);
    });

    it('should return ELIGIBLE when no requirements exist', () => {
      const result = evaluateEligibility({
        workerCredentials: [],
        facilityRequirements: [],
        checkpoint: 'REQUEST_SUBMISSION',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
      expect(result.reasons).toHaveLength(0);
    });

    it('should return ELIGIBLE when all requirements are non-required', () => {
      const requirements = [makeRequirement({ required: false })];
      const result = evaluateEligibility({
        workerCredentials: [],
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
      expect(result.reasons).toHaveLength(0);
    });

    it('should return ELIGIBLE when requirements are not yet effective', () => {
      const requirements = [makeRequirement({ effectiveFrom: new Date('2025-01-01') })];
      const result = evaluateEligibility({
        workerCredentials: [],
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe('INELIGIBLE — missing credentials', () => {
    it('should return INELIGIBLE when worker has no credentials', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];

      const result = evaluateEligibility({
        workerCredentials: [],
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]!.code).toBe('MISSING_CREDENTIAL');
      expect(result.reasons[0]!.credentialType).toBe('RN_LICENSE');
    });

    it('should return INELIGIBLE with multiple reasons for multiple missing credentials', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE' }),
        makeRequirement({ credentialType: 'BLS' }),
        makeRequirement({ credentialType: 'ACLS' }),
      ];

      const result = evaluateEligibility({
        workerCredentials: [],
        facilityRequirements: requirements,
        checkpoint: 'ASSIGNMENT_CONFIRMATION',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons).toHaveLength(3);
      expect(result.reasons.map((r) => r.credentialType)).toEqual(['RN_LICENSE', 'BLS', 'ACLS']);
      expect(result.reasons.every((r) => r.code === 'MISSING_CREDENTIAL')).toBe(true);
    });
  });

  describe('INELIGIBLE — expired credentials', () => {
    it('should return INELIGIBLE when credential has expired', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
      const credentials = [
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'VERIFIED',
          expiresAt: new Date('2024-01-01'), // expired before asOf
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'CLOCK_IN',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]!.code).toBe('CREDENTIAL_EXPIRED');
    });

    it('should return INELIGIBLE when credential expires exactly at evaluation time', () => {
      const requirements = [makeRequirement({ credentialType: 'BLS' })];
      const credentials = [
        makeCredential({
          credentialType: 'BLS',
          status: 'VERIFIED',
          expiresAt: asOf, // expires exactly at evaluation time
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'CLOCK_IN',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons[0]!.code).toBe('CREDENTIAL_EXPIRED');
    });

    it('should return INELIGIBLE for EXPIRED status credential even with future expiry date', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
      const credentials = [
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'EXPIRED',
          expiresAt: new Date('2025-12-31'),
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons[0]!.code).toBe('CREDENTIAL_NOT_VERIFIED');
    });
  });

  describe('INELIGIBLE — not verified', () => {
    it('should return INELIGIBLE when credential is UPLOADED', () => {
      const requirements = [makeRequirement({ credentialType: 'BLS' })];
      const credentials = [
        makeCredential({
          credentialType: 'BLS',
          status: 'UPLOADED',
          expiresAt: new Date('2025-12-31'),
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'REQUEST_SUBMISSION',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons[0]!.code).toBe('CREDENTIAL_NOT_VERIFIED');
    });

    it('should return INELIGIBLE when credential is PENDING_VERIFICATION', () => {
      const requirements = [makeRequirement({ credentialType: 'ACLS' })];
      const credentials = [
        makeCredential({
          credentialType: 'ACLS',
          status: 'PENDING_VERIFICATION',
          expiresAt: new Date('2025-12-31'),
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'ASSIGNMENT_CONFIRMATION',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons[0]!.code).toBe('CREDENTIAL_NOT_VERIFIED');
    });
  });

  describe('ELIGIBLE_WITH_EXCEPTION — expiring soon', () => {
    it('should return ELIGIBLE_WITH_EXCEPTION when credential is EXPIRING but still valid', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
      const credentials = [
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'EXPIRING',
          expiresAt: new Date('2024-07-15'), // still valid, but expiring
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE_WITH_EXCEPTION');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]!.code).toBe('CREDENTIAL_EXPIRING_SOON');
      expect(result.reasons[0]!.credentialType).toBe('RN_LICENSE');
    });

    it('should prefer VERIFIED over EXPIRING credential of same type', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
      const credentials = [
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'EXPIRING',
          expiresAt: new Date('2024-07-15'),
        }),
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'VERIFIED',
          expiresAt: new Date('2026-01-01'),
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      // Should be ELIGIBLE because the VERIFIED credential takes precedence
      expect(result.outcome).toBe('ELIGIBLE');
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe('multiple requirements — decision table', () => {
    it('should return ELIGIBLE when all multiple requirements are met', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE' }),
        makeRequirement({ credentialType: 'BLS' }),
        makeRequirement({ credentialType: 'ACLS' }),
      ];
      const credentials = [
        makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' }),
        makeCredential({ credentialType: 'BLS', status: 'VERIFIED' }),
        makeCredential({ credentialType: 'ACLS', status: 'VERIFIED' }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'CLOCK_IN',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
      expect(result.reasons).toHaveLength(0);
    });

    it('should return INELIGIBLE when one of multiple requirements is missing', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE' }),
        makeRequirement({ credentialType: 'BLS' }),
        makeRequirement({ credentialType: 'ACLS' }),
      ];
      const credentials = [
        makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' }),
        makeCredential({ credentialType: 'BLS', status: 'VERIFIED' }),
        // ACLS missing
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'ASSIGNMENT_CONFIRMATION',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]!.code).toBe('MISSING_CREDENTIAL');
      expect(result.reasons[0]!.credentialType).toBe('ACLS');
    });

    it('should return INELIGIBLE when one is expired and one is missing', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE' }),
        makeRequirement({ credentialType: 'BLS' }),
        makeRequirement({ credentialType: 'ACLS' }),
      ];
      const credentials = [
        makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' }),
        makeCredential({
          credentialType: 'BLS',
          status: 'VERIFIED',
          expiresAt: new Date('2024-01-01'), // expired
        }),
        // ACLS missing
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'CLOCK_IN',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      expect(result.reasons).toHaveLength(2);
      const codes = result.reasons.map((r) => r.code);
      expect(codes).toContain('CREDENTIAL_EXPIRED');
      expect(codes).toContain('MISSING_CREDENTIAL');
    });

    it('should return ELIGIBLE_WITH_EXCEPTION when all met but one expiring', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE' }),
        makeRequirement({ credentialType: 'BLS' }),
      ];
      const credentials = [
        makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' }),
        makeCredential({
          credentialType: 'BLS',
          status: 'EXPIRING',
          expiresAt: new Date('2024-07-01'),
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE_WITH_EXCEPTION');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]!.code).toBe('CREDENTIAL_EXPIRING_SOON');
    });

    it('should return INELIGIBLE even if one credential is expiring and another is missing', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE' }),
        makeRequirement({ credentialType: 'BLS' }),
      ];
      const credentials = [
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'EXPIRING',
          expiresAt: new Date('2024-07-01'),
        }),
        // BLS missing
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'REQUEST_SUBMISSION',
        asOf,
      });

      expect(result.outcome).toBe('INELIGIBLE');
      // Blocking reason (missing) overrides exception
      const codes = result.reasons.map((r) => r.code);
      expect(codes).toContain('MISSING_CREDENTIAL');
      expect(codes).toContain('CREDENTIAL_EXPIRING_SOON');
    });
  });

  describe('checkpoints', () => {
    const checkpoints: EligibilityCheckpoint[] = [
      'MARKETPLACE_DISPLAY',
      'REQUEST_SUBMISSION',
      'ASSIGNMENT_CONFIRMATION',
      'CLOCK_IN',
    ];

    for (const checkpoint of checkpoints) {
      it(`should evaluate correctly at ${checkpoint} checkpoint`, () => {
        const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
        const credentials = [makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' })];

        const result = evaluateEligibility({
          workerCredentials: credentials,
          facilityRequirements: requirements,
          checkpoint,
          asOf,
        });

        expect(result.checkpoint).toBe(checkpoint);
        expect(result.outcome).toBe('ELIGIBLE');
        expect(result.evaluatedAt).toEqual(asOf);
      });
    }
  });

  describe('determinism', () => {
    it('should produce the same result for the same inputs', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE' }),
        makeRequirement({ credentialType: 'BLS' }),
      ];
      const credentials = [
        makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' }),
        // BLS missing
      ];
      const input = {
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'CLOCK_IN' as const,
        asOf,
      };

      const result1 = evaluateEligibility(input);
      const result2 = evaluateEligibility(input);

      expect(result1.outcome).toBe(result2.outcome);
      expect(result1.reasons).toEqual(result2.reasons);
      expect(result1.evaluatedAt).toEqual(result2.evaluatedAt);
    });
  });

  describe('edge cases', () => {
    it('should handle credential with no expiry date as valid (never expires)', () => {
      const requirements = [makeRequirement({ credentialType: 'BACKGROUND_CHECK' })];
      const credentials = [
        makeCredential({
          credentialType: 'BACKGROUND_CHECK',
          status: 'VERIFIED',
          expiresAt: undefined,
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
    });

    it('should handle worker having extra credentials beyond requirements', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
      const credentials = [
        makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' }),
        makeCredential({ credentialType: 'BLS', status: 'VERIFIED' }),
        makeCredential({ credentialType: 'ACLS', status: 'VERIFIED' }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'MARKETPLACE_DISPLAY',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
      expect(result.reasons).toHaveLength(0);
    });

    it('should ignore non-required credentials in eligibility check', () => {
      const requirements = [
        makeRequirement({ credentialType: 'RN_LICENSE', required: true }),
        makeRequirement({ credentialType: 'ACLS', required: false }),
      ];
      const credentials = [
        makeCredential({ credentialType: 'RN_LICENSE', status: 'VERIFIED' }),
        // ACLS missing but not required
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'CLOCK_IN',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
    });

    it('should handle duplicate credential types — uses best one', () => {
      const requirements = [makeRequirement({ credentialType: 'RN_LICENSE' })];
      const credentials = [
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'EXPIRED',
          expiresAt: new Date('2023-01-01'),
        }),
        makeCredential({
          credentialType: 'RN_LICENSE',
          status: 'VERIFIED',
          expiresAt: new Date('2026-01-01'),
        }),
      ];

      const result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: 'CLOCK_IN',
        asOf,
      });

      expect(result.outcome).toBe('ELIGIBLE');
    });
  });
});
