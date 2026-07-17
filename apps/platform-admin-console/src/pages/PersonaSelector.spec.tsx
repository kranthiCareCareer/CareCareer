import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '../lib/auth-context';
import { PersonaSelector } from './PersonaSelector';

describe('PersonaSelector', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderSelector() {
    return render(
      <AuthProvider>
        <PersonaSelector />
      </AuthProvider>,
    );
  }

  it('should render the page heading', () => {
    renderSelector();
    expect(
      screen.getByRole('heading', { name: 'CareCareer Platform Admin Console' }),
    ).toBeInTheDocument();
  });

  it('should display DEMO MODE badge', () => {
    renderSelector();
    expect(screen.getByText(/DEMO MODE — Development Only/)).toBeInTheDocument();
  });

  it('should render all four persona buttons', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: /Platform Administrator/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MAS Tenant Administrator/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /CareShield Tenant Administrator/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Read-Only Auditor/ })).toBeInTheDocument();
  });

  it('should show persona descriptions', () => {
    renderSelector();
    expect(screen.getByText(/Full platform access/)).toBeInTheDocument();
    expect(screen.getByText(/MAS Medical Staffing tenant admin/)).toBeInTheDocument();
    expect(screen.getByText(/CareShield tenant admin/)).toBeInTheDocument();
    expect(screen.getByText(/Can view tenants and audit records/)).toBeInTheDocument();
  });

  it('should show footer disclaimer about production auth', () => {
    renderSelector();
    expect(
      screen.getByText(/Production authentication uses a proper identity provider/),
    ).toBeInTheDocument();
  });

  it('should disable all buttons while authenticating', async () => {
    // Never resolve to keep in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderSelector();
    await userEvent.click(screen.getByRole('button', { name: /Platform Administrator/ }));

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('should show loading text while authenticating', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderSelector();
    await userEvent.click(screen.getByRole('button', { name: /Platform Administrator/ }));

    expect(screen.getByText('Authenticating...')).toBeInTheDocument();
  });

  it('should show error message when authentication fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    renderSelector();
    await userEvent.click(screen.getByRole('button', { name: /Platform Administrator/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('should display error with role="alert" for accessibility', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    renderSelector();
    await userEvent.click(screen.getByRole('button', { name: /Platform Administrator/ }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });

  it('should mark persona button as aria-busy while loading', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderSelector();
    await userEvent.click(screen.getByRole('button', { name: /Platform Administrator/ }));

    const btn = screen.getByRole('button', { name: /Platform Administrator/ });
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});
