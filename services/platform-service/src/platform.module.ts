import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { InMemoryAuthorizationService } from '@carecareer/auth';
import { HealthChecker } from '@carecareer/observability';
import { ServiceCoreModule, AuthenticationGuard } from '@carecareer/service-core';

import { DemoTokenValidator } from './infrastructure/demo-token-validator.js';
import { TenantController } from './interface/http/tenant.controller.js';

/**
 * Platform service root module.
 * Configures authentication, authorization, health, and domain controllers.
 */
@Module({
  imports: [ServiceCoreModule],
  controllers: [TenantController],
  providers: [
    // Token validator — demo mode (HS256)
    {
      provide: 'TOKEN_VALIDATOR',
      useFactory: (): DemoTokenValidator =>
        new DemoTokenValidator({
          secret: process.env['DEMO_AUTH_SECRET'] ?? 'carecareer-demo-secret-for-testing-only-do-not-use-in-production',
          issuer: 'carecareer-demo',
          audience: 'carecareer-api',
        }),
    },
    // Authorization service — in-memory for GP-02
    {
      provide: 'AUTHORIZATION_SERVICE',
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
            READ_ONLY_AUDITOR: [
              'platform.tenant.read',
              'platform.audit.read',
            ],
          },
        }),
    },
    // Authentication guard (global)
    {
      provide: APP_GUARD,
      useFactory: (tokenValidator: DemoTokenValidator): AuthenticationGuard =>
        new AuthenticationGuard(tokenValidator),
      inject: ['TOKEN_VALIDATOR'],
    },
    // Health checker
    {
      provide: HealthChecker,
      useFactory: (): HealthChecker => new HealthChecker(),
    },
  ],
})
export class PlatformModule {}
