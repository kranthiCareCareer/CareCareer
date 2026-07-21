/**
 * Credential Requirement domain entity.
 *
 * Defines what credentials are required for a specific role
 * at a specific facility (and optionally a specific department).
 *
 * Requirement changes affect FUTURE evaluations only — existing
 * assignments are not retroactively invalidated.
 */

export interface CredentialRequirement {
  readonly id: string;
  readonly tenantId: string;
  readonly facilityId: string;
  readonly departmentId: string | undefined;
  readonly role: WorkerRole;
  readonly credentialType: string;
  readonly required: boolean;
  readonly effectiveFrom: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Healthcare worker roles supported by the platform */
export type WorkerRole = 'RN' | 'LPN' | 'CNA' | 'RT' | 'ALLIED';

export const VALID_WORKER_ROLES: readonly WorkerRole[] = ['RN', 'LPN', 'CNA', 'RT', 'ALLIED'];

export interface CreateCredentialRequirementInput {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly departmentId?: string | undefined;
  readonly role: WorkerRole;
  readonly credentialType: string;
  readonly required?: boolean | undefined;
  readonly effectiveFrom?: Date | undefined;
}

/**
 * Create a new credential requirement.
 * effectiveFrom defaults to now (affects future evaluations only).
 */
export function createCredentialRequirement(
  input: CreateCredentialRequirementInput,
): CredentialRequirement {
  if (!input.credentialType || input.credentialType.trim() === '') {
    throw new Error('Credential type is required');
  }

  if (!VALID_WORKER_ROLES.includes(input.role)) {
    throw new Error(`Invalid worker role: ${input.role}`);
  }

  const now = new Date();

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    role: input.role,
    credentialType: input.credentialType.trim(),
    required: input.required ?? true,
    effectiveFrom: input.effectiveFrom ?? now,
    createdAt: now,
    updatedAt: now,
  };
}
