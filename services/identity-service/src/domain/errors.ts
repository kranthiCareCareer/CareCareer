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

export class MembershipNotFoundError extends Error {
  readonly code = 'MEMBERSHIP_NOT_FOUND';
  constructor(membershipId: string) {
    super(`Membership not found: ${membershipId}`);
    this.name = 'MembershipNotFoundError';
  }
}

export class DuplicateMembershipError extends Error {
  readonly code = 'DUPLICATE_MEMBERSHIP';
  constructor(userId: string, tenantId: string) {
    super(`Membership already exists for user ${userId} in tenant ${tenantId}`);
    this.name = 'DuplicateMembershipError';
  }
}

export class InvalidRoleAssignmentError extends Error {
  readonly code = 'INVALID_ROLE_ASSIGNMENT';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRoleAssignmentError';
  }
}

export class CustomRoleDisabledError extends Error {
  readonly code = 'CUSTOM_ROLE_DISABLED';
  constructor() {
    super('Custom role operations are disabled');
    this.name = 'CustomRoleDisabledError';
  }
}
