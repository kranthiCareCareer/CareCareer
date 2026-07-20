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

/**
 * Extended validated token context returned by platform token validators.
 * Includes session and authorization-version fields so the guard does not
 * need to reparse the compact JWT.
 */
export interface ValidatedTokenContext extends AuthenticatedPrincipal {
  /** Session ID from the sid claim */
  readonly sessionId: string;
  /** Token JTI (unique identifier) */
  readonly tokenId: string;
  /** User authorization version at token issuance */
  readonly userAuthorizationVersion: number;
  /** Selected tenant ID (if tenant-scoped) */
  readonly selectedTenantId?: string | undefined;
  /** Membership ID (if tenant-scoped) */
  readonly membershipId?: string | undefined;
  /** Membership authorization version (if tenant-scoped) */
  readonly membershipAuthorizationVersion?: number | undefined;
}
