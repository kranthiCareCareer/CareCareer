import { describe, it, expect } from 'vitest';

import { createSigningKey } from '../domain/signing-key.js';

import {
  buildJwks,
  generateRsaKeyPair,
  signPlatformJwt,
  verifyPlatformJwt,
} from './jwt-service.js';

describe('JWT Service', () => {
  const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();
  const signingKey = createSigningKey({
    id: '11111111-1111-1111-1111-111111111111',
    algorithm: 'RS256',
    publicKey: publicKeyPem,
    privateKeyRef: 'inline:test',
  });

  describe('signPlatformJwt', () => {
    it('should sign a JWT with RS256 and the correct claims', async () => {
      const token = await signPlatformJwt(
        {
          sub: 'user-123',
          active_tenant_id: 'tenant-456',
          membership_id: 'membership-789',
          user_authorization_version: 3,
          membership_authorization_version: 2,
          platform_roles: ['PLATFORM_ADMIN'],
          tenant_roles: ['TENANT_ADMIN'],
          permissions: ['platform.users.read'],
          sid: 'session-abc',
        },
        privateKeyPem,
        signingKey.id,
      );

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);

      // Decode header
      const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString());
      expect(header.alg).toBe('RS256');
      expect(header.kid).toBe(signingKey.id);
    });
  });

  describe('verifyPlatformJwt', () => {
    it('should verify a valid JWT', async () => {
      const token = await signPlatformJwt(
        {
          sub: 'user-123',
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: 'session-abc',
        },
        privateKeyPem,
        signingKey.id,
      );

      const claims = await verifyPlatformJwt(token, [signingKey]);
      expect(claims.sub).toBe('user-123');
      expect(claims.user_authorization_version).toBe(1);
      expect(claims.sid).toBe('session-abc');
    });

    it('should reject a JWT signed with wrong key', async () => {
      const { privateKeyPem: wrongKey } = generateRsaKeyPair();

      const token = await signPlatformJwt(
        {
          sub: 'user-123',
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: 'session-abc',
        },
        wrongKey,
        'wrong-kid',
      );

      await expect(verifyPlatformJwt(token, [signingKey])).rejects.toThrow();
    });

    it('should verify with ROTATED keys (overlap period)', async () => {
      const rotatedKey = { ...signingKey, status: 'ROTATED' as const };

      const token = await signPlatformJwt(
        {
          sub: 'user-123',
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: 'session-abc',
        },
        privateKeyPem,
        signingKey.id,
      );

      const claims = await verifyPlatformJwt(token, [rotatedKey]);
      expect(claims.sub).toBe('user-123');
    });

    it('should reject REVOKED keys', async () => {
      const revokedKey = { ...signingKey, status: 'REVOKED' as const };

      const token = await signPlatformJwt(
        {
          sub: 'user-123',
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: 'session-abc',
        },
        privateKeyPem,
        signingKey.id,
      );

      await expect(verifyPlatformJwt(token, [revokedKey])).rejects.toThrow();
    });
  });

  describe('buildJwks', () => {
    it('should include ACTIVE keys', async () => {
      const jwks = await buildJwks([signingKey]);
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0]!.kid).toBe(signingKey.id);
      expect(jwks.keys[0]!.alg).toBe('RS256');
      expect(jwks.keys[0]!.use).toBe('sig');
    });

    it('should include ROTATED keys', async () => {
      const rotated = { ...signingKey, id: 'rotated-key', status: 'ROTATED' as const };
      const jwks = await buildJwks([signingKey, rotated]);
      expect(jwks.keys).toHaveLength(2);
    });

    it('should exclude REVOKED keys', async () => {
      const revoked = { ...signingKey, id: 'revoked-key', status: 'REVOKED' as const };
      const jwks = await buildJwks([signingKey, revoked]);
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0]!.kid).toBe(signingKey.id);
    });
  });
});
