import type {
  AuthorizationDecision,
  AuthorizationRequest,
  AuthorizationService,
} from './authorization-service.js';

/**
 * In-memory authorization service for development and testing.
 * Replaced by identity-service API in production.
 *
 * Supports:
 * - Role-permission mapping
 * - Tenant membership validation
 * - Explicit deny rules
 */
export class InMemoryAuthorizationService implements AuthorizationService {
  private readonly rolePermissions: Map<string, Set<string>>;
  private readonly denyRules: Set<string>;

  constructor(config: {
    rolePermissions: Record<string, readonly string[]>;
    denyRules?: readonly string[];
  }) {
    this.rolePermissions = new Map();
    for (const [role, permissions] of Object.entries(config.rolePermissions)) {
      this.rolePermissions.set(role, new Set(permissions));
    }
    this.denyRules = new Set(config.denyRules ?? []);
  }

  async evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    // 1. Check tenant membership
    const membership = request.principal.tenantMemberships.find(
      (m) => m.tenantId === request.tenantId,
    );

    if (!membership) {
      return {
        allowed: false,
        reasonCode: 'NO_TENANT_MEMBERSHIP',
        policyVersion: 'in-memory-v1',
      };
    }

    if (membership.status !== 'active') {
      return {
        allowed: false,
        reasonCode: 'MEMBERSHIP_INACTIVE',
        policyVersion: 'in-memory-v1',
      };
    }

    // 2. Check explicit deny (deny always wins)
    const denyKey = `${request.tenantId}:${request.principal.subject}:${request.permission}`;
    if (this.denyRules.has(denyKey)) {
      return {
        allowed: false,
        reasonCode: 'EXPLICIT_DENY',
        policyVersion: 'in-memory-v1',
      };
    }

    // 3. Check role-permission grant
    for (const role of membership.roles) {
      const permissions = this.rolePermissions.get(role);
      if (permissions?.has(request.permission)) {
        return {
          allowed: true,
          reasonCode: 'ROLE_GRANT',
          policyVersion: 'in-memory-v1',
        };
      }
    }

    // 4. No matching grant — implicit deny
    return {
      allowed: false,
      reasonCode: 'NO_MATCHING_GRANT',
      policyVersion: 'in-memory-v1',
    };
  }
}
