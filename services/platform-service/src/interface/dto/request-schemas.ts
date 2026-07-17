import { z } from 'zod';

const uuid = z.string().uuid();
const nonEmptyString = z.string().min(1).max(200);

export const ProvisionTenantSchema = z
  .object({
    name: nonEmptyString,
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z][a-z0-9-]*$/, 'Slug must be lowercase alphanumeric with hyphens'),
    organizationName: nonEmptyString,
  })
  .strict();

export const UpdateTenantSchema = z
  .object({
    name: nonEmptyString.optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const LifecycleTransitionSchema = z
  .object({
    reason: nonEmptyString,
    version: z.number().int().positive(),
  })
  .strict();

export const CreateOrganizationSchema = z
  .object({
    name: nonEmptyString,
  })
  .strict();

export const CreateBranchSchema = z
  .object({
    name: nonEmptyString,
    code: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[A-Z][A-Z0-9-]*$/, 'Code must be uppercase alphanumeric with hyphens'),
  })
  .strict();

export const UpdateEntitlementsSchema = z
  .object({
    modules: z.record(z.string(), z.boolean()),
    version: z.number().int().positive(),
  })
  .strict();

export const UpdateFeatureSchema = z
  .object({
    value: z.unknown(),
  })
  .strict();

// Parameter validation
export const UuidParamSchema = z.object({ id: uuid });
export const TenantIdParamSchema = z.object({ tenantId: uuid });
export const OrganizationIdParamSchema = z.object({ organizationId: uuid });
export const FeatureKeyParamSchema = z.object({
  tenantId: uuid,
  featureKey: z.string().min(3).max(100),
});

export type ProvisionTenantDto = z.infer<typeof ProvisionTenantSchema>;
export type UpdateTenantDto = z.infer<typeof UpdateTenantSchema>;
export type LifecycleTransitionDto = z.infer<typeof LifecycleTransitionSchema>;
export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>;
export type CreateBranchDto = z.infer<typeof CreateBranchSchema>;
export type UpdateEntitlementsDto = z.infer<typeof UpdateEntitlementsSchema>;
export type UpdateFeatureDto = z.infer<typeof UpdateFeatureSchema>;
