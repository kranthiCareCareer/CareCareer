import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { TenantList } from './TenantList';

const mockClearPersona = vi.fn();
vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    persona: { label: 'Platform Administrator', id: 'platform-admin' },
    clearPersona: mockClearPersona,
  }),
}));

describe('TenantList', () => {
  function renderList() {
    return render(
      <MemoryRouter>
        <TenantList />
      </MemoryRouter>,
    );
  }

  it('should render Tenants heading', () => {
    renderList();
    expect(screen.getByRole('heading', { name: 'Tenants' })).toBeInTheDocument();
  });

  it('should have search input', () => {
    renderList();
    expect(screen.getByRole('searchbox', { name: 'Search tenants' })).toBeInTheDocument();
  });

  it('should have status filter select', () => {
    renderList();
    const select = screen.getByRole('combobox', { name: 'Filter by status' });
    expect(select).toBeInTheDocument();
  });

  it('should have status filter options', () => {
    renderList();
    expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Provisioning' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Suspended' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Deactivated' })).toBeInTheDocument();
  });

  it('should have Create Tenant link', () => {
    renderList();
    expect(screen.getByRole('link', { name: 'Create Tenant' })).toHaveAttribute(
      'href',
      '/tenants/create',
    );
  });

  it('should show breadcrumb to Dashboard', () => {
    renderList();
    expect(screen.getByRole('link', { name: '← Dashboard' })).toHaveAttribute('href', '/');
  });

  it('should show empty state message', () => {
    renderList();
    expect(screen.getByText(/Connect to the platform-service/)).toBeInTheDocument();
  });

  it('should show demo:up instruction', () => {
    renderList();
    expect(screen.getByText('pnpm demo:up')).toBeInTheDocument();
  });

  it('should display persona label', () => {
    renderList();
    expect(screen.getByText('Platform Administrator')).toBeInTheDocument();
  });
});
