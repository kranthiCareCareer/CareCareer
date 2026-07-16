import type { AuthenticatedPrincipal } from './authenticated-principal.js';

/**
 * Configuration for token validation.
 */
export interface TokenValidationConfig {
  /** Expected issuer (iss claim) */
  readonly issuer: string;
  /** Expected audience (aud claim) */
  readonly audience: string;
  /** Allowed signing algorithms (default: ['RS256']) */
  readonly algorithms?: readonly string[];
  /** JWKS URI for key discovery */
  readonly jwksUri?: string;
  /** Maximum token age in seconds (optional) */
  readonly maxTokenAgeSec?: number;
}

/**
 * Provider-neutral token validation interface.
 * Implementations validate the token and produce a canonical principal.
 * No provider-specific types leak through this interface.
 */
export interface TokenValidator {
  /**
   * Validate a bearer token and extract the authenticated principal.
   *
   * @throws AuthenticationError if the token is invalid
   * @throws TokenExpiredError if the token has expired
   */
  validate(token: string): Promise<AuthenticatedPrincipal>;
}
