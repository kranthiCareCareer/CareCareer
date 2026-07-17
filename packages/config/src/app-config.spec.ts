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
    const env = { ...validEnv, NODE_ENV: 'development', OIDC_ISSUER: undefined };

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

describe('Configuration matrix: production', () => {
  const productionEnv = {
    ...validEnv,
    NODE_ENV: 'production',
    OIDC_ISSUER: 'https://auth.example.com/',
    OIDC_AUDIENCE: 'carecareer-api',
  };

  it('should succeed when OIDC_ISSUER and OIDC_AUDIENCE are provided', () => {
    const config = loadConfig(productionEnv);
    expect(config.OIDC_ISSUER).toBe('https://auth.example.com/');
    expect(config.OIDC_AUDIENCE).toBe('carecareer-api');
  });

  it('should fail when OIDC_ISSUER is missing in production', () => {
    const env = { ...productionEnv, OIDC_ISSUER: undefined };
    expect(() => loadConfig(env as Record<string, string | undefined>)).toThrow(
      ConfigValidationError,
    );
    try {
      loadConfig(env as Record<string, string | undefined>);
    } catch (error: unknown) {
      expect((error as ConfigValidationError).message).toContain('OIDC_ISSUER is required');
    }
  });

  it('should fail when OIDC_AUDIENCE is missing in production', () => {
    const env = { ...productionEnv, OIDC_AUDIENCE: undefined };
    expect(() => loadConfig(env as Record<string, string | undefined>)).toThrow(
      ConfigValidationError,
    );
    try {
      loadConfig(env as Record<string, string | undefined>);
    } catch (error: unknown) {
      expect((error as ConfigValidationError).message).toContain('OIDC_AUDIENCE is required');
    }
  });

  it('should fail when DEMO_MODE=true in production', () => {
    const env = {
      ...productionEnv,
      DEMO_MODE: 'true',
      DEMO_AUTH_SECRET: 'a-secret-that-is-at-least-32-characters-long',
    };
    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
    try {
      loadConfig(env);
    } catch (error: unknown) {
      expect((error as ConfigValidationError).message).toContain(
        'Demo authentication is prohibited in production',
      );
    }
  });
});

describe('Configuration matrix: development + DEMO_MODE=true', () => {
  const devDemoEnv = {
    ...validEnv,
    NODE_ENV: 'development',
    DEMO_MODE: 'true',
    DEMO_AUTH_SECRET: 'carecareer-demo-secret-for-testing-only-do-not-use-in-production',
  };

  it('should allow demo mode with valid secret', () => {
    const config = loadConfig(devDemoEnv);
    expect(config.DEMO_MODE).toBe(true);
    expect(config.DEMO_AUTH_SECRET).toBe(
      'carecareer-demo-secret-for-testing-only-do-not-use-in-production',
    );
  });

  it('should not require OIDC when demo mode is enabled', () => {
    const env = { ...devDemoEnv, OIDC_ISSUER: undefined, OIDC_AUDIENCE: undefined };
    const config = loadConfig(env as Record<string, string | undefined>);
    expect(config.OIDC_ISSUER).toBeUndefined();
    expect(config.DEMO_MODE).toBe(true);
  });

  it('should fail when DEMO_AUTH_SECRET is missing with DEMO_MODE=true', () => {
    const env = { ...devDemoEnv, DEMO_AUTH_SECRET: undefined };
    expect(() => loadConfig(env as Record<string, string | undefined>)).toThrow(
      ConfigValidationError,
    );
    try {
      loadConfig(env as Record<string, string | undefined>);
    } catch (error: unknown) {
      expect((error as ConfigValidationError).message).toContain(
        'DEMO_AUTH_SECRET is required when DEMO_MODE is enabled',
      );
    }
  });

  it('should fail when DEMO_AUTH_SECRET is too short', () => {
    const env = { ...devDemoEnv, DEMO_AUTH_SECRET: 'too-short' };
    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
  });
});

describe('Configuration matrix: development + DEMO_MODE missing/false', () => {
  const devNoDemoEnv = {
    ...validEnv,
    NODE_ENV: 'development',
    DEMO_MODE: undefined,
  };

  it('should default DEMO_MODE to false when not set', () => {
    const config = loadConfig(devNoDemoEnv as Record<string, string | undefined>);
    expect(config.DEMO_MODE).toBe(false);
  });

  it('should treat DEMO_MODE=false as disabled', () => {
    const env = { ...devNoDemoEnv, DEMO_MODE: 'false' };
    const config = loadConfig(env as Record<string, string | undefined>);
    expect(config.DEMO_MODE).toBe(false);
  });

  it('should not require DEMO_AUTH_SECRET when DEMO_MODE is off', () => {
    const env = { ...devNoDemoEnv, DEMO_AUTH_SECRET: undefined };
    const config = loadConfig(env as Record<string, string | undefined>);
    expect(config.DEMO_AUTH_SECRET).toBeUndefined();
  });
});

describe('Configuration matrix: test mode', () => {
  const testEnv = {
    ...validEnv,
    NODE_ENV: 'test',
  };

  it('should load valid test configuration with OIDC', () => {
    const config = loadConfig(testEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.OIDC_ISSUER).toBe('https://auth.example.com/');
  });

  it('should allow test mode without OIDC when not using demo mode', () => {
    const env = { ...testEnv, OIDC_ISSUER: undefined, OIDC_AUDIENCE: undefined };
    const config = loadConfig(env as Record<string, string | undefined>);
    expect(config.NODE_ENV).toBe('test');
    expect(config.OIDC_ISSUER).toBeUndefined();
  });

  it('should allow test mode with DEMO_MODE=true and valid secret', () => {
    const env = {
      ...testEnv,
      DEMO_MODE: 'true',
      DEMO_AUTH_SECRET: 'carecareer-demo-secret-for-testing-only-do-not-use-in-production',
    };
    const config = loadConfig(env);
    expect(config.DEMO_MODE).toBe(true);
  });

  it('should fail in test mode with DEMO_MODE=true but no secret', () => {
    const env = { ...testEnv, DEMO_MODE: 'true', DEMO_AUTH_SECRET: undefined };
    expect(() => loadConfig(env as Record<string, string | undefined>)).toThrow(
      ConfigValidationError,
    );
  });
});
