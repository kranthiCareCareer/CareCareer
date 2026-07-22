import { describe, it, expect } from 'vitest';

import { changeFacilityStatus, createFacility, updateFacility, type Facility } from './facility.js';

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

describe('updateFacility', () => {
  const baseFacility: Facility = {
    id: 'f-1',
    tenantId: 't-1',
    clientId: 'c-1',
    name: 'Original',
    status: 'ACTIVE',
    country: 'US',
    timezone: 'US/Pacific',
    geofenceVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    latitude: 47.0,
    longitude: -122.0,
    geofenceRadiusMeters: 100,
  };

  it('should increment version on update', () => {
    const updated = updateFacility(baseFacility, { name: 'New Name' });
    expect(updated.version).toBe(2);
    expect(updated.name).toBe('New Name');
  });

  it('should increment geofenceVersion when geofence fields change', () => {
    const updated = updateFacility(baseFacility, { latitude: 48.0 });
    expect(updated.geofenceVersion).toBe(2);
    expect(updated.latitude).toBe(48.0);
  });

  it('should NOT increment geofenceVersion when non-geofence fields change', () => {
    const updated = updateFacility(baseFacility, { name: 'Renamed' });
    expect(updated.geofenceVersion).toBe(1);
  });

  it('should reject empty timezone on update', () => {
    expect(() => updateFacility(baseFacility, { timezone: '' })).toThrow(
      'Facility timezone is mandatory',
    );
  });

  it('should preserve unchanged fields', () => {
    const updated = updateFacility(baseFacility, { city: 'Seattle' });
    expect(updated.name).toBe('Original');
    expect(updated.timezone).toBe('US/Pacific');
    expect(updated.city).toBe('Seattle');
  });
});

describe('changeFacilityStatus', () => {
  const active: Facility = {
    id: 'f-1',
    tenantId: 't-1',
    clientId: 'c-1',
    name: 'Test',
    status: 'ACTIVE',
    country: 'US',
    timezone: 'US/Pacific',
    geofenceVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };

  it('should allow ACTIVE → INACTIVE', () => {
    const result = changeFacilityStatus(active, 'INACTIVE');
    expect(result.status).toBe('INACTIVE');
    expect(result.version).toBe(2);
  });

  it('should allow ACTIVE → SUSPENDED', () => {
    const result = changeFacilityStatus(active, 'SUSPENDED');
    expect(result.status).toBe('SUSPENDED');
  });

  it('should allow INACTIVE → ACTIVE', () => {
    const inactive = { ...active, status: 'INACTIVE' as const };
    const result = changeFacilityStatus(inactive, 'ACTIVE');
    expect(result.status).toBe('ACTIVE');
  });

  it('should reject INACTIVE → SUSPENDED', () => {
    const inactive = { ...active, status: 'INACTIVE' as const };
    expect(() => changeFacilityStatus(inactive, 'SUSPENDED')).toThrow('Invalid status transition');
  });

  it('should reject ACTIVE → ACTIVE (no-op)', () => {
    expect(() => changeFacilityStatus(active, 'ACTIVE')).toThrow('Invalid status transition');
  });
});
