import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { identityConfigSchema } from './identity-config.js';

/**
 * Production startup safety tests.
 * Verifies that insecure development configurations are rejected in production.
 */
describe('Production Startup Safety', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to minimal valid state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEMO_MODE rejection in production', () => {
    it('should reject DEMO_MODE=true when NODE_ENV=production', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        DEMO_MODE: 'true',
        DEMO_AUTH_SECRET: 'a-secret-that-is-long-enough-for-testing-purposes',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('prohibited in production'))).toBe(true);
      }
    });

    it('should allow DEMO_MODE=true in development', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/test',
        DEMO_MODE: 'true',
        DEMO_AUTH_SECRET: 'a-secret-that-is-long-enough-for-testing-purposes',
      });

      expect(result.success).toBe(true);
    });

    it('should allow DEMO_MODE=true in test', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        DEMO_MODE: 'true',
        DEMO_AUTH_SECRET: 'a-secret-that-is-long-enough-for-testing-purposes',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('DEMO_AUTH_SECRET requirement', () => {
    it('should reject DEMO_MODE without DEMO_AUTH_SECRET', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/test',
        DEMO_MODE: 'true',
        // No DEMO_AUTH_SECRET
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('DEMO_AUTH_SECRET'))).toBe(true);
      }
    });

    it('should reject DEMO_AUTH_SECRET shorter than 32 characters', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/test',
        DEMO_MODE: 'true',
        DEMO_AUTH_SECRET: 'too-short',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('DATABASE_URL requirement', () => {
    it('should reject missing DATABASE_URL', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'production',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Module-level startup safety', () => {
    it('should throw when resolving token validator with DEMO_MODE in production env', async () => {
      // Simulate production environment
      process.env['NODE_ENV'] = 'production';
      process.env['DEMO_MODE'] = 'true';
      process.env['DATABASE_URL'] = 'postgresql://localhost/test';

      // Dynamic import to get fresh module evaluation
      const { resolveTokenValidatorForTest } = await import('./startup-safety-helpers.js');

      expect(() => resolveTokenValidatorForTest()).toThrow(/prohibited in production/);
    });

    it('should throw when production lacks TOKEN_ISSUER', async () => {
      process.env['NODE_ENV'] = 'production';
      process.env['DATABASE_URL'] = 'postgresql://localhost/test';
      delete process.env['DEMO_MODE'];
      delete process.env['TOKEN_ISSUER'];
      delete process.env['TOKEN_AUDIENCE'];

      const { resolveTokenValidatorForTest } = await import('./startup-safety-helpers.js');

      expect(() => resolveTokenValidatorForTest()).toThrow(/TOKEN_ISSUER/);
    });

    it('should throw when production lacks TOKEN_AUDIENCE', async () => {
      process.env['NODE_ENV'] = 'production';
      process.env['DATABASE_URL'] = 'postgresql://localhost/test';
      process.env['TOKEN_ISSUER'] = 'carecareer-identity';
      delete process.env['DEMO_MODE'];
      delete process.env['TOKEN_AUDIENCE'];

      const { resolveTokenValidatorForTest } = await import('./startup-safety-helpers.js');

      expect(() => resolveTokenValidatorForTest()).toThrow(/TOKEN_AUDIENCE/);
    });
  });
});
