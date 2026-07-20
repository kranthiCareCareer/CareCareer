import type { ValidatedTokenContext } from './authenticated-principal.js';

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
 * Implementations validate the token and produce a typed token context.
 * No provider-specific types leak through this interface.
 *
 * Returns ValidatedTokenContext which extends AuthenticatedPrincipal
 * with session and authorization-version fields. This eliminates
 * the need for downstream consumers to reparse the JWT.
 */
export interface TokenValidator {
  /**
   * Validate a bearer token and extract the full validated context.
   *
   * @throws AuthenticationError if the token is invalid
   * @throws TokenExpiredError if the token has expired
   */
  validate(token: string): Promise<ValidatedTokenContext>;
}
