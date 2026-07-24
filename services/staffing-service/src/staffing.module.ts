import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';

import type { TokenValidator } from '@carecareer/auth';
import { TenantAwareTransaction } from '@carecareer/database';

import {
  HttpAuthorizationAdapter,
  type PermissionAdapter,
} from './infrastructure/authorization-adapter.js';
import {
  HttpIdentityStateAdapter,
  type IdentityStateAdapter,
} from './infrastructure/identity-state-adapter.js';
import { LocalJwksTokenValidator } from './infrastructure/local-jwks-token-validator.js';
import { PostgresCredentialRepository } from './infrastructure/postgres-credential-repository.js';
import { PostgresStaffingRepository } from './infrastructure/postgres-staffing-repository.js';
import { RemoteJwksTokenValidator } from './infrastructure/remote-jwks-token-validator.js';
import { LocalClientCredentialsProvider } from './infrastructure/service-token-client.js';
import { StaffingAuthGuard } from './infrastructure/staffing-auth.guard.js';
import { StaffingExceptionFilter } from './infrastructure/staffing-exception.filter.js';
import { StaffingPermissionGuard } from './infrastructure/staffing-permission.guard.js';
import { CredentialController } from './interface/http/credential.controller.js';
import { FacilityController } from './interface/http/facility.controller.js';
import { HealthController } from './interface/http/health.controller.js';
import { WorkerController } from './interface/http/worker.controller.js';

/**
 * Staffing service root module.
 * Manages facilities, departments, workers, and credentials.
 *
 * Authentication: RS256 JWT validation via LocalJwksTokenValidator.
 * In production, public keys are fetched from identity-service JWKS endpoint.
 * In tests, keys are provided directly.
 */
@Module({
  controllers: [HealthController, FacilityController, WorkerController, CredentialController],
  providers: [
    {
      provide: 'TOKEN_VALIDATOR',
      useFactory: (): TokenValidator => {
        const jwksUri = process.env['JWKS_URI'];
        const issuer = process.env['JWT_ISSUER'] ?? 'carecareer-identity';
        const audience = process.env['JWT_AUDIENCE'] ?? 'carecareer-api';

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
      },
    },
    {
      provide: 'IDENTITY_STATE_ADAPTER',
      useFactory: (): IdentityStateAdapter | undefined => {
        const identityUrl = process.env['IDENTITY_SERVICE_URL'];
        const clientId = process.env['SERVICE_CLIENT_ID'] ?? 'staffing-service';
        const clientSecret = process.env['SERVICE_CLIENT_SECRET'];
        if (!identityUrl || !clientSecret) return undefined;
        const credentialProvider = new LocalClientCredentialsProvider({
          identityServiceUrl: identityUrl,
          clientId,
          clientSecret,
        });
        return new HttpIdentityStateAdapter(identityUrl, credentialProvider);
      },
    },
    {
      provide: APP_GUARD,
      useFactory: (
        tv: TokenValidator,
        reflector: Reflector,
        adapter: IdentityStateAdapter | undefined,
      ): StaffingAuthGuard => {
        return new StaffingAuthGuard(tv as never, reflector, adapter);
      },
      inject: ['TOKEN_VALIDATOR', Reflector, 'IDENTITY_STATE_ADAPTER'],
    },
    {
      provide: 'PERMISSION_ADAPTER',
      useFactory: (): PermissionAdapter | null => {
        const authUrl =
          process.env['AUTHORIZATION_SERVICE_URL'] ?? process.env['IDENTITY_SERVICE_URL'];
        const clientId = process.env['SERVICE_CLIENT_ID'] ?? 'staffing-service';
        const clientSecret = process.env['SERVICE_CLIENT_SECRET'];
        if (!authUrl || !clientSecret) return null;
        const credentialProvider = new LocalClientCredentialsProvider({
          identityServiceUrl: authUrl,
          clientId,
          clientSecret,
        });
        return new HttpAuthorizationAdapter(authUrl, credentialProvider);
      },
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector, adapter: unknown): StaffingPermissionGuard => {
        return new StaffingPermissionGuard(reflector, adapter as never);
      },
      inject: [Reflector, 'PERMISSION_ADAPTER'],
    },
    {
      provide: 'STAFFING_TENANT_DB',
      useFactory: async (): Promise<TenantAwareTransaction> => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          return new TenantAwareTransaction({
            $transaction: async () => {
              throw new Error('No database configured');
            },
          } as never);
        }
        const { default: pg } = await import('pg');
        const pool = new pg.Pool({ connectionString: dbUrl, max: 10 });
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
    {
      provide: 'CREDENTIAL_REPOSITORY',
      useClass: PostgresCredentialRepository,
    },
    {
      provide: APP_FILTER,
      useClass: StaffingExceptionFilter,
    },
  ],
})
export class StaffingModule {}
