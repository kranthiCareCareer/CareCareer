import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { Dashboard } from './Dashboard';

// Mock auth context
const mockClearPersona = vi.fn();
vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    persona: { label: 'Platform Administrator', id: 'platform-admin' },
    clearPersona: mockClearPersona,
  }),
}));

describe('Dashboard', () => {
  function renderDashboard() {
    return render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
  }

  it('should render Platform Dashboard heading', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Platform Dashboard' })).toBeInTheDocument();
  });

  it('should display signed-in persona name', () => {
    renderDashboard();
    expect(screen.getByText('Platform Administrator')).toBeInTheDocument();
  });

  it('should show stat cards for tenant statuses', () => {
    renderDashboard();
    expect(screen.getByText('Total Tenants')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Provisioning')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('should show placeholder values when data not loaded', () => {
    renderDashboard();
    const values = screen.getAllByText('—');
    expect(values.length).toBe(5);
  });

  it('should have navigation link to tenants', () => {
    renderDashboard();
    expect(screen.getByRole('link', { name: /Tenants/ })).toHaveAttribute('href', '/tenants');
  });

  it('should call clearPersona on Switch Persona click', async () => {
    renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Switch Persona' }));
    expect(mockClearPersona).toHaveBeenCalled();
  });
});
