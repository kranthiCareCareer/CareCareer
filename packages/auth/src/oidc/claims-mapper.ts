import type { JWTPayload } from 'jose';

import type {
  AuthenticatedPrincipal,
  TenantMembershipClaim,
} from '../core/authenticated-principal.js';
import { InvalidTokenError } from '../core/errors.js';

/**
 * Configuration for mapping provider-specific JWT claims to canonical principal.
 * Allows different providers (Auth0, Cognito, Keycloak) to use different claim names.
 */
export interface ClaimsMapperConfig {
  /** Claim path for tenant memberships (default: 'tenants') */
  readonly tenantsClaim?: string;
  /** Claim path for actor type (default: 'actor_type') */
  readonly actorTypeClaim?: string;
  /** Claim path for CareCareer actor ID (default: 'actor_id') */
  readonly actorIdClaim?: string;
}

/**
 * Maps raw JWT claims to the canonical AuthenticatedPrincipal.
 * This is the ONLY place where provider-specific claim names are understood.
 * Everything downstream sees only the canonical interface.
 */
export class ClaimsMapper {
  private readonly tenantsClaim: string;
  private readonly actorTypeClaim: string;
  private readonly actorIdClaim: string;

  constructor(config?: ClaimsMapperConfig) {
    this.tenantsClaim = config?.tenantsClaim ?? 'tenants';
    this.actorTypeClaim = config?.actorTypeClaim ?? 'actor_type';
    this.actorIdClaim = config?.actorIdClaim ?? 'actor_id';
  }

  /**
   * Transform verified JWT claims into a canonical principal.
   * Rejects tokens with malformed or missing required claims.
   */
  toPrincipal(payload: JWTPayload): AuthenticatedPrincipal {
    const subject = payload.sub;
    if (!subject) {
      throw new InvalidTokenError('Missing subject claim');
    }

    const issuedAt = payload.iat ? new Date(payload.iat * 1000) : new Date();
    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 900000);

    const rawTenants = payload[this.tenantsClaim];
    const tenantMemberships = this.mapTenantMemberships(rawTenants);

    const actorType = this.mapActorType(payload[this.actorTypeClaim]);
    const rawActorId = payload[this.actorIdClaim];
    const actorId = typeof rawActorId === 'string' ? rawActorId : undefined;

    return {
      subject,
      actorId: actorId ?? subject,
      actorType,
      tenantMemberships,
      issuedAt,
      expiresAt,
    };
  }

  private mapTenantMemberships(raw: unknown): TenantMembershipClaim[] {
    if (!raw || !Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        tenantId: String(item['tenantId'] ?? item['tenant_id'] ?? ''),
        roles: Array.isArray(item['roles']) ? (item['roles'] as unknown[]).map(String) : [],
        branchIds: this.extractStringArray(item['branchIds'], item['branch_ids']),
        status: this.mapMembershipStatus(item['status']),
      }))
      .filter((m) => m.tenantId.length > 0);
  }

  private extractStringArray(primary: unknown, fallback: unknown): string[] {
    const source = Array.isArray(primary) ? primary : Array.isArray(fallback) ? fallback : [];
    return (source as unknown[]).map(String);
  }

  private mapMembershipStatus(raw: unknown): 'active' | 'inactive' | 'suspended' {
    if (raw === 'active' || raw === 'inactive' || raw === 'suspended') {
      return raw;
    }
    return 'active'; // Default for tokens that don't include explicit status
  }

  private mapActorType(raw: unknown): 'user' | 'service' {
    if (raw === 'service') return 'service';
    return 'user';
  }
}
