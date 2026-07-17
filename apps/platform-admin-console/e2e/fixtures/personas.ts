/**
 * Demo persona fixtures for E2E tests.
 * These mirror the personas available in the admin console.
 */
export const PERSONAS = {
  platformAdmin: {
    id: 'platform-admin',
    label: 'Platform Administrator',
    role: 'PLATFORM_ADMIN',
    tenantId: 'platform',
  },
  masAdmin: {
    id: 'mas-admin',
    label: 'MAS Tenant Administrator',
    role: 'TENANT_ADMIN',
    tenantId: 'mas-medical-staffing',
  },
  careshieldAdmin: {
    id: 'careshield-admin',
    label: 'CareShield Tenant Administrator',
    role: 'TENANT_ADMIN',
    tenantId: 'careshield',
  },
  auditor: {
    id: 'auditor',
    label: 'Read-Only Auditor',
    role: 'READ_ONLY_AUDITOR',
    tenantId: 'platform',
  },
} as const;
