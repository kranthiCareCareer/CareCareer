/**
 * Eligibility Evaluation domain logic.
 *
 * Determines whether a worker is eligible to work at a specific facility
 * based on their credentials and the facility's requirements.
 *
 * This function is DETERMINISTIC: same inputs always produce the same output.
 * No I/O, no randomness, no time-dependent behavior (time is injected).
 */

import type { CredentialRequirement } from './credential-requirement.js';
import type { Credential } from './credential.js';
import { isCredentialValid } from './credential.js';

/** Checkpoints where eligibility is evaluated */
export type EligibilityCheckpoint =
  | 'MARKETPLACE_DISPLAY'
  | 'REQUEST_SUBMISSION'
  | 'ASSIGNMENT_CONFIRMATION'
  | 'CLOCK_IN';

/** Possible outcomes of an eligibility evaluation */
export type EligibilityOutcome = 'ELIGIBLE' | 'INELIGIBLE' | 'ELIGIBLE_WITH_EXCEPTION' | 'ERROR';

/** Machine-readable reason for an ineligibility finding */
export interface EligibilityReason {
  readonly code: EligibilityReasonCode;
  readonly message: string;
  readonly credentialType: string;
}

export type EligibilityReasonCode =
  | 'MISSING_CREDENTIAL'
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_NOT_VERIFIED'
  | 'CREDENTIAL_EXPIRING_SOON';

/** Result of an eligibility evaluation */
export interface EligibilityResult {
  readonly outcome: EligibilityOutcome;
  readonly reasons: EligibilityReason[];
  readonly checkpoint: EligibilityCheckpoint;
  readonly evaluatedAt: Date;
}

/** Input to the eligibility evaluation function */
export interface EvaluateEligibilityInput {
  readonly workerCredentials: readonly Credential[];
  readonly facilityRequirements: readonly CredentialRequirement[];
  readonly checkpoint: EligibilityCheckpoint;
  /** Evaluation reference time — injected for determinism */
  readonly asOf: Date;
}

/**
 * Evaluate worker eligibility for a facility.
 *
 * Rules:
 * 1. For each REQUIRED credential requirement, the worker must hold
 *    a credential of that type that is VERIFIED and not expired.
 * 2. If any required credential is missing → INELIGIBLE.
 * 3. If any required credential is expired → INELIGIBLE.
 * 4. If any required credential is not yet verified → INELIGIBLE.
 * 5. If a credential is in EXPIRING status but not yet past expiry → ELIGIBLE_WITH_EXCEPTION.
 * 6. Non-required credentials are ignored for eligibility decisions.
 * 7. If no requirements exist, the worker is ELIGIBLE by default.
 *
 * The function produces a machine-readable reason for each finding.
 */
export function evaluateEligibility(input: EvaluateEligibilityInput): EligibilityResult {
  const { workerCredentials, facilityRequirements, checkpoint, asOf } = input;
  const reasons: EligibilityReason[] = [];
  let hasException = false;

  // Only evaluate required credentials that are effective
  const activeRequirements = facilityRequirements.filter(
    (req) => req.required && req.effectiveFrom <= asOf,
  );

  // No requirements means eligible by default
  if (activeRequirements.length === 0) {
    return {
      outcome: 'ELIGIBLE',
      reasons: [],
      checkpoint,
      evaluatedAt: asOf,
    };
  }

  for (const requirement of activeRequirements) {
    const matchingCredentials = workerCredentials.filter(
      (cred) => cred.credentialType === requirement.credentialType,
    );

    if (matchingCredentials.length === 0) {
      reasons.push({
        code: 'MISSING_CREDENTIAL',
        message: `Required credential ${requirement.credentialType} is not on file`,
        credentialType: requirement.credentialType,
      });
      continue;
    }

    // Find the best matching credential (prefer VERIFIED, then EXPIRING)
    const bestCredential = findBestCredential(matchingCredentials, asOf);

    if (!bestCredential) {
      // All matching credentials are in non-valid states
      const mostRecent = matchingCredentials[0]!;
      if (mostRecent.expiresAt && mostRecent.expiresAt <= asOf) {
        reasons.push({
          code: 'CREDENTIAL_EXPIRED',
          message: `Credential ${requirement.credentialType} has expired`,
          credentialType: requirement.credentialType,
        });
      } else {
        reasons.push({
          code: 'CREDENTIAL_NOT_VERIFIED',
          message: `Credential ${requirement.credentialType} is not verified`,
          credentialType: requirement.credentialType,
        });
      }
      continue;
    }

    // Credential is valid but check if it's in EXPIRING state
    if (bestCredential.status === 'EXPIRING') {
      hasException = true;
      reasons.push({
        code: 'CREDENTIAL_EXPIRING_SOON',
        message: `Credential ${requirement.credentialType} is expiring soon`,
        credentialType: requirement.credentialType,
      });
    }
  }

  // Determine final outcome
  const hasBlockingReason = reasons.some(
    (r) =>
      r.code === 'MISSING_CREDENTIAL' ||
      r.code === 'CREDENTIAL_EXPIRED' ||
      r.code === 'CREDENTIAL_NOT_VERIFIED',
  );

  let outcome: EligibilityOutcome;
  if (hasBlockingReason) {
    outcome = 'INELIGIBLE';
  } else if (hasException) {
    outcome = 'ELIGIBLE_WITH_EXCEPTION';
  } else {
    outcome = 'ELIGIBLE';
  }

  return {
    outcome,
    reasons,
    checkpoint,
    evaluatedAt: asOf,
  };
}

/**
 * Find the best credential from a set of matching credentials.
 * Returns the first valid credential (VERIFIED preferred, then EXPIRING).
 * Returns null if no valid credential exists.
 */
function findBestCredential(credentials: readonly Credential[], asOf: Date): Credential | null {
  // Prefer VERIFIED credentials first
  const verified = credentials.find((c) => c.status === 'VERIFIED' && isCredentialValid(c, asOf));
  if (verified) return verified;

  // Then EXPIRING (still valid but approaching expiration)
  const expiring = credentials.find((c) => c.status === 'EXPIRING' && isCredentialValid(c, asOf));
  if (expiring) return expiring;

  return null;
}
