import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * GP-05 Facilities Schema Integration Tests
 *
 * Proves migration applies, RLS is enforced, and cross-tenant isolation works
 * using the real staffing_app application role.
 */
describe('Facilities Schema and RLS (GP-05)', () => {
  let container: StartedPostgreSqlContainer;
  let superClient: Client;
  let appPool: Pool;

  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('staffing_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    superClient = new Client({ connectionString: container.getConnectionUri() });
    await superClient.connect();

    // Apply migration
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationPath = resolve(currentDir, '..', '..', 'prisma', 'migrations', '001_facilities_schema.sql');
    await superClient.query(readFileSync(migrationPath, 'utf-8'));

    // Set test password (not in migration — provisioned separately)
    await superClient.query(`ALTER ROLE staffing_app PASSWORD 'staffing_app_test'`);

    // Create app-role connection pool (subject to RLS)
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    appPool = new Pool({
      connectionString: `postgresql://staffing_app:staffing_app_test@${host}:${port}/staffing_test`,
      max: 1,
    });
    appPool.on('error', () => {});

    // Seed test data as superuser (bypasses RLS)
    await superClient.query(`
      INSERT INTO staffing.clients (id, tenant_id, name) VALUES
        ('00000000-0000-0000-0000-000000000c01', '${tenantAId}', 'Client A'),
        ('00000000-0000-0000-0000-000000000c02', '${tenantBId}', 'Client B');
      INSERT INTO staffing.facilities (id, tenant_id, client_id, name, timezone) VALUES
        ('00000000-0000-0000-0000-000000000f01', '${tenantAId}', '00000000-0000-0000-0000-000000000c01', 'Facility A', 'US/Pacific'),
        ('00000000-0000-0000-0000-000000000f02', '${tenantBId}', '00000000-0000-0000-0000-000000000c02', 'Facility B', 'US/Eastern');
      INSERT INTO staffing.departments (id, tenant_id, facility_id, name) VALUES
        ('00000000-0000-0000-0000-000000000d01', '${tenantAId}', '00000000-0000-0000-0000-000000000f01', 'ER'),
        ('00000000-0000-0000-0000-000000000d02', '${tenantBId}', '00000000-0000-0000-0000-000000000f02', 'ICU');
    `);
  }, 120000);

  afterAll(async () => {
    await superClient.end();
    await appPool.end();
    await container.stop();
  });

  describe('Migration and RLS enforcement', () => {
    it('should confirm RLS enabled and forced on facilities', async () => {
      const r = await superClient.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'staffing.facilities'::regclass`);
      expect(r.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });

    it('should confirm RLS enabled and forced on departments', async () => {
      const r = await superClient.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'staffing.departments'::regclass`);
      expect(r.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });

    it('should confirm staffing_app role has no superuser or bypassrls', async () => {
      const r = await superClient.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'staffing_app'`);
      expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it('should confirm staffing_app is not table owner of facilities', async () => {
      const r = await superClient.query(
        `SELECT tableowner FROM pg_tables WHERE schemaname='staffing' AND tablename='facilities'`);
      expect(r.rows[0]?.tableowner).not.toBe('staffing_app');
    });

    it('should confirm staffing_app is not table owner of departments', async () => {
      const r = await superClient.query(
        `SELECT tableowner FROM pg_tables WHERE schemaname='staffing' AND tablename='departments'`);
      expect(r.rows[0]?.tableowner).not.toBe('staffing_app');
    });
  });

  describe('Tenant isolation via RLS', () => {
    it('should allow Tenant A to read only its own facilities', async () => {
      const conn = await appPool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query('SET LOCAL search_path TO staffing, public');
        await conn.query(`SELECT set_config('app.tenant_id', '${tenantAId}', true)`);
        const r = await conn.query('SELECT name FROM staffing.facilities');
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0].name).toBe('Facility A');
        await conn.query('COMMIT');
      } finally {
        conn.release();
      }
    });

    it('should prevent Tenant A from reading Tenant B facilities', async () => {
      const conn = await appPool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query(`SELECT set_config('app.tenant_id', '${tenantAId}', true)`);
        const r = await conn.query('SELECT name FROM staffing.facilities');
        expect(r.rows.find((row: { name: string }) => row.name === 'Facility B')).toBeUndefined();
        await conn.query('COMMIT');
      } finally {
        conn.release();
      }
    });

    it('should allow Tenant B to read only its own departments', async () => {
      const conn = await appPool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query(`SELECT set_config('app.tenant_id', '${tenantBId}', true)`);
        const r = await conn.query('SELECT name FROM staffing.departments');
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0].name).toBe('ICU');
        await conn.query('COMMIT');
      } finally {
        conn.release();
      }
    });

    it('should isolate context across A → B → A pool reuse', async () => {
      const conn = await appPool.connect();
      try {
        // Tenant A
        await conn.query('BEGIN');
        await conn.query(`SELECT set_config('app.tenant_id', '${tenantAId}', true)`);
        let r = await conn.query('SELECT count(*) FROM staffing.facilities');
        expect(parseInt(r.rows[0].count, 10)).toBe(1);
        await conn.query('COMMIT');

        // Tenant B on same connection
        await conn.query('BEGIN');
        await conn.query(`SELECT set_config('app.tenant_id', '${tenantBId}', true)`);
        r = await conn.query('SELECT count(*) FROM staffing.facilities');
        expect(parseInt(r.rows[0].count, 10)).toBe(1);
        await conn.query('COMMIT');

        // Tenant A again
        await conn.query('BEGIN');
        await conn.query(`SELECT set_config('app.tenant_id', '${tenantAId}', true)`);
        r = await conn.query('SELECT count(*) FROM staffing.facilities');
        expect(parseInt(r.rows[0].count, 10)).toBe(1);
        await conn.query('COMMIT');
      } finally {
        conn.release();
      }
    });

    it('should enforce department uniqueness within a facility', async () => {
      const conn = await appPool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query(`SELECT set_config('app.tenant_id', '${tenantAId}', true)`);
        // Try to insert a duplicate department name in the same facility
        await expect(
          conn.query(`INSERT INTO staffing.departments (tenant_id, facility_id, name)
            VALUES ('${tenantAId}', '00000000-0000-0000-0000-000000000f01', 'ER')`),
        ).rejects.toThrow(/unique|duplicate/i);
        await conn.query('ROLLBACK');
      } finally {
        conn.release();
      }
    });
  });
});
