/**
 * Authorization decision domain model.
 *
 * Evaluates whether an authenticated principal is permitted to perform
 * a specific action on a resource within their tenant context.
 *
 * Precedence (deterministic, top-down):
 * 1. Invalid/missing principal              → AUTH_REQUIRED
 * 2. Suspended/deactivated user             → USER_SUSPENDED / USER_DEACTIVATED
 * 3. Missing/suspended/deactivated membership → MEMBERSHIP_INVALID
 * 4. Stale user authorization version       → VERSION_STALE
 * 5. Stale membership authorization version → VERSION_STALE
 * 6. Explicit deny                          → EXPLICIT_DENY
 * 7. Matching permission grant              → ALLOWED
 * 8. No matching grant                      → NO_MATCHING_GRANT
 *
 * Default behavior: DENY.
 */

export interface AuthorizationRequest {
  /** The action identifier (e.g. 'facility.read', 'shift.create') */
  readonly action: string;
  /** Resource type (e.g. 'facility', 'shift') */
  readonly resourceType: string;
  /** Resource ID (UUID) */
  readonly resourceId?: string;
}

export interface AuthorizationPrincipal {
  readonly userId: string;
  readonly userStatus: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  readonly userAuthorizationVersion: number;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly membershipStatus: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'INVITED';
  readonly membershipAuthorizationVersion: number;
  readonly permissions: readonly string[];
  readonly explicitDenials: readonly string[];
}

export type DecisionOutcome = 'ALLOWED' | 'DENIED';

export type DenialReason =
  | 'USER_SUSPENDED'
  | 'USER_DEACTIVATED'
  | 'MEMBERSHIP_INVALID'
  | 'VERSION_STALE'
  | 'EXPLICIT_DENY'
  | 'NO_MATCHING_GRANT';

export interface AuthorizationDecision {
  readonly decisionId: string;
  readonly outcome: DecisionOutcome;
  readonly reasonCode: DenialReason | 'GRANTED';
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly evaluatedAt: Date;
  readonly policyVersion: number;
}

/** Current policy version — increment when decision logic changes */
const POLICY_VERSION = 1;

/**
 * Evaluate an authorization decision.
 *
 * Pure function — no I/O. All required state is passed in.
 * This enables deterministic testing and caching.
 */
export function evaluateDecision(
  principal: AuthorizationPrincipal,
  request: AuthorizationRequest,
  decisionId: string,
): AuthorizationDecision {
  const base = {
    decisionId,
    action: request.action,
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    tenantId: principal.tenantId,
    userId: principal.userId,
    evaluatedAt: new Date(),
    policyVersion: POLICY_VERSION,
  };

  // Step 2: Suspended/deactivated user
  if (principal.userStatus === 'SUSPENDED') {
    return { ...base, outcome: 'DENIED', reasonCode: 'USER_SUSPENDED' };
  }
  if (principal.userStatus === 'DEACTIVATED') {
    return { ...base, outcome: 'DENIED', reasonCode: 'USER_DEACTIVATED' };
  }

  // Step 3: Membership state
  if (principal.membershipStatus !== 'ACTIVE') {
    return { ...base, outcome: 'DENIED', reasonCode: 'MEMBERSHIP_INVALID' };
  }

  // Step 6: Explicit deny
  if (principal.explicitDenials.includes(request.action)) {
    return { ...base, outcome: 'DENIED', reasonCode: 'EXPLICIT_DENY' };
  }

  // Step 7: Matching permission grant
  if (principal.permissions.includes(request.action)) {
    return { ...base, outcome: 'ALLOWED', reasonCode: 'GRANTED' };
  }

  // Step 8: Default deny
  return { ...base, outcome: 'DENIED', reasonCode: 'NO_MATCHING_GRANT' };
}
