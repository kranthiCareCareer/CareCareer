/**
 * Worker domain entity.
 *
 * A worker is a healthcare professional registered on the platform.
 * Workers have a lifecycle state machine that controls their eligibility
 * for shift assignment and clock-in.
 *
 * PII handling: firstName, lastName, email, phone are CONFIDENTIAL.
 * These fields must never appear in logs.
 */

export type WorkerStatus =
  | 'APPLICANT'
  | 'SCREENING'
  | 'QUALIFIED'
  | 'CREDENTIALING'
  | 'READY'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'BLOCKED'
  | 'ALUMNI';

export type WorkerProfession = 'RN' | 'LPN' | 'CNA' | 'RT' | 'ALLIED';

export interface Worker {
  readonly id: string;
  readonly tenantId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string | undefined;
  readonly status: WorkerStatus;
  readonly profession: WorkerProfession;
  readonly specialty?: string | undefined;
  readonly homeLatitude?: number | undefined;
  readonly homeLongitude?: number | undefined;
  readonly homeCity?: string | undefined;
  readonly homeState?: string | undefined;
  readonly homeZip?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ExternalReference {
  readonly id: string;
  readonly tenantId: string;
  readonly workerId: string;
  readonly systemName: string;
  readonly externalId: string;
  readonly createdAt: Date;
}

export const VALID_PROFESSIONS: readonly WorkerProfession[] = [
  'RN', 'LPN', 'CNA', 'RT', 'ALLIED',
];

export interface CreateWorkerInput {
  readonly tenantId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string | undefined;
  readonly profession: WorkerProfession;
  readonly specialty?: string | undefined;
  readonly homeLatitude?: number | undefined;
  readonly homeLongitude?: number | undefined;
  readonly homeCity?: string | undefined;
  readonly homeState?: string | undefined;
  readonly homeZip?: string | undefined;
}

/**
 * Create a new worker. Initial status is APPLICANT.
 */
export function createWorker(input: CreateWorkerInput): Worker {
  if (!input.firstName || input.firstName.trim() === '') {
    throw new Error('Worker first name is required');
  }
  if (!input.lastName || input.lastName.trim() === '') {
    throw new Error('Worker last name is required');
  }
  if (!input.email || input.email.trim() === '') {
    throw new Error('Worker email is required');
  }
  if (!VALID_PROFESSIONS.includes(input.profession)) {
    throw new Error(`Invalid profession: ${input.profession}`);
  }

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim(),
    status: 'APPLICANT',
    profession: input.profession,
    specialty: input.specialty?.trim(),
    homeLatitude: input.homeLatitude,
    homeLongitude: input.homeLongitude,
    homeCity: input.homeCity?.trim(),
    homeState: input.homeState?.trim(),
    homeZip: input.homeZip?.trim(),
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };
}

/**
 * Valid status transitions for the worker lifecycle.
 */
const VALID_WORKER_STATUS_TRANSITIONS: Record<WorkerStatus, WorkerStatus[]> = {
  APPLICANT: ['SCREENING', 'ALUMNI'],
  SCREENING: ['QUALIFIED', 'ALUMNI'],
  QUALIFIED: ['CREDENTIALING', 'ALUMNI'],
  CREDENTIALING: ['READY', 'ALUMNI'],
  READY: ['ACTIVE', 'ALUMNI'],
  ACTIVE: ['INACTIVE', 'BLOCKED', 'ALUMNI'],
  INACTIVE: ['ACTIVE', 'ALUMNI'],
  BLOCKED: ['ACTIVE', 'ALUMNI'],
  ALUMNI: [],
};

/**
 * Transition worker to a new status.
 * Validates the transition is allowed by the state machine.
 */
export function changeWorkerStatus(worker: Worker, newStatus: WorkerStatus): Worker {
  const allowed = VALID_WORKER_STATUS_TRANSITIONS[worker.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid worker status transition: ${worker.status} → ${newStatus}`,
    );
  }

  return {
    ...worker,
    status: newStatus,
    updatedAt: new Date(),
    version: worker.version + 1,
  };
}

export interface UpdateWorkerInput {
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
  readonly phone?: string | undefined;
  readonly specialty?: string | undefined;
  readonly homeLatitude?: number | undefined;
  readonly homeLongitude?: number | undefined;
  readonly homeCity?: string | undefined;
  readonly homeState?: string | undefined;
  readonly homeZip?: string | undefined;
}

/**
 * Update a worker's profile fields.
 * Email and profession cannot be changed after creation.
 */
export function updateWorker(worker: Worker, input: UpdateWorkerInput): Worker {
  const firstName = input.firstName?.trim() ?? worker.firstName;
  const lastName = input.lastName?.trim() ?? worker.lastName;

  if (!firstName) throw new Error('Worker first name is required');
  if (!lastName) throw new Error('Worker last name is required');

  return {
    ...worker,
    firstName,
    lastName,
    phone: input.phone !== undefined ? input.phone.trim() : worker.phone,
    specialty: input.specialty !== undefined ? input.specialty.trim() : worker.specialty,
    homeLatitude: input.homeLatitude ?? worker.homeLatitude,
    homeLongitude: input.homeLongitude ?? worker.homeLongitude,
    homeCity: input.homeCity ?? worker.homeCity,
    homeState: input.homeState ?? worker.homeState,
    homeZip: input.homeZip ?? worker.homeZip,
    updatedAt: new Date(),
    version: worker.version + 1,
  };
}
