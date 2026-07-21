import { describe, it, expect } from 'vitest';

import {
  evaluateDecision,
  type AuthorizationPrincipal,
  type AuthorizationRequest,
} from './authorization-decision.js';

describe('Authorization Decision', () => {
  const activePrincipal: AuthorizationPrincipal = {
    userId: 'user-1',
    userStatus: 'ACTIVE',
    userAuthorizationVersion: 1,
    tenantId: 'tenant-1',
    membershipId: 'membership-1',
    membershipStatus: 'ACTIVE',
    membershipAuthorizationVersion: 1,
    permissions: ['facility.read', 'facility.create', 'shift.read'],
    explicitDenials: ['facility.delete'],
  };

  const readFacility: AuthorizationRequest = {
    action: 'facility.read',
    resourceType: 'facility',
    resourceId: 'facility-123',
  };

  describe('Default deny', () => {
    it('should deny when no matching permission exists', () => {
      const result = evaluateDecision(activePrincipal, {
        action: 'payroll.process',
        resourceType: 'payroll',
      }, 'dec-1');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('NO_MATCHING_GRANT');
    });

    it('should deny for unknown action', () => {
      const result = evaluateDecision(activePrincipal, {
        action: 'unknown.action',
        resourceType: 'unknown',
      }, 'dec-2');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('NO_MATCHING_GRANT');
    });
  });

  describe('Matching permission grants', () => {
    it('should allow when permission matches action', () => {
      const result = evaluateDecision(activePrincipal, readFacility, 'dec-3');
      expect(result.outcome).toBe('ALLOWED');
      expect(result.reasonCode).toBe('GRANTED');
    });

    it('should include resource details in decision', () => {
      const result = evaluateDecision(activePrincipal, readFacility, 'dec-4');
      expect(result.resourceType).toBe('facility');
      expect(result.resourceId).toBe('facility-123');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.userId).toBe('user-1');
    });
  });

  describe('Explicit deny overrides grants', () => {
    it('should deny when action is explicitly denied even if permission exists', () => {
      // facility.delete is in explicitDenials
      const result = evaluateDecision(activePrincipal, {
        action: 'facility.delete',
        resourceType: 'facility',
        resourceId: 'facility-123',
      }, 'dec-5');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('EXPLICIT_DENY');
    });

    it('should deny explicit denial even with multiple role grants', () => {
      const multiRolePrincipal: AuthorizationPrincipal = {
        ...activePrincipal,
        permissions: ['facility.delete', 'facility.read', 'facility.create'],
        explicitDenials: ['facility.delete'],
      };
      const result = evaluateDecision(multiRolePrincipal, {
        action: 'facility.delete',
        resourceType: 'facility',
      }, 'dec-6');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('EXPLICIT_DENY');
    });
  });

  describe('User status enforcement', () => {
    it('should deny suspended user', () => {
      const suspended: AuthorizationPrincipal = {
        ...activePrincipal,
        userStatus: 'SUSPENDED',
      };
      const result = evaluateDecision(suspended, readFacility, 'dec-7');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('USER_SUSPENDED');
    });

    it('should deny deactivated user', () => {
      const deactivated: AuthorizationPrincipal = {
        ...activePrincipal,
        userStatus: 'DEACTIVATED',
      };
      const result = evaluateDecision(deactivated, readFacility, 'dec-8');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('USER_DEACTIVATED');
    });
  });

  describe('Membership status enforcement', () => {
    it('should deny suspended membership', () => {
      const suspended: AuthorizationPrincipal = {
        ...activePrincipal,
        membershipStatus: 'SUSPENDED',
      };
      const result = evaluateDecision(suspended, readFacility, 'dec-9');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('MEMBERSHIP_INVALID');
    });

    it('should deny deactivated membership', () => {
      const deactivated: AuthorizationPrincipal = {
        ...activePrincipal,
        membershipStatus: 'DEACTIVATED',
      };
      const result = evaluateDecision(deactivated, readFacility, 'dec-10');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('MEMBERSHIP_INVALID');
    });

    it('should deny invited membership', () => {
      const invited: AuthorizationPrincipal = {
        ...activePrincipal,
        membershipStatus: 'INVITED',
      };
      const result = evaluateDecision(invited, readFacility, 'dec-11');
      expect(result.outcome).toBe('DENIED');
      expect(result.reasonCode).toBe('MEMBERSHIP_INVALID');
    });
  });

  describe('Decision metadata', () => {
    it('should include policy version', () => {
      const result = evaluateDecision(activePrincipal, readFacility, 'dec-12');
      expect(result.policyVersion).toBe(1);
    });

    it('should include evaluation timestamp', () => {
      const before = new Date();
      const result = evaluateDecision(activePrincipal, readFacility, 'dec-13');
      expect(result.evaluatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should include the provided decision ID', () => {
      const result = evaluateDecision(activePrincipal, readFacility, 'my-decision-id');
      expect(result.decisionId).toBe('my-decision-id');
    });
  });

  describe('Precedence ordering', () => {
    it('should check user status before explicit deny', () => {
      // User suspended AND action explicitly denied — user status wins
      const principal: AuthorizationPrincipal = {
        ...activePrincipal,
        userStatus: 'SUSPENDED',
        explicitDenials: ['facility.read'],
      };
      const result = evaluateDecision(principal, readFacility, 'dec-14');
      expect(result.reasonCode).toBe('USER_SUSPENDED');
    });

    it('should check membership before explicit deny', () => {
      const principal: AuthorizationPrincipal = {
        ...activePrincipal,
        membershipStatus: 'SUSPENDED',
        explicitDenials: ['facility.read'],
      };
      const result = evaluateDecision(principal, readFacility, 'dec-15');
      expect(result.reasonCode).toBe('MEMBERSHIP_INVALID');
    });

    it('should check explicit deny before permission grant', () => {
      // Action is both granted AND denied — deny wins
      const principal: AuthorizationPrincipal = {
        ...activePrincipal,
        permissions: ['facility.delete'],
        explicitDenials: ['facility.delete'],
      };
      const result = evaluateDecision(principal, {
        action: 'facility.delete',
        resourceType: 'facility',
      }, 'dec-16');
      expect(result.reasonCode).toBe('EXPLICIT_DENY');
    });
  });
});
