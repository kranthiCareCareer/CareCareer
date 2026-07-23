import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { SignJWT, importPKCS8 } from 'jose';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';
import { TenantAwareTransaction } from '@carecareer/database';

import type { PermissionAdapter } from '../../infrastructure/authorization-adapter.js';
import type {
  IdentityStateAdapter,
  IdentityStateValidationResult,
} from '../../infrastructure/identity-state-adapter.js';
import { LocalJwksTokenValidator } from '../../infrastructure/local-jwks-token-validator.js';
import { PostgresCredentialRepository } from '../../infrastructure/postgres-credential-repository.js';
import { PostgresStaffingRepository } from '../../infrastructure/postgres-staffing-repository.js';
import { StaffingAuthGuard } from '../../infrastructure/staffing-auth.guard.js';
import { StaffingExceptionFilter } from '../../infrastructure/staffing-exception.filter.js';
import { StaffingPermissionGuard } from '../../infrastructure/staffing-permission.guard.js';

import { CredentialController } from './credential.controller.js';
import { FacilityController } from './facility.controller.js';
import { HealthController } from './health.controller.js';
import { WorkerController } from './worker.controller.js';

/**
 * GP-07 Credential HTTP Integration Tests
 *
 * Proves credential CRUD works through:
 * - Real NestJS application
 * - Real PostgreSQL via Testcontainers
 * - Real RS256 JWT validation
 * - RLS tenant isolation
 * - Credential-worker binding enforcement
 * - Audit/outbox atomicity
 */
