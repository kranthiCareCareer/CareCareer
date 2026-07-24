import type { TokenValidator, ValidatedTokenContext } from '@carecareer/auth';
import { createHmac } from 'node:crypto';

/**
 * Demo-only token validator for local development.
 * Accepts HS256 tokens issued by the platform-service demo endpoint.
 *
 * NOT FOR PRODUCTION USE — production uses RS256 via JWKS.
 */
export class DemoTokenValidator implements TokenValidator {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: { secret: string; issuer: string; audience: string }) {
    this.secret = config.secret;
    this.issuer = config.issuer;
    this.audience = config.audience;
  }

  async validate(token: string): Promise<ValidatedTokenContext> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    const expectedSig = createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (expectedSig !== signatureB64) {
      throw new Error('Invalid token signature');
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());

    // Validate claims
    if (payload.iss !== this.issuer) {
      throw new Error(`Invalid issuer: ${payload.iss as string}`);
    }
    if (payload.aud !== this.audience) {
      throw new Error(`Invalid audience: ${payload.aud as string}`);
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }

    return {
      subject: payload.sub as string,
      actorType: 'user',
      tenantMemberships: [
        {
          tenantId: (payload.tenant_id ?? payload.tenantId ?? '') as string,
          roles: [payload.role as string ?? 'ALL'],
          branchIds: [],
          status: 'active',
        },
      ],
      selectedTenantId: (payload.tenant_id ?? payload.tenantId ?? '') as string,
      membershipId: (payload.membership_id ?? 'demo-membership') as string,
      sessionId: (payload.sid ?? 'demo-session') as string,
      userAuthorizationVersion: (payload.user_authz_version ?? 1) as number,
      membershipAuthorizationVersion: (payload.membership_authz_version ?? 1) as number,
      issuedAt: new Date((payload.iat ?? now) * 1000),
      expiresAt: new Date((payload.exp ?? now + 3600) * 1000),
      tokenId: (payload.jti ?? 'demo-jti') as string,
    };
  }
}
