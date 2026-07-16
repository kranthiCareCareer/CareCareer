import type { AuthenticatedPrincipal } from './authenticated-principal.js';

/**
 * Authorization request — evaluated by the authorization service.
 */
export interface AuthorizationRequest {
  readonly principal: AuthenticatedPrincipal;
  readonly tenantId: string;
  readonly permission: string;
  readonly resource?: Readonly<Record<string, unknown>>;
  readonly environment?: Readonly<Record<string, unknown>>;
}

/**
 * Authorization decision — the result of evaluating an authorization request.
 */
export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly policyVersion?: string;
}

/**
 * Authorization service interface.
 * First implementation is in-memory; replaced by identity-service API later.
 */
export interface AuthorizationService {
  /**
   * Evaluate whether the principal is authorized to perform the requested action.
   *
   * @returns AuthorizationDecision with allow/deny and reason
   */
  evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}
