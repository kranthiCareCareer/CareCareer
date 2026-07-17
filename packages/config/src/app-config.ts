import { z } from 'zod';

import { ConfigValidationError } from './errors.js';

/**
 * Application configuration schema.
 * Validates environment variables at startup.
 * Application MUST fail immediately when required configuration is invalid.
 */
export const appConfigSchema = z
  .object({
    // Application identity
    APP_NAME: z.string().min(1).default('carecareer-service'),
    APP_VERSION: z.string().default('0.0.0'),
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

    // HTTP server
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),

    // Database
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    // OIDC / JWT — required in production, optional in dev/test with demo auth
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_AUDIENCE: z.string().min(1).optional(),
    OIDC_JWKS_URI: z.string().url().optional(),
    OIDC_ALGORITHMS: z.string().default('RS256'),

    // Demo authentication (development/test only)
    DEMO_MODE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    DEMO_AUTH_SECRET: z.string().min(32).optional(),

    // Logging
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Observability
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().optional(),

    // Events
    EVENT_PUBLISHER_TYPE: z.enum(['bullmq', 'sqs', 'memory']).default('memory'),
    REDIS_URL: z.string().optional(),
    SQS_QUEUE_URL: z.string().optional(),

    // Idempotency
    IDEMPOTENCY_TTL_DAYS: z.coerce.number().int().positive().default(7),

    // Graceful shutdown
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  })
  .superRefine((data, ctx) => {
    // Configuration matrix enforcement
    if (data.NODE_ENV === 'production') {
      // Production: OIDC required, demo prohibited
      if (!data.OIDC_ISSUER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OIDC_ISSUER'],
          message: 'OIDC_ISSUER is required in production',
        });
      }
      if (!data.OIDC_AUDIENCE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OIDC_AUDIENCE'],
          message: 'OIDC_AUDIENCE is required in production',
        });
      }
      if (data.DEMO_MODE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DEMO_MODE'],
          message: 'Demo authentication is prohibited in production',
        });
      }
    }

    // Development/test with DEMO_MODE: demo secret required
    if (data.DEMO_MODE && !data.DEMO_AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_AUTH_SECRET'],
        message: 'DEMO_AUTH_SECRET is required when DEMO_MODE is enabled',
      });
    }
  });

export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * Load and validate application configuration from environment variables.
 * Fails fast with a descriptive error if validation fails.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = appConfigSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );

    throw new ConfigValidationError(
      `Configuration validation failed:\n${issues.join('\n')}`,
      result.error.issues,
    );
  }

  return result.data;
}
