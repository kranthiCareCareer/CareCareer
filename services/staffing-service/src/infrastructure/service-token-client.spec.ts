import { generateKeyPairSync } from 'node:crypto';

import { decodeProtectedHeader, decodeJwt } from 'jose';
import { describe, it, expect } from 'vitest';

import { ServiceTokenClient } from './service-token-client.js';

describe('ServiceTokenClient', () => {
  const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const config = {
    privateKeyPem: keyPair.privateKey as string,
    keyId: 'test-service-key',
    serviceId: 'staffing-service',
    lifetimeSec: 300,
  };

  it('should generate a valid RS256 service JWT', async () => {
    const client = new ServiceTokenClient(config);
    const token = await client.getToken();

    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3);

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe('test-service-key');

    const payload = decodeJwt(token);
    expect(payload.sub).toBe('service:staffing-service');
    expect(payload.aud).toBe('carecareer-internal');
    expect(payload.iss).toBe('carecareer-identity');
    expect(payload['client_id']).toBe('staffing-service');
    expect(payload['token_type']).toBe('service');
    expect(payload['scopes']).toContain('identity.state.validate');
    expect(payload['scopes']).toContain('authorization.decide');
    expect(payload.jti).toBeDefined();
  });

  it('should cache the token on subsequent calls', async () => {
    const client = new ServiceTokenClient(config);
    const token1 = await client.getToken();
    const token2 = await client.getToken();
    expect(token1).toBe(token2);
  });

  it('should generate a new token after invalidation', async () => {
    const client = new ServiceTokenClient(config);
    const token1 = await client.getToken();
    client.invalidate();
    const token2 = await client.getToken();
    expect(token1).not.toBe(token2);
  });

  it('should set correct expiration based on lifetime config', async () => {
    const client = new ServiceTokenClient({ ...config, lifetimeSec: 60 });
    const token = await client.getToken();
    const payload = decodeJwt(token);
    const expiry = payload.exp ?? 0;
    const issued = payload.iat ?? 0;
    expect(expiry - issued).toBe(60);
  });

  it('should default to 300 second lifetime', async () => {
    const client = new ServiceTokenClient({
      privateKeyPem: keyPair.privateKey as string,
      keyId: 'k', serviceId: 's',
    });
    const token = await client.getToken();
    const payload = decodeJwt(token);
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(300);
  });
});
