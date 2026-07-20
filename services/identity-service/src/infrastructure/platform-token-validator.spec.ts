import { describe, it, expect, beforeAll } from 'vitest';

import { InvalidTokenError, TokenExpiredError } from '@carecareer/auth';
import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import type { SigningKey } from '../domain/signing-key.js';

import { generateRsaKeyPair, signPlatformJwt } from './jwt-service.js';
import { mapJoseError, PlatformTokenValidator } from './platform-token-validator.js';
import type { SigningKeyRepository } from './postgres-session-repository.js';

/**
 * Unit tests for PlatformTokenValidator.
 * Uses in-memory signing keys and mocked repository.
 */
describe('PlatformTokenValidator', () => {
  let validator: PlatformTokenValidator;
  let signingKey: SigningKey;
  let privateKeyPem: string;
  const keyId = '00000000-0000-0000-0000-000000000001';

  beforeAll(() => {
    const { publicKeyPem, privateKeyPem: privKey } = generateRsaKeyPair();
    privateKeyPem = privKey;

    signingKey = {
      id: keyId,
      algorithm: 'RS256',
      publicKey: publicKeyPem,
      privateKeyRef: 'inline:test',
      status: 'ACTIVE',
      activatedAt: new Date(),
      rotatedAt: null,
      createdAt: new Date(),
    };

    const mockSigningKeyRepo: SigningKeyRepository = {
      getActiveKey: async () => signingKey,
      getVerificationKeys: async () => [signingKey],
      createKey: async () => {},
      rotateKey: async () => {},
      revokeKey: async () => {},
    };

    const mockPrisma: PrismaLikeClient = {
      async $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
        const mockTx = {
          $executeRaw: async () => 0,
          $queryRaw: async () => [],
        } as unknown as TransactionClient;
        return fn(mockTx);
      },
    };

    validator = new PlatformTokenValidator(
      { issuer: 'carecareer-identity', audience: 'carecareer-api', clockToleranceSec: 30 },
      mockPrisma,
      mockSigningKeyRepo,
    );
  });

  describe('Valid RS256 token', () => {
    it('should validate a correctly signed platform token', async () => {
      const token = await signPlatformJwt(
        {
          sub: 'user-001',
          user_authorization_version: 1,
          platform_roles: ['PLATFORM_ADMIN'],
          tenant_roles: [],
          permissions: [],
          sid: 'session-001',
        },
        privateKeyPem,
        keyId,
      );

      const principal = await validator.validate(token);
      expect(principal.subject).toBe('user-001');
      expect(principal.actorType).toBe('user');
      expect(principal.tenantMemberships.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Algorithm confusion rejection', () => {
    it('should reject alg=none', async () => {
      // Construct a token with alg: none
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'user-001', iss: 'carecareer-identity', aud: 'carecareer-api' }),
      ).toString('base64url');
      const fakeToken = `${header}.${payload}.`;

      await expect(validator.validate(fakeToken)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject HS256 tokens (algorithm confusion attack)', async () => {
      // Create an HS256-signed token using the public key as HMAC secret (classic confusion)
      const { createHmac } = await import('node:crypto');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: keyId })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'attacker',
          iss: 'carecareer-identity',
          aud: 'carecareer-api',
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ).toString('base64url');
      const sig = createHmac('sha256', signingKey.publicKey)
        .update(`${header}.${payload}`)
        .digest('base64url');
      const confusedToken = `${header}.${payload}.${sig}`;

      await expect(validator.validate(confusedToken)).rejects.toThrow(InvalidTokenError);
    });
  });

  describe('Key identifier validation', () => {
    it('should reject token with unknown kid', async () => {
      const token = await signPlatformJwt(
        {
          sub: 'user-001',
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: 'session-001',
        },
        privateKeyPem,
        'unknown-key-id-that-does-not-exist',
      );

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject token without kid', async () => {
      // Manually create a token without kid in header
      const { importPKCS8 } = await import('jose');
      const { SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({ sid: 'test', user_authorization_version: 1 })
        .setProtectedHeader({ alg: 'RS256' }) // No kid!
        .setSubject('user-001')
        .setIssuer('carecareer-identity')
        .setAudience('carecareer-api')
        .setExpirationTime('15m')
        .setJti('test-jti')
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });
  });

  describe('Claim validation', () => {
    it('should reject token with wrong issuer', async () => {
      const { importPKCS8, SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({
        sid: 'test',
        user_authorization_version: 1,
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setSubject('user-001')
        .setIssuer('wrong-issuer') // Wrong!
        .setAudience('carecareer-api')
        .setExpirationTime('15m')
        .setJti('test-jti')
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject token with wrong audience', async () => {
      const { importPKCS8, SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({
        sid: 'test',
        user_authorization_version: 1,
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setSubject('user-001')
        .setIssuer('carecareer-identity')
        .setAudience('wrong-audience') // Wrong!
        .setExpirationTime('15m')
        .setJti('test-jti')
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject expired token', async () => {
      const { importPKCS8, SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({
        sid: 'test',
        user_authorization_version: 1,
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setSubject('user-001')
        .setIssuer('carecareer-identity')
        .setAudience('carecareer-api')
        .setExpirationTime('-1h') // Already expired
        .setJti('test-jti')
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(TokenExpiredError);
    });

    it('should reject token missing subject', async () => {
      const { importPKCS8, SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({
        sid: 'test',
        user_authorization_version: 1,
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        // No subject!
        .setIssuer('carecareer-identity')
        .setAudience('carecareer-api')
        .setExpirationTime('15m')
        .setJti('test-jti')
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject token missing session identifier (sid)', async () => {
      const { importPKCS8, SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({
        user_authorization_version: 1,
        // No sid!
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setSubject('user-001')
        .setIssuer('carecareer-identity')
        .setAudience('carecareer-api')
        .setExpirationTime('15m')
        .setJti('test-jti')
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject token missing jti (token identifier)', async () => {
      const { importPKCS8, SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({
        sid: 'test',
        user_authorization_version: 1,
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setSubject('user-001')
        .setIssuer('carecareer-identity')
        .setAudience('carecareer-api')
        .setExpirationTime('15m')
        // No setJti!
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject token missing user_authorization_version', async () => {
      const { importPKCS8, SignJWT } = await import('jose');
      const key = await importPKCS8(privateKeyPem, 'RS256');

      const token = await new SignJWT({
        sid: 'test',
        // No user_authorization_version!
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setSubject('user-001')
        .setIssuer('carecareer-identity')
        .setAudience('carecareer-api')
        .setExpirationTime('15m')
        .setJti('test-jti')
        .sign(key);

      await expect(validator.validate(token)).rejects.toThrow(InvalidTokenError);
    });
  });

  describe('Malformed input', () => {
    it('should reject a completely random string', async () => {
      await expect(validator.validate('not-a-jwt-at-all')).rejects.toThrow(InvalidTokenError);
    });

    it('should reject modified signature', async () => {
      const token = await signPlatformJwt(
        {
          sub: 'user-001',
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: 'session-001',
        },
        privateKeyPem,
        keyId,
      );

      // Tamper with the signature (last part)
      const parts = token.split('.');
      const tamperedSig = parts[2]!.split('').reverse().join('');
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      await expect(validator.validate(tamperedToken)).rejects.toThrow(InvalidTokenError);
    });

    it('should reject empty token', async () => {
      await expect(validator.validate('')).rejects.toThrow(InvalidTokenError);
    });
  });
});

describe('mapJoseError', () => {
  it('should map JWTExpired to TokenExpiredError', async () => {
    const { errors } = await import('jose');
    const joseErr = new errors.JWTExpired('expired', {});
    const result = mapJoseError(joseErr);
    expect(result).toBeInstanceOf(TokenExpiredError);
  });

  it('should map JWTClaimValidationFailed to InvalidTokenError with claim message', async () => {
    const { errors } = await import('jose');
    const joseErr = new errors.JWTClaimValidationFailed('bad claim', {});
    const result = mapJoseError(joseErr);
    expect(result).toBeInstanceOf(InvalidTokenError);
    expect(result.message).toContain('claim validation failed');
  });

  it('should map JWSSignatureVerificationFailed to InvalidTokenError', async () => {
    const { errors } = await import('jose');
    const joseErr = new errors.JWSSignatureVerificationFailed();
    const result = mapJoseError(joseErr);
    expect(result).toBeInstanceOf(InvalidTokenError);
    expect(result.message).toContain('signature verification failed');
  });

  it('should map JWSInvalid to InvalidTokenError', async () => {
    const { errors } = await import('jose');
    const joseErr = new errors.JWSInvalid('bad jws');
    const result = mapJoseError(joseErr);
    expect(result).toBeInstanceOf(InvalidTokenError);
    expect(result.message).toContain('invalid token structure');
  });

  it('should map JWTInvalid to InvalidTokenError', async () => {
    const { errors } = await import('jose');
    const joseErr = new errors.JWTInvalid('bad jwt');
    const result = mapJoseError(joseErr);
    expect(result).toBeInstanceOf(InvalidTokenError);
    expect(result.message).toContain('invalid token');
  });

  it('should map unknown errors to generic InvalidTokenError', () => {
    const result = mapJoseError(new Error('something unexpected'));
    expect(result).toBeInstanceOf(InvalidTokenError);
    expect(result.message).toContain('token verification failed');
  });

  it('should handle non-Error objects', () => {
    const result = mapJoseError('string error');
    expect(result).toBeInstanceOf(InvalidTokenError);
  });
});
