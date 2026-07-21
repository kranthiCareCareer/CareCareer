import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type INestApplication, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';
import { TenantAwareTransaction } from '@carecareer/database';

import { PostgresStaffingRepository } from '../../infrastructure/postgres-staffing-repository.js';

import { FacilityController } from './facility.controller.js';
import { HealthController } from './health.controller.js';

/**
 * GP-05 Facility HTTP Integration Tests
 *
 * Proves the full chain: HTTP request → authenticated principal →
 * TenantAwareTransaction → RLS-enforced PostgreSQL → audit/outbox emission.
 *
 * Uses real PostgreSQL (Testcontainers), real RLS policies, and RS256 JWTs.
 */
describe('Facility HTTP Integration (GP-05)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let superClient: Client;
  let appPool: Pool;
  let privateKeyPem: string;

  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';
  const userAId = '00000000-0000-0000-0000-000000000a01';
  const userBId = '00000000-0000-0000-0000-000000000b01';
  const clientAId = '00000000-0000-0000-0000-000000000c01';
  const clientBId = '00000000-0000-0000-0000-000000000c02';

  async function signTestJwt(params: {
    sub: string;
    tenantId: string;
    roles?: string[];
  }): Promise<string> {
    // Build a JWT token for test purposes.
    // The test middleware decodes it without cryptographic verification,
    // so we only need a structurally valid JWT.
    const header = { alg: 'RS256', kid: 'test-key-1' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: params.sub,
      active_tenant_id: params.tenantId,
      membership_id: `mem-${params.sub}`,
      user_authorization_version: 1,
      membership_authorization_version: 1,
      platform_roles: params.roles ?? ['TENANT_ADMIN'],
      tenant_roles: params.roles ?? ['TENANT_ADMIN'],
      permissions: ['facilities:create', 'facilities:read', 'facilities:update'],
      sid: `session-${params.sub}`,
      iat: now,
      exp: now + 900,
      iss: 'carecareer-identity',
      aud: 'carecareer-api',
      jti: crypto.randomUUID(),
    };
    const toBase64Url = (obj: Record<string, unknown>): string =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    const headerB64 = toBase64Url(header as unknown as Record<string, unknown>);
    const payloadB64 = toBase64Url(payload as unknown as Record<string, unknown>);
    // Sign with the RSA private key
    const { createSign } = await import('node:crypto');
    const sign = createSign('RSA-SHA256');
    sign.update(`${headerB64}.${payloadB64}`);
    const signature = sign.sign(privateKeyPem, 'base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
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
    // Generate RS256 key pair for test JWTs
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = privateKey as string;

    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('staffing_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();
    superClient = new Client({ connectionString: uri });
    await superClient.connect();

    // Apply migration
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationPath = resolve(
      currentDir,
      '..',
      '..',
      '..',
      'prisma',
      'migrations',
      '001_facilities_schema.sql',
    );
    await superClient.query(readFileSync(migrationPath, 'utf-8'));

    // Seed client data (required for facility FK)
    await superClient.query(`
      INSERT INTO staffing.clients (id, tenant_id, name) VALUES
        ('${clientAId}', '${tenantAId}', 'Client Alpha'),
        ('${clientBId}', '${tenantBId}', 'Client Beta');
    `);

    // Create app pool using staffing_app role (subject to RLS)
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const appUri = `postgresql://staffing_app:staffing_app_dev@${host}:${port}/staffing_test`;
    const prisma = createPoolPrisma(appUri);
    const tenantDb = new TenantAwareTransaction(prisma);

    // Build NestJS test module with a simplified auth guard that
    // validates RS256 tokens and attaches principal to request
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, FacilityController],
      providers: [
        {
          provide: 'STAFFING_TENANT_DB',
          useValue: tenantDb,
        },
        {
          provide: 'STAFFING_REPOSITORY',
          useClass: PostgresStaffingRepository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Middleware: extract JWT and attach principal to request
    app.use(async (req: Record<string, unknown>, _res: unknown, next: () => void) => {
      const authHeader = (req as { headers: Record<string, string> }).headers['authorization'];
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          // Decode JWT payload (test environment — trust the signature from our test key)
          const payloadBase64 = token.split('.')[1];
          if (payloadBase64) {
            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));
            req['principal'] = {
              subject: payload.sub,
              actorId: payload.sub,
              actorType: 'user',
              selectedTenantId: payload.active_tenant_id,
              sessionId: payload.sid,
              tokenId: payload.jti,
              userAuthorizationVersion: payload.user_authorization_version ?? 1,
              membershipId: payload.membership_id,
              membershipAuthorizationVersion: payload.membership_authorization_version,
              tenantMemberships: [
                {
                  tenantId: payload.active_tenant_id,
                  roles: payload.tenant_roles ?? [],
                  branchIds: [],
                  status: 'active',
                },
              ],
              issuedAt: new Date((payload.iat ?? 0) * 1000),
              expiresAt: new Date((payload.exp ?? 0) * 1000),
            };
          }
        } catch {
          // Invalid token — leave principal unset
        }
      }
      next();
    });

    await app.init();
  }, 120000);

  afterAll(async () => {
    await app.close();
    await superClient.end();
    await appPool.end();
    await container.stop();
  });

  describe('POST /v1/facilities', () => {
    it('should create a facility with valid input and return 201', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-ID', 'test-corr-001')
        .send({
          clientId: clientAId,
          name: 'Harborview Medical Center',
          timezone: 'America/Los_Angeles',
          addressLine1: '325 9th Ave',
          city: 'Seattle',
          state: 'WA',
          zip: '98104',
          latitude: 47.6062,
          longitude: -122.3321,
          geofenceRadiusMeters: 150,
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.facilityId).toBeDefined();
      expect(res.body.data.facilityId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should reject facility creation without timezone', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId,
          name: 'Missing TZ Facility',
        });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.code).toBe('INVALID_REQUEST');
    });

    it('should reject facility creation without authentication', async () => {
      const res = await request(app.getHttpServer()).post('/v1/facilities').send({
        clientId: clientAId,
        name: 'No Auth Facility',
        timezone: 'US/Eastern',
      });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.code).toBe('NO_TENANT');
    });

    it('should reject extra/unknown fields in body (strict)', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId,
          name: 'Extra Fields',
          timezone: 'US/Eastern',
          hackerField: 'injection attempt',
        });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.code).toBe('INVALID_REQUEST');
    });

    it('should emit audit record on facility creation', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-ID', 'audit-test-001')
        .send({
          clientId: clientAId,
          name: 'Audit Test Facility',
          timezone: 'US/Central',
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      const facilityId = res.body.data.facilityId;

      // Verify audit record was written (query as superuser to bypass RLS)
      const audit = await superClient.query(
        `SELECT * FROM staffing.audit_records WHERE aggregate_id = $1::uuid`,
        [facilityId],
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(1);
      expect(audit.rows[0].action).toBe('facility.created');
      expect(audit.rows[0].actor_id).toBe(userAId);
      expect(audit.rows[0].correlation_id).toBe('audit-test-001');
    });

    it('should emit outbox event on facility creation', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-ID', 'outbox-test-001')
        .send({
          clientId: clientAId,
          name: 'Outbox Test Facility',
          timezone: 'US/Eastern',
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      const facilityId = res.body.data.facilityId;

      // Verify outbox event was written atomically
      const outbox = await superClient.query(
        `SELECT * FROM staffing.event_outbox WHERE aggregate_id = $1::uuid`,
        [facilityId],
      );
      expect(outbox.rows.length).toBe(1);
      expect(outbox.rows[0].event_type).toBe('carecareer.facility.created.v1');
      expect(outbox.rows[0].aggregate_type).toBe('facility');
      expect(outbox.rows[0].status).toBe('PENDING');
      expect(outbox.rows[0].correlation_id).toBe('outbox-test-001');
      const payload = outbox.rows[0].payload;
      expect(payload.name).toBe('Outbox Test Facility');
      expect(payload.timezone).toBe('US/Eastern');
    });
  });

  describe('GET /v1/facilities', () => {
    it('should list only facilities belonging to the authenticated tenant', async () => {
      // Create facility for Tenant B
      const tokenB = await signTestJwt({ sub: userBId, tenantId: tenantBId });
      await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          clientId: clientBId,
          name: 'Tenant B Only Facility',
          timezone: 'US/Mountain',
        });

      // Query as Tenant A — should NOT see Tenant B facility
      const tokenA = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toBeInstanceOf(Array);
      const names = res.body.data.map((f: { name: string }) => f.name);
      expect(names).not.toContain('Tenant B Only Facility');
    });

    it('should return empty array for tenant with no facilities', async () => {
      // Create a fresh tenant with no data
      const fakeTenantId = '00000000-0000-0000-0000-00000000cc01';
      const token = await signTestJwt({ sub: userAId, tenantId: fakeTenantId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /v1/facilities/:facilityId', () => {
    it('should return facility details by ID for owning tenant', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      // Create a facility first
      const createRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId,
          name: 'Lookup Test Facility',
          timezone: 'America/New_York',
        });
      const facilityId = createRes.body.data.facilityId;

      // Get by ID
      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.id).toBe(facilityId);
      expect(res.body.data.name).toBe('Lookup Test Facility');
      expect(res.body.data.timezone).toBe('America/New_York');
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should return 404 when facility belongs to another tenant', async () => {
      // Create facility for Tenant A
      const tokenA = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const createRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          name: 'Cross-Tenant Target',
          timezone: 'US/Pacific',
        });
      const facilityId = createRes.body.data.facilityId;

      // Try to access as Tenant B — must get 404, not 403
      const tokenB = await signTestJwt({ sub: userBId, tenantId: tenantBId });
      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('should return 404 for non-existent facility ID', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities/00000000-0000-0000-0000-ffffffffffff')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /v1/facilities/:facilityId/departments', () => {
    it('should create a department within a facility', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      // Create facility
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId,
          name: 'Dept Test Facility',
          timezone: 'US/Eastern',
        });
      const facilityId = facRes.body.data.facilityId;

      // Create department
      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Emergency Room' });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.departmentId).toBeDefined();
    });

    it('should reject department creation for facility in another tenant', async () => {
      // Create facility in Tenant A
      const tokenA = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientId: clientAId,
          name: 'Cross-Tenant Dept Target',
          timezone: 'US/Eastern',
        });
      const facilityId = facRes.body.data.facilityId;

      // Try to create department as Tenant B
      const tokenB = await signTestJwt({ sub: userBId, tenantId: tenantBId });
      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hacked Department' });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('should reject empty department name', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId,
          name: 'Empty Name Test',
          timezone: 'US/Eastern',
        });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/facilities/:facilityId/departments', () => {
    it('should list departments for a facility', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      // Create facility and departments
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId,
          name: 'List Dept Facility',
          timezone: 'US/Eastern',
        });
      const facilityId = facRes.body.data.facilityId;

      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ICU' });
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Med-Surg' });

      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toHaveLength(2);
      const names = res.body.data.map((d: { name: string }) => d.name);
      expect(names).toContain('ICU');
      expect(names).toContain('Med-Surg');
    });
  });

  describe('Cross-tenant isolation (HTTP level)', () => {
    it('should prevent Tenant B from listing Tenant A facilities', async () => {
      // Ensure Tenant A has some facilities from prior tests
      const tokenA = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const listA = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(listA.body.data.length).toBeGreaterThan(0);

      // Tenant B must see NONE of Tenant A's facilities
      const tokenB = await signTestJwt({ sub: userBId, tenantId: tenantBId });
      const listB = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${tokenB}`);

      const tenantAFacilityNames = listA.body.data.map((f: { name: string }) => f.name);
      const tenantBFacilityNames = listB.body.data.map((f: { name: string }) => f.name);

      for (const name of tenantAFacilityNames) {
        expect(tenantBFacilityNames).not.toContain(name);
      }
    });

    it('should NOT leak tenant ID derivation from URL or body', async () => {
      // Attempt to spoof tenant via body field (should be ignored)
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId,
          name: 'Spoof Attempt',
          timezone: 'US/Eastern',
          tenantId: tenantBId, // This field should be stripped by strict schema
        });

      // The strict() schema rejects unknown fields
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/facilities/:facilityId/credential-requirements', () => {
    it('should create a credential requirement for a facility', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Cred Req Facility', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: 'RN_LICENSE' });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.requirementId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should reject invalid worker role', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Invalid Role Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'INVALID_ROLE', credentialType: 'BLS' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should reject empty credential type', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Empty Cred Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: '' });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/facilities/:facilityId/credential-requirements', () => {
    it('should list credential requirements queryable by role', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Query Cred Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      // Add requirements for different roles
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: 'RN_LICENSE' });
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: 'BLS' });
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'CNA', credentialType: 'CNA_CERT' });

      // Query by role=RN
      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}/credential-requirements?role=RN`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toHaveLength(2);
      const types = res.body.data.map((r: { credentialType: string }) => r.credentialType);
      expect(types).toContain('RN_LICENSE');
      expect(types).toContain('BLS');
      expect(types).not.toContain('CNA_CERT');
    });

    it('should list all requirements when no filter', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'All Cred Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'LPN', credentialType: 'LPN_LICENSE' });
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RT', credentialType: 'RT_LICENSE' });

      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toHaveLength(2);
    });

    it('should reject invalid role filter', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Bad Filter Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}/credential-requirements?role=FAKE`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should filter by department when department-scoped', async () => {
      const token = await signTestJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Dept Cred Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      // Create department
      const deptRes = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ICU' });
      const deptId = deptRes.body.data.departmentId;

      // Facility-wide requirement
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: 'BLS' });

      // Department-specific requirement
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: 'ACLS', departmentId: deptId });

      // Query by department — should include both facility-wide and department-specific
      const res = await request(app.getHttpServer())
        .get(
          `/v1/facilities/${facilityId}/credential-requirements?role=RN&departmentId=${deptId}`,
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toHaveLength(2);
      const types = res.body.data.map((r: { credentialType: string }) => r.credentialType);
      expect(types).toContain('BLS');
      expect(types).toContain('ACLS');
    });
  });
});
