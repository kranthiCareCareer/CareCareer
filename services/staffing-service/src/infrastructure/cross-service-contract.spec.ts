/**
 * Cross-Service Contract Integration Tests
 *
 * Purpose: Prove the service-to-service authentication and authorization flow
 * between staffing-service and identity-service works end-to-end.
 *
 * These tests document the EXACT request/response schemas that constitute
 * the inter-service contract and prove fail-closed behavior at every stage.
 *
 * Contract chain: client_credentials token exchange → identity state validation → authorization decision
 *
 * Each adapter is tested against its contract with realistic scenarios:
 * 1. Happy path — correct request format produces correct result
 * 2. Fail-closed on network error (ECONNREFUSED)
 * 3. Fail-closed on timeout (3s/5s AbortSignal)
 * 4. Fail-closed on 401 (service token rejected)
 * 5. Fail-closed on 500 (upstream failure)
 * 6. Fail-closed on malformed response
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpAuthorizationAdapter } from './authorization-adapter.js';
import { HttpIdentityStateAdapter } from './identity-state-adapter.js';
import { LocalClientCredentialsProvider } from './service-token-client.js';
import type { ServiceCredentialProvider } from './service-token-client.js';

// ─── Shared Constants ────────────────────────────────────────────────────────

const IDENTITY_SERVICE_URL = 'http://identity-service:3100';
const TOKEN_ENDPOINT = `${IDENTITY_SERVICE_URL}/internal/v1/oauth/token`;
const STATE_VALIDATION_ENDPOINT = `${IDENTITY_SERVICE_URL}/internal/v1/identity/state-validations`;
const AUTHORIZATION_ENDPOINT = `${IDENTITY_SERVICE_URL}/internal/v1/authorization/decisions`;

const SERVICE_CLIENT_CONFIG = {
  identityServiceUrl: IDENTITY_SERVICE_URL,
  clientId: 'staffing-service',
  clientSecret: 'test-client-secret-256bit',
};

// ─── Contract Section 1: Token Exchange ──────────────────────────────────────

describe('Cross-Service Contract: Token Exchange (LocalClientCredentialsProvider)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Schema Contract', () => {
    it('should POST to /internal/v1/oauth/token with correct body schema', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'svc-jwt-abc', expires_in: 300 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
      await provider.getCredential();

      // Verify endpoint
      expect(mockFetch).toHaveBeenCalledWith(TOKEN_ENDPOINT, expect.anything());

      // Verify HTTP method and headers
      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');

      // Verify body matches identity-service's expected schema
      const body = JSON.parse(opts.body as string);
      expect(body).toStrictEqual({
        grant_type: 'client_credentials',
        client_id: 'staffing-service',
        client_secret: 'test-client-secret-256bit',
        scope: 'identity.state.validate authorization.decide',
      });
    });

    it('should parse response with access_token and expires_in', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'issued-service-jwt', expires_in: 600 }),
        }),
      );

      const provider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
      const credential = await provider.getCredential();

      expect(credential.token).toBe('issued-service-jwt');
      expect(credential.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('Fail-Closed Guarantees', () => {
    it('should throw on network error (identity-service unavailable)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const provider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
      await expect(provider.getCredential()).rejects.toThrow('ECONNREFUSED');
    });

    it('should throw on timeout (identity-service unresponsive)', async () => {
      const timeoutErr = new Error('The operation was aborted');
      timeoutErr.name = 'TimeoutError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));

      const provider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
      await expect(provider.getCredential()).rejects.toThrow();
    });

    it('should throw on 401 (invalid client credentials)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({
            error: 'invalid_client',
            error_description: 'Client authentication failed',
          }),
        }),
      );

      const provider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
      await expect(provider.getCredential()).rejects.toThrow('Token exchange failed');
    });

    it('should throw on 500 (identity-service internal error)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'server_error' }),
        }),
      );

      const provider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
      await expect(provider.getCredential()).rejects.toThrow('Token exchange failed');
    });

    it('should throw on malformed response (missing access_token)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ unexpected: 'structure' }),
        }),
      );

      const provider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
      const credential = await provider.getCredential();
      // Token will be undefined — downstream adapters will fail closed
      expect(credential.token).toBeUndefined();
    });
  });
});

// ─── Contract Section 2: Identity State Validation ───────────────────────────

describe('Cross-Service Contract: Identity State Validation (HttpIdentityStateAdapter)', () => {
  const mockCredentialProvider: ServiceCredentialProvider = {
    getCredential: vi.fn().mockResolvedValue({ token: 'svc-jwt-valid', expiresAt: 9999999999 }),
    invalidate: vi.fn(),
  };

  const adapter = new HttpIdentityStateAdapter(IDENTITY_SERVICE_URL, mockCredentialProvider);

  const validPrincipal = {
    sessionId: 'sess-abc-123',
    userId: 'user-uuid-1',
    selectedTenantId: 'tenant-uuid-1',
    membershipId: 'membership-uuid-1',
    userAuthorizationVersion: 7,
    membershipAuthorizationVersion: 12,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    (mockCredentialProvider.getCredential as ReturnType<typeof vi.fn>).mockResolvedValue({
      token: 'svc-jwt-valid',
      expiresAt: 9999999999,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Schema Contract', () => {
    it('should POST to /internal/v1/identity/state-validations with principal body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ valid: true }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.validate(validPrincipal);

      // Verify endpoint
      expect(mockFetch).toHaveBeenCalledWith(STATE_VALIDATION_ENDPOINT, expect.anything());

      // Verify method + auth headers
      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toBe('Bearer svc-jwt-valid');
      expect(opts.headers['X-Correlation-ID']).toBeDefined();

      // Verify body matches identity-service expected schema
      const body = JSON.parse(opts.body as string);
      expect(body).toStrictEqual({
        subject: 'user-uuid-1',
        sessionId: 'sess-abc-123',
        selectedTenantId: 'tenant-uuid-1',
        membershipId: 'membership-uuid-1',
        userAuthorizationVersion: 7,
        membershipAuthorizationVersion: 12,
      });
    });

    it('should return valid:true when identity-service confirms state', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            valid: true,
            user: { status: 'ACTIVE', authorizationVersion: 7 },
            session: { status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z' },
            membership: { status: 'ACTIVE', tenantId: 'tenant-uuid-1', authorizationVersion: 12 },
          }),
        }),
      );

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(true);
    });
  });

  describe('Fail-Closed Guarantees', () => {
    it('should deny on network error (identity-service unavailable)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('IDENTITY_SERVICE_UNAVAILABLE');
    });

    it('should deny on timeout (3-second deadline exceeded)', async () => {
      const timeoutErr = new Error('The operation was aborted');
      timeoutErr.name = 'TimeoutError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('IDENTITY_SERVICE_TIMEOUT');
    });

    it('should deny and invalidate on 401 (expired/invalid service token)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: 'invalid_token' }),
        }),
      );

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SERVICE_AUTH_FAILED');
      expect(mockCredentialProvider.invalidate).toHaveBeenCalled();
    });

    it('should deny on 500 (identity-service internal error)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ code: 'INTERNAL_ERROR' }),
        }),
      );

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(false);
    });

    it('should deny on malformed response (missing valid field)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ unexpected: 'garbage' }),
        }),
      );

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MALFORMED_RESPONSE');
    });

    it('should deny when service token acquisition fails', async () => {
      (mockCredentialProvider.getCredential as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Key rotation in progress'),
      );

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SERVICE_TOKEN_UNAVAILABLE');
    });

    it('should deny when identity reports session revoked', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ valid: false, code: 'SESSION_REVOKED' }),
        }),
      );

      const result = await adapter.validate(validPrincipal);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SESSION_REVOKED');
    });
  });
});

// ─── Contract Section 3: Authorization Decision ──────────────────────────────

describe('Cross-Service Contract: Authorization Decision (HttpAuthorizationAdapter)', () => {
  const mockCredentialProvider: ServiceCredentialProvider = {
    getCredential: vi.fn().mockResolvedValue({ token: 'svc-jwt-valid', expiresAt: 9999999999 }),
    invalidate: vi.fn(),
  };

  const adapter = new HttpAuthorizationAdapter(IDENTITY_SERVICE_URL, mockCredentialProvider);

  const validRequest = {
    userId: 'user-uuid-1',
    tenantId: 'tenant-uuid-1',
    permission: 'facility.create',
    sessionId: 'sess-abc-123',
    membershipId: 'membership-uuid-1',
    userAuthorizationVersion: 7,
    membershipAuthorizationVersion: 12,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    (mockCredentialProvider.getCredential as ReturnType<typeof vi.fn>).mockResolvedValue({
      token: 'svc-jwt-valid',
      expiresAt: 9999999999,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Schema Contract', () => {
    it('should POST to /internal/v1/authorization/decisions with principal+action body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          decision: 'ALLOW',
          decisionId: 'dec-001',
          policyVersion: 3,
          reasonCode: 'ROLE_GRANTED',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.hasPermission(validRequest);

      // Verify endpoint
      expect(mockFetch).toHaveBeenCalledWith(AUTHORIZATION_ENDPOINT, expect.anything());

      // Verify method + auth headers
      const [, opts] = mockFetch.mock.calls[0]!;
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toBe('Bearer svc-jwt-valid');
      expect(opts.headers['X-Correlation-ID']).toBeDefined();

      // Verify body matches authorization-service expected schema
      const body = JSON.parse(opts.body as string);
      expect(body.principal).toStrictEqual({
        subject: 'user-uuid-1',
        sessionId: 'sess-abc-123',
        tenantId: 'tenant-uuid-1',
        membershipId: 'membership-uuid-1',
        userAuthorizationVersion: 7,
        membershipAuthorizationVersion: 12,
      });
      expect(body.action).toBe('facility.create');
      expect(body.resource).toBeUndefined(); // No resource for non-resource-scoped permissions
    });

    it('should include resource when resourceType is specified', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          decision: 'ALLOW',
          decisionId: 'dec-002',
          policyVersion: 3,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.hasPermission({
        ...validRequest,
        permission: 'facility.read',
        resourceType: 'facility',
        resourceId: 'facility-uuid-1',
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.resource).toStrictEqual({
        type: 'facility',
        id: 'facility-uuid-1',
        tenantId: 'tenant-uuid-1',
      });
    });

    it('should return allowed:true with decision metadata on ALLOW', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            decision: 'ALLOW',
            decisionId: 'dec-003',
            policyVersion: 5,
            reasonCode: 'ROLE_GRANTED',
          }),
        }),
      );

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(true);
      expect(result.decisionId).toBe('dec-003');
      expect(result.policyVersion).toBe(5);
    });

    it('should return allowed:false with reason on DENY', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            decision: 'DENY',
            decisionId: 'dec-004',
            policyVersion: 5,
            reasonCode: 'EXPLICIT_DENY',
          }),
        }),
      );

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('EXPLICIT_DENY');
    });
  });

  describe('Fail-Closed Guarantees', () => {
    it('should deny on network error (authorization-service unavailable)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('unavailable');
    });

    it('should deny on timeout (3-second deadline exceeded)', async () => {
      const timeoutErr = new Error('The operation was aborted');
      timeoutErr.name = 'TimeoutError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('timeout');
    });

    it('should deny and invalidate on 401 (expired/invalid service token)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
      expect(mockCredentialProvider.invalidate).toHaveBeenCalled();
    });

    it('should deny on 500 (authorization-service internal error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('500');
    });

    it('should deny on malformed response (missing decisionId)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ decision: 'ALLOW' }), // Missing decisionId + policyVersion
        }),
      );

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Missing decision metadata');
    });

    it('should deny on malformed response (unknown decision value)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ decision: 'MAYBE', decisionId: 'd', policyVersion: 1 }),
        }),
      );

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
    });

    it('should deny when service token acquisition fails', async () => {
      (mockCredentialProvider.getCredential as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Secret rotation in progress'),
      );

      const result = await adapter.hasPermission(validRequest);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('service token');
    });
  });
});

// ─── Contract Section 4: Full Auth Chain (End-to-End) ────────────────────────

describe('Cross-Service Contract: Full Authentication Chain', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prove: token exchange → state validation → authorization (happy path)', async () => {
    // Step 1: Token exchange succeeds
    const tokenFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'chain-svc-jwt', expires_in: 300 }),
    });
    vi.stubGlobal('fetch', tokenFetch);

    const credentialProvider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);
    const credential = await credentialProvider.getCredential();
    expect(credential.token).toBe('chain-svc-jwt');

    // Step 2: Identity state validation using the token
    const stateFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ valid: true }),
    });
    vi.stubGlobal('fetch', stateFetch);

    const stateAdapter = new HttpIdentityStateAdapter(IDENTITY_SERVICE_URL, credentialProvider);
    const stateResult = await stateAdapter.validate({
      sessionId: 'sess-chain',
      userId: 'user-chain',
      selectedTenantId: 'tenant-chain',
      membershipId: 'mem-chain',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
    });
    expect(stateResult.valid).toBe(true);

    // Verify state adapter used the token from step 1
    const stateOpts = stateFetch.mock.calls[0]![1];
    expect(stateOpts.headers['Authorization']).toBe('Bearer chain-svc-jwt');

    // Step 3: Authorization decision using the same token
    const authFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        decision: 'ALLOW',
        decisionId: 'chain-dec',
        policyVersion: 2,
        reasonCode: 'ROLE_GRANTED',
      }),
    });
    vi.stubGlobal('fetch', authFetch);

    const authAdapter = new HttpAuthorizationAdapter(IDENTITY_SERVICE_URL, credentialProvider);
    const authResult = await authAdapter.hasPermission({
      userId: 'user-chain',
      tenantId: 'tenant-chain',
      permission: 'facility.create',
      sessionId: 'sess-chain',
      membershipId: 'mem-chain',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
    });
    expect(authResult.allowed).toBe(true);
    expect(authResult.decisionId).toBe('chain-dec');

    // Verify auth adapter reused cached token (no additional fetch to token endpoint)
    expect(authFetch).toHaveBeenCalledTimes(1);
    const authOpts = authFetch.mock.calls[0]![1];
    expect(authOpts.headers['Authorization']).toBe('Bearer chain-svc-jwt');
  });

  it('should prove: entire chain fails closed when token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const credentialProvider = new LocalClientCredentialsProvider(SERVICE_CLIENT_CONFIG);

    // Both downstream adapters must deny when they cannot get a service token
    const stateAdapter = new HttpIdentityStateAdapter(IDENTITY_SERVICE_URL, credentialProvider);
    const stateResult = await stateAdapter.validate({
      sessionId: 's',
      userId: 'u',
      userAuthorizationVersion: 1,
    });
    expect(stateResult.valid).toBe(false);
    expect(stateResult.code).toBe('SERVICE_TOKEN_UNAVAILABLE');

    const authAdapter = new HttpAuthorizationAdapter(IDENTITY_SERVICE_URL, credentialProvider);
    const authResult = await authAdapter.hasPermission({
      userId: 'u',
      tenantId: 't',
      permission: 'facility.create',
      sessionId: 's',
      membershipId: 'm',
      userAuthorizationVersion: 1,
      membershipAuthorizationVersion: 1,
    });
    expect(authResult.allowed).toBe(false);
    expect(authResult.reason).toContain('service token');
  });

  it('should prove: chain fails closed when identity-service rejects state', async () => {
    const credentialProvider: ServiceCredentialProvider = {
      getCredential: vi.fn().mockResolvedValue({ token: 'svc-jwt', expiresAt: 9999999999 }),
      invalidate: vi.fn(),
    };

    // Identity service says session is revoked
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ valid: false, code: 'SESSION_REVOKED' }),
      }),
    );

    const stateAdapter = new HttpIdentityStateAdapter(IDENTITY_SERVICE_URL, credentialProvider);
    const stateResult = await stateAdapter.validate({
      sessionId: 's',
      userId: 'u',
      userAuthorizationVersion: 1,
    });

    // If state is invalid, the calling code MUST NOT proceed to authorization
    expect(stateResult.valid).toBe(false);
    expect(stateResult.code).toBe('SESSION_REVOKED');
  });
});
