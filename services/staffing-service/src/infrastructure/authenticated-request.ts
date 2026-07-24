/**
 * Typed authenticated request contract for the staffing-service.
 *
 * The auth guard attaches a validated principal to every non-public request.
 * Controllers should use this type instead of `unknown` or `as never`.
 */

export interface AuthenticatedPrincipal {
  readonly subject: string;
  readonly selectedTenantId: string;
  readonly membershipId: string;
  readonly sessionId: string;
  readonly userAuthorizationVersion: number;
  readonly membershipAuthorizationVersion: number;
}

/**
 * Express Request with an attached authenticated principal.
 * Use this as the type for @Req() in controllers.
 */
export interface AuthenticatedStaffingRequest {
  principal?: AuthenticatedPrincipal;
  headers: Record<string, string | string[] | undefined>;
}
