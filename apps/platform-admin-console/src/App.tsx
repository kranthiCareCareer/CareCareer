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
import { ShiftList } from './pages/ShiftList';
import { CreateShift } from './pages/CreateShift';
import { ShiftRequests } from './pages/ShiftRequests';
import { MarketplaceShifts } from './pages/MarketplaceShifts';
import { MyAssignments } from './pages/MyAssignments';
import { TimecardList } from './pages/TimecardList';
import { Notifications } from './pages/Notifications';

function AppRoutes() {
  const { isAuthenticated, persona } = useAuth();

  if (!isAuthenticated) {
    return <PersonaSelector />;
  }

  const role = persona?.role ?? '';

  return (
    <main>
      <Routes>
        <Route path="/" element={<Dashboard />} />

        {/* Admin routes */}
        {(role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN') && (
          <>
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
            <Route path="/shifts" element={<ShiftList />} />
            <Route path="/shifts/create" element={<CreateShift />} />
            <Route path="/shift-requests" element={<ShiftRequests />} />
            <Route path="/timecards" element={<TimecardList />} />
            <Route path="/audit" element={<AuditTimeline />} />
          </>
        )}

        {/* Client routes */}
        {role === 'CLIENT' && (
          <>
            <Route path="/shifts" element={<ShiftList />} />
            <Route path="/shifts/create" element={<CreateShift />} />
            <Route path="/shift-requests" element={<ShiftRequests />} />
            <Route path="/assignments" element={<MyAssignments />} />
            <Route path="/timecards" element={<TimecardList />} />
          </>
        )}

        {/* Worker routes */}
        {role === 'WORKER' && (
          <>
            <Route path="/marketplace" element={<MarketplaceShifts />} />
            <Route path="/my-assignments" element={<MyAssignments />} />
            <Route path="/timecards" element={<TimecardList />} />
            <Route path="/notifications" element={<Notifications />} />
          </>
        )}

        {/* Auditor routes */}
        {role === 'READ_ONLY_AUDITOR' && (
          <>
            <Route path="/tenants" element={<TenantList />} />
            <Route path="/tenants/:tenantId" element={<TenantDetail />} />
            <Route path="/tenants/:tenantId/audit" element={<AuditTimeline />} />
            <Route path="/audit" element={<AuditTimeline />} />
          </>
        )}
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
