/**
 * Typed application errors for the staffing-service domain.
 *
 * These errors are caught by a centralized exception filter and mapped
 * to appropriate HTTP status codes. Internal messages are never exposed.
 */

/** Base class for all staffing domain errors */
export abstract class StaffingDomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Resource not found within the authenticated tenant */
export class CredentialNotFoundError extends StaffingDomainError {
  readonly code = 'CREDENTIAL_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(credentialId: string) {
    super(`Credential not found: ${credentialId}`);
  }
}

/** Credential does not belong to the worker in the URL path */
export class CredentialWorkerMismatchError extends StaffingDomainError {
  readonly code = 'CREDENTIAL_WORKER_MISMATCH';
  readonly httpStatus = 404;

  constructor() {
    super('Credential does not belong to this worker');
  }
}

/** Invalid state machine transition */
export class InvalidCredentialTransitionError extends StaffingDomainError {
  readonly code = 'INVALID_CREDENTIAL_TRANSITION';
  readonly httpStatus = 400;

  constructor(currentStatus: string, targetStatus: string) {
    super(`Cannot transition from ${currentStatus} to ${targetStatus}`);
  }
}

/** Optimistic concurrency conflict */
export class VersionConflictError extends StaffingDomainError {
  readonly code = 'VERSION_CONFLICT';
  readonly httpStatus = 409;

  constructor(entity: string, id: string) {
    super(`Version conflict on ${entity}: ${id}`);
  }
}

/** Authenticated principal is missing required identity context */
export class TenantContextMissingError extends StaffingDomainError {
  readonly code = 'TENANT_CONTEXT_MISSING';
  readonly httpStatus = 401;

  constructor(field: string) {
    super(`Authenticated principal missing: ${field}`);
  }
}

/** Worker not found within the authenticated tenant */
export class WorkerNotFoundError extends StaffingDomainError {
  readonly code = 'WORKER_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(workerId: string) {
    super(`Worker not found: ${workerId}`);
  }
}

/** Facility not found within the authenticated tenant */
export class FacilityNotFoundError extends StaffingDomainError {
  readonly code = 'FACILITY_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(facilityId: string) {
    super(`Facility not found: ${facilityId}`);
  }
}

/** Invalid request body or parameters */
export class InvalidRequestError extends StaffingDomainError {
  readonly code = 'INVALID_REQUEST';
  readonly httpStatus = 400;

  readonly details: Array<{ path: string; message: string }> | undefined;

  constructor(message: string, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.details = details;
  }
}
