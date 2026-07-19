import { createPublicKey } from 'node:crypto';

import { jwtVerify, createLocalJWKSet, type JWTPayload, decodeProtectedHeader, errors as joseErrors } from 'jose';

import type { AuthenticatedPrincipal, TenantMembershipClaim, TokenValidator } from '@carecareer/auth';
import { InvalidTokenError, TokenExpiredError } from '@carecareer/auth';
import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import type { SigningKey } from '../domain/signing-key.js';

import type { SigningKeyRepository } from './postgres-session-repository.js';

/**
 * Configuration for the production platform token validator.
 */
export interface PlatformTokenValidatorConfig {
  /** Expected issuer (iss claim) */
  readonly issuer: string;
  /** Expected audience (aud claim) */
  readonly audience: string;
  /** Clock tolerance in seconds for exp/nbf validation */
  readonly clockToleranceSec?: number;
}

/**
 * Production RS256 platform token validator.
 *
 * Validates CareCareer-issued access tokens using the platform JWKS.
 * This is the real production guard — DemoTokenValidator MUST NOT be used in production.
 *
 * Validation steps:
 * 1. Parse protected header (reject if missing kid or wrong alg)
 * 2. Require RS256 algorithm (reject alg=none, HS256, etc.)
 * 3. Require valid kid
 * 4. Resolve public verification key from signing-key repository
 * 5. Verify JWT signature
 * 6. Validate issuer
 * 7. Validate audience
 * 8. Validate expiration
 * 9. Validate nbf when present
 * 10. Validate required claim types
 * 11. Construct authenticated principal
 *
 * Security: never activates database administrative context.
 * Never accepts IdP tokens as CareCareer platform tokens.
 * Rejects HS256/RS256 confusion and alg=none.
 */
export class PlatformTokenValidator implements TokenValidator {
  private readonly config: PlatformTokenValidatorConfig;
  private readonly prisma: PrismaLikeClient;
  private readonly signingKeyRepo: SigningKeyRepository;

  constructor(
    config: PlatformTokenValidatorConfig,
    prisma: PrismaLikeClient,
    signingKeyRepo: SigningKeyRepository,
  ) {
    this.config = config;
    this.prisma = prisma;
    this.signingKeyRepo = signingKeyRepo;
  }

  async validate(token: string): Promise<AuthenticatedPrincipal> {
    // Step 1: Decode protected header without verification
    let header: { alg?: string; kid?: string };
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new InvalidTokenError('malformed token header');
    }

    // Step 2: Reject algorithm confusion — only RS256 accepted
    if (!header.alg || header.alg !== 'RS256') {
      throw new InvalidTokenError('unsupported algorithm');
    }

    // Step 3: Require kid
    if (!header.kid) {
      throw new InvalidTokenError('missing key identifier');
    }

    // Step 4: Resolve verification keys from database
    const keys = await this.prisma.$transaction(async (tx: TransactionClient) => {
      return this.signingKeyRepo.getVerificationKeys(tx);
    });

    // Find the matching key by kid
    const matchingKey = keys.find((k: SigningKey) => k.id === header.kid);
    if (!matchingKey) {
      throw new InvalidTokenError('unknown signing key');
    }

    // Step 5-9: Verify JWT using jose library with all validations
    let payload: JWTPayload;
    try {
      const publicKey = createPublicKey(matchingKey.publicKey);
      const { exportJWK } = await import('jose');
      const jwk = await exportJWK(publicKey);
      const jwkSet = createLocalJWKSet({
        keys: [{ ...jwk, kid: matchingKey.id, use: 'sig', alg: 'RS256' }],
      });

      const result = await jwtVerify(token, jwkSet, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['RS256'],
        clockTolerance: this.config.clockToleranceSec ?? 30,
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
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('expired') || error.name === 'JWTExpired') {
          throw new TokenExpiredError();
        }
      }
      throw new InvalidTokenError('signature verification failed');
    }

    // Step 10: Validate required claim types
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

    // Step 11: Construct the authenticated principal
    const platformRoles = (payload['platform_roles'] as string[] | undefined) ?? [];
    const tenantRoles = (payload['tenant_roles'] as string[] | undefined) ?? [];
    const activeTenantId = payload['active_tenant_id'] as string | undefined;

    // Build tenant membership claims from token
    const memberships: TenantMembershipClaim[] = [];
    if (activeTenantId) {
      memberships.push({
        tenantId: activeTenantId,
        roles: [...tenantRoles],
        branchIds: [],
        status: 'active',
      });
    }

    // Add platform-level membership if platform roles exist
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
    };
  }
}
