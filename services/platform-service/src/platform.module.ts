import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { InMemoryAuthorizationService } from '@carecareer/auth';
import { AdministrativeDatabase, TenantAwareTransaction } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';

import {
  ADMINISTRATIVE_DATABASE,
  AUTHORIZATION_SERVICE,
  OUTBOX_WRITER,
  PLATFORM_REPOSITORY,
  TENANT_DATABASE,
  TOKEN_VALIDATOR,
} from './application/ports/injection-tokens.js';
import { createPgPrismaClient } from './infrastructure/database-factory.js';
import { DemoTokenValidator } from './infrastructure/demo-token-validator.js';
import { PlatformAuthGuard } from './infrastructure/platform-auth.guard.js';
import { PostgresPlatformRepository } from './infrastructure/postgres-platform-repository.js';
import { DemoAuthController } from './interface/http/demo-auth.controller.js';
import { PlatformHealthController } from './interface/http/health.controller.js';
import { TenantController } from './interface/http/tenant.controller.js';

@Module({
  controllers: [TenantController, PlatformHealthController, DemoAuthController],
  providers: [
    {
      provide: TOKEN_VALIDATOR,
      useFactory: (): DemoTokenValidator =>
        new DemoTokenValidator({
          secret:
            process.env['DEMO_AUTH_SECRET'] ??
            'carecareer-demo-secret-for-testing-only-do-not-use-in-production',
          issuer: 'carecareer-demo',
          audience: 'carecareer-api',
        }),
    },
    {
      provide: APP_GUARD,
      useClass: PlatformAuthGuard,
    },
    {
      provide: AUTHORIZATION_SERVICE,
      useFactory: (): InMemoryAuthorizationService =>
        new InMemoryAuthorizationService({
          rolePermissions: {
            PLATFORM_ADMIN: [
              'platform.tenant.provision',
              'platform.tenant.read',
              'platform.tenant.update',
              'platform.organization.create',
              'platform.branch.create',
              'platform.entitlements.manage',
              'platform.features.manage',
              'platform.audit.read',
            ],
            TENANT_ADMIN: [
              'platform.tenant.read',
              'platform.tenant.update',
              'platform.organization.create',
              'platform.branch.create',
              'platform.entitlements.manage',
              'platform.features.manage',
              'platform.audit.read',
            ],
            READ_ONLY_AUDITOR: ['platform.tenant.read', 'platform.audit.read'],
          },
        }),
    },
    { provide: PLATFORM_REPOSITORY, useClass: PostgresPlatformRepository },
    {
      provide: ADMINISTRATIVE_DATABASE,
      useFactory: (): AdministrativeDatabase => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          // Fallback stub for unit tests (overridden in test modules)
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
      provide: OUTBOX_WRITER,
      useFactory: (): OutboxWriter => new OutboxWriter('platform-service'),
    },
  ],
})
export class PlatformModule {}
