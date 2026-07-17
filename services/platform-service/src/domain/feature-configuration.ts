import { z } from 'zod';

/**
 * Known feature keys with typed value schemas.
 * Feature configuration cannot enable an unentitled capability.
 */
export const FEATURE_SCHEMAS = {
  'scheduling.auto_confirm_enabled': z.boolean(),
  'scheduling.max_workers_per_shift': z.number().int().min(1).max(100),
  'timekeeping.geofence_required': z.boolean(),
  'timekeeping.allowed_clock_in_minutes_before': z.number().int().min(0).max(120),
  'timekeeping.allowed_clock_in_minutes_after': z.number().int().min(0).max(60),
  'timekeeping.break_reminder_enabled': z.boolean(),
  'recruiting.auto_post_to_boards': z.boolean(),
  'notifications.sms_enabled': z.boolean(),
  'notifications.push_enabled': z.boolean(),
} as const;

export type FeatureKey = keyof typeof FEATURE_SCHEMAS;

/**
 * Feature configuration entry for a tenant.
 */
export interface FeatureConfiguration {
  readonly tenantId: string;
  readonly featureKey: FeatureKey;
  readonly value: unknown;
  readonly version: number;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

/**
 * Required module entitlement for each feature key.
 */
export const FEATURE_MODULE_REQUIREMENTS: Record<FeatureKey, string> = {
  'scheduling.auto_confirm_enabled': 'scheduling',
  'scheduling.max_workers_per_shift': 'scheduling',
  'timekeeping.geofence_required': 'timekeeping',
  'timekeeping.allowed_clock_in_minutes_before': 'timekeeping',
  'timekeeping.allowed_clock_in_minutes_after': 'timekeeping',
  'timekeeping.break_reminder_enabled': 'timekeeping',
  'recruiting.auto_post_to_boards': 'recruiting',
  'notifications.sms_enabled': 'core',
  'notifications.push_enabled': 'core',
};

/**
 * Validate a feature value against its schema.
 */
export function validateFeatureValue(key: FeatureKey, value: unknown): boolean {
  const schema = FEATURE_SCHEMAS[key];
  const result = schema.safeParse(value);
  return result.success;
}
