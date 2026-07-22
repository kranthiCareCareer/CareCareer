import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpIdentityStateAdapter } from './identity-state-adapter.js';
import type { ServiceTokenClient } from './service-token-client.js';

describe('HttpIdentityStateAdapter', () => {
  const mockTokenClient: ServiceTokenClient = {
    getToken: vi.fn().mockResolvedValue('service-jwt-token'),
    invalidate: vi.fn(),
  } as unknown as ServiceTokenClient;

  const adapter = new HttpIdentityStateAdapter('http://identity:3100', mockTokenClient);

  const validInput = {
    sessionId: 'session-1',
    userId: 'user-1',
    selectedTenantId: 'tenant-1',
    membershipId: 'membership-1',
    userAuthorizationVersion: 7,
    membershipAuthorizationVersion: 12,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    (mockTokenClient.getToken as ReturnType<typeof vi.fn>).mockResolvedValue('service-jwt-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return valid when identity service confirms state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    }));

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(true);
  });

  it('should deny when identity service returns invalid state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: false, code: 'SESSION_REVOKED' }),
    }));

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('SESSION_REVOKED');
  });

  it('should deny when identity service returns HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ code: 'FORBIDDEN' }),
    }));

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('should deny and invalidate token on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('SERVICE_AUTH_FAILED');
    expect(mockTokenClient.invalidate).toHaveBeenCalled();
  });

  it('should deny on network failure (fail closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('IDENTITY_SERVICE_UNAVAILABLE');
  });

  it('should deny on timeout (fail closed)', async () => {
    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('IDENTITY_SERVICE_TIMEOUT');
  });

  it('should deny on malformed response (missing valid field)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'structure' }),
    }));

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('MALFORMED_RESPONSE');
  });

  it('should deny when service token acquisition fails', async () => {
    (mockTokenClient.getToken as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Key unavailable'),
    );

    const result = await adapter.validate(validInput);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('SERVICE_TOKEN_UNAVAILABLE');
  });

  it('should send correct request body with principal fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ valid: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await adapter.validate(validInput);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://identity:3100/internal/v1/identity/state-validations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer service-jwt-token',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.subject).toBe('user-1');
    expect(body.sessionId).toBe('session-1');
    expect(body.selectedTenantId).toBe('tenant-1');
    expect(body.userAuthorizationVersion).toBe(7);
  });
});
