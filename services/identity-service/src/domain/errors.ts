/**
 * Domain errors for the identity service.
 * Each error has a stable code for API error envelopes.
 */

export class UserNotFoundError extends Error {
  readonly code = 'USER_NOT_FOUND';
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export class DuplicateUserError extends Error {
  readonly code = 'DUPLICATE_USER';
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateUserError';
  }
}

export class InvalidStatusTransitionError extends Error {
  readonly code = 'INVALID_STATUS_TRANSITION';
  readonly from: string;
  readonly to: string;
  constructor(from: string, to: string) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidStatusTransitionError';
    this.from = from;
    this.to = to;
  }
}

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(entity: string, expected: number, actual: number) {
    super(
      `Optimistic concurrency conflict on ${entity}: expected version ${expected}, got ${actual}`,
    );
    this.name = 'VersionConflictError';
  }
}

export class DuplicateExternalIdentityError extends Error {
  readonly code = 'DUPLICATE_EXTERNAL_IDENTITY';
  constructor(issuer: string, subject: string) {
    super(`External identity already exists: issuer=${issuer}, subject=${subject}`);
    this.name = 'DuplicateExternalIdentityError';
  }
}

export class ExternalIdentityNotFoundError extends Error {
  readonly code = 'EXTERNAL_IDENTITY_NOT_FOUND';
  constructor(id: string) {
    super(`External identity not found: ${id}`);
    this.name = 'ExternalIdentityNotFoundError';
  }
}
