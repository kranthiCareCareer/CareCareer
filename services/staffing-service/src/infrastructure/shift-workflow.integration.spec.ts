import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import type { TransactionClient } from '@carecareer/database';

import { createAssignment, checkInAssignment, completeAssignment } from '../domain/assignment.js';
import { createShiftRequest, confirmShiftRequest } from '../domain/shift-request.js';
import { createShift, publishShift } from '../domain/shift.js';

import { PostgresAssignmentRepository } from './postgres-assignment-repository.js';
import { PostgresAuditRepository } from './postgres-audit-repository.js';
import { PostgresShiftRepository } from './postgres-shift-repository.js';
import { PostgresShiftRequestRepository } from './postgres-shift-request-repository.js';

/**
 * Shift Workflow Integration Tests
 *
 * Proves the complete shift lifecycle (create → publish → request → confirm → assign)
 * against real PostgreSQL with RLS enforcement.
 */
describe('Shift Workflow Integration (GP-08/09/10)', () => {
  let container: StartedPostgreSqlContainer;
  let superClient: Client;
  let appPool: Pool;

  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';
  const facilityId = '00000000-0000-0000-0000-000000000f01';
  const workerId = '00000000-0000-0000-0000-000000000a01';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('staffing_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    superClient = new Client({ connectionString: container.getConnectionUri() });
    await superClient.connect();

    // Apply all migrations in order
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', 'prisma', 'migrations');
    const migrations = [
      '001_facilities_schema.sql',
      '002_workers_schema.sql',
      '008_credentials_schema.sql',
      '009_shifts_schema.sql',
      '011_expand_credential_lifecycle.sql',
      '012_credential_idempotency.sql',
      '013_shift_requests_schema.sql',
      '014_assignments_schema.sql',
      '016_notifications_schema.sql',
    ];

    for (const migration of migrations) {
      const sql = readFileSync(resolve(migrationsDir, migration), 'utf-8');
      await superClient.query(sql);
    }

    // Set app role password
    await superClient.query(`ALTER ROLE staffing_app PASSWORD 'staffing_app_test'`);

    // Create app-role connection pool
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    appPool = new Pool({
      connectionString: `postgresql://staffing_app:staffing_app_test@${host}:${port}/staffing_test`,
      max: 2,
    });
    appPool.on('error', () => {});

    // Seed prerequisite data
    await superClient.query(`
      INSERT INTO staffing.clients (id, tenant_id, name) VALUES
        ('00000000-0000-0000-0000-000000000c01', '${tenantAId}', 'Client A'),
        ('00000000-0000-0000-0000-000000000c02', '${tenantBId}', 'Client B');
      INSERT INTO staffing.facilities (id, tenant_id, client_id, name, timezone) VALUES
        ('${facilityId}', '${tenantAId}', '00000000-0000-0000-0000-000000000c01', 'Test Facility', 'US/Eastern');
      INSERT INTO staffing.workers (id, tenant_id, first_name, last_name, email, status, profession, version) VALUES
        ('${workerId}', '${tenantAId}', 'Test', 'Worker', 'test@example.com', 'ACTIVE', 'RN', 1);
    `);
  }, 120000);

  afterAll(async () => {
    await superClient.end();
    await appPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // Clean shift-related data between tests
    await superClient.query('DELETE FROM staffing.audit_log');
    await superClient.query('DELETE FROM staffing.assignments');
    await superClient.query('DELETE FROM staffing.shift_requests');
    await superClient.query('DELETE FROM staffing.shifts');
  });

  async function withTenantContext(
    tenantId: string,
    fn: (tx: TransactionClient) => Promise<void>,
  ): Promise<void> {
    const conn = await appPool.connect();
    try {
      await conn.query('BEGIN');
      await conn.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const tx: TransactionClient = {
        async $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<number> {
          let q = '';
          for (let i = 0; i < s.length; i++) {
            q += s[i];
            if (i < v.length) q += `$${i + 1}`;
          }
          return (await conn.query(q, v)).rowCount ?? 0;
        },
        async $queryRaw<T>(s: TemplateStringsArray, ...v: unknown[]): Promise<T[]> {
          let q = '';
          for (let i = 0; i < s.length; i++) {
            q += s[i];
            if (i < v.length) q += `$${i + 1}`;
          }
          return (await conn.query(q, v)).rows as T[];
        },
      };
      await fn(tx);
      await conn.query('COMMIT');
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    } finally {
      conn.release();
    }
  }

  describe('Shift CRUD and state transitions', () => {
    it('should create and retrieve a shift', async () => {
      const shiftRepo = new PostgresShiftRepository();
      const shift = createShift({
        tenantId: tenantAId,
        facilityId,
        role: 'RN',
        startTime: new Date('2026-08-01T07:00:00Z'),
        endTime: new Date('2026-08-01T19:00:00Z'),
        businessDate: '2026-08-01',
        requiredWorkerCount: 2,
        payRateCents: 4500,
        billRateCents: 7500,
        createdBy: 'test-admin',
      });

      await withTenantContext(tenantAId, async (tx) => {
        await shiftRepo.createShift(tx, shift);
        const fetched = await shiftRepo.getShiftById(tx, shift.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.status).toBe('DRAFT');
        expect(fetched!.role).toBe('RN');
        expect(fetched!.requiredWorkerCount).toBe(2);
      });
    });

    it('should publish a shift', async () => {
      const shiftRepo = new PostgresShiftRepository();
      const shift = createShift({
        tenantId: tenantAId,
        facilityId,
        role: 'RN',
        startTime: new Date('2026-08-01T07:00:00Z'),
        endTime: new Date('2026-08-01T19:00:00Z'),
        businessDate: '2026-08-01',
        requiredWorkerCount: 1,
        payRateCents: 4500,
        billRateCents: 7500,
        createdBy: 'test-admin',
      });
      const published = publishShift(shift);

      await withTenantContext(tenantAId, async (tx) => {
        await shiftRepo.createShift(tx, shift);
        await shiftRepo.updateShift(tx, published);
        const fetched = await shiftRepo.getShiftById(tx, shift.id);
        expect(fetched!.status).toBe('PUBLISHED');
        expect(fetched!.publishedAt).not.toBeNull();
      });
    });

    it('should enforce RLS — tenant B cannot see tenant A shifts', async () => {
      const shiftRepo = new PostgresShiftRepository();
      const shift = createShift({
        tenantId: tenantAId,
        facilityId,
        role: 'RN',
        startTime: new Date('2026-08-01T07:00:00Z'),
        endTime: new Date('2026-08-01T19:00:00Z'),
        businessDate: '2026-08-01',
        requiredWorkerCount: 1,
        payRateCents: 4500,
        billRateCents: 7500,
        createdBy: 'test-admin',
      });

      // Create as tenant A
      await withTenantContext(tenantAId, async (tx) => {
        await shiftRepo.createShift(tx, shift);
      });

      // Query as tenant B — should NOT see it
      await withTenantContext(tenantBId, async (tx) => {
        const result = await shiftRepo.getShiftById(tx, shift.id);
        expect(result).toBeNull();
      });
    });
  });

  describe('Shift request workflow', () => {
    it('should create a shift request and prevent duplicates', async () => {
      const shiftRepo = new PostgresShiftRepository();
      const requestRepo = new PostgresShiftRequestRepository();

      const shift = createShift({
        tenantId: tenantAId,
        facilityId,
        role: 'RN',
        startTime: new Date('2026-08-01T07:00:00Z'),
        endTime: new Date('2026-08-01T19:00:00Z'),
        businessDate: '2026-08-01',
        requiredWorkerCount: 1,
        payRateCents: 4500,
        billRateCents: 7500,
        createdBy: 'test-admin',
      });
      const published = publishShift(shift);

      await withTenantContext(tenantAId, async (tx) => {
        await shiftRepo.createShift(tx, shift);
        await shiftRepo.updateShift(tx, published);

        // Create request
        const request = createShiftRequest({
          tenantId: tenantAId,
          shiftId: shift.id,
          workerId,
        });
        await requestRepo.createShiftRequest(tx, request);

        // Verify duplicate detection
        const hasActive = await requestRepo.hasActiveRequest(tx, shift.id, workerId);
        expect(hasActive).toBe(true);
      });
    });

    it('should confirm request and create assignment atomically', async () => {
      const shiftRepo = new PostgresShiftRepository();
      const requestRepo = new PostgresShiftRequestRepository();
      const assignmentRepo = new PostgresAssignmentRepository();

      const shift = createShift({
        tenantId: tenantAId,
        facilityId,
        role: 'RN',
        startTime: new Date('2026-08-01T07:00:00Z'),
        endTime: new Date('2026-08-01T19:00:00Z'),
        businessDate: '2026-08-01',
        requiredWorkerCount: 1,
        payRateCents: 4500,
        billRateCents: 7500,
        createdBy: 'test-admin',
      });
      const published = publishShift(shift);

      await withTenantContext(tenantAId, async (tx) => {
        await shiftRepo.createShift(tx, shift);
        await shiftRepo.updateShift(tx, published);

        // Create and confirm request
        const request = createShiftRequest({
          tenantId: tenantAId,
          shiftId: shift.id,
          workerId,
        });
        await requestRepo.createShiftRequest(tx, request);

        const confirmed = confirmShiftRequest(request, 'admin-1');
        await requestRepo.updateShiftRequest(tx, confirmed);

        // Create assignment
        const assignment = createAssignment({
          tenantId: tenantAId,
          shiftId: shift.id,
          workerId,
          shiftRequestId: request.id,
          confirmedBy: 'admin-1',
        });
        await assignmentRepo.createAssignment(tx, assignment);

        // Increment fill count
        await shiftRepo.incrementFilledCount(tx, shift.id, published.version);

        // Verify state
        const updatedShift = await shiftRepo.getShiftById(tx, shift.id);
        expect(updatedShift!.filledWorkerCount).toBe(1);
        expect(updatedShift!.status).toBe('FILLED'); // 1/1 filled

        const fetchedAssignment = await assignmentRepo.getAssignmentById(tx, assignment.id);
        expect(fetchedAssignment!.status).toBe('CONFIRMED');
      });
    });
  });

  describe('Assignment lifecycle', () => {
    it('should check in and complete an assignment', async () => {
      const shiftRepo = new PostgresShiftRepository();
      const assignmentRepo = new PostgresAssignmentRepository();

      const shift = createShift({
        tenantId: tenantAId,
        facilityId,
        role: 'RN',
        startTime: new Date('2026-08-01T07:00:00Z'),
        endTime: new Date('2026-08-01T19:00:00Z'),
        businessDate: '2026-08-01',
        requiredWorkerCount: 1,
        payRateCents: 4500,
        billRateCents: 7500,
        createdBy: 'test-admin',
      });

      await withTenantContext(tenantAId, async (tx) => {
        await shiftRepo.createShift(tx, shift);

        const assignment = createAssignment({
          tenantId: tenantAId,
          shiftId: shift.id,
          workerId,
          confirmedBy: 'admin-1',
        });
        await assignmentRepo.createAssignment(tx, assignment);

        // Check in
        const checkedIn = checkInAssignment(assignment);
        await assignmentRepo.updateAssignment(tx, checkedIn);

        let fetched = await assignmentRepo.getAssignmentById(tx, assignment.id);
        expect(fetched!.status).toBe('CHECKED_IN');

        // Complete
        const completed = completeAssignment(checkedIn);
        await assignmentRepo.updateAssignment(tx, completed);

        fetched = await assignmentRepo.getAssignmentById(tx, assignment.id);
        expect(fetched!.status).toBe('COMPLETED');
      });
    });
  });

  describe('Audit trail', () => {
    it('should record audit entries for shift operations', async () => {
      const auditRepo = new PostgresAuditRepository();

      await withTenantContext(tenantAId, async (tx) => {
        await auditRepo.createEntry(tx, {
          id: crypto.randomUUID(),
          tenantId: tenantAId,
          actorId: 'admin-1',
          actorType: 'USER',
          action: 'shift.created',
          resourceType: 'shift',
          resourceId: 'shift-123',
          details: { role: 'RN' },
          createdAt: new Date(),
        });

        const entries = await auditRepo.listByResource(tx, 'shift', 'shift-123');
        expect(entries).toHaveLength(1);
        expect(entries[0]!.action).toBe('shift.created');
      });
    });
  });
}, 120000);
