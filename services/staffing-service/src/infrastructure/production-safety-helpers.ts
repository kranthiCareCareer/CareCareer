import type { TokenValidator } from '@carecareer/auth';

import { DemoTokenValidator } from './demo-token-validator.js';
import { LocalJwksTokenValidator } from './local-jwks-token-validator.js';
import { RemoteJwksTokenValidator } from './remote-jwks-token-validator.js';

/**
 * Creates a token validator based on environment configuration.
 * Implements production safety: rejects demo mode in production,
 * requires JWKS in production.
 *
 * Exported for testability — the module factory delegates to this.
 */
export function createTokenValidator(): TokenValidator {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const demoMode = process.env['DEMO_MODE'] === 'true';
  const issuer = process.env['JWT_ISSUER'] ?? 'carecareer-identity';
  const audience = process.env['JWT_AUDIENCE'] ?? 'carecareer-api';

  // PRODUCTION SAFETY: reject demo mode in production
  if (nodeEnv === 'production' && demoMode) {
    throw new Error(
      'FATAL: DEMO_MODE=true is forbidden in production. ' +
        'Remove DEMO_MODE or set NODE_ENV to development/staging.',
    );
  }

  // Demo mode: accept HS256 tokens from platform-service demo endpoint
  if (demoMode) {
    const secret =
      process.env['DEMO_AUTH_SECRET'] ??
      'carecareer-demo-secret-for-testing-only-do-not-use-in-production';
    return new DemoTokenValidator({
      secret,
      issuer: 'carecareer-demo',
      audience,
    });
  }

  const jwksUri = process.env['JWKS_URI'];

  // PRODUCTION SAFETY: require JWKS in production
  if (nodeEnv === 'production' && !jwksUri) {
    throw new Error(
      'FATAL: JWKS_URI is required in production for RS256 token validation. ' +
        'Configure the identity-service JWKS endpoint.',
    );
  }

  // Production: use remote JWKS with auto-refresh and key rotation
  if (jwksUri) {
    return new RemoteJwksTokenValidator({ issuer, audience, jwksUri });
  }

  // Local dev/test: use static keys from environment
  const jwksKeys = process.env['JWKS_PUBLIC_KEYS'];
  const publicKeys: Array<{ kid: string; publicKeyPem: string }> = jwksKeys
    ? (JSON.parse(jwksKeys) as Array<{ kid: string; publicKeyPem: string }>)
    : [];

  return new LocalJwksTokenValidator({ issuer, audience, publicKeys });
}
