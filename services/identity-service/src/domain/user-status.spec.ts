import { describe, it, expect } from 'vitest';

import { isValidTransition } from './user-status.js';

describe('UserStatus State Machine', () => {
  describe('valid transitions', () => {
    it('ACTIVE → SUSPENDED', () => expect(isValidTransition('ACTIVE', 'SUSPENDED')).toBe(true));
    it('ACTIVE → DEACTIVATED', () => expect(isValidTransition('ACTIVE', 'DEACTIVATED')).toBe(true));
    it('SUSPENDED → ACTIVE', () => expect(isValidTransition('SUSPENDED', 'ACTIVE')).toBe(true));
    it('SUSPENDED → DEACTIVATED', () =>
      expect(isValidTransition('SUSPENDED', 'DEACTIVATED')).toBe(true));
  });

  describe('invalid transitions', () => {
    it('DEACTIVATED → ACTIVE (terminal)', () =>
      expect(isValidTransition('DEACTIVATED', 'ACTIVE')).toBe(false));
    it('DEACTIVATED → SUSPENDED (terminal)', () =>
      expect(isValidTransition('DEACTIVATED', 'SUSPENDED')).toBe(false));
    it('ACTIVE → ACTIVE (self)', () => expect(isValidTransition('ACTIVE', 'ACTIVE')).toBe(false));
    it('SUSPENDED → SUSPENDED (self)', () =>
      expect(isValidTransition('SUSPENDED', 'SUSPENDED')).toBe(false));
    it('DEACTIVATED → DEACTIVATED (self)', () =>
      expect(isValidTransition('DEACTIVATED', 'DEACTIVATED')).toBe(false));
  });
});
