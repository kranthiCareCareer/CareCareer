/**
 * Facility domain entity.
 *
 * A facility represents a physical healthcare site where workers are placed.
 * It belongs to a client within a tenant.
 *
 * Required: timezone (mandatory for shift scheduling)
 * Optional: geofence (for clock-in validation)
 */

export interface Facility {
  readonly id: string;
  readonly tenantId: string;
  readonly clientId: string;
  readonly name: string;
  readonly status: FacilityStatus;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
  readonly country: string;
  readonly timezone: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly geofenceRadiusMeters?: number;
  readonly geofenceVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export type FacilityStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface CreateFacilityInput {
  readonly tenantId: string;
  readonly clientId: string;
  readonly name: string;
  readonly timezone: string;
  readonly addressLine1?: string;
  readonly city?: string;
  readonly state?: string;
  readonly zip?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly geofenceRadiusMeters?: number;
}

/**
 * Create a new facility entity.
 * Validates timezone is non-empty (mandatory for scheduling).
 */
export function createFacility(input: CreateFacilityInput): Facility {
  if (!input.timezone || input.timezone.trim() === '') {
    throw new Error('Facility timezone is mandatory');
  }

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    clientId: input.clientId,
    name: input.name,
    status: 'ACTIVE',
    addressLine1: input.addressLine1,
    city: input.city,
    state: input.state,
    zip: input.zip,
    country: 'US',
    timezone: input.timezone.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    geofenceRadiusMeters: input.geofenceRadiusMeters,
    geofenceVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };
}
