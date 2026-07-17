import { describe, expect, it } from 'vitest';

import { FEATURE_MODULE_REQUIREMENTS, validateFeatureValue } from './feature-configuration.js';

describe('Feature Configuration Domain', () => {
  describe('validateFeatureValue', () => {
    it('should accept valid boolean for boolean feature', () => {
      expect(validateFeatureValue('scheduling.auto_confirm_enabled', true)).toBe(true);
      expect(validateFeatureValue('scheduling.auto_confirm_enabled', false)).toBe(true);
    });

    it('should reject invalid type for boolean feature', () => {
      expect(validateFeatureValue('scheduling.auto_confirm_enabled', 'yes')).toBe(false);
      expect(validateFeatureValue('scheduling.auto_confirm_enabled', 1)).toBe(false);
    });

    it('should accept valid number within range', () => {
      expect(validateFeatureValue('scheduling.max_workers_per_shift', 5)).toBe(true);
      expect(validateFeatureValue('scheduling.max_workers_per_shift', 1)).toBe(true);
      expect(validateFeatureValue('scheduling.max_workers_per_shift', 100)).toBe(true);
    });

    it('should reject number outside range', () => {
      expect(validateFeatureValue('scheduling.max_workers_per_shift', 0)).toBe(false);
      expect(validateFeatureValue('scheduling.max_workers_per_shift', 101)).toBe(false);
      expect(validateFeatureValue('scheduling.max_workers_per_shift', -1)).toBe(false);
    });

    it('should reject non-integer for integer feature', () => {
      expect(validateFeatureValue('scheduling.max_workers_per_shift', 3.5)).toBe(false);
    });

    it('should validate geofence settings', () => {
      expect(validateFeatureValue('timekeeping.geofence_required', true)).toBe(true);
      expect(validateFeatureValue('timekeeping.allowed_clock_in_minutes_before', 30)).toBe(true);
      expect(validateFeatureValue('timekeeping.allowed_clock_in_minutes_before', -1)).toBe(false);
      expect(validateFeatureValue('timekeeping.allowed_clock_in_minutes_before', 200)).toBe(false);
    });
  });

  describe('FEATURE_MODULE_REQUIREMENTS', () => {
    it('should map scheduling features to scheduling module', () => {
      expect(FEATURE_MODULE_REQUIREMENTS['scheduling.auto_confirm_enabled']).toBe('scheduling');
      expect(FEATURE_MODULE_REQUIREMENTS['scheduling.max_workers_per_shift']).toBe('scheduling');
    });

    it('should map timekeeping features to timekeeping module', () => {
      expect(FEATURE_MODULE_REQUIREMENTS['timekeeping.geofence_required']).toBe('timekeeping');
    });

    it('should map notifications to core module', () => {
      expect(FEATURE_MODULE_REQUIREMENTS['notifications.sms_enabled']).toBe('core');
      expect(FEATURE_MODULE_REQUIREMENTS['notifications.push_enabled']).toBe('core');
    });
  });
});
