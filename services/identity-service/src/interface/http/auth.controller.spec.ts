import { createHmac } from 'node:crypto';

import { type INestApplication, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

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
      sub: 'user-001',
      actor_id: 'user-001',
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

describe('AuthController HTTP Contract Tests', () => {
  let app: INestApplication;
  let validToken: string;

  beforeAll(async () => {
    const mockIdentityRepo = {
      createUser: vi.fn(),
      findUserById: vi.fn().mockResolvedValue({
        id: 'user-001',
        displayName: 'Test User',
        primaryEmail: 'test@example.com',
        status: 'ACTIVE',
        authorizationVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      }),
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
          $queryRaw: vi.fn().mockResolvedValue([]),
        };
        return operation(mockTx);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IDENTITY_REPOSITORY)
      .useValue(mockIdentityRepo)
      .overrideProvider(ADMINISTRATIVE_DATABASE)
      .useValue(mockAdminDb)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    validToken = signToken();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v1/auth/refresh', () => {
    it('should return 401 when no refresh token provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({})
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.code).toBe('AUTH_REFRESH_INVALID');
    });

    it('should return 401 when refresh token is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token-value' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.code).toBeDefined();
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('should return 200 on authenticated logout (idempotent)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(HttpStatus.OK);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer()).post('/v1/auth/logout').expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/auth/logout-all', () => {
    it('should return 200 on authenticated logout-all', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('ok');
      expect(res.body.revokedCount).toBeDefined();
    });
  });

  describe('GET /v1/auth/sessions', () => {
    it('should return 200 with session list', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer()).get('/v1/auth/sessions').expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('DELETE /v1/auth/sessions/:sessionId', () => {
    it('should return 404 for non-existent session (hidden 404)', async () => {
      await request(app.getHttpServer())
        .delete('/v1/auth/sessions/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .delete('/v1/auth/sessions/11111111-1111-1111-1111-111111111111')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /v1/auth/me', () => {
    it('should return 200 with current user identity', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.userId).toBe('user-001');
      expect(res.body.data.displayName).toBe('Test User');
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer()).get('/v1/auth/me').expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /.well-known/jwks.json', () => {
    it('should return 200 with JWKS (public, no auth required)', async () => {
      const res = await request(app.getHttpServer())
        .get('/.well-known/jwks.json')
        .expect(HttpStatus.OK);

      expect(res.body.keys).toBeDefined();
      expect(Array.isArray(res.body.keys)).toBe(true);
    });

    it('should not contain private key fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/.well-known/jwks.json')
        .expect(HttpStatus.OK);

      const responseText = JSON.stringify(res.body);
      expect(responseText).not.toContain('"d"');
      expect(responseText).not.toContain('"p"');
      expect(responseText).not.toContain('"q"');
      expect(responseText).not.toContain('"dp"');
      expect(responseText).not.toContain('"dq"');
      expect(responseText).not.toContain('"qi"');
    });
  });

  describe('POST /v1/auth/dev/session', () => {
    it('should return 401 without userId in non-production', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/dev/session')
        .send({})
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
