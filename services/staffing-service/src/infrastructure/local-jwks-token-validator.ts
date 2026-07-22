import { createPublicKey } from 'node:crypto';

import {
  jwtVerify,
  createLocalJWKSet,
  type JWTPayload,
  decodeProtectedHeader,
  exportJWK,
  errors as joseErrors,
} from 'jose';

import type {
  TenantMembershipClaim,
  TokenValidator,
  ValidatedTokenContext,
} from '@carecareer/auth';
import { InvalidTokenError, TokenExpiredError } from '@carecareer/auth';

/**
 * Local JWKS token validator for the staffing service.
 *
 * Used in production with keys fetched from identity-service JWKS endpoint,
 * and in integration tests with locally-generated test keys.
 *
 * Validation chain:
 * 1. Decode protected header → reject malformed
 * 2. Require RS256 algorithm → reject alg=none, HS256
 * 3. Require kid header
 * 4. Resolve public key from local key set
 * 5. Verify JWT signature (RS256) + issuer + audience + expiration
 * 6. Validate required claims (sub, jti, sid, user_authorization_version)
 * 7. Construct ValidatedTokenContext
 *
 * SECURITY: Caller-supplied roles, permissions, and admin claims
 * from the token payload are extracted but their use is gated by
 * server-side authorization checks. The token is cryptographically
 * proven to have been issued by our identity-service (trusted issuer).
 */
export class LocalJwksTokenValidator implements TokenValidator {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly clockToleranceSec: number;
  private jwkSet: ReturnType<typeof createLocalJWKSet> | undefined;
  private readonly publicKeys: Array<{ kid: string; publicKeyPem: string }>;

  constructor(config: {
    issuer: string;
    audience: string;
    clockToleranceSec?: number;
    publicKeys: Array<{ kid: string; publicKeyPem: string }>;
  }) {
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.clockToleranceSec = config.clockToleranceSec ?? 30;
    this.publicKeys = config.publicKeys;
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

    // Step 4: Build JWKS and verify
    const jwkSet = await this.getJwkSet();

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, jwkSet, {
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

    // Step 5: Validate required claims
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

    // Step 6: Construct ValidatedTokenContext
    const platformRoles = (payload['platform_roles'] as string[] | undefined) ?? [];
    const tenantRoles = (payload['tenant_roles'] as string[] | undefined) ?? [];
    const activeTenantId = payload['active_tenant_id'] as string | undefined;
    const membershipId = payload['membership_id'] as string | undefined;
    const membershipAuthVersion = payload['membership_authorization_version'] as number | undefined;

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

  private async getJwkSet(): Promise<ReturnType<typeof createLocalJWKSet>> {
    if (!this.jwkSet) {
      const keys = [];
      for (const { kid, publicKeyPem } of this.publicKeys) {
        const publicKey = createPublicKey(publicKeyPem);
        const jwk = await exportJWK(publicKey);
        keys.push({ ...jwk, kid, use: 'sig', alg: 'RS256' });
      }
      this.jwkSet = createLocalJWKSet({ keys });
    }
    return this.jwkSet;
  }
}
