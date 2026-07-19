import { createHmac } from 'node:crypto';

import { describe, it, expect } from 'vitest';

import { AuthenticationError } from '@carecareer/auth';

import { DemoTokenValidator } from './demo-token-validator.js';

const SECRET = 'carecareer-demo-secret-for-testing-only-do-not-use-in-production';
const ISSUER = 'carecareer-demo';
const AUDIENCE = 'carecareer-api';

function createToken(payload: Record<string, unknown>, secret: string = SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

describe('DemoTokenValidator', () => {
  const validator = new DemoTokenValidator({ secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
  const now = Math.floor(Date.now() / 1000);

  const validPayload = {
    sub: 'user-001',
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + 900,
    tenants: [{ tenantId: 'tenant-1', roles: ['ADMIN'], branchIds: [], status: 'active' }],
  };

  it('should validate a correctly signed token', async () => {
    const token = createToken(validPayload);
    const principal = await validator.validate(token);
    expect(principal.subject).toBe('user-001');
    expect(principal.tenantMemberships).toHaveLength(1);
  });

  it('should reject invalid token format (not 3 parts)', async () => {
    await expect(validator.validate('only-two.parts')).rejects.toThrow(AuthenticationError);
  });

  it('should reject invalid signature', async () => {
    const token = createToken(validPayload, 'wrong-secret-key-that-does-not-match');
    await expect(validator.validate(token)).rejects.toThrow('Invalid token signature');
  });

  it('should reject wrong issuer', async () => {
    const token = createToken({ ...validPayload, iss: 'wrong-issuer' });
    await expect(validator.validate(token)).rejects.toThrow('Invalid issuer');
  });

  it('should reject wrong audience', async () => {
    const token = createToken({ ...validPayload, aud: 'wrong-audience' });
    await expect(validator.validate(token)).rejects.toThrow('Invalid audience');
  });

  it('should reject expired token', async () => {
    const token = createToken({ ...validPayload, exp: now - 60 });
    await expect(validator.validate(token)).rejects.toThrow('Token expired');
  });

  it('should accept token without tenants claim', async () => {
    const token = createToken({ ...validPayload, tenants: undefined });
    const principal = await validator.validate(token);
    expect(principal.tenantMemberships).toHaveLength(0);
  });
});
