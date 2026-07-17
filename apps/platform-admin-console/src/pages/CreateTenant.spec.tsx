import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { CreateTenant } from './CreateTenant';

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    persona: { label: 'Platform Administrator', id: 'platform-admin' },
  }),
}));

// We need to mock the apiClient
const mockProvisionTenant = vi.fn();
vi.mock('../api/client', () => ({
  apiClient: {
    provisionTenant: (...args: unknown[]) => mockProvisionTenant(...args),
  },
}));

describe('CreateTenant', () => {
  beforeEach(() => {
    mockProvisionTenant.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderCreate() {
    return render(
      <MemoryRouter>
        <CreateTenant />
      </MemoryRouter>,
    );
  }

  it('should render Create Tenant heading', () => {
    renderCreate();
    expect(screen.getByRole('heading', { name: 'Create Tenant' })).toBeInTheDocument();
  });

  it('should have breadcrumb to tenants list', () => {
    renderCreate();
    expect(screen.getByRole('link', { name: '← Tenants' })).toHaveAttribute(
      'href',
      '/tenants',
    );
  });

  it('should render all form fields', () => {
    renderCreate();
    expect(screen.getByLabelText('Tenant Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Tenant Slug')).toBeInTheDocument();
    expect(screen.getByLabelText('Initial Organization Name')).toBeInTheDocument();
  });

  it('should have submit button', () => {
    renderCreate();
    expect(screen.getByRole('button', { name: 'Provision Tenant' })).toBeInTheDocument();
  });

  it('should disable button while submitting', async () => {
    mockProvisionTenant.mockReturnValue(new Promise(() => {}));

    renderCreate();
    await userEvent.type(screen.getByLabelText('Tenant Name'), 'Test');
    await userEvent.type(screen.getByLabelText('Tenant Slug'), 'test');
    await userEvent.type(screen.getByLabelText('Initial Organization Name'), 'Org');
    await userEvent.click(screen.getByRole('button', { name: 'Provision Tenant' }));

    expect(screen.getByRole('button', { name: 'Provisioning...' })).toBeDisabled();
  });

  it('should display success result with tenant and correlation IDs', async () => {
    mockProvisionTenant.mockResolvedValue({
      tenantId: 'new-tenant-id',
      organizationId: 'new-org-id',
      correlationId: 'corr-abc-123',
    });

    renderCreate();
    await userEvent.type(screen.getByLabelText('Tenant Name'), 'Test Corp');
    await userEvent.type(screen.getByLabelText('Tenant Slug'), 'test-corp');
    await userEvent.type(screen.getByLabelText('Initial Organization Name'), 'Test Org');
    await userEvent.click(screen.getByRole('button', { name: 'Provision Tenant' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('new-tenant-id')).toBeInTheDocument();
      expect(screen.getByText('new-org-id')).toBeInTheDocument();
      expect(screen.getByText('corr-abc-123')).toBeInTheDocument();
    });
  });

  it('should show View Tenant link after successful provisioning', async () => {
    mockProvisionTenant.mockResolvedValue({
      tenantId: 'tid-1',
      organizationId: 'oid-1',
      correlationId: 'c-1',
    });

    renderCreate();
    await userEvent.type(screen.getByLabelText('Tenant Name'), 'T');
    await userEvent.type(screen.getByLabelText('Tenant Slug'), 'ts');
    await userEvent.type(screen.getByLabelText('Initial Organization Name'), 'O');
    await userEvent.click(screen.getByRole('button', { name: 'Provision Tenant' }));

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'View Tenant' });
      expect(link).toHaveAttribute('href', '/tenants/tid-1');
    });
  });

  it('should display error message on failure', async () => {
    mockProvisionTenant.mockRejectedValue({
      message: 'Slug already exists',
      code: 'VALIDATION_ERROR',
      correlationId: 'err-c-1',
    });

    renderCreate();
    await userEvent.type(screen.getByLabelText('Tenant Name'), 'T');
    await userEvent.type(screen.getByLabelText('Tenant Slug'), 'existing');
    await userEvent.type(screen.getByLabelText('Initial Organization Name'), 'O');
    await userEvent.click(screen.getByRole('button', { name: 'Provision Tenant' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Slug already exists')).toBeInTheDocument();
    });
  });

  it('should prevent double submission', async () => {
    mockProvisionTenant.mockReturnValue(new Promise(() => {}));

    renderCreate();
    await userEvent.type(screen.getByLabelText('Tenant Name'), 'T');
    await userEvent.type(screen.getByLabelText('Tenant Slug'), 'ts');
    await userEvent.type(screen.getByLabelText('Initial Organization Name'), 'O');

    // Click submit twice quickly
    const btn = screen.getByRole('button', { name: 'Provision Tenant' });
    await userEvent.click(btn);

    // Button should now be disabled showing "Provisioning..."
    expect(screen.getByRole('button', { name: 'Provisioning...' })).toBeDisabled();
    expect(mockProvisionTenant).toHaveBeenCalledTimes(1);
  });

  it('should send correct payload to API', async () => {
    mockProvisionTenant.mockResolvedValue({
      tenantId: 'tid',
      organizationId: 'oid',
      correlationId: 'c',
    });

    renderCreate();
    await userEvent.type(screen.getByLabelText('Tenant Name'), 'My Company');
    await userEvent.type(screen.getByLabelText('Tenant Slug'), 'my-company');
    await userEvent.type(screen.getByLabelText('Initial Organization Name'), 'HQ');
    await userEvent.click(screen.getByRole('button', { name: 'Provision Tenant' }));

    await waitFor(() => {
      expect(mockProvisionTenant).toHaveBeenCalledWith({
        name: 'My Company',
        slug: 'my-company',
        organizationName: 'HQ',
      });
    });
  });

  it('should re-enable button after error', async () => {
    mockProvisionTenant.mockRejectedValue({ message: 'Failed' });

    renderCreate();
    await userEvent.type(screen.getByLabelText('Tenant Name'), 'T');
    await userEvent.type(screen.getByLabelText('Tenant Slug'), 'ts');
    await userEvent.type(screen.getByLabelText('Initial Organization Name'), 'O');
    await userEvent.click(screen.getByRole('button', { name: 'Provision Tenant' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Provision Tenant' })).not.toBeDisabled();
    });
  });
});
