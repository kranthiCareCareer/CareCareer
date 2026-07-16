/**
 * Canonical authenticated principal.
 * Provider-specific claims are translated at the boundary.
 * Domain services receive only this interface — never raw JWT claims.
 */
export interface TenantMembershipClaim {
  readonly tenantId: string;
  readonly roles: readonly string[];
  readonly branchIds: readonly string[];
  readonly status: 'active' | 'inactive' | 'suspended';
}

export interface AuthenticatedPrincipal {
  /** OIDC subject claim — mapped to CareCareer user ID */
  readonly subject: string;
  /** CareCareer canonical actor ID (may differ from subject during mapping) */
  readonly actorId?: string | undefined;
  /** Actor type */
  readonly actorType: 'user' | 'service';
  /** Tenant memberships from identity-service (or token claims) */
  readonly tenantMemberships: readonly TenantMembershipClaim[];
  /** Token issued-at time */
  readonly issuedAt: Date;
  /** Token expiration time */
  readonly expiresAt: Date;
}
