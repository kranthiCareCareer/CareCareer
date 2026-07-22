import {
  jwtVerify,
  createRemoteJWKSet,
  type JWTPayload,
  decodeProtectedHeader,
  errors as joseErrors,
  type FlattenedJWSInput,
  type GetKeyFunction,
  type JWSHeaderParameters,
} from 'jose';

import type {
  TenantMembershipClaim,
  TokenValidator,
  ValidatedTokenContext,
} from '@carecareer/auth';
import { InvalidTokenError, TokenExpiredError } from '@carecareer/auth';

/**
 * Production JWKS token validator for the staffing service.
 *
 * Fetches public keys from the identity-service JWKS endpoint with:
 * - Automatic key rotation handling (jose library manages cache)
 * - Timeout on JWKS fetch (3 seconds)
 * - Retries on transient failures (jose handles internally)
 * - Supports multiple signing keys (rollover)
 *
 * Validation chain:
 * 1. Decode protected header → reject malformed
 * 2. Require RS256 algorithm → reject alg=none, HS256
 * 3. Require kid header
 * 4. Fetch/cache public key from remote JWKS endpoint
 * 5. Verify JWT signature (RS256) + issuer + audience + expiration
 * 6. Validate required claims (sub, jti, sid, user_authorization_version)
 * 7. Construct ValidatedTokenContext
 */
export class RemoteJwksTokenValidator implements TokenValidator {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly clockToleranceSec: number;
  private readonly jwks: GetKeyFunction<JWSHeaderParameters, FlattenedJWSInput>;

  constructor(config: {
    issuer: string;
    audience: string;
    jwksUri: string;
    clockToleranceSec?: number;
  }) {
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.clockToleranceSec = config.clockToleranceSec ?? 30;
    this.jwks = createRemoteJWKSet(new URL(config.jwksUri), {
      cooldownDuration: 30000, // 30s between JWKS refetches
      timeoutDuration: 3000,  // 3s timeout on fetch
    });
  }

  async validate(token: string): Promise<ValidatedTokenContext> {
    if (!token) {
      throw new InvalidTokenError('Token is empty');
    }

    // Step 1: Decode protected header
    let header: { alg?: string; kid?: string };
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new InvalidTokenError('malformed token header');
    }

    // Step 2: Require RS256
    if (!header.alg || header.alg !== 'RS256') {
      throw new InvalidTokenError('unsupported algorithm');
    }

    // Step 3: Require kid
    if (!header.kid) {
      throw new InvalidTokenError('missing key identifier');
    }

    // Step 4-5: Verify using remote JWKS
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        clockTolerance: this.clockToleranceSec,
      });
      payload = result.payload;
    } catch (error: unknown) {
      if (error instanceof joseErrors.JWTExpired) {
        throw new TokenExpiredError();
      }
      if (error instanceof joseErrors.JWTClaimValidationFailed) {
        throw new InvalidTokenError('claim validation failed');
      }
      if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
        throw new InvalidTokenError('signature verification failed');
      }
      if (error instanceof joseErrors.JWSInvalid) {
        throw new InvalidTokenError('invalid token structure');
      }
      throw new InvalidTokenError('token verification failed');
    }

    // Step 6: Validate required claims
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new InvalidTokenError('missing subject claim');
    }
    if (!payload.jti || typeof payload.jti !== 'string') {
      throw new InvalidTokenError('missing token identifier');
    }
    const sid = payload['sid'];
    if (!sid || typeof sid !== 'string') {
      throw new InvalidTokenError('missing session identifier');
    }
    const userAuthVersion = payload['user_authorization_version'];
    if (typeof userAuthVersion !== 'number') {
      throw new InvalidTokenError('missing user authorization version');
    }

    // Step 7: Construct ValidatedTokenContext
    const platformRoles = (payload['platform_roles'] as string[] | undefined) ?? [];
    const tenantRoles = (payload['tenant_roles'] as string[] | undefined) ?? [];
    const activeTenantId = payload['active_tenant_id'] as string | undefined;
    const membershipId = payload['membership_id'] as string | undefined;
    const membershipAuthVersion = payload['membership_authorization_version'] as
      | number
      | undefined;

    const memberships: TenantMembershipClaim[] = [];
    if (activeTenantId) {
      memberships.push({
        tenantId: activeTenantId,
        roles: [...tenantRoles],
        branchIds: [],
        status: 'active',
      });
    }
    if (platformRoles.length > 0) {
      memberships.push({
        tenantId: 'platform',
        roles: [...platformRoles],
        branchIds: [],
        status: 'active',
      });
    }

    return {
      subject: payload.sub,
      actorId: payload.sub,
      actorType: 'user',
      tenantMemberships: memberships,
      issuedAt: new Date((payload.iat ?? 0) * 1000),
      expiresAt: new Date((payload.exp ?? 0) * 1000),
      sessionId: sid,
      tokenId: payload.jti,
      userAuthorizationVersion: userAuthVersion,
      selectedTenantId: activeTenantId,
      membershipId,
      membershipAuthorizationVersion: membershipAuthVersion,
    };
  }
}
