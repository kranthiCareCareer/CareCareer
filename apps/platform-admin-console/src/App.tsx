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
