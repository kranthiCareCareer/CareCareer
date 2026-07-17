import { describe, expect, it } from 'vitest';

import { loadConfig, ConfigValidationError } from './index.js';

const validEnv = {
  APP_NAME: 'test-service',
  APP_VERSION: '1.0.0',
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  OIDC_ISSUER: 'https://auth.example.com/',
  OIDC_AUDIENCE: 'carecareer-api',
};

describe('loadConfig', () => {
  it('should load valid configuration', () => {
    const config = loadConfig(validEnv);

    expect(config.APP_NAME).toBe('test-service');
    expect(config.APP_VERSION).toBe('1.0.0');
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3001);
    expect(config.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    expect(config.OIDC_ISSUER).toBe('https://auth.example.com/');
    expect(config.OIDC_AUDIENCE).toBe('carecareer-api');
  });

  it('should apply defaults for optional fields', () => {
    const config = loadConfig(validEnv);

    expect(config.LOG_LEVEL).toBe('info');
    expect(config.DATABASE_POOL_MIN).toBe(2);
    expect(config.DATABASE_POOL_MAX).toBe(10);
    expect(config.EVENT_PUBLISHER_TYPE).toBe('memory');
    expect(config.IDEMPOTENCY_TTL_DAYS).toBe(7);
    expect(config.SHUTDOWN_TIMEOUT_MS).toBe(10000);
  });

  it('should use default for APP_NAME when missing', () => {
    const env = { ...validEnv, APP_NAME: undefined };

    const config = loadConfig(env as Record<string, string | undefined>);
    expect(config.APP_NAME).toBe('carecareer-service');
  });

  it('should fail when DATABASE_URL is invalid', () => {
    const env = { ...validEnv, DATABASE_URL: 'not-a-url' };

    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
  });

  it('should allow OIDC_ISSUER to be absent in development mode', () => {
    const env = { ...validEnv, OIDC_ISSUER: undefined };

    const config = loadConfig(env as Record<string, string | undefined>);
    expect(config.OIDC_ISSUER).toBeUndefined();
  });

  it('should fail when NODE_ENV is invalid', () => {
    const env = { ...validEnv, NODE_ENV: 'invalid' };

    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
  });

  it('should coerce PORT from string to number', () => {
    const config = loadConfig({ ...validEnv, PORT: '8080' });

    expect(config.PORT).toBe(8080);
    expect(typeof config.PORT).toBe('number');
  });

  it('should include all invalid fields in error message', () => {
    try {
      loadConfig({});
      expect.fail('Should have thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      if (error instanceof ConfigValidationError) {
        expect(error.issues.length).toBeGreaterThan(0);
        expect(error.message).toContain('Configuration validation failed');
      }
    }
  });
});
