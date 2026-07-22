import { generateKeyPairSync } from 'node:crypto';

import { SignJWT, importPKCS8, exportJWK } from 'jose';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { RemoteJwksTokenValidator } from './remote-jwks-token-validator.js';

/**
 * Tests for RemoteJwksTokenValidator.
 *
 * Uses a real key pair to sign test JWTs, but mocks the JWKS endpoint
 * by intercepting the global fetch that jose's createRemoteJWKSet uses.
 */
describe('RemoteJwksTokenValidator', () => {
  const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const KID = 'remote-test-key';
  const ISSUER = 'carecareer-identity';
  const AUDIENCE = 'carecareer-api';

  let jwksResponse: { keys: Record<string, unknown>[] };

  // Build JWKS response from the test key
  async function buildJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const { createPublicKey } = await import('node:crypto');
    const pubKey = createPublicKey(keyPair.publicKey as string);
    const jwk = await exportJWK(pubKey);
    return { keys: [{ ...jwk, kid: KID, use: 'sig', alg: 'RS256' }] };
  }

  async function signToken(overrides?: Record<string, unknown>): Promise<string> {
    const pk = await importPKCS8(keyPair.privateKey as string, 'RS256');
    return new SignJWT({
      active_tenant_id: 'tenant-1',
      membership_id: 'mem-1',
      user_authorization_version: 1,
      membership_authorization_version: 1,
      platform_roles: [],
      tenant_roles: ['TENANT_ADMIN'],
      sid: 'session-1',
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt()
      .setExpirationTime('15m')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user-1')
      .setJti(crypto.randomUUID())
      .sign(pk);
  }

  afterEach(() => { vi.restoreAllMocks(); });

  it('should validate a correctly signed token', async () => {
    jwksResponse = await buildJwks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => jwksResponse,
      headers: new Headers({ 'content-type': 'application/json' }),
    }));

    const validator = new RemoteJwksTokenValidator({
      issuer: ISSUER, audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
    });

    const token = await signToken();
    const result = await validator.validate(token);

    expect(result.subject).toBe('user-1');
    expect(result.sessionId).toBe('session-1');
    expect(result.selectedTenantId).toBe('tenant-1');
    expect(result.userAuthorizationVersion).toBe(1);
  });

  it('should reject empty token', async () => {
    const validator = new RemoteJwksTokenValidator({
      issuer: ISSUER, audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
    });

    await expect(validator.validate('')).rejects.toThrow('Token is empty');
  });

  it('should reject malformed token', async () => {
    const validator = new RemoteJwksTokenValidator({
      issuer: ISSUER, audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
    });

    await expect(validator.validate('not.a.valid.jwt')).rejects.toThrow('malformed token header');
  });

  it('should reject HS256 algorithm', async () => {
    // Create a token with HS256 header
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: KID })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url');
    const fakeToken = `${header}.${payload}.fakesig`;

    const validator = new RemoteJwksTokenValidator({
      issuer: ISSUER, audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
    });

    await expect(validator.validate(fakeToken)).rejects.toThrow('unsupported algorithm');
  });

  it('should reject token without kid', async () => {
    const pk = await importPKCS8(keyPair.privateKey as string, 'RS256');
    const token = await new SignJWT({ sid: 's', user_authorization_version: 1 })
      .setProtectedHeader({ alg: 'RS256' }) // no kid
      .setIssuedAt().setExpirationTime('15m')
      .setIssuer(ISSUER).setAudience(AUDIENCE)
      .setSubject('u').setJti('j')
      .sign(pk);

    const validator = new RemoteJwksTokenValidator({
      issuer: ISSUER, audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
    });

    await expect(validator.validate(token)).rejects.toThrow('missing key identifier');
  });

  it('should reject token with wrong issuer', async () => {
    jwksResponse = await buildJwks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => jwksResponse,
      headers: new Headers({ 'content-type': 'application/json' }),
    }));

    const validator = new RemoteJwksTokenValidator({
      issuer: 'wrong-issuer', audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
    });

    const token = await signToken();
    await expect(validator.validate(token)).rejects.toThrow('claim validation failed');
  });

  it('should reject expired token', async () => {
    jwksResponse = await buildJwks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => jwksResponse,
      headers: new Headers({ 'content-type': 'application/json' }),
    }));

    const validator = new RemoteJwksTokenValidator({
      issuer: ISSUER, audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
      clockToleranceSec: 0,
    });

    const pk = await importPKCS8(keyPair.privateKey as string, 'RS256');
    const token = await new SignJWT({ sid: 's', user_authorization_version: 1 })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300)
      .setIssuer(ISSUER).setAudience(AUDIENCE)
      .setSubject('u').setJti('j')
      .sign(pk);

    await expect(validator.validate(token)).rejects.toThrow();
  });

  it('should reject token missing required claims (sid)', async () => {
    jwksResponse = await buildJwks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => jwksResponse,
      headers: new Headers({ 'content-type': 'application/json' }),
    }));

    const validator = new RemoteJwksTokenValidator({
      issuer: ISSUER, audience: AUDIENCE,
      jwksUri: 'http://identity:3100/.well-known/jwks.json',
    });

    const pk = await importPKCS8(keyPair.privateKey as string, 'RS256');
    const token = await new SignJWT({ user_authorization_version: 1 }) // no sid
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt().setExpirationTime('15m')
      .setIssuer(ISSUER).setAudience(AUDIENCE)
      .setSubject('u').setJti('j')
      .sign(pk);

    await expect(validator.validate(token)).rejects.toThrow('missing session identifier');
  });
});
