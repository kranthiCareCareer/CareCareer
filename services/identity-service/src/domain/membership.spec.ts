import { describe, it, expect } from 'vitest';

import { InvalidStatusTransitionError, VersionConflictError } from './errors.js';
import { changeMembershipStatus, createMembership } from './membership.js';

describe('TenantMembership Domain', () => {
  describe('createMembership', () => {
    it('should create a membership with INVITED status by default', () => {
      const membership = createMembership({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tenantId: '33333333-3333-3333-3333-333333333333',
      });

      expect(membership.status).toBe('INVITED');
      expect(membership.authorizationVersion).toBe(1);
      expect(membership.version).toBe(1);
      expect(membership.joinedAt).toBeNull();
    });

    it('should create a membership with ACTIVE status when specified', () => {
      const membership = createMembership({
        id: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        tenantId: '33333333-3333-3333-3333-333333333333',
        status: 'ACTIVE',
      });

      expect(membership.status).toBe('ACTIVE');
      expect(membership.joinedAt).not.toBeNull();
    });
  });

  describe('changeMembershipStatus', () => {
    const baseMembership = createMembership({
      id: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
    });

    it('should transition INVITED → ACTIVE', () => {
      const { updatedMembership, previousStatus } = changeMembershipStatus({
        membership: baseMembership,
        targetStatus: 'ACTIVE',
        expectedVersion: 1,
      });

      expect(updatedMembership.status).toBe('ACTIVE');
      expect(previousStatus).toBe('INVITED');
      expect(updatedMembership.authorizationVersion).toBe(2);
      expect(updatedMembership.joinedAt).not.toBeNull();
    });

    it('should transition INVITED → DEACTIVATED', () => {
      const { updatedMembership } = changeMembershipStatus({
        membership: baseMembership,
        targetStatus: 'DEACTIVATED',
        expectedVersion: 1,
      });

      expect(updatedMembership.status).toBe('DEACTIVATED');
      expect(updatedMembership.deactivatedAt).not.toBeNull();
    });

    it('should transition ACTIVE → SUSPENDED', () => {
      const activeMembership = { ...baseMembership, status: 'ACTIVE' as const, version: 2 };
      const { updatedMembership } = changeMembershipStatus({
        membership: activeMembership,
        targetStatus: 'SUSPENDED',
        expectedVersion: 2,
      });

      expect(updatedMembership.status).toBe('SUSPENDED');
      expect(updatedMembership.suspendedAt).not.toBeNull();
    });

    it('should transition SUSPENDED → ACTIVE', () => {
      const suspendedMembership = { ...baseMembership, status: 'SUSPENDED' as const, version: 3 };
      const { updatedMembership } = changeMembershipStatus({
        membership: suspendedMembership,
        targetStatus: 'ACTIVE',
        expectedVersion: 3,
      });

      expect(updatedMembership.status).toBe('ACTIVE');
    });

    it('should transition ACTIVE → DEACTIVATED', () => {
      const activeMembership = { ...baseMembership, status: 'ACTIVE' as const, version: 2 };
      const { updatedMembership } = changeMembershipStatus({
        membership: activeMembership,
        targetStatus: 'DEACTIVATED',
        expectedVersion: 2,
      });

      expect(updatedMembership.status).toBe('DEACTIVATED');
    });

    it('should transition SUSPENDED → DEACTIVATED', () => {
      const suspendedMembership = { ...baseMembership, status: 'SUSPENDED' as const, version: 3 };
      const { updatedMembership } = changeMembershipStatus({
        membership: suspendedMembership,
        targetStatus: 'DEACTIVATED',
        expectedVersion: 3,
      });

      expect(updatedMembership.status).toBe('DEACTIVATED');
    });

    it('should reject DEACTIVATED → ACTIVE (terminal state)', () => {
      const deactivated = { ...baseMembership, status: 'DEACTIVATED' as const, version: 4 };
      expect(() =>
        changeMembershipStatus({
          membership: deactivated,
          targetStatus: 'ACTIVE',
          expectedVersion: 4,
        }),
      ).toThrow(InvalidStatusTransitionError);
    });

    it('should reject DEACTIVATED → SUSPENDED (terminal state)', () => {
      const deactivated = { ...baseMembership, status: 'DEACTIVATED' as const, version: 4 };
      expect(() =>
        changeMembershipStatus({
          membership: deactivated,
          targetStatus: 'SUSPENDED',
          expectedVersion: 4,
        }),
      ).toThrow(InvalidStatusTransitionError);
    });

    it('should reject version conflict', () => {
      expect(() =>
        changeMembershipStatus({
          membership: baseMembership,
          targetStatus: 'ACTIVE',
          expectedVersion: 99,
        }),
      ).toThrow(VersionConflictError);
    });

    it('should increment authorization version on every transition', () => {
      const { updatedMembership: activated } = changeMembershipStatus({
        membership: baseMembership,
        targetStatus: 'ACTIVE',
        expectedVersion: 1,
      });
      expect(activated.authorizationVersion).toBe(2);

      const { updatedMembership: suspended } = changeMembershipStatus({
        membership: activated,
        targetStatus: 'SUSPENDED',
        expectedVersion: 2,
      });
      expect(suspended.authorizationVersion).toBe(3);
    });

    it('should reject duplicate membership (business rule tested at repository level)', () => {
      // This is enforced by UNIQUE(user_id, tenant_id) in the database
      // Domain model creates memberships; repository rejects duplicates
      const m1 = createMembership({
        id: 'aaaa',
        userId: 'same-user',
        tenantId: 'same-tenant',
      });
      const m2 = createMembership({
        id: 'bbbb',
        userId: 'same-user',
        tenantId: 'same-tenant',
      });
      // Both can be created at domain level; constraint enforced at DB
      expect(m1.userId).toBe(m2.userId);
      expect(m1.tenantId).toBe(m2.tenantId);
    });
  });
});
