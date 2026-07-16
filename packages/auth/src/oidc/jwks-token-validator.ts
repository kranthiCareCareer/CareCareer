import * as jose from 'jose';

import type { AuthenticatedPrincipal } from '../core/authenticated-principal.js';
import { InvalidTokenError, TokenExpiredError } from '../core/errors.js';
import type { TokenValidationConfig, TokenValidator } from '../core/token-validator.js';

import { ClaimsMapper, type ClaimsMapperConfig } from './claims-mapper.js';

/**
 * JWKS-based token validator using the jose library.
 * Provider-neutral — works with any OIDC provider that exposes JWKS.
 */
export class JwksTokenValidator implements TokenValidator {
  private jwks: ReturnType<typeof jose.createRemoteJWKSet> | undefined;
  private readonly config: TokenValidationConfig;
  private readonly claimsMapper: ClaimsMapper;

  constructor(config: TokenValidationConfig, claimsMapperConfig?: ClaimsMapperConfig) {
    this.config = config;
    this.claimsMapper = new ClaimsMapper(claimsMapperConfig);
  }

  async validate(token: string): Promise<AuthenticatedPrincipal> {
    if (!token) {
      throw new InvalidTokenError('Token is empty');
    }

    const jwks = this.getJwks();

    try {
      const options: jose.JWTVerifyOptions = {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: this.config.algorithms ? [...this.config.algorithms] : ['RS256'],
      };

      if (this.config.maxTokenAgeSec) {
        options.maxTokenAge = `${String(this.config.maxTokenAgeSec)}s`;
      }

      const { payload } = await jose.jwtVerify(token, jwks, options);

      if (!payload.sub) {
        throw new InvalidTokenError('Token missing subject claim');
      }

      return this.claimsMapper.toPrincipal(payload);
    } catch (error: unknown) {
      if (error instanceof InvalidTokenError || error instanceof TokenExpiredError) {
        throw error;
      }
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenExpiredError();
      }
      if (error instanceof jose.errors.JOSEError) {
        throw new InvalidTokenError(error.code);
      }
      throw new InvalidTokenError('Unknown validation error');
    }
  }

  private getJwks(): ReturnType<typeof jose.createRemoteJWKSet> {
    if (!this.jwks) {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- jwksUri is optional string, ternary reads clearer for URL construction
      const jwksUri = this.config.jwksUri
        ? this.config.jwksUri
        : `${this.config.issuer}.well-known/jwks.json`;
      this.jwks = jose.createRemoteJWKSet(new URL(jwksUri));
    }
    return this.jwks;
  }
}
