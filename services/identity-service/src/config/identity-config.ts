import { z } from 'zod';

/**
 * Identity service configuration schema.
 * Validates environment variables at startup with fail-fast behavior.
 *
 * Production startup MUST reject insecure development settings.
 * This schema enforces fail-closed behavior before accepting traffic.
 */
export const identityConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3100),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGINS: z.string().optional(),

    /** Demo authentication (development/test only) */
    DEMO_MODE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    DEMO_AUTH_SECRET: z.string().min(32).optional(),

    /** Signing provider configuration */
    SIGNING_PROVIDER: z.enum(['local-rs256', 'aws-kms']).optional(),
    SIGNING_PRIVATE_KEY: z.string().optional(),

    /** Token configuration */
    TOKEN_ISSUER: z.string().optional(),
    TOKEN_AUDIENCE: z.string().optional(),
    ACCESS_TOKEN_LIFETIME_SEC: z.coerce.number().int().positive().default(900),
    SESSION_LIFETIME_DAYS: z.coerce.number().int().positive().default(7),
  })
  .superRefine((data, ctx) => {
    const isProd = data.NODE_ENV === 'production';

    // Demo mode prohibited in production
    if (isProd && data.DEMO_MODE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_MODE'],
        message: 'Demo authentication is prohibited in production',
      });
    }
    if (data.DEMO_MODE && !data.DEMO_AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_AUTH_SECRET'],
        message: 'DEMO_AUTH_SECRET is required when DEMO_MODE is enabled',
      });
    }

    // Production requires explicit signing provider
    if (isProd && !data.SIGNING_PROVIDER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SIGNING_PROVIDER'],
        message: 'SIGNING_PROVIDER is required in production',
      });
    }

    // Production prohibits local development signing provider
    if (isProd && data.SIGNING_PROVIDER === 'local-rs256') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SIGNING_PROVIDER'],
        message: 'Development signing provider (local-rs256) is prohibited in production',
      });
    }

    // Production prohibits inline private key
    if (isProd && data.SIGNING_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SIGNING_PRIVATE_KEY'],
        message: 'Inline private key is prohibited in production. Use KMS.',
      });
    }

    // Production requires explicit issuer and audience
    if (isProd && !data.TOKEN_ISSUER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TOKEN_ISSUER'],
        message: 'TOKEN_ISSUER must be explicitly set in production',
      });
    }
    if (isProd && !data.TOKEN_AUDIENCE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TOKEN_AUDIENCE'],
        message: 'TOKEN_AUDIENCE must be explicitly set in production',
      });
    }

    // Access token lifetime must not exceed 15 minutes
    if (data.ACCESS_TOKEN_LIFETIME_SEC > 900) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ACCESS_TOKEN_LIFETIME_SEC'],
        message: 'Access token lifetime must not exceed 900 seconds (15 minutes)',
      });
    }

    // Session lifetime must not exceed 7 days
    if (data.SESSION_LIFETIME_DAYS > 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_LIFETIME_DAYS'],
        message: 'Session lifetime must not exceed 7 days',
      });
    }
  });

export type IdentityConfig = z.infer<typeof identityConfigSchema>;
