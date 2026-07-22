import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { PersonaSelector } from './pages/PersonaSelector';
import { Dashboard } from './pages/Dashboard';
import { TenantList } from './pages/TenantList';
import { CreateTenant } from './pages/CreateTenant';
import { TenantDetail } from './pages/TenantDetail';
import { Entitlements } from './pages/Entitlements';
import { Organizations } from './pages/Organizations';
import { Features } from './pages/Features';
import { AuditTimeline } from './pages/AuditTimeline';
import { FacilityList } from './pages/FacilityList';
import { CreateFacility } from './pages/CreateFacility';
import { FacilityDetail } from './pages/FacilityDetail';
import { WorkerList } from './pages/WorkerList';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <PersonaSelector />;
  }

  return (
    <main>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tenants" element={<TenantList />} />
        <Route path="/tenants/create" element={<CreateTenant />} />
        <Route path="/tenants/:tenantId" element={<TenantDetail />} />
        <Route path="/tenants/:tenantId/entitlements" element={<Entitlements />} />
        <Route path="/tenants/:tenantId/organizations" element={<Organizations />} />
        <Route path="/tenants/:tenantId/features" element={<Features />} />
        <Route path="/tenants/:tenantId/audit" element={<AuditTimeline />} />
        <Route path="/facilities" element={<FacilityList />} />
        <Route path="/facilities/create" element={<CreateFacility />} />
        <Route path="/facilities/:facilityId" element={<FacilityDetail />} />
        <Route path="/workers" element={<WorkerList />} />
      </Routes>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
