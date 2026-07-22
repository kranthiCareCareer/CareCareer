import type { ServiceCredentialProvider } from './service-token-client.js';

/**
 * Authorization Decision Adapter — calls the authorization decision service.
 *
 * Calls: POST /internal/v1/authorization/decisions
 * Auth: Service JWT (staffing-service identity)
 *
 * Fail-closed: deny on ANY failure condition.
 * Explicit deny overrides all grants.
 * Never trusts roles/permissions from JWT claims.
 */

export interface PermissionCheckInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly permission: string;
  readonly sessionId: string;
  readonly membershipId: string;
  readonly userAuthorizationVersion: number;
  readonly membershipAuthorizationVersion: number;
  readonly resourceType?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly correlationId?: string | undefined;
}

export interface PermissionCheckResult {
  readonly allowed: boolean;
  readonly reason?: string | undefined;
  readonly decisionId?: string | undefined;
  readonly policyVersion?: number | undefined;
}

/**
 * Port for authorization decisions.
 * Implementations must fail closed (deny on error).
 */
export interface PermissionAdapter {
  hasPermission(params: PermissionCheckInput): Promise<PermissionCheckResult>;
}

/** Expected authorization decision response */
interface AuthorizationDecisionResponse {
  decision: 'ALLOW' | 'DENY';
  decisionId?: string;
  policyVersion?: number;
  reasonCode?: string;
}

/**
 * Production adapter — authenticates as staffing-service, sends authorization request.
 */
export class HttpAuthorizationAdapter implements PermissionAdapter {
  private readonly baseUrl: string;
  private readonly credentialProvider: ServiceCredentialProvider;

  constructor(authorizationServiceBaseUrl: string, credentialProvider: ServiceCredentialProvider) {
    this.baseUrl = authorizationServiceBaseUrl.replace(/\/$/, '');
    this.credentialProvider = credentialProvider;
  }

  async hasPermission(params: PermissionCheckInput): Promise<PermissionCheckResult> {
    let serviceToken: string;
    try {
      const credential = await this.credentialProvider.getCredential();
      serviceToken = credential.token;
    } catch {
      return { allowed: false, reason: 'Cannot acquire service token' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/internal/v1/authorization/decisions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceToken}`,
          'X-Correlation-ID': params.correlationId ?? crypto.randomUUID(),
        },
        body: JSON.stringify({
          principal: {
            subject: params.userId,
            sessionId: params.sessionId,
            tenantId: params.tenantId,
            membershipId: params.membershipId,
            userAuthorizationVersion: params.userAuthorizationVersion,
            membershipAuthorizationVersion: params.membershipAuthorizationVersion,
          },
          action: params.permission,
          resource: params.resourceType
            ? {
                type: params.resourceType,
                id: params.resourceId,
                tenantId: params.tenantId,
              }
            : undefined,
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 401) {
        this.credentialProvider.invalidate();
        return { allowed: false, reason: 'Service authentication failed' };
      }

      if (!response.ok) {
        return {
          allowed: false,
          reason: `Authorization service returned ${String(response.status)}`,
        };
      }

      // Validate response schema strictly
      const body = (await response.json()) as unknown;
      if (!body || typeof body !== 'object' || !('decision' in body)) {
        return { allowed: false, reason: 'Malformed authorization response' };
      }

      const result = body as AuthorizationDecisionResponse;

      // Must have decision and policy version
      if (!result.decisionId || typeof result.policyVersion !== 'number') {
        return { allowed: false, reason: 'Missing decision metadata' };
      }

      if (result.decision === 'ALLOW') {
        return {
          allowed: true,
          decisionId: result.decisionId,
          policyVersion: result.policyVersion,
        };
      }

      // DENY or unknown decision → deny
      return {
        allowed: false,
        reason: result.reasonCode ?? 'Access denied',
        decisionId: result.decisionId,
        policyVersion: result.policyVersion,
      };
    } catch (error: unknown) {
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      return {
        allowed: false,
        reason: isTimeout ? 'Authorization service timeout' : 'Authorization service unavailable',
      };
    }
  }
}
