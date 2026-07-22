import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpAuthorizationAdapter } from './authorization-adapter.js';
import type { ServiceCredentialProvider } from './service-token-client.js';

describe('HttpAuthorizationAdapter', () => {
  const mockCredentialProvider: ServiceCredentialProvider = {
    getCredential: vi.fn().mockResolvedValue({ token: 'service-jwt', expiresAt: 9999999999 }),
    invalidate: vi.fn(),
  };

  const adapter = new HttpAuthorizationAdapter('http://auth:3100', mockCredentialProvider);

  const validParams = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    permission: 'facility.create',
    membershipId: 'mem-1',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    (mockCredentialProvider.getCredential as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 'service-jwt', expiresAt: 9999999999 });
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('should allow when decision service returns ALLOW', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ decision: 'ALLOW', decisionId: 'd-1', policyVersion: 5, reasonCode: 'ROLE_GRANTED' }),
    }));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(true);
    expect(result.decisionId).toBe('d-1');
    expect(result.policyVersion).toBe(5);
  });

  it('should deny when decision service returns DENY', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ decision: 'DENY', decisionId: 'd-2', policyVersion: 5, reasonCode: 'EXPLICIT_DENY' }),
    }));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('EXPLICIT_DENY');
  });

  it('should deny on missing decisionId (malformed response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ decision: 'ALLOW' }), // missing decisionId + policyVersion
    }));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Missing decision metadata');
  });

  it('should deny on missing policyVersion (malformed response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ decision: 'ALLOW', decisionId: 'd-1' }), // missing policyVersion
    }));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
  });

  it('should deny on unknown decision value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ decision: 'UNKNOWN', decisionId: 'd-1', policyVersion: 1 }),
    }));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
  });

  it('should deny and invalidate on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
    expect(mockCredentialProvider.invalidate).toHaveBeenCalled();
  });

  it('should deny on HTTP 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('500');
  });

  it('should deny on network failure (fail closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('unavailable');
  });

  it('should deny on timeout (fail closed)', async () => {
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('timeout');
  });

  it('should deny when service token acquisition fails', async () => {
    (mockCredentialProvider.getCredential as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no key'));

    const result = await adapter.hasPermission(validParams);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('service token');
  });

  it('should send service JWT in Authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ decision: 'ALLOW', decisionId: 'd', policyVersion: 1 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await adapter.hasPermission(validParams);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://auth:3100/internal/v1/authorization/decisions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer service-jwt' }),
      }),
    );
  });

  it('should send principal and action in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ decision: 'ALLOW', decisionId: 'd', policyVersion: 1 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await adapter.hasPermission(validParams);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.principal.subject).toBe('user-1');
    expect(body.principal.tenantId).toBe('tenant-1');
    expect(body.action).toBe('facility.create');
  });
});
