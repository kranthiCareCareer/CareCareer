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

import type { IdentityStateAdapter, IdentityStateValidationResult } from '../../infrastructure/identity-state-adapter.js';
import { LocalJwksTokenValidator } from '../../infrastructure/local-jwks-token-validator.js';
import { PostgresStaffingRepository } from '../../infrastructure/postgres-staffing-repository.js';
import { StaffingAuthGuard } from '../../infrastructure/staffing-auth.guard.js';
import { StaffingPermissionGuard, type PermissionAdapter } from '../../infrastructure/staffing-permission.guard.js';

import { FacilityController } from './facility.controller.js';
import { HealthController } from './health.controller.js';

/**
 * GP-05 Facility HTTP Integration Tests
 *
 * Uses REAL RS256 signature validation via LocalJwksTokenValidator + StaffingAuthGuard.
 * NO decode-only or trust-all-claims path exists.
 *
 * Validation chain proven:
 *   RS256 private key → signed JWT → StaffingAuthGuard → LocalJwksTokenValidator
 *   → jose jwtVerify (signature + issuer + audience + expiration + claims)
 *   → ValidatedTokenContext attached to request
 *   → TenantAwareTransaction (tenant from principal.selectedTenantId)
 *   → PostgreSQL RLS (app.tenant_id)
 */
