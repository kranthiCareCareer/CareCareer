import { createPublicKey } from 'node:crypto';

import {
  jwtVerify,
  createLocalJWKSet,
  type JWTPayload,
  decodeProtectedHeader,
  errors as joseErrors,
} from 'jose';

import type {
  TenantMembershipClaim,
  TokenValidator,
  ValidatedTokenContext,
} from '@carecareer/auth';
import { InvalidTokenError, TokenExpiredError } from '@carecareer/auth';
import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import type { SigningKey } from '../domain/signing-key.js';

import type { SigningKeyRepository } from './postgres-session-repository.js';

/**
 * Configuration for the production platform token validator.
 */
export interface PlatformTokenValidatorConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly clockToleranceSec?: number;
}

/**
 * Map jose library errors to safe CareCareer authentication errors.
 * Extracted as a pure function for independent testability.
 *
 * Never exposes jose internals, key IDs, or parsing details to callers.
 */
export function mapJoseError(error: unknown): InvalidTokenError | TokenExpiredError {
  if (error instanceof joseErrors.JWTExpired) {
    return new TokenExpiredError();
  }
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    return new InvalidTokenError('claim validation failed');
  }
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
    return new InvalidTokenError('signature verification failed');
  }
  if (error instanceof joseErrors.JWSInvalid) {
    return new InvalidTokenError('invalid token structure');
  }
  if (error instanceof joseErrors.JWTInvalid) {
    return new InvalidTokenError('invalid token');
  }
  return new InvalidTokenError('token verification failed');
}

/**
 * Production RS256 platform token validator.
 *
 * Validates CareCareer-issued access tokens and returns a complete
 * ValidatedTokenContext so the guard never needs to reparse the JWT.
 *
 * Validation steps:
 * 1. Decode protected header (reject malformed)
 * 2. Require RS256 (reject alg=none, HS256)
 * 3. Require kid
 * 4. Resolve public key from signing-key repository
 * 5. Verify JWT signature, issuer, audience, expiration
 * 6. Validate required claims (sub, jti, sid, user_authorization_version)
 * 7. Return typed ValidatedTokenContext
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

  async validate(token: string): Promise<ValidatedTokenContext> {
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

    // Step 4: Resolve verification key
    const keys = await this.prisma.$transaction(async (tx: TransactionClient) => {
      return this.signingKeyRepo.getVerificationKeys(tx);
    });

    const matchingKey = keys.find((k: SigningKey) => k.id === header.kid);
    if (!matchingKey) {
      throw new InvalidTokenError('unknown signing key');
    }

    // Step 5: Verify JWT
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
      throw mapJoseError(error);
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
}
