import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

import { SignJWT, importPKCS8, exportJWK, jwtVerify, createLocalJWKSet } from 'jose';
import { v7 as uuidv7 } from 'uuid';

import type { SigningKey } from '../domain/signing-key.js';

/**
 * Platform JWT claims embedded in access tokens.
 * No PII beyond user ID.
 */
export interface PlatformJwtClaims {
  readonly sub: string;
  readonly active_tenant_id?: string | undefined;
  readonly membership_id?: string | undefined;
  readonly user_authorization_version: number;
  readonly membership_authorization_version?: number | undefined;
  readonly platform_roles: string[];
  readonly tenant_roles: string[];
  readonly permissions: string[];
  readonly sid: string;
}

/**
 * JWKS entry for public key distribution.
 */
export interface JwksEntry {
  readonly kty: string;
  readonly kid: string;
  readonly use: string;
  readonly alg: string;
  readonly n?: string | undefined;
  readonly e?: string | undefined;
  readonly crv?: string | undefined;
  readonly x?: string | undefined;
  readonly y?: string | undefined;
}

const ACCESS_TOKEN_LIFETIME_SEC = 15 * 60; // 15 minutes
const ISSUER = 'carecareer-identity';
const AUDIENCE = 'carecareer-api';

/**
 * Generate an RSA-2048 key pair for development/test use.
 * Production uses KMS-backed keys via private_key_ref.
 */
export function generateRsaKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey as string, privateKeyPem: privateKey as string };
}

/**
 * Sign a platform JWT using the active signing key.
 */
export async function signPlatformJwt(
  claims: PlatformJwtClaims,
  privateKeyPem: string,
  kid: string,
): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256');

  const jwt = await new SignJWT({
    active_tenant_id: claims.active_tenant_id,
    membership_id: claims.membership_id,
    user_authorization_version: claims.user_authorization_version,
    membership_authorization_version: claims.membership_authorization_version,
    platform_roles: claims.platform_roles,
    tenant_roles: claims.tenant_roles,
    permissions: claims.permissions,
    sid: claims.sid,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_LIFETIME_SEC}s`)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setJti(uuidv7())
    .sign(privateKey);

  return jwt;
}

/**
 * Build a JWKS response from signing keys.
 * Includes ACTIVE and ROTATED keys (not REVOKED).
 */
export async function buildJwks(keys: SigningKey[]): Promise<{ keys: JwksEntry[] }> {
  const jwksEntries: JwksEntry[] = [];

  for (const key of keys) {
    if (key.status === 'REVOKED') continue;

    const publicKey = createPublicKey(key.publicKey);
    const jwk = await exportJWK(publicKey);

    jwksEntries.push({
      kty: jwk.kty ?? 'RSA',
      kid: key.id,
      use: 'sig',
      alg: key.algorithm,
      n: jwk.n as string | undefined,
      e: jwk.e as string | undefined,
      crv: jwk.crv as string | undefined,
      x: jwk.x as string | undefined,
      y: jwk.y as string | undefined,
    });
  }

  return { keys: jwksEntries };
}

/**
 * Verify a platform JWT using JWKS keys.
 * Returns decoded claims or throws on verification failure.
 */
export async function verifyPlatformJwt(
  token: string,
  keys: SigningKey[],
): Promise<PlatformJwtClaims & { exp: number; iat: number; jti: string }> {
  const jwks = await buildJwks(keys);
  const jwkSet = createLocalJWKSet(jwks as unknown as { keys: Record<string, unknown>[] });

  const { payload } = await jwtVerify(token, jwkSet, {
    issuer: ISSUER,
    audience: AUDIENCE,
    clockTolerance: 30,
  });

  return {
    sub: payload.sub ?? '',
    active_tenant_id: payload['active_tenant_id'] as string | undefined,
    membership_id: payload['membership_id'] as string | undefined,
    user_authorization_version: payload['user_authorization_version'] as number,
    membership_authorization_version: payload['membership_authorization_version'] as
      | number
      | undefined,
    platform_roles: (payload['platform_roles'] as string[]) ?? [],
    tenant_roles: (payload['tenant_roles'] as string[]) ?? [],
    permissions: (payload['permissions'] as string[]) ?? [],
    sid: payload['sid'] as string,
    exp: payload.exp ?? 0,
    iat: payload.iat ?? 0,
    jti: payload.jti ?? '',
  };
}

// Re-export for external use
export { KeyObject, createPrivateKey, createPublicKey };
