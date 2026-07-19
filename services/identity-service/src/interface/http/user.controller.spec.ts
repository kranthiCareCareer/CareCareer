import { createHmac } from 'node:crypto';

import { type INestApplication, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
} from '../../application/ports/injection-tokens.js';

const SECRET = 'carecareer-demo-secret-for-testing-only-do-not-use-in-production';

function signToken(overrides: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'carecareer-demo',
      aud: 'carecareer-api',
      sub: 'actor-001',
      actor_id: 'actor-001',
      actor_type: 'user',
      tenants: [
        { tenantId: 'tenant-001', roles: ['PLATFORM_ADMIN'], branchIds: [], status: 'active' },
      ],
      iat: now,
      exp: now + 900,
      ...overrides,
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

describe('UserController HTTP Contract Tests', () => {
  let app: INestApplication;
  let validToken: string;
  let noPermToken: string;

  beforeAll(async () => {
    const mockRepo = {
      createUser: vi.fn(),
      findUserById: vi.fn().mockResolvedValue(null),
      findUserByEmail: vi.fn().mockResolvedValue(null),
      listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
      updateUser: vi.fn(),
      createExternalIdentity: vi.fn(),
      findExternalIdentityByIssuerSubject: vi.fn().mockResolvedValue(null),
      listExternalIdentitiesByUserId: vi.fn().mockResolvedValue([]),
      insertAuditRecord: vi.fn(),
    };

    const mockAdminDb = {
      execute: vi.fn(async (_params: unknown, operation: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          $queryRaw: vi.fn().mockResolvedValue([{ total: 0 }]),
        };
        return operation(mockTx);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IDENTITY_REPOSITORY)
      .useValue(mockRepo)
      .overrideProvider(ADMINISTRATIVE_DATABASE)
      .useValue(mockAdminDb)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    validToken = signToken();
    noPermToken = signToken({
      tenants: [{ tenantId: 'tenant-001', roles: ['READ_ONLY'], branchIds: [], status: 'active' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication boundary', () => {
    it('should return 401 when no Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/platform/users')
        .expect(HttpStatus.UNAUTHORIZED);
      expect(res.body.message).toContain('Authentication required');
    });

    it('should return 401 for invalid token format', async () => {
      await request(app.getHttpServer())
        .get('/v1/platform/users')
        .set('Authorization', 'Bearer invalid-token')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 for expired token', async () => {
      const expiredToken = signToken({ exp: Math.floor(Date.now() / 1000) - 300 });
      await request(app.getHttpServer())
        .get('/v1/platform/users')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Permission boundary', () => {
    it('should return 403 when permission is missing', async () => {
      await request(app.getHttpServer())
        .get('/v1/platform/users')
        .set('Authorization', `Bearer ${noPermToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Validation', () => {
    it('should return 400 for invalid UUID in path', async () => {
      await request(app.getHttpServer())
        .get('/v1/platform/users/not-a-uuid')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 when required field missing in create', async () => {
      await request(app.getHttpServer())
        .post('/v1/platform/users')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ displayName: 'Test' }) // missing primaryEmail
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for unknown JSON field in create', async () => {
      await request(app.getHttpServer())
        .post('/v1/platform/users')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ displayName: 'Test', primaryEmail: 'test@example.com', unknownField: true })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for blank display name', async () => {
      await request(app.getHttpServer())
        .post('/v1/platform/users')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ displayName: '', primaryEmail: 'test@example.com' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for oversized display name', async () => {
      await request(app.getHttpServer())
        .post('/v1/platform/users')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ displayName: 'x'.repeat(201), primaryEmail: 'test@example.com' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for invalid status in change-status', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      await request(app.getHttpServer())
        .patch(`/v1/platform/users/${userId}/status`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'INVALID', reason: 'test', version: 1 })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Health endpoints (public)', () => {
    it('GET /health returns 200 without auth', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(HttpStatus.OK);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('identity-service');
    });

    it('GET /ready returns 200 without auth', async () => {
      const res = await request(app.getHttpServer()).get('/ready').expect(HttpStatus.OK);
      expect(res.body.status).toBeDefined();
    });
  });

  describe('Successful operations', () => {
    it('POST /v1/platform/users → 201 on valid input', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/platform/users')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ displayName: 'New User', primaryEmail: 'new@example.com' })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.displayName).toBe('New User');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.id).toBeDefined();
    });

    it('POST external-identity link → 201 when user exists', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      // Override the mock to return a user for this test
      const repo = app.get(IDENTITY_REPOSITORY);
      const findUserSpy = vi.spyOn(repo, 'findUserById').mockResolvedValueOnce({
        id: userId,
        displayName: 'Existing User',
        primaryEmail: 'existing@example.com',
        status: 'ACTIVE',
        authorizationVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/platform/users/${userId}/external-identities`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          issuer: 'https://login.example.com',
          subject: 'sub-123',
          providerType: 'auth0',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.issuer).toBe('https://login.example.com');
      expect(res.body.data.subject).toBe('sub-123');
      findUserSpy.mockRestore();
    });

    it('POST external-identity link → 404 when user does not exist', async () => {
      const userId = '22222222-2222-2222-2222-222222222222';
      await request(app.getHttpServer())
        .post(`/v1/platform/users/${userId}/external-identities`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          issuer: 'https://login.example.com',
          subject: 'sub-456',
          providerType: 'auth0',
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
