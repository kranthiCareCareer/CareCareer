import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { DemoPersona } from '../api/types';
import { apiClient } from '../api/client';

/** Available demo personas */
export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'platform-admin',
    label: 'Platform Administrator',
    role: 'PLATFORM_ADMIN',
    tenantId: 'platform',
    description: 'Full platform access. Can provision tenants and manage all resources.',
  },
  {
    id: 'mas-admin',
    label: 'MAS Tenant Administrator',
    role: 'TENANT_ADMIN',
    tenantId: 'mas-medical-staffing',
    description: 'MAS Medical Staffing tenant admin. Can manage their own tenant.',
  },
  {
    id: 'careshield-admin',
    label: 'CareShield Tenant Administrator',
    role: 'TENANT_ADMIN',
    tenantId: 'careshield',
    description: 'CareShield tenant admin. Can manage their own tenant.',
  },
  {
    id: 'auditor',
    label: 'Read-Only Auditor',
    role: 'READ_ONLY_AUDITOR',
    tenantId: 'platform',
    description: 'Can view tenants and audit records but cannot make changes.',
  },
];

interface AuthState {
  persona: DemoPersona | null;
  token: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  selectPersona: (persona: DemoPersona) => Promise<void>;
  clearPersona: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Demo authentication provider.
 * Requests a signed JWT from the backend demo endpoint.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    persona: null,
    token: null,
    isAuthenticated: false,
  });

  const selectPersona = useCallback(async (persona: DemoPersona) => {
    // Request demo token from backend
    const res = await fetch('/api/demo/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sub: persona.id,
        tenantId: persona.tenantId,
        role: persona.role,
      }),
    });

    if (!res.ok) {
      throw new Error('Failed to obtain demo token');
    }

    const { token } = (await res.json()) as { token: string };
    apiClient.setAuth(token, persona.id);
    setState({ persona, token, isAuthenticated: true });
  }, []);

  const clearPersona = useCallback(() => {
    apiClient.clearAuth();
    setState({ persona: null, token: null, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, selectPersona, clearPersona }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
