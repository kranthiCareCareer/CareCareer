import type { TokenValidator } from '@carecareer/auth';

import { createPgPrismaClient } from '../infrastructure/database-factory.js';
import { DemoTokenValidator } from '../infrastructure/demo-token-validator.js';
import { PlatformTokenValidator } from '../infrastructure/platform-token-validator.js';
import { PostgresSigningKeyRepository } from '../infrastructure/postgres-session-repository.js';

/**
 * Exported for testing purposes only.
 * Implements the same logic as the identity module's resolveTokenValidator
 * but can be called from test contexts without NestJS DI.
 */
export function resolveTokenValidatorForTest(): TokenValidator {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const demoMode = process.env['DEMO_MODE'] === 'true';

  // Production safety: reject demo mode
  if (nodeEnv === 'production' && demoMode) {
    throw new Error(
      'FATAL: DEMO_MODE is prohibited in production. ' +
        'Remove DEMO_MODE=true from production configuration.',
    );
  }

  // Development/test with demo mode enabled
  if (demoMode) {
    const secret = process.env['DEMO_AUTH_SECRET'];
    if (!secret || secret.length < 32) {
      throw new Error('DEMO_AUTH_SECRET must be at least 32 characters when DEMO_MODE is enabled');
    }
    return new DemoTokenValidator({
      secret,
      issuer: 'carecareer-demo',
      audience: 'carecareer-api',
    });
  }

  // Production or non-demo development: use real platform token validator
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    if (nodeEnv === 'test' || nodeEnv === 'development') {
      return new DemoTokenValidator({
        secret:
          process.env['DEMO_AUTH_SECRET'] ??
          'carecareer-demo-secret-for-testing-only-do-not-use-in-production',
        issuer: 'carecareer-demo',
        audience: 'carecareer-api',
      });
    }
    throw new Error('DATABASE_URL is required for production token validation');
  }

  const issuer = process.env['TOKEN_ISSUER'] ?? 'carecareer-identity';
  const audience = process.env['TOKEN_AUDIENCE'] ?? 'carecareer-api';

  // Production safety checks
  if (nodeEnv === 'production') {
    if (!process.env['TOKEN_ISSUER']) {
      throw new Error('TOKEN_ISSUER must be explicitly set in production');
    }
    if (!process.env['TOKEN_AUDIENCE']) {
      throw new Error('TOKEN_AUDIENCE must be explicitly set in production');
    }
  }

  const prisma = createPgPrismaClient(dbUrl);
  const signingKeyRepo = new PostgresSigningKeyRepository();

  return new PlatformTokenValidator(
    { issuer, audience, clockToleranceSec: 30 },
    prisma,
    signingKeyRepo,
  );
}
