import { createHmac } from 'node:crypto';

import type {
  TenantMembershipClaim,
  TokenValidator,
  ValidatedTokenContext,
} from '@carecareer/auth';
import { AuthenticationError } from '@carecareer/auth';

export interface DemoTokenValidatorConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
}

/**
 * Demo-only token validator for development and testing.
 * Uses HMAC-SHA256 (HS256) for simplicity.
 *
 * MUST NOT be used in production — the guard verifies NODE_ENV at startup.
 * Returns ValidatedTokenContext for contract compatibility with PlatformTokenValidator.
 */
export class DemoTokenValidator implements TokenValidator {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: DemoTokenValidatorConfig) {
    this.secret = config.secret;
    this.issuer = config.issuer;
    this.audience = config.audience;
  }

  async validate(token: string): Promise<ValidatedTokenContext> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthenticationError('Invalid token format');
    }

    const [headerB64, payloadB64, signature] = parts;
    const expectedSig = createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signature !== expectedSig) {
      throw new AuthenticationError('Invalid token signature');
    }

    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString()) as Record<
      string,
      unknown
    >;

    // Validate claims
    if (payload['iss'] !== this.issuer) {
      throw new AuthenticationError('Invalid issuer');
    }
    if (payload['aud'] !== this.audience) {
      throw new AuthenticationError('Invalid audience');
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload['exp'] === 'number' && payload['exp'] < now - 30) {
      throw new AuthenticationError('Token expired');
    }

    const tenants = payload['tenants'] as
      | Array<{
          tenantId: string;
          roles: string[];
          branchIds: string[];
          status: string;
        }>
      | undefined;

    const memberships: TenantMembershipClaim[] = (tenants ?? []).map((t) => ({
      tenantId: t.tenantId,
      roles: t.roles,
      branchIds: t.branchIds,
      status: t.status as 'active' | 'inactive' | 'suspended',
    }));

    const iat = typeof payload['iat'] === 'number' ? payload['iat'] : now;
    const exp = typeof payload['exp'] === 'number' ? payload['exp'] : now + 900;

    return {
      subject: payload['sub'] as string,
      actorId: String(payload['actor_id'] ?? payload['sub']),
      actorType: (payload['actor_type'] === 'service' ? 'service' : 'user') as 'user' | 'service',
      tenantMemberships: memberships,
      issuedAt: new Date(iat * 1000),
      expiresAt: new Date(exp * 1000),
      // Demo tokens use simplified session context
      sessionId: (payload['sid'] as string) ?? 'demo-session',
      tokenId: (payload['jti'] as string) ?? 'demo-jti',
      userAuthorizationVersion:
        typeof payload['user_authorization_version'] === 'number'
          ? (payload['user_authorization_version'] as number)
          : 1,
      selectedTenantId: memberships.length > 0 ? memberships[0]?.tenantId : undefined,
      membershipId: payload['membership_id'] as string | undefined,
      membershipAuthorizationVersion: payload['membership_authorization_version'] as
        | number
        | undefined,
    };
  }
}
