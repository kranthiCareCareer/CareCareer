import type { ServiceCredentialProvider } from './service-token-client.js';

/**
 * Identity State Adapter — validates current session, user, and membership state.
 *
 * Calls: POST /internal/v1/identity/state-validations
 * Auth: Service JWT obtained via token-exchange (identity-service signs it)
 * User context: validated principal fields in request body
 *
 * Fail-closed: deny on ANY of:
 * - Missing service credential
 * - Identity service unavailable
 * - Timeout (3 seconds)
 * - Malformed response
 * - HTTP 4xx/5xx
 * - Unknown response structure
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

/** Expected response schema from identity service */
interface StateValidationResponse {
  valid: boolean;
  code?: string;
  user?: { status: string; authorizationVersion: number };
  session?: { status: string; expiresAt: string };
  membership?: { status: string; tenantId: string; authorizationVersion: number };
}

/**
 * Production adapter — authenticates as staffing-service via service JWT.
 * Sends validated principal fields, NOT the raw user token.
 */
export class HttpIdentityStateAdapter implements IdentityStateAdapter {
  private readonly baseUrl: string;
  private readonly credentialProvider: ServiceCredentialProvider;

  constructor(identityServiceBaseUrl: string, credentialProvider: ServiceCredentialProvider) {
    this.baseUrl = identityServiceBaseUrl.replace(/\/$/, '');
    this.credentialProvider = credentialProvider;
  }

  async validate(input: IdentityStateValidationInput): Promise<IdentityStateValidationResult> {
    let serviceToken: string;
    try {
      const credential = await this.credentialProvider.getCredential();
      serviceToken = credential.token;
    } catch {
      return {
        valid: false,
        code: 'SERVICE_TOKEN_UNAVAILABLE',
        message: 'Cannot acquire service token — access denied',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/internal/v1/identity/state-validations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceToken}`,
          'X-Correlation-ID': crypto.randomUUID(),
        },
        body: JSON.stringify({
          subject: input.userId,
          sessionId: input.sessionId,
          selectedTenantId: input.selectedTenantId,
          membershipId: input.membershipId,
          userAuthorizationVersion: input.userAuthorizationVersion,
          membershipAuthorizationVersion: input.membershipAuthorizationVersion,
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 401) {
        // Service token rejected — invalidate and deny
        this.credentialProvider.invalidate();
        return {
          valid: false,
          code: 'SERVICE_AUTH_FAILED',
          message: 'Service authentication failed',
        };
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as StateValidationResponse | null;
        return {
          valid: false,
          code: body?.code ?? 'IDENTITY_STATE_INVALID',
          message: 'Identity state validation failed',
        };
      }

      // Validate response schema
      const body = (await response.json()) as unknown;
      if (!body || typeof body !== 'object' || !('valid' in body)) {
        return {
          valid: false,
          code: 'MALFORMED_RESPONSE',
          message: 'Unexpected identity response',
        };
      }

      const result = body as StateValidationResponse;
      if (result.valid !== true) {
        return {
          valid: false,
          code: result.code ?? 'IDENTITY_STATE_INVALID',
          message: 'Identity state check failed',
        };
      }

      return { valid: true };
    } catch (error: unknown) {
      // Network error, timeout, or identity service down — fail closed
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      return {
        valid: false,
        code: isTimeout ? 'IDENTITY_SERVICE_TIMEOUT' : 'IDENTITY_SERVICE_UNAVAILABLE',
        message: 'Cannot validate identity state — access denied',
      };
    }
  }
}
