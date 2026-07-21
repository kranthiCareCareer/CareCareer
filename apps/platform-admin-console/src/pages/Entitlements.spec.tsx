import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { Entitlements } from './Entitlements';

const mockGetEntitlements = vi.fn();
const mockUpdateEntitlements = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    getEntitlements: (...args: unknown[]) => mockGetEntitlements(...args),
    updateEntitlements: (...args: unknown[]) => mockUpdateEntitlements(...args),
  },
}));

const defaultEntitlements = {
  tenantId: 'tenant-1',
  modules: {
    core: true,
    workforce: false,
    credentialing: false,
    scheduling: true,
    timekeeping: false,
    pay_bill_preview: false,
    recruiting: false,
    engagement: false,
    vms: false,
    analytics: false,
  },
  version: 1,
  updatedAt: '2025-01-01T00:00:00Z',
  updatedBy: 'admin',
};

describe('Entitlements', () => {
  beforeEach(() => {
    mockGetEntitlements.mockReset();
    mockUpdateEntitlements.mockReset();
    mockGetEntitlements.mockResolvedValue(defaultEntitlements);
  });

  function renderEntitlements() {
    return render(
      <MemoryRouter initialEntries={['/tenants/tenant-1/entitlements']}>
        <Routes>
          <Route path="/tenants/:tenantId/entitlements" element={<Entitlements />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('should render Entitlements heading', async () => {
    renderEntitlements();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Entitlements' })).toBeInTheDocument();
    });
  });

  it('should show breadcrumb to tenant detail', async () => {
    renderEntitlements();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '← Tenant' })).toBeInTheDocument();
    });
  });

  it('should display entitlement description', async () => {
    renderEntitlements();
    await waitFor(() => {
      expect(
        screen.getByText(/Entitlements represent purchased or authorized platform modules/),
      ).toBeInTheDocument();
    });
  });

  it('should render checkbox for each module', async () => {
    renderEntitlements();
    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBe(10);
    });
  });

  it('should show Core Platform as always enabled and disabled', async () => {
    renderEntitlements();
    await waitFor(() => {
      expect(screen.getByText('Core Platform')).toBeInTheDocument();
      expect(screen.getByText('(always enabled)')).toBeInTheDocument();
    });
  });

  it('should display version number', async () => {
    renderEntitlements();
    await waitFor(() => {
      expect(screen.getByText(/Version: 1/)).toBeInTheDocument();
    });
  });

  it('should call updateEntitlements on toggle', async () => {
    mockUpdateEntitlements.mockResolvedValue(undefined);
    mockGetEntitlements.mockResolvedValueOnce(defaultEntitlements).mockResolvedValueOnce({
      ...defaultEntitlements,
      modules: { ...defaultEntitlements.modules, workforce: true },
      version: 2,
    });

    renderEntitlements();
    await waitFor(() => {
      expect(screen.getByText('Workforce Management')).toBeInTheDocument();
    });

    const workforceCheckbox = screen.getAllByRole('checkbox')[1]!; // workforce is second
    await userEvent.click(workforceCheckbox);

    await waitFor(() => {
      expect(mockUpdateEntitlements).toHaveBeenCalledWith('tenant-1', { workforce: true }, 1);
    });
  });

  it('should show version conflict error', async () => {
    mockUpdateEntitlements.mockRejectedValue({
      message: 'Conflict',
      code: 'VERSION_CONFLICT',
    });

    renderEntitlements();
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox').length).toBe(10);
    });

    const checkbox = screen.getAllByRole('checkbox')[2]!; // credentialing
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Version conflict/)).toBeInTheDocument();
    });
  });

  it('should show heading and loading state initially', () => {
    mockGetEntitlements.mockReturnValue(new Promise(() => {}));
    renderEntitlements();
    // Heading renders immediately regardless of data state
    expect(screen.getByRole('heading', { name: 'Entitlements' })).toBeInTheDocument();
    expect(screen.getByText('Loading entitlements...')).toBeInTheDocument();
  });

  it('should show accessible error banner on API failure', async () => {
    mockGetEntitlements.mockRejectedValue({ message: 'Network error' });
    renderEntitlements();

    await waitFor(() => {
      // Heading is always visible
      expect(screen.getByRole('heading', { name: 'Entitlements' })).toBeInTheDocument();
      // Error banner appears with the error message
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
    // Loading indicator also visible since entitlements is still null
    expect(screen.getByText('Loading entitlements...')).toBeInTheDocument();
    // No stack traces or SQL exposed
    expect(screen.queryByText(/SQLSTATE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/node_modules/)).not.toBeInTheDocument();
  });
});
