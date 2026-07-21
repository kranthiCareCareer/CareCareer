import { describe, it, expect } from 'vitest';

import { createFacility } from './facility.js';

describe('Facility Domain', () => {
  const validInput = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    name: 'Harborview Medical Center',
    timezone: 'America/Los_Angeles',
  };

  describe('createFacility', () => {
    it('should create a facility with valid input', () => {
      const facility = createFacility(validInput);
      expect(facility.id).toBeDefined();
      expect(facility.tenantId).toBe('tenant-1');
      expect(facility.clientId).toBe('client-1');
      expect(facility.name).toBe('Harborview Medical Center');
      expect(facility.timezone).toBe('America/Los_Angeles');
      expect(facility.status).toBe('ACTIVE');
      expect(facility.version).toBe(1);
      expect(facility.geofenceVersion).toBe(1);
      expect(facility.country).toBe('US');
    });

    it('should reject empty timezone', () => {
      expect(() => createFacility({ ...validInput, timezone: '' })).toThrow(
        'Facility timezone is mandatory',
      );
    });

    it('should reject whitespace-only timezone', () => {
      expect(() => createFacility({ ...validInput, timezone: '   ' })).toThrow(
        'Facility timezone is mandatory',
      );
    });

    it('should trim timezone whitespace', () => {
      const facility = createFacility({ ...validInput, timezone: ' US/Pacific ' });
      expect(facility.timezone).toBe('US/Pacific');
    });

    it('should include optional geofence when provided', () => {
      const facility = createFacility({
        ...validInput,
        latitude: 47.6062,
        longitude: -122.3321,
        geofenceRadiusMeters: 150,
      });
      expect(facility.latitude).toBe(47.6062);
      expect(facility.longitude).toBe(-122.3321);
      expect(facility.geofenceRadiusMeters).toBe(150);
    });

    it('should include address fields when provided', () => {
      const facility = createFacility({
        ...validInput,
        addressLine1: '325 9th Ave',
        city: 'Seattle',
        state: 'WA',
        zip: '98104',
      });
      expect(facility.addressLine1).toBe('325 9th Ave');
      expect(facility.city).toBe('Seattle');
      expect(facility.state).toBe('WA');
      expect(facility.zip).toBe('98104');
    });
  });
});
