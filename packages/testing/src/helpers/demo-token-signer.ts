import { createHmac } from 'node:crypto';

/**
 * Demo-only JWT signer for integration and E2E testing.
 * Uses HMAC-SHA256 (HS256) for simplicity in test environments.
 *
 * MUST NOT be used in production. Production uses RS256 via OIDC provider.
 * Enabled only when DEMO_AUTH_SECRET environment variable is set.
 */

const DEMO_SECRET = 'carecareer-demo-secret-for-testing-only-do-not-use-in-production';

export interface DemoTokenClaims {
  sub: string;
  actor_id?: string;
  actor_type?: 'user' | 'service';
  tenants: Array<{
    tenantId: string;
    roles: string[];
    branchIds: string[];
    status: 'active' | 'inactive' | 'suspended';
  }>;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

/**
 * Sign a demo JWT for testing purposes.
 */
export function signDemoToken(claims: DemoTokenClaims): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: claims.iss ?? 'carecareer-demo',
    aud: claims.aud ?? 'carecareer-api',
    sub: claims.sub,
    actor_id: claims.actor_id ?? claims.sub,
    actor_type: claims.actor_type ?? 'user',
    tenants: claims.tenants,
    iat: claims.iat ?? now,
    exp: claims.exp ?? now + 900, // 15 min default
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', DEMO_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify a demo JWT. Returns the payload or throws.
 */
export function verifyDemoToken(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, signature] = parts;
  const expectedSig = createHmac('sha256', DEMO_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expectedSig) throw new Error('Invalid signature');

  const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString()) as Record<string, unknown>;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload['exp'] === 'number' && payload['exp'] < now) {
    throw new Error('Token expired');
  }

  return payload;
}

/**
 * Get the demo secret for configuring the validator.
 */
export function getDemoSecret(): string {
  return DEMO_SECRET;
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}