describe('Facility HTTP Integration (GP-05)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let superClient: Client;
  let appPool: Pool;
  let privateKeyPem: string;
  let publicKeyPem: string;

  const TEST_KID = 'test-signing-key-001';
  const ISSUER = 'carecareer-identity';
  const AUDIENCE = 'carecareer-api';

  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';
  const userAId = '00000000-0000-0000-0000-000000000a01';
  const userBId = '00000000-0000-0000-0000-000000000b01';
  const clientAId = '00000000-0000-0000-0000-000000000c01';
  const clientBId = '00000000-0000-0000-0000-000000000c02';

  /** Configurable identity state mock — defaults to "valid" */
  let mockIdentityResult: IdentityStateValidationResult = { valid: true };
  const mockIdentityAdapter: IdentityStateAdapter = {
    validate: async () => mockIdentityResult,
  };

  /** Configurable permission mock — defaults to "allowed" */
  let mockPermissionResult: { allowed: boolean; reason?: string } = { allowed: true };
  const mockPermissionAdapter: PermissionAdapter = {
    hasPermission: async () => mockPermissionResult,
  };

  /**
   * Sign a real RS256 JWT using the test private key.
   * The resulting token will be cryptographically validated by the guard.
   */
  async function signValidJwt(params: {
    sub: string;
    tenantId: string;
    roles?: string[];
    kid?: string;
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    sid?: string;
  }): Promise<string> {
    const pk = await importPKCS8(privateKeyPem, 'RS256');
    return new SignJWT({
      active_tenant_id: params.tenantId,
      membership_id: `mem-${params.sub}`,
      user_authorization_version: 1,
      membership_authorization_version: 1,
      platform_roles: params.roles ?? ['TENANT_ADMIN'],
      tenant_roles: params.roles ?? ['TENANT_ADMIN'],
      permissions: ['facilities:create', 'facilities:read'],
      sid: params.sid ?? `session-${params.sub}`,
    })
      .setProtectedHeader({ alg: 'RS256', kid: params.kid ?? TEST_KID })
      .setIssuedAt()
      .setExpirationTime(params.expiresIn ?? '15m')
      .setIssuer(params.issuer ?? ISSUER)
      .setAudience(params.audience ?? AUDIENCE)
      .setSubject(params.sub)
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
    // Generate RS256 key pair
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = keyPair.privateKey as string;
    publicKeyPem = keyPair.publicKey as string;

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
      currentDir, '..', '..', '..', 'prisma', 'migrations', '001_facilities_schema.sql',
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

    // Create REAL RS256 token validator with the test public key
    const tokenValidator = new LocalJwksTokenValidator({
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSec: 30,
      publicKeys: [{ kid: TEST_KID, publicKeyPem: publicKeyPem }],
    });

    // Build NestJS test module with REAL auth guard (RS256 + identity state)
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, FacilityController],
      providers: [
        { provide: 'STAFFING_TENANT_DB', useValue: tenantDb },
        { provide: 'STAFFING_REPOSITORY', useClass: PostgresStaffingRepository },
        { provide: 'TOKEN_VALIDATOR', useValue: tokenValidator },
        { provide: 'IDENTITY_STATE_ADAPTER', useValue: mockIdentityAdapter },
        { provide: 'PERMISSION_ADAPTER', useValue: mockPermissionAdapter },
        {
          provide: APP_GUARD,
          useFactory: (tv: unknown, ref: Reflector, adapter: IdentityStateAdapter) => {
            return new StaffingAuthGuard(tv as never, ref, adapter);
          },
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
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app.close();
    await superClient.end();
    await appPool.end();
    await container.stop();
  });

  describe('Authentication boundary (RS256 validation)', () => {
    it('should reject request with no Authorization header (401)', async () => {
      const res = await request(app.getHttpServer()).get('/v1/facilities');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    it('should reject malformed Authorization header (401)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', 'NotBearer some-token');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('INVALID_AUTH_FORMAT');
    });

    it('should reject unsigned/fabricated token (401)', async () => {
      // Manually construct a token without valid RS256 signature
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: TEST_KID })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: userAId, active_tenant_id: tenantAId, sid: 'fake', jti: 'fake',
        user_authorization_version: 1, iss: ISSUER, aud: AUDIENCE,
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900,
      })).toString('base64url');
      const fakeToken = `${header}.${payload}.invalid-signature`;

      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject HS256 token (401 — algorithm not allowed)', async () => {
      // Create an HS256 token (not RS256)
      const { createHmac } = await import('node:crypto');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: TEST_KID })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: userAId, active_tenant_id: tenantAId, sid: 'hs256-session', jti: 'hs256-jti',
        user_authorization_version: 1, iss: ISSUER, aud: AUDIENCE,
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900,
      })).toString('base64url');
      const hmac = createHmac('sha256', 'some-secret-key').update(`${header}.${payload}`).digest('base64url');
      const hs256Token = `${header}.${payload}.${hmac}`;

      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${hs256Token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject token with wrong issuer (401)', async () => {
      const token = await signValidJwt({
        sub: userAId, tenantId: tenantAId, issuer: 'wrong-issuer',
      });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject token with wrong audience (401)', async () => {
      const token = await signValidJwt({
        sub: userAId, tenantId: tenantAId, audience: 'wrong-audience',
      });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject expired token (401)', async () => {
      const token = await signValidJwt({
        sub: userAId, tenantId: tenantAId, expiresIn: '-5m',
      });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject token with unknown kid (401)', async () => {
      const token = await signValidJwt({
        sub: userAId, tenantId: tenantAId, kid: 'unknown-key-id-999',
      });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should reject token signed with different private key (401)', async () => {
      // Generate a different key pair
      const otherKeys = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const otherPk = await importPKCS8(otherKeys.privateKey as string, 'RS256');
      const token = await new SignJWT({
        active_tenant_id: tenantAId, sid: 'other-session', user_authorization_version: 1,
        membership_id: 'mem-other', platform_roles: [], tenant_roles: ['TENANT_ADMIN'],
        permissions: ['facilities:read'],
      })
        .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
        .setIssuedAt()
        .setExpirationTime('15m')
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject(userAId)
        .setJti(crypto.randomUUID())
        .sign(otherPk);

      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should accept valid RS256 token and return 200', async () => {
      mockIdentityResult = { valid: true };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.OK);
    });

    it('should ignore malicious role claims — tenant derives from validated token only', async () => {
      mockIdentityResult = { valid: true };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantBId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toEqual([]);
    });

    it('should deny when session is revoked', async () => {
      mockIdentityResult = { valid: false, code: 'AUTH_SESSION_REVOKED', message: 'Session revoked' };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('AUTH_SESSION_REVOKED');
    });

    it('should deny when user is inactive', async () => {
      mockIdentityResult = { valid: false, code: 'USER_INACTIVE', message: 'User inactive' };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('USER_INACTIVE');
    });

    it('should deny when membership is inactive', async () => {
      mockIdentityResult = { valid: false, code: 'MEMBERSHIP_INACTIVE', message: 'Membership inactive' };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('MEMBERSHIP_INACTIVE');
    });

    it('should deny when user authorization version is stale', async () => {
      mockIdentityResult = { valid: false, code: 'AUTH_VERSION_STALE', message: 'Stale auth version' };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('AUTH_VERSION_STALE');
    });

    it('should deny when identity service is unavailable (fail closed)', async () => {
      mockIdentityResult = { valid: false, code: 'IDENTITY_SERVICE_UNAVAILABLE', message: 'Cannot validate' };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.code).toBe('IDENTITY_SERVICE_UNAVAILABLE');
    });
  });

  describe('Permission enforcement', () => {
    it('should deny when permission adapter rejects (403)', async () => {
      mockIdentityResult = { valid: true };
      mockPermissionResult = { allowed: false, reason: 'No facility.create permission' };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Denied Fac', timezone: 'US/Eastern' });
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should allow when permission adapter grants', async () => {
      mockIdentityResult = { valid: true };
      mockPermissionResult = { allowed: true };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(HttpStatus.OK);
    });
  });

  describe('POST /v1/facilities', () => {
    it('should create a facility with valid input and return 201', async () => {
      mockIdentityResult = { valid: true }; // Reset for non-auth tests
      mockPermissionResult = { allowed: true };
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
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
      expect(res.body.data.facilityId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should reject facility creation without timezone (400)', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'No TZ' });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.code).toBe('INVALID_REQUEST');
    });

    it('should reject extra/unknown fields (strict schema)', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: clientAId, name: 'Extra', timezone: 'US/Eastern',
          tenantId: tenantBId, // Attempted tenant spoof
        });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should emit audit record atomically on creation', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-ID', 'audit-test-001')
        .send({ clientId: clientAId, name: 'Audit Facility', timezone: 'US/Central' });

      expect(res.status).toBe(HttpStatus.CREATED);
      const facilityId = res.body.data.facilityId;

      const audit = await superClient.query(
        `SELECT * FROM staffing.audit_records WHERE aggregate_id = $1::uuid`,
        [facilityId],
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(1);
      expect(audit.rows[0].action).toBe('facility.created');
      expect(audit.rows[0].actor_id).toBe(userAId);
      expect(audit.rows[0].correlation_id).toBe('audit-test-001');
    });

    it('should emit outbox event atomically on creation', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-ID', 'outbox-test-001')
        .send({ clientId: clientAId, name: 'Outbox Facility', timezone: 'US/Eastern' });

      expect(res.status).toBe(HttpStatus.CREATED);
      const facilityId = res.body.data.facilityId;

      const outbox = await superClient.query(
        `SELECT * FROM staffing.event_outbox WHERE aggregate_id = $1::uuid`,
        [facilityId],
      );
      expect(outbox.rows.length).toBe(1);
      expect(outbox.rows[0].event_type).toBe('carecareer.facility.created.v1');
      expect(outbox.rows[0].aggregate_type).toBe('facility');
      expect(outbox.rows[0].status).toBe('PENDING');
      expect(outbox.rows[0].correlation_id).toBe('outbox-test-001');
    });
  });

  describe('GET /v1/facilities', () => {
    it('should list only facilities belonging to the authenticated tenant', async () => {
      const tokenB = await signValidJwt({ sub: userBId, tenantId: tenantBId });
      await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ clientId: clientBId, name: 'Tenant B Only', timezone: 'US/Mountain' });

      const tokenA = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const res = await request(app.getHttpServer())
        .get('/v1/facilities')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(HttpStatus.OK);
      const names = res.body.data.map((f: { name: string }) => f.name);
      expect(names).not.toContain('Tenant B Only');
    });
  });

  describe('GET /v1/facilities/:facilityId', () => {
    it('should return facility by ID for owning tenant', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const createRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Lookup Fac', timezone: 'America/New_York' });
      const facilityId = createRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.id).toBe(facilityId);
      expect(res.body.data.timezone).toBe('America/New_York');
    });

    it('should return 404 for facility in another tenant (no leakage)', async () => {
      const tokenA = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const createRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ clientId: clientAId, name: 'XTenant Target', timezone: 'US/Pacific' });
      const facilityId = createRes.body.data.facilityId;

      const tokenB = await signValidJwt({ sub: userBId, tenantId: tenantBId });
      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /v1/facilities/:facilityId/departments', () => {
    it('should create a department within a facility', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Dept Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Emergency Room' });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.departmentId).toBeDefined();
    });

    it('should reject department creation in another tenant facility', async () => {
      const tokenA = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ clientId: clientAId, name: 'XTenant Dept', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const tokenB = await signValidJwt({ sub: userBId, tenantId: tenantBId });
      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hacked Dept' });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /v1/facilities/:facilityId/departments', () => {
    it('should list departments for a facility', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'List Dept Fac', timezone: 'US/Eastern' });
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
    });
  });

  describe('Credential requirements', () => {
    it('should create and query credential requirements by role', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Cred Req Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

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

    it('should filter by department (includes facility-wide)', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Dept Cred Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const deptRes = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ICU' });
      const deptId = deptRes.body.data.departmentId;

      // Facility-wide
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: 'BLS' });
      // Department-specific
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/credential-requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'RN', credentialType: 'ACLS', departmentId: deptId });

      const res = await request(app.getHttpServer())
        .get(`/v1/facilities/${facilityId}/credential-requirements?role=RN&departmentId=${deptId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('PATCH /v1/facilities/:facilityId (update)', () => {
    it('should update facility name and increment version', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Update Target', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .patch(`/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name', expectedVersion: 1 });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.version).toBe(2);
    });

    it('should increment geofenceVersion when geofence changes', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Geofence Test', timezone: 'US/Eastern',
          latitude: 47.0, longitude: -122.0, geofenceRadiusMeters: 100 });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .patch(`/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ latitude: 48.0, expectedVersion: 1 });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.geofenceVersion).toBe(2);
      expect(res.body.data.latitude).toBe(48);
    });

    it('should reject update with wrong expectedVersion (409)', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Conflict Test', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .patch(`/v1/facilities/${facilityId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Stale', expectedVersion: 99 });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.code).toBe('VERSION_CONFLICT');
    });
  });

  describe('POST /v1/facilities/:facilityId/status', () => {
    it('should deactivate an active facility', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Deactivate Test', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INACTIVE', expectedVersion: 1 });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.status).toBe('INACTIVE');
      expect(res.body.data.version).toBe(2);
    });

    it('should reactivate an inactive facility', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Reactivate Test', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      // Deactivate first
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INACTIVE', expectedVersion: 1 });

      // Reactivate
      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ACTIVE', expectedVersion: 2 });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should reject invalid status transition (400)', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Invalid Trans', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      // Deactivate
      await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INACTIVE', expectedVersion: 1 });

      // Try INACTIVE → SUSPENDED (not allowed)
      const res = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'SUSPENDED', expectedVersion: 2 });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('POST /v1/facilities/:facilityId/departments/:departmentId/status', () => {
    it('should deactivate and reactivate a department', async () => {
      const token = await signValidJwt({ sub: userAId, tenantId: tenantAId });
      const facRes = await request(app.getHttpServer())
        .post('/v1/facilities')
        .set('Authorization', `Bearer ${token}`)
        .send({ clientId: clientAId, name: 'Dept Status Fac', timezone: 'US/Eastern' });
      const facilityId = facRes.body.data.facilityId;

      const deptRes = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'ICU' });
      const deptId = deptRes.body.data.departmentId;

      // Deactivate
      const deact = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments/${deptId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INACTIVE', expectedVersion: 1 });
      expect(deact.status).toBe(HttpStatus.OK);
      expect(deact.body.data.status).toBe('INACTIVE');

      // Reactivate
      const react = await request(app.getHttpServer())
        .post(`/v1/facilities/${facilityId}/departments/${deptId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ACTIVE', expectedVersion: 2 });
      expect(react.status).toBe(HttpStatus.OK);
      expect(react.body.data.status).toBe('ACTIVE');
    });
  });
});
