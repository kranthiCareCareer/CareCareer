import { describe, it, expect } from 'vitest';

import { InvalidStatusTransitionError, VersionConflictError } from './errors.js';
import { createUser, changeUserStatus } from './user.js';

describe('User Domain', () => {
  describe('createUser', () => {
    it('should create a user with ACTIVE status', () => {
      const user = createUser({
        id: '11111111-1111-1111-1111-111111111111',
        displayName: 'John Doe',
        primaryEmail: 'john@example.com',
      });

      expect(user.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(user.displayName).toBe('John Doe');
      expect(user.primaryEmail).toBe('john@example.com');
      expect(user.status).toBe('ACTIVE');
      expect(user.authorizationVersion).toBe(1);
      expect(user.version).toBe(1);
    });

    it('should trim display name and normalize email', () => {
      const user = createUser({
        id: '11111111-1111-1111-1111-111111111111',
        displayName: '  Jane Doe  ',
        primaryEmail: '  JANE@Example.COM  ',
      });

      expect(user.displayName).toBe('Jane Doe');
      expect(user.primaryEmail).toBe('jane@example.com');
    });
  });

  describe('changeUserStatus', () => {
    const activeUser = createUser({
      id: '11111111-1111-1111-1111-111111111111',
      displayName: 'Test User',
      primaryEmail: 'test@example.com',
    });

    it('should transition ACTIVE → SUSPENDED', () => {
      const { updatedUser, previousStatus } = changeUserStatus({
        user: activeUser,
        targetStatus: 'SUSPENDED',
        expectedVersion: 1,
        reason: 'Policy violation',
      });

      expect(updatedUser.status).toBe('SUSPENDED');
      expect(previousStatus).toBe('ACTIVE');
      expect(updatedUser.authorizationVersion).toBe(2);
      expect(updatedUser.version).toBe(2);
    });

    it('should transition ACTIVE → DEACTIVATED', () => {
      const { updatedUser } = changeUserStatus({
        user: activeUser,
        targetStatus: 'DEACTIVATED',
        expectedVersion: 1,
        reason: 'Account closure',
      });

      expect(updatedUser.status).toBe('DEACTIVATED');
      expect(updatedUser.authorizationVersion).toBe(2);
    });

    it('should transition SUSPENDED → ACTIVE', () => {
      const suspendedUser = { ...activeUser, status: 'SUSPENDED' as const, version: 2 };
      const { updatedUser } = changeUserStatus({
        user: suspendedUser,
        targetStatus: 'ACTIVE',
        expectedVersion: 2,
        reason: 'Reinstatement',
      });

      expect(updatedUser.status).toBe('ACTIVE');
    });

    it('should transition SUSPENDED → DEACTIVATED', () => {
      const suspendedUser = { ...activeUser, status: 'SUSPENDED' as const, version: 2 };
      const { updatedUser } = changeUserStatus({
        user: suspendedUser,
        targetStatus: 'DEACTIVATED',
        expectedVersion: 2,
        reason: 'Permanent removal',
      });

      expect(updatedUser.status).toBe('DEACTIVATED');
    });

    it('should reject DEACTIVATED → ACTIVE (terminal state)', () => {
      const deactivatedUser = { ...activeUser, status: 'DEACTIVATED' as const, version: 2 };
      expect(() =>
        changeUserStatus({
          user: deactivatedUser,
          targetStatus: 'ACTIVE',
          expectedVersion: 2,
          reason: 'Attempt to reactivate',
        }),
      ).toThrow(InvalidStatusTransitionError);
    });

    it('should reject DEACTIVATED → SUSPENDED (terminal state)', () => {
      const deactivatedUser = { ...activeUser, status: 'DEACTIVATED' as const, version: 2 };
      expect(() =>
        changeUserStatus({
          user: deactivatedUser,
          targetStatus: 'SUSPENDED',
          expectedVersion: 2,
          reason: 'Invalid',
        }),
      ).toThrow(InvalidStatusTransitionError);
    });

    it('should reject version conflict', () => {
      expect(() =>
        changeUserStatus({
          user: activeUser,
          targetStatus: 'SUSPENDED',
          expectedVersion: 99,
          reason: 'Stale version',
        }),
      ).toThrow(VersionConflictError);
    });

    it('should increment authorization version on each transition', () => {
      const { updatedUser: suspended } = changeUserStatus({
        user: activeUser,
        targetStatus: 'SUSPENDED',
        expectedVersion: 1,
        reason: 'First transition',
      });

      expect(suspended.authorizationVersion).toBe(2);

      const { updatedUser: reactivated } = changeUserStatus({
        user: suspended,
        targetStatus: 'ACTIVE',
        expectedVersion: 2,
        reason: 'Second transition',
      });

      expect(reactivated.authorizationVersion).toBe(3);
    });
  });
});
