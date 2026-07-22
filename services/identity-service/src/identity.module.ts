import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';

import type { TokenValidator } from '@carecareer/auth';
import { AdministrativeDatabase, TenantAwareTransaction } from '@carecareer/database';

import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  TENANT_DATABASE,
  TOKEN_VALIDATOR,
} from './application/ports/injection-tokens.js';
import { createPgPrismaClient } from './infrastructure/database-factory.js';
import { DemoTokenValidator } from './infrastructure/demo-token-validator.js';
import { IdentityAuthGuard } from './infrastructure/identity-auth.guard.js';
import { PlatformTokenValidator } from './infrastructure/platform-token-validator.js';
import { PostgresAuthorizationRepository } from './infrastructure/postgres-authorization-repository.js';
import { PostgresIdentityRepository } from './infrastructure/postgres-identity-repository.js';
import { PostgresMembershipRepository } from './infrastructure/postgres-membership-repository.js';
import { PostgresSessionRepository } from './infrastructure/postgres-session-repository.js';
import { PostgresSigningKeyRepository } from './infrastructure/postgres-signing-key-repository.js';
import { ServiceIdentityGuard } from './infrastructure/service-identity.guard.js';
import { SessionStateValidator } from './infrastructure/session-state-validator.js';
import { AuthController } from './interface/http/auth.controller.js';
import { AuthorizationController } from './interface/http/authorization.controller.js';
import { HealthController } from './interface/http/health.controller.js';
import { InternalAuthorizationController } from './interface/http/internal-authorization.controller.js';
import { InternalIdentityController } from './interface/http/internal-identity.controller.js';
import { InternalOAuthController } from './interface/http/internal-oauth.controller.js';
import { MembershipController } from './interface/http/membership.controller.js';
import { UserController } from './interface/http/user.controller.js';

/**
 * Resolve the token validator based on environment.
 *
 * Production: PlatformTokenValidator (RS256, JWKS-verified)
 * Development/Test: DemoTokenValidator (HS256, for local testing only)
 *
 * Production startup MUST reject DEMO_MODE=true.
 */
function resolveTokenValidator(): TokenValidator {
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
    // Fallback for test environments without DATABASE_URL: use demo
    // This only applies when DEMO_MODE is not explicitly set
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

@Module({
  controllers: [
    HealthController,
    UserController,
    MembershipController,
    AuthController,
    AuthorizationController,
    InternalOAuthController,
    InternalIdentityController,
    InternalAuthorizationController,
  ],
  providers: [
    {
      provide: TOKEN_VALIDATOR,
      useFactory: resolveTokenValidator,
    },
    {
      provide: APP_GUARD,
      useFactory: (tokenValidator: TokenValidator, reflector: Reflector) => {
        // Wire session-state validator for live enforcement when database is available
        const dbUrl = process.env['DATABASE_URL'];
        let sessionValidator: SessionStateValidator | null = null;
        if (dbUrl) {
          const prisma = createPgPrismaClient(dbUrl);
          const sessionRepo = new PostgresSessionRepository();
          sessionValidator = new SessionStateValidator(prisma, sessionRepo);
        }
        return new IdentityAuthGuard(tokenValidator, reflector, sessionValidator);
      },
      inject: [TOKEN_VALIDATOR, Reflector],
    },
    {
      provide: IDENTITY_REPOSITORY,
      useClass: PostgresIdentityRepository,
    },
    {
      provide: MEMBERSHIP_REPOSITORY,
      useClass: PostgresMembershipRepository,
    },
    {
      provide: ADMINISTRATIVE_DATABASE,
      useFactory: (): AdministrativeDatabase => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          return new AdministrativeDatabase({
            $transaction: async () => {
              throw new Error('No database configured');
            },
          } as never);
        }
        return new AdministrativeDatabase(createPgPrismaClient(dbUrl));
      },
    },
    {
      provide: TENANT_DATABASE,
      useFactory: (): TenantAwareTransaction => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          return new TenantAwareTransaction({
            $transaction: async () => {
              throw new Error('No database configured');
            },
          } as never);
        }
        return new TenantAwareTransaction(createPgPrismaClient(dbUrl));
      },
    },
    {
      provide: 'AUTHORIZATION_PRISMA',
      useFactory: () => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          return {
            $transaction: async () => {
              throw new Error('No database configured');
            },
          };
        }
        return createPgPrismaClient(dbUrl);
      },
    },
    {
      provide: 'AUTHORIZATION_REPOSITORY',
      useClass: PostgresAuthorizationRepository,
    },
    {
      provide: 'IDENTITY_PRISMA',
      useFactory: () => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          return {
            $transaction: async () => {
              throw new Error('No database configured');
            },
          };
        }
        return createPgPrismaClient(dbUrl);
      },
    },
    {
      provide: 'SIGNING_KEY_REPOSITORY',
      useClass: PostgresSigningKeyRepository,
    },
    {
      provide: 'SESSION_REPOSITORY',
      useClass: PostgresSessionRepository,
    },
    ServiceIdentityGuard,
  ],
})
export class IdentityModule {}
