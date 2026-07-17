import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { Features } from './Features';

const mockGetFeatures = vi.fn();
const mockUpdateFeature = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    getFeatures: (...args: unknown[]) => mockGetFeatures(...args),
    updateFeature: (...args: unknown[]) => mockUpdateFeature(...args),
  },
}));

const sampleFeatures = [
  { tenantId: 'tid', featureKey: 'scheduling.auto_confirm_enabled', value: true, version: 1, updatedAt: '2025-01-01T00:00:00Z', updatedBy: 'admin' },
  { tenantId: 'tid', featureKey: 'timekeeping.geofence_required', value: false, version: 1, updatedAt: '2025-01-01T00:00:00Z', updatedBy: 'admin' },
  { tenantId: 'tid', featureKey: 'timekeeping.allowed_clock_in_minutes_before', value: 15, version: 1, updatedAt: '2025-01-01T00:00:00Z', updatedBy: 'admin' },
];

describe('Features', () => {
  beforeEach(() => {
    mockGetFeatures.mockReset();
    mockUpdateFeature.mockReset();
    mockGetFeatures.mockResolvedValue(sampleFeatures);
  });

  function renderFeatures() {
    return render(
      <MemoryRouter initialEntries={['/tenants/tid/features']}>
        <Routes>
          <Route path="/tenants/:tenantId/features" element={<Features />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('should render Feature Configuration heading', async () => {
    renderFeatures();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Feature Configuration' })).toBeInTheDocument();
    });
  });

  it('should show breadcrumb to tenant', async () => {
    renderFeatures();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '← Tenant' })).toBeInTheDocument();
    });
  });

  it('should display description about entitlements', async () => {
    renderFeatures();
    await waitFor(() => {
      expect(
        screen.getByText(/Feature settings are available only for entitled modules/),
      ).toBeInTheDocument();
    });
  });

  it('should render feature labels', async () => {
    renderFeatures();
    await waitFor(() => {
      expect(screen.getByText('Auto-confirm shifts')).toBeInTheDocument();
      expect(screen.getByText('Geofence required')).toBeInTheDocument();
      expect(screen.getByText('Clock-in window (before)')).toBeInTheDocument();
    });
  });

  it('should render feature keys', async () => {
    renderFeatures();
    await waitFor(() => {
      expect(screen.getByText('scheduling.auto_confirm_enabled')).toBeInTheDocument();
      expect(screen.getByText('timekeeping.geofence_required')).toBeInTheDocument();
    });
  });

  it('should render boolean features as checkboxes', async () => {
    renderFeatures();
    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  it('should render number features as number inputs', async () => {
    renderFeatures();
    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton');
      expect(spinbuttons.length).toBeGreaterThan(0);
    });
  });

  it('should call updateFeature when boolean toggled', async () => {
    mockUpdateFeature.mockResolvedValue(undefined);

    renderFeatures();
    await waitFor(() => {
      expect(screen.getByText('Geofence required')).toBeInTheDocument();
    });

    // geofence_required is false, toggling should send true
    const checkboxes = screen.getAllByRole('checkbox');
    // Find the geofence checkbox (second boolean feature in order)
    await userEvent.click(checkboxes[1]!);

    await waitFor(() => {
      expect(mockUpdateFeature).toHaveBeenCalledWith(
        'tid',
        'timekeeping.geofence_required',
        true,
      );
    });
  });

  it('should show error on update failure', async () => {
    mockUpdateFeature.mockRejectedValue({ message: 'Entitlement not enabled' });

    renderFeatures();
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByRole('checkbox')[0]!);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Entitlement not enabled')).toBeInTheDocument();
    });
  });

  it('should show error on load failure', async () => {
    mockGetFeatures.mockRejectedValue({ message: 'Load error' });
    renderFeatures();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
