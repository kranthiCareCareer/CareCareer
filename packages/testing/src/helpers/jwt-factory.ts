import type { AuthenticatedPrincipal, TenantMembershipClaim } from '@carecareer/auth';

/**
 * Creates test AuthenticatedPrincipal objects for unit and integration tests.
 * No real JWT signing — just the canonical principal structure.
 */
export function createTestToken(
  overrides: Partial<AuthenticatedPrincipal> & {
    tenantId?: string;
    roles?: string[];
  } = {},
): AuthenticatedPrincipal {
  const tenantId = overrides.tenantId ?? '01912345-0000-7000-8000-000000000001';
  const roles = overrides.roles ?? ['SCHEDULER'];

  const defaultMembership: TenantMembershipClaim = {
    tenantId,
    roles,
    branchIds: ['01912345-0000-7000-8000-000000000010'],
    status: 'active',
  };

  return {
    subject: overrides.subject ?? 'test-user-001',
    actorId: overrides.actorId ?? 'test-user-001',
    actorType: overrides.actorType ?? 'user',
    tenantMemberships: overrides.tenantMemberships ?? [defaultMembership],
    issuedAt: overrides.issuedAt ?? new Date(),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 900000),
  };
}
