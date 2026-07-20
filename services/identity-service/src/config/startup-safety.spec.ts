import { describe, it, expect } from 'vitest';

import { identityConfigSchema } from './identity-config.js';

/**
 * Production startup safety tests.
 * Proves production fails closed for every insecure configuration.
 */
describe('Production Startup Safety', () => {
  const validProdBase = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/test',
    SIGNING_PROVIDER: 'aws-kms',
    TOKEN_ISSUER: 'carecareer-identity',
    TOKEN_AUDIENCE: 'carecareer-api',
  };

  describe('Demo mode rejection', () => {
    it('should reject DEMO_MODE=true in production', () => {
      const result = identityConfigSchema.safeParse({
        ...validProdBase,
        DEMO_MODE: 'true',
        DEMO_AUTH_SECRET: 'a-secret-that-is-long-enough-for-testing-purposes',
      });
      expect(result.success).toBe(false);
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

    it('should reject DEMO_MODE without DEMO_AUTH_SECRET', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/test',
        DEMO_MODE: 'true',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Signing provider validation', () => {
    it('should reject missing SIGNING_PROVIDER in production', () => {
      const withoutProvider = { ...validProdBase, SIGNING_PROVIDER: undefined };
      const result = identityConfigSchema.safeParse(withoutProvider);
      expect(result.success).toBe(false);
    });

    it('should reject development signing provider in production', () => {
      const result = identityConfigSchema.safeParse({
        ...validProdBase,
        SIGNING_PROVIDER: 'local-rs256',
      });
      expect(result.success).toBe(false);
    });

    it('should reject inline private key in production', () => {
      const result = identityConfigSchema.safeParse({
        ...validProdBase,
        SIGNING_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIE...',
      });
      expect(result.success).toBe(false);
    });

    it('should accept aws-kms provider in production', () => {
      const result = identityConfigSchema.safeParse(validProdBase);
      expect(result.success).toBe(true);
    });
  });

  describe('Token configuration validation', () => {
    it('should reject missing TOKEN_ISSUER in production', () => {
      const without = { ...validProdBase, TOKEN_ISSUER: undefined };
      const result = identityConfigSchema.safeParse(without);
      expect(result.success).toBe(false);
    });

    it('should reject missing TOKEN_AUDIENCE in production', () => {
      const without = { ...validProdBase, TOKEN_AUDIENCE: undefined };
      const result = identityConfigSchema.safeParse(without);
      expect(result.success).toBe(false);
    });

    it('should reject access token lifetime above 15 minutes', () => {
      const result = identityConfigSchema.safeParse({
        ...validProdBase,
        ACCESS_TOKEN_LIFETIME_SEC: '1800',
      });
      expect(result.success).toBe(false);
    });

    it('should reject session lifetime above 7 days', () => {
      const result = identityConfigSchema.safeParse({
        ...validProdBase,
        SESSION_LIFETIME_DAYS: '30',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid production configuration', () => {
      const result = identityConfigSchema.safeParse(validProdBase);
      expect(result.success).toBe(true);
    });
  });

  describe('Development configuration', () => {
    it('should accept minimal development config', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/dev',
      });
      expect(result.success).toBe(true);
    });

    it('should accept local-rs256 provider in development', () => {
      const result = identityConfigSchema.safeParse({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost/dev',
        SIGNING_PROVIDER: 'local-rs256',
      });
      expect(result.success).toBe(true);
    });
  });
});
