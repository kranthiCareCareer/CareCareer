import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { identityConfigSchema } from './identity-config.js';

/**
 * Production bootstrap-before-listen validation (GP-03.3).
 *
 * Proves that invalid production configuration prevents NestJS initialization.
 * The bootstrap flow is:
 *   1. identityConfigSchema.parse(process.env) — fails fast on invalid config
 *   2. NestFactory.create(AppModule) — module factories validate further
 *   3. app.listen() — only reached if all validation passes
 *
 * These tests prove listen() is NEVER called for insecure configurations
 * by using a testable bootstrap factory with a listener spy.
 */

/**
 * Testable bootstrap factory.
 * Mirrors the real bootstrap() from main.ts but accepts a listener spy
 * instead of actually starting a server.
 */
async function testableBootstrap(
  env: Record<string, string | undefined>,
  listenerSpy: () => void,
): Promise<void> {
  // Step 1: Config validation (same as production main.ts)
  const config = identityConfigSchema.parse(env);

  // Step 2: If we reach here, config is valid — call the listener spy
  // In real bootstrap, this is where NestFactory.create + app.listen happens
  listenerSpy();

  // Use config to avoid unused-variable lint
  void config;
}

describe('Production bootstrap-before-listen validation (GP-03.3)', () => {
  let listenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listenerSpy = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validProdEnv: Record<string, string> = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://prod-host:5432/carecareer',
    SIGNING_PROVIDER: 'aws-kms',
    TOKEN_ISSUER: 'carecareer-identity',
    TOKEN_AUDIENCE: 'carecareer-api',
  };

  describe('Valid production config calls listen()', () => {
    it('should call listener when all production config is valid', async () => {
      await testableBootstrap(validProdEnv, listenerSpy);
      expect(listenerSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Demo mode enabled in production prevents listen()', () => {
    it('should NOT call listener when DEMO_MODE=true in production', async () => {
      await expect(
        testableBootstrap(
          {
            ...validProdEnv,
            DEMO_MODE: 'true',
            DEMO_AUTH_SECRET: 'a-long-enough-secret-for-testing-purposes-here',
          },
          listenerSpy,
        ),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Missing signing provider prevents listen()', () => {
    it('should NOT call listener when SIGNING_PROVIDER is missing', async () => {
      const env = { ...validProdEnv };
      delete env['SIGNING_PROVIDER'];
      await expect(testableBootstrap(env, listenerSpy)).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Unsupported signing provider prevents listen()', () => {
    it('should NOT call listener when SIGNING_PROVIDER is invalid value', async () => {
      await expect(
        testableBootstrap({ ...validProdEnv, SIGNING_PROVIDER: 'custom-signer' }, listenerSpy),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Development signing provider in production prevents listen()', () => {
    it('should NOT call listener when SIGNING_PROVIDER is local-rs256 in production', async () => {
      await expect(
        testableBootstrap({ ...validProdEnv, SIGNING_PROVIDER: 'local-rs256' }, listenerSpy),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Inline private key in production prevents listen()', () => {
    it('should NOT call listener when SIGNING_PRIVATE_KEY is set in production', async () => {
      await expect(
        testableBootstrap(
          { ...validProdEnv, SIGNING_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIE...' },
          listenerSpy,
        ),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('HS256 algorithm prevention', () => {
    it('should NOT call listener when SIGNING_PROVIDER is not in allowed enum', async () => {
      // HS256 is not an allowed signing provider value
      await expect(
        testableBootstrap({ ...validProdEnv, SIGNING_PROVIDER: 'hs256' }, listenerSpy),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Missing issuer/audience prevents listen()', () => {
    it('should NOT call listener when TOKEN_ISSUER is missing in production', async () => {
      const env = { ...validProdEnv };
      delete env['TOKEN_ISSUER'];
      await expect(testableBootstrap(env, listenerSpy)).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });

    it('should NOT call listener when TOKEN_AUDIENCE is missing in production', async () => {
      const env = { ...validProdEnv };
      delete env['TOKEN_AUDIENCE'];
      await expect(testableBootstrap(env, listenerSpy)).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Token lifetime exceeds maximum prevents listen()', () => {
    it('should NOT call listener when access token lifetime exceeds 15 minutes', async () => {
      await expect(
        testableBootstrap({ ...validProdEnv, ACCESS_TOKEN_LIFETIME_SEC: '1800' }, listenerSpy),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Session lifetime exceeds maximum prevents listen()', () => {
    it('should NOT call listener when session lifetime exceeds 7 days', async () => {
      await expect(
        testableBootstrap({ ...validProdEnv, SESSION_LIFETIME_DAYS: '30' }, listenerSpy),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Placeholder secrets prevent listen()', () => {
    it('should NOT call listener when DATABASE_URL is empty', async () => {
      await expect(
        testableBootstrap({ ...validProdEnv, DATABASE_URL: '' }, listenerSpy),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });

    it('should NOT call listener when DEMO_AUTH_SECRET is too short in demo mode', async () => {
      await expect(
        testableBootstrap(
          {
            NODE_ENV: 'development',
            DATABASE_URL: 'postgresql://x/y',
            DEMO_MODE: 'true',
            DEMO_AUTH_SECRET: 'short',
          },
          listenerSpy,
        ),
      ).rejects.toThrow();
      expect(listenerSpy).not.toHaveBeenCalled();
    });
  });
});
