/**
 * User lifecycle statuses and valid transitions.
 *
 * State machine:
 *   ACTIVE → SUSPENDED
 *   SUSPENDED → ACTIVE
 *   ACTIVE → DEACTIVATED
 *   SUSPENDED → DEACTIVATED
 *   DEACTIVATED → (terminal, no outbound transitions)
 */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

const VALID_TRANSITIONS: Record<UserStatus, UserStatus[]> = {
  ACTIVE: ['SUSPENDED', 'DEACTIVATED'],
  SUSPENDED: ['ACTIVE', 'DEACTIVATED'],
  DEACTIVATED: [],
};

/**
 * Check whether a status transition is valid.
 */
export function isValidTransition(from: UserStatus, to: UserStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