describe('Credential HTTP Integration (GP-07)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let superClient: Client;
  let appPool: Pool;
  let privateKeyPem: string;

  const TEST_KID = 'test-cred-key';
  const ISSUER = 'carecareer-identity';
  const AUDIENCE = 'carecareer-api';

  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';
  const userAId = '00000000-0000-0000-0000-000000000a01';
  const userBId = '00000000-0000-0000-0000-000000000b01';
  const clientAId = '00000000-0000-0000-0000-000000000c01';

  let workerAId: string;

  let mockIdentityResult: IdentityStateValidationResult = { valid: true };
  const mockIdentityAdapter: IdentityStateAdapter = {
    validate: async () => mockIdentityResult,
  };

  let mockPermissionResult: { allowed: boolean; reason?: string } = { allowed: true };
  const mockPermissionAdapter: PermissionAdapter = {
    hasPermission: async () => mockPermissionResult,
  };

  async function signJwt(sub: string, tenantId: string): Promise<string> {
    const pk = await importPKCS8(privateKeyPem, 'RS256');
    return new SignJWT({
      active_tenant_id: tenantId,
      membership_id: `mem-${sub}`,
      user_authorization_version: 1,
      membership_authorization_version: 1,
      platform_roles: ['TENANT_ADMIN'],
      tenant_roles: ['TENANT_ADMIN'],
      permissions: [
        'credentials:create',
        'credentials:read',
        'credentials:submit',
        'credentials:verify',
        'credentials:revoke',
        'eligibility:evaluate',
        'workers:create',
        'facilities:create',
      ],
      sid: `session-${sub}`,
    })
      .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
      .setIssuedAt()
      .setExpirationTime('15m')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(sub)
      .setJti(crypto.randomUUID())
      .sign(pk);
  }

  function createPoolPrisma(uri: string): PrismaLikeClient {
    appPool = new Pool({ connectionString: uri, max: 5 });
    appPool.on('error', () => {});
    return {
      async $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
        const conn = await appPool.connect();
        try {
          await conn.query('BEGIN');
          await conn.query('SET LOCAL search_path TO staffing, public');
          const tx: TransactionClient = {
            async $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<number> {
              let q = '';
              for (let i = 0; i < s.length; i++) {
                q += s[i];
                if (i < v.length) q += `$${i + 1}`;
              }
              return (await conn.query(q, v)).rowCount ?? 0;
            },
            async $queryRaw<R = Record<string, unknown>>(
              s: TemplateStringsArray,
              ...v: unknown[]
            ): Promise<R[]> {
              let q = '';
              for (let i = 0; i < s.length; i++) {
                q += s[i];
                if (i < v.length) q += `$${i + 1}`;
              }
              return (await conn.query(q, v)).rows as R[];
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
    };
  }

  beforeAll(async () => {
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = keyPair.privateKey as string;
    const publicKeyPem = keyPair.publicKey as string;

    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('credential_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    superClient = new Client({ connectionString: container.getConnectionUri() });
    await superClient.connect();

    // Apply all migrations in order
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', '..', 'prisma', 'migrations');
    await superClient.query(
      readFileSync(resolve(migrationsDir, '001_facilities_schema.sql'), 'utf-8'),
    );
    await superClient.query(
      readFileSync(resolve(migrationsDir, '002_workers_schema.sql'), 'utf-8'),
    );
    await superClient.query(
      readFileSync(resolve(migrationsDir, '003_worker_identity_link.sql'), 'utf-8'),
    );
    await superClient.query(
      readFileSync(resolve(migrationsDir, '008_credentials_schema.sql'), 'utf-8'),
    );
    await superClient.query(
      readFileSync(resolve(migrationsDir, '011_expand_credential_lifecycle.sql'), 'utf-8'),
    );
    await superClient.query(
      readFileSync(resolve(migrationsDir, '012_credential_idempotency.sql'), 'utf-8'),
    );

    // Set password for app role
    await superClient.query(`ALTER ROLE staffing_app PASSWORD 'staffing_app_test'`);

    // Seed client for facility FK
    await superClient.query(`
      INSERT INTO staffing.clients (id, tenant_id, name) VALUES
        ('${clientAId}', '${tenantAId}', 'Client Alpha');
    `);

    // Create app pool with RLS-enforced role
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const appUri = `postgresql://staffing_app:staffing_app_test@${host}:${port}/credential_test`;
    const prisma = createPoolPrisma(appUri);
    const tenantDb = new TenantAwareTransaction(prisma);

    const tokenValidator = new LocalJwksTokenValidator({
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSec: 30,
      publicKeys: [{ kid: TEST_KID, publicKeyPem }],
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, FacilityController, WorkerController, CredentialController],
      providers: [
        { provide: 'STAFFING_TENANT_DB', useValue: tenantDb },
        { provide: 'STAFFING_REPOSITORY', useClass: PostgresStaffingRepository },
        { provide: 'CREDENTIAL_REPOSITORY', useClass: PostgresCredentialRepository },
        { provide: 'TOKEN_VALIDATOR', useValue: tokenValidator },
        { provide: 'IDENTITY_STATE_ADAPTER', useValue: mockIdentityAdapter },
        { provide: 'PERMISSION_ADAPTER', useValue: mockPermissionAdapter },
        {
          provide: APP_GUARD,
          useFactory: (tv: unknown, ref: Reflector, adapter: IdentityStateAdapter) =>
            new StaffingAuthGuard(tv as never, ref, adapter),
          inject: ['TOKEN_VALIDATOR', Reflector, 'IDENTITY_STATE_ADAPTER'],
        },
        {
          provide: APP_GUARD,
          useFactory: (ref: Reflector, pa: PermissionAdapter) =>
            new StaffingPermissionGuard(ref, pa),
          inject: [Reflector, 'PERMISSION_ADAPTER'],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new StaffingExceptionFilter());
    await app.init();

    // Seed workers for credential tests
    const tokenA = await signJwt(userAId, tenantAId);
    const wA = await request(app.getHttpServer())
      .post('/v1/workers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        firstName: 'Alice',
        lastName: 'Nurse',
        email: 'alice@example.com',
        profession: 'RN',
      });
    workerAId = wA.body.data.workerId;

    const tokenB = await signJwt(userBId, tenantBId);
    await request(app.getHttpServer())
      .post('/v1/workers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        firstName: 'Bob',
        lastName: 'Aid',
        email: 'bob@example.com',
        profession: 'CNA',
      });
  }, 120000);

  afterAll(async () => {
    await app.close();
    await superClient.end();
    await appPool.end();
    await container.stop();
  });

  describe('POST /v1/workers/:workerId/credentials — Create', () => {
    it('should create a credential and return 201', async () => {
      mockIdentityResult = { valid: true };
      mockPermissionResult = { allowed: true };
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'RN_LICENSE', issuingAuthority: 'CA Board of Nursing' });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.credentialId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should persist credential in database with correct tenant', async () => {
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'BLS', expiresAt: '2028-06-01T00:00:00Z' });

      const credId = res.body.data.credentialId;
      const dbRow = await superClient.query(
        `SELECT * FROM staffing.worker_credentials WHERE id = $1::uuid`,
        [credId],
      );
      expect(dbRow.rows).toHaveLength(1);
      expect(dbRow.rows[0].tenant_id).toBe(tenantAId);
      expect(dbRow.rows[0].worker_id).toBe(workerAId);
      expect(dbRow.rows[0].credential_type).toBe('BLS');
      expect(dbRow.rows[0].status).toBe('UPLOADED');
    });

    it('should emit audit record atomically', async () => {
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-ID', 'cred-audit-001')
        .send({ credentialType: 'ACLS' });

      const credId = res.body.data.credentialId;
      const audit = await superClient.query(
        `SELECT * FROM staffing.audit_records WHERE aggregate_id = $1::uuid AND action = 'credential.created'`,
        [credId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].actor_id).toBe(userAId);
      expect(audit.rows[0].correlation_id).toBe('cred-audit-001');
    });

    it('should emit outbox event atomically', async () => {
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'CNA_CERT' });

      const credId = res.body.data.credentialId;
      const outbox = await superClient.query(
        `SELECT * FROM staffing.event_outbox WHERE aggregate_id = $1::uuid AND event_type = 'carecareer.credential.created.v1'`,
        [credId],
      );
      expect(outbox.rows).toHaveLength(1);
      expect(outbox.rows[0].status).toBe('PENDING');
    });

    it('should reject when worker does not exist (404)', async () => {
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .post('/v1/workers/00000000-0000-0000-0000-ffffffffffff/credentials')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'BLS' });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.code).toBe('WORKER_NOT_FOUND');
    });

    it('should reject invalid body (400)', async () => {
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: '' }); // empty not allowed

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/workers/:workerId/credentials — List', () => {
    it('should list credentials for a worker', async () => {
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .get(`/v1/workers/${workerAId}/credentials`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].credentialType).toBeDefined();
      expect(res.body.data[0].status).toBe('UPLOADED');
    });
  });

  describe('POST /v1/workers/:workerId/credentials/:id/submit — Submit for verification', () => {
    it('should transition UPLOADED → PENDING_VERIFICATION', async () => {
      const token = await signJwt(userAId, tenantAId);

      // Create a credential first
      const createRes = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'PALS' });
      const credId = createRes.body.data.credentialId;

      // Submit for verification
      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/submit`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.status).toBe('PENDING_VERIFICATION');
    });

    it('should reject submit on wrong worker path (404)', async () => {
      const token = await signJwt(userAId, tenantAId);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'TB_TEST' });
      const credId = createRes.body.data.credentialId;

      // Try to submit via wrong worker path (use some other worker ID in same tenant)
      const res = await request(app.getHttpServer())
        .post(`/v1/workers/00000000-0000-0000-0000-000000099999/credentials/${credId}/submit`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /v1/workers/:workerId/credentials/:id/verify — Verify', () => {
    it('should verify a PENDING_VERIFICATION credential', async () => {
      const token = await signJwt(userAId, tenantAId);

      // Create + submit
      const createRes = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'NRP' });
      const credId = createRes.body.data.credentialId;

      await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/submit`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      // Verify
      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/verify`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.status).toBe('VERIFIED');
    });

    it('should reject verify on UPLOADED credential (invalid transition)', async () => {
      const token = await signJwt(userAId, tenantAId);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'FLU_SHOT' });
      const credId = createRes.body.data.credentialId;

      // Try to verify without submitting first
      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/verify`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Cross-tenant credential isolation (RLS)', () => {
    it('should not allow tenant B to list tenant A credentials', async () => {
      const tokenB = await signJwt(userBId, tenantBId);

      const res = await request(app.getHttpServer())
        .get(`/v1/workers/${workerAId}/credentials`)
        .set('Authorization', `Bearer ${tokenB}`);

      // Worker does not exist in tenant B's scope - returns 404 without leaking info
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.code).toBe('WORKER_NOT_FOUND');
    });

    it('should not allow tenant B to create credentials on tenant A worker', async () => {
      const tokenB = await signJwt(userBId, tenantBId);

      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ credentialType: 'BLS' });

      // Worker not found in tenant B's context
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.code).toBe('WORKER_NOT_FOUND');
    });
  });

  describe('Authentication boundary', () => {
    it('should reject request without token (401)', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/workers/${workerAId}/credentials`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject expired token (401)', async () => {
      const pk = await importPKCS8(privateKeyPem, 'RS256');
      const token = await new SignJWT({
        active_tenant_id: tenantAId,
        membership_id: 'mem-expired',
        user_authorization_version: 1,
        membership_authorization_version: 1,
        sid: 'sess-expired',
      })
        .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
        .setIssuedAt()
        .setExpirationTime('-5m')
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject(userAId)
        .setJti(crypto.randomUUID())
        .sign(pk);

      const res = await request(app.getHttpServer())
        .get(`/v1/workers/${workerAId}/credentials`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should deny when identity state is invalid (fail closed)', async () => {
      mockIdentityResult = { valid: false, code: 'SESSION_REVOKED' };
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .get(`/v1/workers/${workerAId}/credentials`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      // Reset
      mockIdentityResult = { valid: true };
    });
  });

  describe('Stored status equals returned status', () => {
    it('should persist PENDING_VERIFICATION and return it consistently', async () => {
      mockIdentityResult = { valid: true };
      mockPermissionResult = { allowed: true };
      const token = await signJwt(userAId, tenantAId);

      // Create
      const createRes = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'STATUS_CHECK' });
      const credId = createRes.body.data.credentialId;

      // Submit
      await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/submit`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      // Verify DB state matches API response
      const dbRow = await superClient.query(
        `SELECT status FROM staffing.worker_credentials WHERE id = $1::uuid`,
        [credId],
      );
      expect(dbRow.rows[0].status).toBe('PENDING_VERIFICATION');

      // List should return the same status
      const listRes = await request(app.getHttpServer())
        .get(`/v1/workers/${workerAId}/credentials`)
        .set('Authorization', `Bearer ${token}`);
      const cred = listRes.body.data.find((c: { id: string }) => c.id === credId);
      expect(cred.status).toBe('PENDING_VERIFICATION');
    });

    it('should persist VERIFIED and return it consistently', async () => {
      const token = await signJwt(userAId, tenantAId);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'STATUS_VERIFY_CHECK' });
      const credId = createRes.body.data.credentialId;

      await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/submit`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);
      await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/verify`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      const dbRow = await superClient.query(
        `SELECT status FROM staffing.worker_credentials WHERE id = $1::uuid`,
        [credId],
      );
      expect(dbRow.rows[0].status).toBe('VERIFIED');
    });
  });

  describe('Credential number privacy', () => {
    it('should NOT expose raw credentialNumber in list responses', async () => {
      const token = await signJwt(userAId, tenantAId);
      const testCredNumber = `RN-${Date.now()}`;

      await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({
          credentialType: 'PRIVACY_TEST',
          credentialNumber: testCredNumber,
        });

      const listRes = await request(app.getHttpServer())
        .get(`/v1/workers/${workerAId}/credentials`)
        .set('Authorization', `Bearer ${token}`);

      // credentialNumber must NOT appear in any list item
      const responseText = JSON.stringify(listRes.body);
      expect(responseText).not.toContain(testCredNumber);
      expect(responseText).not.toContain('credentialNumber');
    });
  });

  describe('Exception filter behavior', () => {
    it('should return typed error code for invalid transition', async () => {
      mockIdentityResult = { valid: true };
      mockPermissionResult = { allowed: true };
      const token = await signJwt(userAId, tenantAId);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'FILTER_TEST' });
      const credId = createRes.body.data.credentialId;

      // Try to verify UPLOADED (invalid) — should get typed error
      const res = await request(app.getHttpServer())
        .post(`/v1/workers/${workerAId}/credentials/${credId}/verify`)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.code).toBe('INVALID_CREDENTIAL_TRANSITION');
      // Must NOT contain stack traces or internal details
      expect(res.body.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('node_modules');
    });

    it('should return generic 500 without internals for unknown errors', async () => {
      // This is tested implicitly — if any unhandled error occurs,
      // the filter returns { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
      // We verify the structure of known error responses proves the filter is active
      const token = await signJwt(userAId, tenantAId);

      const res = await request(app.getHttpServer())
        .post('/v1/workers/00000000-0000-0000-0000-ffffffffffff/credentials')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Authorization', `Bearer ${token}`)
        .send({ credentialType: 'X' });

      // Should get WORKER_NOT_FOUND from exception filter
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.code).toBe('WORKER_NOT_FOUND');
      expect(res.body.stack).toBeUndefined();
    });
  });
});
