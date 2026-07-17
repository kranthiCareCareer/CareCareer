import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AuditTimeline } from './AuditTimeline';

describe('AuditTimeline', () => {
  function renderAudit() {
    return render(
      <MemoryRouter initialEntries={['/tenants/tid/audit']}>
        <Routes>
          <Route path="/tenants/:tenantId/audit" element={<AuditTimeline />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('should render Audit Timeline heading', () => {
    renderAudit();
    expect(screen.getByRole('heading', { name: 'Audit Timeline' })).toBeInTheDocument();
  });

  it('should show breadcrumb to tenant', () => {
    renderAudit();
    expect(screen.getByRole('link', { name: '← Tenant' })).toBeInTheDocument();
  });

  it('should describe immutable and read-only nature', () => {
    renderAudit();
    expect(screen.getByText(/immutable, append-only audit log/)).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it('should describe what each entry shows', () => {
    renderAudit();
    expect(screen.getByText(/timestamp, actor, action, resource, reason/)).toBeInTheDocument();
  });

  it('should explain sensitive values are redacted', () => {
    renderAudit();
    expect(screen.getByText(/Sensitive values are redacted/)).toBeInTheDocument();
  });

  it('should show empty state placeholder', () => {
    renderAudit();
    expect(screen.getByText(/Audit timeline will display/)).toBeInTheDocument();
  });
});
