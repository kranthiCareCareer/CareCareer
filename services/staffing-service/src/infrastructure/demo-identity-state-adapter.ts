import type {
  IdentityStateAdapter,
  IdentityStateValidationInput,
  IdentityStateValidationResult,
} from './identity-state-adapter.js';

/**
 * Deterministic local-demo identity state adapter.
 *
 * Validates session, membership, and authorization versions against
 * seeded demo data. This is NOT a bypass — it performs real checks
 * against known-good state, enforcing:
 * - Session validity
 * - Tenant membership
 * - User active status
 * - Authorization version currency
 *
 * Rejects:
 * - Unknown subjects (not in seeded users)
 * - Inactive sessions
 * - Wrong tenant (subject not member of requested tenant)
 * - Stale authorization versions
 */

interface DemoUser {
  readonly subject: string;
  readonly status: 'active' | 'inactive' | 'suspended';
  readonly authorizationVersion: number;
  readonly tenantMemberships: readonly DemoMembership[];
}

interface DemoMembership {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly status: 'active' | 'inactive' | 'suspended';
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly facilityIds: readonly string[];
  readonly authorizationVersion: number;
}

const DEMO_TENANT_ID = '00000000-0000-4000-a000-000000000001';
const DEMO_FACILITY_ID = '00000000-0000-4000-a000-000000000010';
const DEMO_WORKER_ID = '00000000-0000-4000-a000-000000000020';

/** Seeded demo users with deterministic state */
const DEMO_USERS: readonly DemoUser[] = [
  {
    subject: 'platform-admin',
    status: 'active',
    authorizationVersion: 1,
    tenantMemberships: [
      {
        membershipId: 'mem-admin-001',
        tenantId: DEMO_TENANT_ID,
        status: 'active',
        roles: ['PLATFORM_ADMIN'],
        permissions: [
          // Facilities (dot-separated legacy)
          'facility.create', 'facility.list', 'facility.read', 'facility.update', 'facility.activate',
          'department.create', 'department.list', 'department.activate',
          'credential-requirement.manage', 'credential-requirement.read',
          // Workers (dot-separated legacy)
          'worker.create', 'worker.read', 'worker.list', 'worker.update', 'worker.change-status',
          // Credentials
          'credentials:create', 'credentials:read', 'credentials:verify', 'credentials:reject', 'credentials:revoke',
          // Shifts (colon-separated)
          'shifts:create', 'shifts:read', 'shifts:publish', 'shifts:cancel',
          // Marketplace
          'shift-requests:create', 'shift-requests:read', 'shift-requests:confirm', 'shift-requests:reject', 'shift-requests:withdraw',
          'marketplace:read',
          // Assignments
          'assignments:read', 'assignments:check-in', 'assignments:complete', 'assignments:cancel',
          // Timekeeping
          'timekeeping:clock', 'timekeeping:read', 'timekeeping:submit', 'timekeeping:approve', 'timekeeping:reject',
          // Notifications
          'notifications:read', 'notifications:admin',
          // Audit
          'audit:read',
        ],
        facilityIds: [DEMO_FACILITY_ID],
        authorizationVersion: 1,
      },
    ],
  },
  {
    subject: 'worker-sarah',
    status: 'active',
    authorizationVersion: 1,
    tenantMemberships: [
      {
        membershipId: 'mem-worker-001',
        tenantId: DEMO_TENANT_ID,
        status: 'active',
        roles: ['WORKER'],
        permissions: [
          'marketplace:read',
          'shift-requests:create', 'shift-requests:read', 'shift-requests:withdraw',
          'assignments:read', 'assignments:check-in', 'assignments:complete',
          'timekeeping:clock', 'timekeeping:read', 'timekeeping:submit',
          'credentials:read',
          'notifications:read',
          'worker.read',
        ],
        facilityIds: [],
        authorizationVersion: 1,
      },
    ],
  },
  {
    subject: 'client-mercy',
    status: 'active',
    authorizationVersion: 1,
    tenantMemberships: [
      {
        membershipId: 'mem-client-001',
        tenantId: DEMO_TENANT_ID,
        status: 'active',
        roles: ['CLIENT'],
        permissions: [
          'facility.list', 'facility.read',
          'shifts:create', 'shifts:read', 'shifts:publish', 'shifts:cancel',
          'shift-requests:read', 'shift-requests:confirm', 'shift-requests:reject',
          'marketplace:read',
          'assignments:read',
          'timekeeping:read', 'timekeeping:approve', 'timekeeping:reject',
          'worker.list', 'worker.read',
        ],
        facilityIds: [DEMO_FACILITY_ID],
        authorizationVersion: 1,
      },
    ],
  },
];

/** Active sessions (demo — all subjects have active sessions) */
const ACTIVE_SESSIONS = new Set(['demo-session']);

export class DemoIdentityStateAdapter implements IdentityStateAdapter {
  async validate(input: IdentityStateValidationInput): Promise<IdentityStateValidationResult> {
    // Validate session
    if (!ACTIVE_SESSIONS.has(input.sessionId)) {
      return { valid: false, code: 'SESSION_REVOKED', message: 'Session is not active' };
    }

    // Find user
    const user = DEMO_USERS.find((u) => u.subject === input.userId);
    if (!user) {
      return { valid: false, code: 'USER_NOT_FOUND', message: 'User not found' };
    }

    // Check user status
    if (user.status !== 'active') {
      return { valid: false, code: 'USER_INACTIVE', message: `User is ${user.status}` };
    }

    // Check authorization version
    if (input.userAuthorizationVersion < user.authorizationVersion) {
      return {
        valid: false,
        code: 'USER_AUTHZ_STALE',
        message: 'User authorization version is stale',
      };
    }

    // If tenant-scoped, validate membership
    if (input.selectedTenantId) {
      const membership = user.tenantMemberships.find(
        (m) => m.tenantId === input.selectedTenantId,
      );
      if (!membership) {
        return { valid: false, code: 'NO_MEMBERSHIP', message: 'No membership for tenant' };
      }
      if (membership.status !== 'active') {
        return {
          valid: false,
          code: 'MEMBERSHIP_INACTIVE',
          message: `Membership is ${membership.status}`,
        };
      }
      if (
        input.membershipAuthorizationVersion !== undefined &&
        input.membershipAuthorizationVersion < membership.authorizationVersion
      ) {
        return {
          valid: false,
          code: 'MEMBERSHIP_AUTHZ_STALE',
          message: 'Membership authorization version is stale',
        };
      }
    }

    return { valid: true };
  }
}

/**
 * Demo permission adapter that checks permissions against seeded roles.
 */
export class DemoPermissionAdapter {
  async hasPermission(input: {
    userId: string;
    tenantId: string;
    permission: string;
    sessionId: string;
    membershipId: string;
    userAuthorizationVersion: number;
    membershipAuthorizationVersion: number;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const user = DEMO_USERS.find((u) => u.subject === input.userId);
    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    const membership = user.tenantMemberships.find((m) => m.tenantId === input.tenantId);
    if (!membership) {
      return { allowed: false, reason: 'No membership for tenant' };
    }

    if (!membership.permissions.includes(input.permission)) {
      return { allowed: false, reason: `Permission '${input.permission}' not granted` };
    }

    return { allowed: true };
  }
}

/** Export constants for use in tests */
export const DEMO_CONSTANTS = {
  TENANT_ID: DEMO_TENANT_ID,
  FACILITY_ID: DEMO_FACILITY_ID,
  WORKER_ID: DEMO_WORKER_ID,
  USERS: DEMO_USERS,
} as const;
