import { z } from 'zod';

/**
 * Identity service configuration schema.
 * Validates environment variables at startup with fail-fast behavior.
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
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && data.DEMO_MODE) {
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
  });

export type IdentityConfig = z.infer<typeof identityConfigSchema>;
