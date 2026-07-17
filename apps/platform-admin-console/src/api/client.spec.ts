import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { apiClient } from './client';

describe('PlatformApiClient', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    apiClient.clearAuth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authentication', () => {
    it('should include Authorization header after setAuth', async () => {
      apiClient.setAuth('test-token', 'actor-1');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tenantId: 'a', organizationId: 'b' } }),
        headers: new Headers({ 'x-correlation-id': 'corr-1' }),
      });

      await apiClient.provisionTenant({
        name: 'Test',
        slug: 'test',
        organizationName: 'Org',
      });

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
      expect(headers['X-Actor-Id']).toBe('actor-1');
    });

    it('should not include Authorization header when not authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tenantId: 'a', organizationId: 'b' } }),
        headers: new Headers({ 'x-correlation-id': 'corr-1' }),
      });

      await apiClient.provisionTenant({
        name: 'Test',
        slug: 'test',
        organizationName: 'Org',
      });

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should clear auth state on clearAuth', () => {
      apiClient.setAuth('token', 'actor');
      apiClient.clearAuth();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
        headers: new Headers({}),
      });

      apiClient.listOrganizations('tid');
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('correlation ID', () => {
    it('should include X-Correlation-Id on every request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tenantId: 'a', organizationId: 'b' } }),
        headers: new Headers({ 'x-correlation-id': 'server-corr' }),
      });

      await apiClient.provisionTenant({
        name: 'T',
        slug: 't',
        organizationName: 'O',
      });

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['X-Correlation-Id']).toBeDefined();
      expect(headers['X-Correlation-Id'].length).toBeGreaterThan(0);
    });

    it('should return correlation ID from the server response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tenantId: 'tid', organizationId: 'oid' } }),
        headers: new Headers({ 'x-correlation-id': 'response-corr-123' }),
      });

      const result = await apiClient.provisionTenant({
        name: 'T',
        slug: 't',
        organizationName: 'O',
      });

      expect(result.correlationId).toBe('response-corr-123');
    });
  });

  describe('idempotency key', () => {
    it('should include Idempotency-Key header on mutations', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tenantId: 'a', organizationId: 'b' } }),
        headers: new Headers({}),
      });

      await apiClient.provisionTenant({
        name: 'T',
        slug: 't',
        organizationName: 'O',
      });

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBeDefined();
    });

    it('should generate unique idempotency keys per call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tenantId: 'a', organizationId: 'b' } }),
        headers: new Headers({}),
      });

      await apiClient.provisionTenant({ name: 'T1', slug: 't1', organizationName: 'O1' });
      await apiClient.provisionTenant({ name: 'T2', slug: 't2', organizationName: 'O2' });

      const headers1 = (mockFetch.mock.calls[0] as [string, RequestInit])[1]
        .headers as Record<string, string>;
      const headers2 = (mockFetch.mock.calls[1] as [string, RequestInit])[1]
        .headers as Record<string, string>;
      expect(headers1['Idempotency-Key']).not.toBe(headers2['Idempotency-Key']);
    });
  });

  describe('error handling', () => {
    it('should throw enriched error on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          message: 'Version conflict',
          code: 'VERSION_CONFLICT',
        }),
        headers: new Headers({ 'x-correlation-id': 'err-corr' }),
      });

      await expect(
        apiClient.activateTenant('tid', 'test', 1),
      ).rejects.toMatchObject({
        message: 'Version conflict',
        status: 409,
        code: 'VERSION_CONFLICT',
        correlationId: 'err-corr',
      });
    });

    it('should handle 401 unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
        headers: new Headers({}),
      });

      await expect(apiClient.getTenant('tid')).rejects.toMatchObject({
        status: 401,
        message: 'Unauthorized',
      });
    });

    it('should handle 403 forbidden', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Insufficient permissions', code: 'FORBIDDEN' }),
        headers: new Headers({}),
      });

      await expect(apiClient.getTenant('tid')).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('should handle 404 not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not found' }),
        headers: new Headers({}),
      });

      await expect(apiClient.getTenant('unknown')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new Error('not json'); },
        headers: new Headers({}),
      });

      await expect(apiClient.getTenant('tid')).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  describe('tenant operations', () => {
    it('should call correct URL for provisionTenant', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { tenantId: 'new-id', organizationId: 'org-id' } }),
        headers: new Headers({}),
      });

      await apiClient.provisionTenant({
        name: 'Test Tenant',
        slug: 'test-tenant',
        organizationName: 'Test Org',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/tenants',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should call correct URL for getTenant', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'tid', name: 'Test' } }),
        headers: new Headers({}),
      });

      await apiClient.getTenant('tid-123');
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/tenants/tid-123', expect.any(Object));
    });
  });

  describe('lifecycle operations', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ACTIVE' }),
        headers: new Headers({}),
      });
    });

    it('should POST to activate endpoint', async () => {
      await apiClient.activateTenant('tid', 'reason', 1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/tenants/tid/activate',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should POST to suspend endpoint', async () => {
      await apiClient.suspendTenant('tid', 'reason', 2);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/tenants/tid/suspend',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should POST to deactivate endpoint', async () => {
      await apiClient.deactivateTenant('tid', 'reason', 3);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/tenants/tid/deactivate',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should include version in lifecycle request body', async () => {
      await apiClient.activateTenant('tid', 'activate-reason', 5);
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.version).toBe(5);
      expect(body.reason).toBe('activate-reason');
    });
  });

  describe('entitlements', () => {
    it('should GET entitlements', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { tenantId: 'tid', modules: { core: true }, version: 1 },
        }),
        headers: new Headers({}),
      });

      const result = await apiClient.getEntitlements('tid');
      expect(result.tenantId).toBe('tid');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/tenants/tid/entitlements',
        expect.any(Object),
      );
    });

    it('should PUT entitlements with version', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers({}),
      });

      await apiClient.updateEntitlements('tid', { scheduling: true }, 3);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/v1/tenants/tid/entitlements');
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body as string);
      expect(body.modules).toEqual({ scheduling: true });
      expect(body.version).toBe(3);
    });
  });
});
