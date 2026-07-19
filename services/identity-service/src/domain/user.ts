import { InvalidStatusTransitionError, VersionConflictError } from './errors.js';
import { isValidTransition, type UserStatus } from './user-status.js';

/**
 * User domain entity.
 * Represents a CareCareer platform user (identity, not authentication).
 */
export interface User {
  readonly id: string;
  readonly displayName: string;
  readonly primaryEmail: string;
  readonly status: UserStatus;
  readonly authorizationVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CreateUserParams {
  readonly id: string;
  readonly displayName: string;
  readonly primaryEmail: string;
}

export interface ChangeUserStatusParams {
  readonly user: User;
  readonly targetStatus: UserStatus;
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface ChangeUserStatusResult {
  readonly updatedUser: User;
  readonly previousStatus: UserStatus;
}

/**
 * Create a new user with initial ACTIVE status.
 */
export function createUser(params: CreateUserParams): User {
  const now = new Date();
  return {
    id: params.id,
    displayName: params.displayName.trim(),
    primaryEmail: params.primaryEmail.trim().toLowerCase(),
    status: 'ACTIVE',
    authorizationVersion: 1,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Transition a user to a new status.
 * Validates the state machine and increments authorization version.
 */
export function changeUserStatus(params: ChangeUserStatusParams): ChangeUserStatusResult {
  const { user, targetStatus, expectedVersion } = params;

  if (user.version !== expectedVersion) {
    throw new VersionConflictError('user', expectedVersion, user.version);
  }

  if (!isValidTransition(user.status, targetStatus)) {
    throw new InvalidStatusTransitionError(user.status, targetStatus);
  }

  const updatedUser: User = {
    ...user,
    status: targetStatus,
    authorizationVersion: user.authorizationVersion + 1,
    version: user.version + 1,
    updatedAt: new Date(),
  };

  return {
    updatedUser,
    previousStatus: user.status,
  };
}
