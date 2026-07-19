import { describe, it, expect } from 'vitest';

import { isValidMembershipTransition } from './membership-status.js';

describe('MembershipStatus State Machine', () => {
  describe('valid transitions', () => {
    it('INVITED → ACTIVE', () =>
      expect(isValidMembershipTransition('INVITED', 'ACTIVE')).toBe(true));
    it('INVITED → DEACTIVATED', () =>
      expect(isValidMembershipTransition('INVITED', 'DEACTIVATED')).toBe(true));
    it('ACTIVE → SUSPENDED', () =>
      expect(isValidMembershipTransition('ACTIVE', 'SUSPENDED')).toBe(true));
    it('ACTIVE → DEACTIVATED', () =>
      expect(isValidMembershipTransition('ACTIVE', 'DEACTIVATED')).toBe(true));
    it('SUSPENDED → ACTIVE', () =>
      expect(isValidMembershipTransition('SUSPENDED', 'ACTIVE')).toBe(true));
    it('SUSPENDED → DEACTIVATED', () =>
      expect(isValidMembershipTransition('SUSPENDED', 'DEACTIVATED')).toBe(true));
  });

  describe('invalid transitions', () => {
    it('DEACTIVATED → ACTIVE (terminal)', () =>
      expect(isValidMembershipTransition('DEACTIVATED', 'ACTIVE')).toBe(false));
    it('DEACTIVATED → SUSPENDED (terminal)', () =>
      expect(isValidMembershipTransition('DEACTIVATED', 'SUSPENDED')).toBe(false));
    it('DEACTIVATED → INVITED (terminal)', () =>
      expect(isValidMembershipTransition('DEACTIVATED', 'INVITED')).toBe(false));
    it('INVITED → SUSPENDED (invalid)', () =>
      expect(isValidMembershipTransition('INVITED', 'SUSPENDED')).toBe(false));
    it('ACTIVE → INVITED (invalid)', () =>
      expect(isValidMembershipTransition('ACTIVE', 'INVITED')).toBe(false));
    it('SUSPENDED → INVITED (invalid)', () =>
      expect(isValidMembershipTransition('SUSPENDED', 'INVITED')).toBe(false));
    it('ACTIVE → ACTIVE (self)', () =>
      expect(isValidMembershipTransition('ACTIVE', 'ACTIVE')).toBe(false));
  });
});
