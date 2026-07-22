/**
 * Identity State Adapter for the staffing service.
 *
 * Validates current session, user, and membership state against the
 * identity service. This ensures that revoked sessions, inactive users,
 * and stale authorization versions are rejected immediately.
 *
 * In production: calls identity-service HTTP API
 * In tests: uses a configurable mock
 *
 * Fail-closed: if the identity service is unreachable, access is DENIED.
 */

export interface IdentityStateValidationInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly selectedTenantId?: string | undefined;
  readonly membershipId?: string | undefined;
  readonly userAuthorizationVersion: number;
  readonly membershipAuthorizationVersion?: number | undefined;
}

export interface IdentityStateValidationResult {
  readonly valid: boolean;
  readonly code?: string | undefined;
  readonly message?: string | undefined;
}

/**
 * Port for identity state validation.
 * Implementations must fail closed (deny on error).
 */
export interface IdentityStateAdapter {
  validate(input: IdentityStateValidationInput): Promise<IdentityStateValidationResult>;
}

/**
 * Production adapter that calls identity-service HTTP API.
 * Fails closed on network errors or non-200 responses.
 */
export class HttpIdentityStateAdapter implements IdentityStateAdapter {
  private readonly baseUrl: string;

  constructor(identityServiceBaseUrl: string) {
    this.baseUrl = identityServiceBaseUrl.replace(/\/$/, '');
  }

  async validate(input: IdentityStateValidationInput): Promise<IdentityStateValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/identity/validate-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: input.sessionId,
          userId: input.userId,
          selectedTenantId: input.selectedTenantId,
          membershipId: input.membershipId,
          userAuthorizationVersion: input.userAuthorizationVersion,
          membershipAuthorizationVersion: input.membershipAuthorizationVersion,
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        // Identity service rejected — deny access
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        const code = typeof body['code'] === 'string' ? body['code'] : 'IDENTITY_STATE_INVALID';
        const message = typeof body['message'] === 'string' ? body['message'] : 'Identity state validation failed';
        return { valid: false, code, message };
      }

      return { valid: true };
    } catch {
      // Network error, timeout, or identity service down — fail closed
      return {
        valid: false,
        code: 'IDENTITY_SERVICE_UNAVAILABLE',
        message: 'Cannot validate identity state — access denied',
      };
    }
  }
}
