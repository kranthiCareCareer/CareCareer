import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { Organizations } from './Organizations';

const mockListOrganizations = vi.fn();
const mockCreateOrganization = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    listOrganizations: (...args: unknown[]) => mockListOrganizations(...args),
    createOrganization: (...args: unknown[]) => mockCreateOrganization(...args),
  },
}));

const sampleOrgs = [
  {
    id: 'org-1',
    tenantId: 'tenant-1',
    name: 'MAS Corporate',
    version: 1,
    createdAt: '2025-01-01T00:00:00Z',
    createdBy: 'admin',
  },
  {
    id: 'org-2',
    tenantId: 'tenant-1',
    name: 'MAS Northeast',
    version: 1,
    createdAt: '2025-01-02T00:00:00Z',
    createdBy: 'admin',
  },
];

describe('Organizations', () => {
  beforeEach(() => {
    mockListOrganizations.mockReset();
    mockCreateOrganization.mockReset();
    mockListOrganizations.mockResolvedValue(sampleOrgs);
  });

  function renderOrgs() {
    return render(
      <MemoryRouter initialEntries={['/tenants/tenant-1/organizations']}>
        <Routes>
          <Route path="/tenants/:tenantId/organizations" element={<Organizations />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('should render Organizations heading', async () => {
    renderOrgs();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Organizations' })).toBeInTheDocument();
    });
  });

  it('should show breadcrumb to tenant', async () => {
    renderOrgs();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '← Tenant' })).toBeInTheDocument();
    });
  });

  it('should display organization names', async () => {
    renderOrgs();
    await waitFor(() => {
      expect(screen.getByText('MAS Corporate')).toBeInTheDocument();
      expect(screen.getByText('MAS Northeast')).toBeInTheDocument();
    });
  });

  it('should show empty state when no organizations', async () => {
    mockListOrganizations.mockResolvedValue([]);
    renderOrgs();
    await waitFor(() => {
      expect(screen.getByText('No organizations yet.')).toBeInTheDocument();
    });
  });

  it('should have organization creation form', async () => {
    renderOrgs();
    await waitFor(() => {
      expect(screen.getByLabelText('Organization name')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Organization' })).toBeInTheDocument();
    });
  });

  it('should create organization on form submit', async () => {
    mockCreateOrganization.mockResolvedValue({ organizationId: 'new-org' });
    mockListOrganizations
      .mockResolvedValueOnce(sampleOrgs)
      .mockResolvedValueOnce([...sampleOrgs, { id: 'new-org', tenantId: 'tenant-1', name: 'New Branch Office', version: 1, createdAt: '2025-01-03', createdBy: 'admin' }]);

    renderOrgs();
    await waitFor(() => {
      expect(screen.getByText('MAS Corporate')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText('Organization name'), 'New Branch Office');
    await userEvent.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledWith('tenant-1', 'New Branch Office');
    });
  });

  it('should clear form after successful creation', async () => {
    mockCreateOrganization.mockResolvedValue({ organizationId: 'new' });

    renderOrgs();
    await waitFor(() => {
      expect(screen.getByText('MAS Corporate')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Organization name');
    await userEvent.type(input, 'Test Org');
    await userEvent.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('should show error on creation failure', async () => {
    mockCreateOrganization.mockRejectedValue({ message: 'Duplicate name' });

    renderOrgs();
    await waitFor(() => {
      expect(screen.getByText('MAS Corporate')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText('Organization name'), 'MAS Corporate');
    await userEvent.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Duplicate name')).toBeInTheDocument();
    });
  });

  it('should disable button while creating', async () => {
    mockCreateOrganization.mockReturnValue(new Promise(() => {}));

    renderOrgs();
    await waitFor(() => {
      expect(screen.getByText('MAS Corporate')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText('Organization name'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Create Organization' }));

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
  });

  it('should show load error', async () => {
    mockListOrganizations.mockRejectedValue({ message: 'Server error' });
    renderOrgs();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
