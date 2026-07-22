import { describe, it, expect, vi, afterEach } from 'vitest';

import { LocalClientCredentialsProvider } from './service-token-client.js';

describe('LocalClientCredentialsProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const config = {
    identityServiceUrl: 'http://identity:3100',
    clientId: 'staffing-service',
    clientSecret: 'test-secret',
  };

  it('should exchange credentials for a service token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'issued-service-jwt', expires_in: 300 }),
      }),
    );

    const provider = new LocalClientCredentialsProvider(config);
    const credential = await provider.getCredential();

    expect(credential.token).toBe('issued-service-jwt');
    expect(credential.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should cache the credential on subsequent calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'cached-jwt', expires_in: 300 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new LocalClientCredentialsProvider(config);
    await provider.getCredential();
    await provider.getCredential();

    // Only one fetch call — second used cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should refetch after invalidation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new-jwt', expires_in: 300 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new LocalClientCredentialsProvider(config);
    await provider.getCredential();
    provider.invalidate();
    await provider.getCredential();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw when token endpoint returns error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_client', error_description: 'Bad credentials' }),
      }),
    );

    const provider = new LocalClientCredentialsProvider(config);
    await expect(provider.getCredential()).rejects.toThrow('Token exchange failed');
  });

  it('should throw when token endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const provider = new LocalClientCredentialsProvider(config);
    await expect(provider.getCredential()).rejects.toThrow('ECONNREFUSED');
  });

  it('should send correct request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'jwt', expires_in: 300 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new LocalClientCredentialsProvider(config);
    await provider.getCredential();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://identity:3100/internal/v1/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.grant_type).toBe('client_credentials');
    expect(body.client_id).toBe('staffing-service');
    expect(body.client_secret).toBe('test-secret');
    expect(body.scope).toContain('identity.state.validate');
  });
});
