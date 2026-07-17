import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { PersonaSelector } from './pages/PersonaSelector';
import { Dashboard } from './pages/Dashboard';
import { TenantList } from './pages/TenantList';
import { CreateTenant } from './pages/CreateTenant';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <PersonaSelector />;
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/tenants" element={<TenantList />} />
      <Route path="/tenants/create" element={<CreateTenant />} />
    </Routes>
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
