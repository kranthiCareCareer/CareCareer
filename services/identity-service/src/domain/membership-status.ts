/**
 * Tenant membership lifecycle statuses and valid transitions.
 *
 * State machine:
 *   INVITED → ACTIVE
 *   INVITED → DEACTIVATED
 *   ACTIVE → SUSPENDED
 *   SUSPENDED → ACTIVE
 *   ACTIVE → DEACTIVATED
 *   SUSPENDED → DEACTIVATED
 *   DEACTIVATED → (terminal, no outbound transitions)
 *
 * Note: INVITED → EXPIRED is handled by GP-03.5 invitation process.
 */
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

const VALID_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  INVITED: ['ACTIVE', 'DEACTIVATED'],
  ACTIVE: ['SUSPENDED', 'DEACTIVATED'],
  SUSPENDED: ['ACTIVE', 'DEACTIVATED'],
  DEACTIVATED: [],
};

/**
 * Check whether a membership status transition is valid.
 */
export function isValidMembershipTransition(from: MembershipStatus, to: MembershipStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
