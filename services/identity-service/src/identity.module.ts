import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';

import { AdministrativeDatabase } from '@carecareer/database';

import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
  TOKEN_VALIDATOR,
} from './application/ports/injection-tokens.js';
import { createPgPrismaClient } from './infrastructure/database-factory.js';
import { DemoTokenValidator } from './infrastructure/demo-token-validator.js';
import { IdentityAuthGuard } from './infrastructure/identity-auth.guard.js';
import { PostgresIdentityRepository } from './infrastructure/postgres-identity-repository.js';
import { HealthController } from './interface/http/health.controller.js';
import { UserController } from './interface/http/user.controller.js';

@Module({
  controllers: [HealthController, UserController],
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
      useFactory: (tokenValidator: DemoTokenValidator, reflector: Reflector) =>
        new IdentityAuthGuard(tokenValidator, reflector),
      inject: [TOKEN_VALIDATOR, Reflector],
    },
    {
      provide: IDENTITY_REPOSITORY,
      useClass: PostgresIdentityRepository,
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
  ],
})
export class IdentityModule {}
