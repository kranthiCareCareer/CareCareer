import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';

import type { TokenValidator } from '@carecareer/auth';
import { TenantAwareTransaction } from '@carecareer/database';

import { LocalJwksTokenValidator } from './infrastructure/local-jwks-token-validator.js';
import { PostgresStaffingRepository } from './infrastructure/postgres-staffing-repository.js';
import { StaffingAuthGuard } from './infrastructure/staffing-auth.guard.js';
import { FacilityController } from './interface/http/facility.controller.js';
import { HealthController } from './interface/http/health.controller.js';

/**
 * Staffing service root module.
 * Manages facilities, departments, workers, shifts and assignments.
 *
 * Authentication: RS256 JWT validation via LocalJwksTokenValidator.
 * In production, public keys are fetched from identity-service JWKS endpoint.
 * In tests, keys are provided directly.
 */
@Module({
  controllers: [HealthController, FacilityController],
  providers: [
    {
      provide: 'TOKEN_VALIDATOR',
      useFactory: (): LocalJwksTokenValidator => {
        const jwksKeys = process.env['JWKS_PUBLIC_KEYS'];
        const issuer = process.env['JWT_ISSUER'] ?? 'carecareer-identity';
        const audience = process.env['JWT_AUDIENCE'] ?? 'carecareer-api';

        // Parse public keys from environment (JSON array of {kid, publicKeyPem})
        const publicKeys: Array<{ kid: string; publicKeyPem: string }> = jwksKeys
          ? JSON.parse(jwksKeys) as Array<{ kid: string; publicKeyPem: string }>
          : [];

        return new LocalJwksTokenValidator({ issuer, audience, publicKeys });
      },
    },
    {
      provide: APP_GUARD,
      useFactory: (tv: TokenValidator, reflector: Reflector): StaffingAuthGuard => {
        return new StaffingAuthGuard(tv as never, reflector);
      },
      inject: ['TOKEN_VALIDATOR', Reflector],
    },
    {
      provide: 'STAFFING_TENANT_DB',
      useFactory: (): TenantAwareTransaction => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          return new TenantAwareTransaction({
            $transaction: async () => {
              throw new Error('No database configured');
            },
          } as never);
        }
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: dbUrl, max: 10 });
        return new TenantAwareTransaction({
          async $transaction(fn: (tx: unknown) => Promise<unknown>) {
            const conn = await pool.connect();
            try {
              await conn.query('BEGIN');
              await conn.query('SET LOCAL search_path TO staffing, public');
              const tx = {
                async $executeRaw(s: TemplateStringsArray, ...v: unknown[]) {
                  let q = '';
                  for (let i = 0; i < s.length; i++) {
                    q += s[i];
                    if (i < v.length) q += `$${i + 1}`;
                  }
                  return (await conn.query(q, v)).rowCount ?? 0;
                },
                async $queryRaw(s: TemplateStringsArray, ...v: unknown[]) {
                  let q = '';
                  for (let i = 0; i < s.length; i++) {
                    q += s[i];
                    if (i < v.length) q += `$${i + 1}`;
                  }
                  return (await conn.query(q, v)).rows;
                },
              };
              const result = await fn(tx);
              await conn.query('COMMIT');
              return result;
            } catch (e) {
              await conn.query('ROLLBACK');
              throw e;
            } finally {
              conn.release();
            }
          },
        } as never);
      },
    },
    {
      provide: 'STAFFING_REPOSITORY',
      useClass: PostgresStaffingRepository,
    },
  ],
})
export class StaffingModule {}
