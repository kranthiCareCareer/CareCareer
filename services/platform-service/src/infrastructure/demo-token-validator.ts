import { createHmac } from 'node:crypto';

import {
  InvalidTokenError,
  TokenExpiredError,
  type TenantMembershipClaim,
  type TokenValidator,
  type ValidatedTokenContext,
} from '@carecareer/auth';

/**
 * Demo-only token validator using HS256.
 * Used exclusively in test and demo environments.
 * Production uses JwksTokenValidator with RS256.
 */
export class DemoTokenValidator implements TokenValidator {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(params: { secret: string; issuer: string; audience: string }) {
    this.secret = params.secret;
    this.issuer = params.issuer;
    this.audience = params.audience;
  }

  async validate(token: string): Promise<ValidatedTokenContext> {
    if (!token) throw new InvalidTokenError('Token is empty');

    const parts = token.split('.');
    if (parts.length !== 3) throw new InvalidTokenError('Invalid token format');

    const [headerB64, payloadB64, signature] = parts;

    // Verify signature
    const expectedSig = createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signature !== expectedSig) throw new InvalidTokenError('Invalid signature');

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString()) as Record<
      string,
      unknown
    >;

    // Verify issuer
    if (payload['iss'] !== this.issuer) {
      throw new InvalidTokenError('Invalid issuer');
    }

    // Verify audience
    if (payload['aud'] !== this.audience) {
      throw new InvalidTokenError('Invalid audience');
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload['exp'] === 'number' && payload['exp'] < now) {
      throw new TokenExpiredError();
    }

    // Verify subject
    const sub = payload['sub'];
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new InvalidTokenError('Missing subject');
    }

    // Map tenants
    const rawTenants = payload['tenants'];
    const tenantMemberships: TenantMembershipClaim[] = Array.isArray(rawTenants)
      ? rawTenants.map((t: Record<string, unknown>) => ({
          tenantId: String(t['tenantId'] ?? ''),
          roles: Array.isArray(t['roles']) ? t['roles'].map(String) : [],
          branchIds: Array.isArray(t['branchIds']) ? t['branchIds'].map(String) : [],
          status:
            t['status'] === 'active' || t['status'] === 'inactive' || t['status'] === 'suspended'
              ? t['status']
              : ('active' as const),
        }))
      : [];

    return {
      subject: sub,
      actorId: typeof payload['actor_id'] === 'string' ? payload['actor_id'] : sub,
      actorType: payload['actor_type'] === 'service' ? 'service' : 'user',
      tenantMemberships,
      issuedAt: new Date((payload['iat'] as number) * 1000),
      expiresAt: new Date((payload['exp'] as number) * 1000),
      sessionId: (payload['sid'] as string) ?? 'demo-session',
      tokenId: (payload['jti'] as string) ?? 'demo-jti',
      userAuthorizationVersion:
        typeof payload['user_authorization_version'] === 'number'
          ? (payload['user_authorization_version'] as number)
          : 1,
      selectedTenantId: tenantMemberships.length > 0 ? tenantMemberships[0]?.tenantId : undefined,
    };
  }
}
