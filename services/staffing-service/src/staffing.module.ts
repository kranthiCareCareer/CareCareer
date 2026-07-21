import { Module } from '@nestjs/common';

import { TenantAwareTransaction } from '@carecareer/database';

import { PostgresStaffingRepository } from './infrastructure/postgres-staffing-repository.js';
import { FacilityController } from './interface/http/facility.controller.js';
import { HealthController } from './interface/http/health.controller.js';

/**
 * Staffing service root module.
 * Manages facilities, departments, workers, shifts and assignments.
 */
@Module({
  controllers: [HealthController, FacilityController],
  providers: [
    {
      provide: 'STAFFING_TENANT_DB',
      useFactory: (): TenantAwareTransaction => {
        const dbUrl = process.env['DATABASE_URL'];
        if (!dbUrl) {
          return new TenantAwareTransaction({
            $transaction: async () => { throw new Error('No database configured'); },
          } as never);
        }
        // Import dynamically to avoid circular dependency
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
                  for (let i = 0; i < s.length; i++) { q += s[i]; if (i < v.length) q += `$${i + 1}`; }
                  return (await conn.query(q, v)).rowCount ?? 0;
                },
                async $queryRaw(s: TemplateStringsArray, ...v: unknown[]) {
                  let q = '';
                  for (let i = 0; i < s.length; i++) { q += s[i]; if (i < v.length) q += `$${i + 1}`; }
                  return (await conn.query(q, v)).rows;
                },
              };
              const result = await fn(tx);
              await conn.query('COMMIT');
              return result;
            } catch (e) { await conn.query('ROLLBACK'); throw e; }
            finally { conn.release(); }
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
