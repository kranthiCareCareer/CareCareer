import { z } from 'zod';

/**
 * Request validation schemas for identity-service HTTP endpoints.
 * All use strict mode (rejects unknown fields).
 */

export const CreateUserSchema = z
  .object({
    displayName: z.string().min(1).max(200).trim(),
    primaryEmail: z.string().email().max(320).trim(),
  })
  .strict();

export const ChangeUserStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
    reason: z.string().min(1).max(500),
    version: z.number().int().positive(),
  })
  .strict();

export const LinkExternalIdentitySchema = z
  .object({
    issuer: z.string().min(1).max(500).trim(),
    subject: z.string().min(1).max(500).trim(),
    providerType: z.enum(['entra', 'okta', 'auth0', 'mock']),
    emailClaim: z.string().email().max(320).trim().optional(),
    displayNameClaim: z.string().max(200).trim().optional(),
  })
  .strict();

export const ListUsersQuerySchema = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  search: z.string().max(200).optional(),
  orderBy: z.enum(['created_at', 'display_name']).default('created_at'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type ChangeUserStatusDto = z.infer<typeof ChangeUserStatusSchema>;
export type LinkExternalIdentityDto = z.infer<typeof LinkExternalIdentitySchema>;
export type ListUsersQueryDto = z.infer<typeof ListUsersQuerySchema>;
