/**
 * Worker Credential domain entity.
 *
 * Represents a license, certification, or other credential held by a worker.
 *
 * State machine:
 *   UPLOADED → PENDING_VERIFICATION → VERIFIED → EXPIRING → EXPIRED
 *   PENDING_VERIFICATION → REJECTED
 *   PENDING_VERIFICATION → CORRECTION_REQUIRED → UPLOADED (re-submit)
 *   VERIFIED → REVOKED
 *   VERIFIED → SUPERSEDED (replaced by newer credential)
 *   EXPIRED → UPLOADED (renewal)
 *
 * Compliance semantics:
 * - REJECTED: submission was never accepted as valid
 * - REVOKED: previously accepted credential was invalidated
 * - EXPIRED: credential passed its validity date naturally
 * - CORRECTION_REQUIRED: reviewer found issues, worker must re-upload
 * - SUPERSEDED: replaced by a newer version of the same credential
 */

export type CredentialStatus =
  | 'UPLOADED'
  | 'PENDING_VERIFICATION'
  | 'CORRECTION_REQUIRED'
  | 'VERIFIED'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'REJECTED'
  | 'REVOKED'
  | 'SUPERSEDED';

export interface Credential {
  readonly id: string;
  readonly tenantId: string;
  readonly workerId: string;
  readonly credentialType: string;
  readonly status: CredentialStatus;
  readonly issuingAuthority?: string | undefined;
  readonly credentialNumber?: string | undefined;
  readonly issuedAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly verifiedAt?: Date | undefined;
  readonly verifiedBy?: string | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Valid state transitions for the credential lifecycle.
 */
const VALID_CREDENTIAL_TRANSITIONS: Record<CredentialStatus, CredentialStatus[]> = {
  UPLOADED: ['PENDING_VERIFICATION', 'EXPIRED'],
  PENDING_VERIFICATION: ['VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED', 'EXPIRED'],
  CORRECTION_REQUIRED: ['UPLOADED'],
  VERIFIED: ['EXPIRING', 'EXPIRED', 'REVOKED', 'SUPERSEDED'],
  EXPIRING: ['EXPIRED', 'VERIFIED', 'REVOKED'],
  EXPIRED: ['UPLOADED'],
  REJECTED: [],
  REVOKED: [],
  SUPERSEDED: [],
};

export interface CreateCredentialInput {
  readonly tenantId: string;
  readonly workerId: string;
  readonly credentialType: string;
  readonly issuingAuthority?: string | undefined;
  readonly credentialNumber?: string | undefined;
  readonly issuedAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
}

/**
 * Create a new credential in UPLOADED status.
 */
export function createCredential(input: CreateCredentialInput): Credential {
  if (!input.credentialType || input.credentialType.trim() === '') {
    throw new Error('Credential type is required');
  }
  if (!input.workerId || input.workerId.trim() === '') {
    throw new Error('Worker ID is required');
  }
  if (!input.tenantId || input.tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }

  const now = new Date();

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    workerId: input.workerId,
    credentialType: input.credentialType.trim(),
    status: 'UPLOADED',
    issuingAuthority: input.issuingAuthority?.trim(),
    credentialNumber: input.credentialNumber?.trim(),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    verifiedAt: undefined,
    verifiedBy: undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transition a credential to a new status.
 * Validates the transition is allowed by the state machine.
 */
export function changeCredentialStatus(
  credential: Credential,
  newStatus: CredentialStatus,
): Credential {
  const allowed = VALID_CREDENTIAL_TRANSITIONS[credential.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid credential status transition: ${credential.status} → ${newStatus}`);
  }

  return {
    ...credential,
    status: newStatus,
    updatedAt: new Date(),
    version: credential.version + 1,
  };
}

/**
 * Mark a credential as verified by a compliance officer.
 * Transitions from PENDING_VERIFICATION → VERIFIED.
 */
export function verifyCredential(credential: Credential, verifiedBy: string): Credential {
  if (!verifiedBy || verifiedBy.trim() === '') {
    throw new Error('Verified by is required');
  }
  if (credential.status !== 'PENDING_VERIFICATION') {
    throw new Error(
      `Cannot verify credential in status ${credential.status}; must be PENDING_VERIFICATION`,
    );
  }

  return {
    ...credential,
    status: 'VERIFIED',
    verifiedAt: new Date(),
    verifiedBy: verifiedBy.trim(),
    updatedAt: new Date(),
    version: credential.version + 1,
  };
}

/**
 * Reject a credential submission.
 * Transitions from PENDING_VERIFICATION → REJECTED.
 */
export function rejectCredential(credential: Credential): Credential {
  if (credential.status !== 'PENDING_VERIFICATION') {
    throw new Error(
      `Cannot reject credential in status ${credential.status}; must be PENDING_VERIFICATION`,
    );
  }

  return {
    ...credential,
    status: 'REJECTED',
    updatedAt: new Date(),
    version: credential.version + 1,
  };
}

/**
 * Revoke a previously verified credential.
 * Transitions from VERIFIED or EXPIRING → REVOKED.
 */
export function revokeCredential(credential: Credential): Credential {
  if (credential.status !== 'VERIFIED' && credential.status !== 'EXPIRING') {
    throw new Error(
      `Cannot revoke credential in status ${credential.status}; must be VERIFIED or EXPIRING`,
    );
  }

  return {
    ...credential,
    status: 'REVOKED',
    updatedAt: new Date(),
    version: credential.version + 1,
  };
}

/**
 * Request correction on a pending credential.
 * Transitions from PENDING_VERIFICATION → CORRECTION_REQUIRED.
 */
export function requestCorrection(credential: Credential): Credential {
  if (credential.status !== 'PENDING_VERIFICATION') {
    throw new Error(
      `Cannot request correction in status ${credential.status}; must be PENDING_VERIFICATION`,
    );
  }

  return {
    ...credential,
    status: 'CORRECTION_REQUIRED',
    updatedAt: new Date(),
    version: credential.version + 1,
  };
}

/**
 * Mark a credential as superseded by a newer version.
 * Transitions from VERIFIED → SUPERSEDED.
 */
export function supersedeCredential(credential: Credential): Credential {
  if (credential.status !== 'VERIFIED') {
    throw new Error(`Cannot supersede credential in status ${credential.status}; must be VERIFIED`);
  }

  return {
    ...credential,
    status: 'SUPERSEDED',
    updatedAt: new Date(),
    version: credential.version + 1,
  };
}

/**
 * Check if a credential is currently valid (verified and not expired).
 */
export function isCredentialValid(credential: Credential, asOf: Date = new Date()): boolean {
  if (credential.status !== 'VERIFIED' && credential.status !== 'EXPIRING') {
    return false;
  }
  if (credential.expiresAt && credential.expiresAt <= asOf) {
    return false;
  }
  return true;
}

/**
 * Get all valid transitions from the current status.
 */
export function getValidTransitions(status: CredentialStatus): CredentialStatus[] {
  return [...VALID_CREDENTIAL_TRANSITIONS[status]];
}
