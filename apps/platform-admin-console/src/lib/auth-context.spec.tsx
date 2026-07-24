import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider, useAuth, DEMO_PERSONAS } from './auth-context';

function TestConsumer() {
  const { isAuthenticated, persona, selectPersona, clearPersona } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</span>
      <span data-testid="persona-label">{persona?.label ?? 'none'}</span>
      {DEMO_PERSONAS.map((p) => (
        <button key={p.id} onClick={() => selectPersona(p).catch(() => {})}>
          {p.label}
        </button>
      ))}
      <button onClick={clearPersona}>Clear</button>
    </div>
  );
}

describe('AuthContext', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start unauthenticated', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('persona-label')).toHaveTextContent('none');
  });

  it('should authenticate when persona is selected', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'demo-jwt-token' }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Platform Administrator' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('persona-label')).toHaveTextContent('Platform Administrator');
    });
  });

  it('should call demo token endpoint with correct payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'MAS Tenant Administrator' }));
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/demo/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sub: 'mas-admin',
        tenantId: 'mas-medical-staffing',
        role: 'TENANT_ADMIN',
      }),
    });
  });

  it('should clear persona and return to unauthenticated', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt' }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Platform Administrator' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('persona-label')).toHaveTextContent('none');
  });

  it('should throw error when useAuth is called outside provider', () => {
    // Suppress React error boundary logging
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within AuthProvider');
    spy.mockRestore();
  });

  it('should handle failed token request', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // The selectPersona throws, but the PersonaSelector component handles
    // this internally. Here we just verify clicking doesn't leave us authenticated.
    // Suppress the expected unhandled error from the promise
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await userEvent.click(screen.getByRole('button', { name: 'Platform Administrator' }));

    // Wait for async operations to settle
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    });

    consoleSpy.mockRestore();
  });

  describe('DEMO_PERSONAS', () => {
    it('should have 6 defined personas', () => {
      expect(DEMO_PERSONAS).toHaveLength(6);
    });

    it('should include Platform Administrator', () => {
      const pa = DEMO_PERSONAS.find((p) => p.id === 'platform-admin');
      expect(pa).toBeDefined();
      expect(pa?.role).toBe('PLATFORM_ADMIN');
    });

    it('should include MAS Tenant Administrator', () => {
      const mas = DEMO_PERSONAS.find((p) => p.id === 'mas-admin');
      expect(mas).toBeDefined();
      expect(mas?.role).toBe('TENANT_ADMIN');
      expect(mas?.tenantId).toBe('mas-medical-staffing');
    });

    it('should include CareShield Tenant Administrator', () => {
      const cs = DEMO_PERSONAS.find((p) => p.id === 'careshield-admin');
      expect(cs).toBeDefined();
      expect(cs?.role).toBe('TENANT_ADMIN');
      expect(cs?.tenantId).toBe('careshield');
    });

    it('should include Read-Only Auditor', () => {
      const aud = DEMO_PERSONAS.find((p) => p.id === 'auditor');
      expect(aud).toBeDefined();
      expect(aud?.role).toBe('READ_ONLY_AUDITOR');
    });
  });
});
