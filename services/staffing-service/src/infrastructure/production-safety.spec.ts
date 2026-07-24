import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Production Authentication Safety Tests
 *
 * Proves that production mode cannot enable demo authentication,
 * and that required security configuration must be present.
 */
describe('Production Authentication Safety', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should reject DEMO_MODE=true in production', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['DEMO_MODE'] = 'true';
    process.env['DEMO_AUTH_SECRET'] = 'some-secret-that-should-not-work';

    // The module factory throws on production + demo mode
    const { createTokenValidator } = await import('./production-safety-helpers.js');
    expect(() => createTokenValidator()).toThrow('DEMO_MODE=true is forbidden in production');
  });

  it('should reject missing JWKS_URI in production', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['DEMO_MODE'] = 'false';
    delete process.env['JWKS_URI'];

    const { createTokenValidator } = await import('./production-safety-helpers.js');
    expect(() => createTokenValidator()).toThrow('JWKS_URI is required in production');
  });

  it('should allow demo mode in development', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['DEMO_MODE'] = 'true';
    process.env['DEMO_AUTH_SECRET'] =
      'carecareer-demo-secret-for-testing-only-do-not-use-in-production';

    const { createTokenValidator } = await import('./production-safety-helpers.js');
    const validator = createTokenValidator();
    expect(validator).toBeDefined();
  });

  it('should allow production with JWKS_URI configured', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['DEMO_MODE'] = 'false';
    process.env['JWKS_URI'] = 'http://identity:3100/.well-known/jwks.json';
    process.env['JWT_ISSUER'] = 'carecareer-identity';
    process.env['JWT_AUDIENCE'] = 'carecareer-api';

    const { createTokenValidator } = await import('./production-safety-helpers.js');
    const validator = createTokenValidator();
    expect(validator).toBeDefined();
  });
});
