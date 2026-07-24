import { TenantContextMissingError } from '../domain/errors.js';

import type { AuthenticatedStaffingRequest } from './authenticated-request.js';

/**
 * Validated principal extracted from the authenticated request.
 * Every field is guaranteed non-empty after validation.
 */
export interface ValidatedPrincipal {
  readonly subject: string;
  readonly selectedTenantId: string;
  readonly membershipId: string;
  readonly sessionId: string;
  readonly userAuthorizationVersion: number;
  readonly membershipAuthorizationVersion: number;
}

/**
 * Extract and validate a complete principal from the request.
 * Throws TenantContextMissingError if any required field is absent.
 *
 * This function MUST be used by every endpoint (reads and writes).
 * It replaces the unsafe `principal?.subject ?? 'unknown'` pattern.
 */
export function requirePrincipal(req: AuthenticatedStaffingRequest): ValidatedPrincipal {
  const p = req.principal;
  if (!p) {
    throw new TenantContextMissingError('principal');
  }
  if (!p.subject) {
    throw new TenantContextMissingError('subject');
  }
  if (!p.selectedTenantId) {
    throw new TenantContextMissingError('selectedTenantId');
  }
  if (!p.membershipId) {
    throw new TenantContextMissingError('membershipId');
  }
  if (!p.sessionId) {
    throw new TenantContextMissingError('sessionId');
  }
  if (typeof p.userAuthorizationVersion !== 'number') {
    throw new TenantContextMissingError('userAuthorizationVersion');
  }
  if (typeof p.membershipAuthorizationVersion !== 'number') {
    throw new TenantContextMissingError('membershipAuthorizationVersion');
  }

  return {
    subject: p.subject,
    selectedTenantId: p.selectedTenantId,
    membershipId: p.membershipId,
    sessionId: p.sessionId,
    userAuthorizationVersion: p.userAuthorizationVersion,
    membershipAuthorizationVersion: p.membershipAuthorizationVersion,
  };
}
