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
  readonly addressLine1?: string | undefined;
  readonly addressLine2?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly zip?: string | undefined;
  readonly country: string;
  readonly timezone: string;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly geofenceRadiusMeters?: number | undefined;
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
  readonly addressLine1?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly zip?: string | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly geofenceRadiusMeters?: number | undefined;
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

export interface UpdateFacilityInput {
  readonly name?: string | undefined;
  readonly timezone?: string | undefined;
  readonly addressLine1?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly zip?: string | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly geofenceRadiusMeters?: number | undefined;
}

/**
 * Apply an update to a facility, returning a new version.
 * Increments geofenceVersion if geofence fields change.
 * Increments version for optimistic concurrency.
 */
export function updateFacility(facility: Facility, input: UpdateFacilityInput): Facility {
  const newTimezone = input.timezone?.trim() ?? facility.timezone;
  if (!newTimezone || newTimezone === '') {
    throw new Error('Facility timezone is mandatory');
  }

  const geofenceChanged =
    (input.latitude !== undefined && input.latitude !== facility.latitude) ||
    (input.longitude !== undefined && input.longitude !== facility.longitude) ||
    (input.geofenceRadiusMeters !== undefined &&
      input.geofenceRadiusMeters !== facility.geofenceRadiusMeters);

  return {
    ...facility,
    name: input.name ?? facility.name,
    timezone: newTimezone,
    addressLine1: input.addressLine1 ?? facility.addressLine1,
    city: input.city ?? facility.city,
    state: input.state ?? facility.state,
    zip: input.zip ?? facility.zip,
    latitude: input.latitude ?? facility.latitude,
    longitude: input.longitude ?? facility.longitude,
    geofenceRadiusMeters: input.geofenceRadiusMeters ?? facility.geofenceRadiusMeters,
    geofenceVersion: geofenceChanged ? facility.geofenceVersion + 1 : facility.geofenceVersion,
    updatedAt: new Date(),
    version: facility.version + 1,
  };
}

const VALID_STATUS_TRANSITIONS: Record<FacilityStatus, FacilityStatus[]> = {
  ACTIVE: ['INACTIVE', 'SUSPENDED'],
  INACTIVE: ['ACTIVE'],
  SUSPENDED: ['ACTIVE'],
};

/**
 * Change facility status with transition validation.
 * Only allowed transitions proceed; invalid ones throw.
 */
export function changeFacilityStatus(facility: Facility, newStatus: FacilityStatus): Facility {
  const allowed = VALID_STATUS_TRANSITIONS[facility.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${facility.status} → ${newStatus}`,
    );
  }

  return {
    ...facility,
    status: newStatus,
    updatedAt: new Date(),
    version: facility.version + 1,
  };
}
