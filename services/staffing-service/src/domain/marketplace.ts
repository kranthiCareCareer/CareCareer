/**
 * Marketplace domain logic.
 *
 * Filters published shifts for worker visibility based on:
 * - Shift must be PUBLISHED (not draft, cancelled, or filled)
 * - Shift must have capacity (filledWorkerCount < requiredWorkerCount)
 * - Shift must be in the future (startTime > now)
 * - Worker role must match shift role
 *
 * Eligibility filtering is handled at the application layer
 * (requires credential lookup — not pure domain logic).
 */

import type { Shift, ShiftRole } from './shift.js';

export interface MarketplaceFilter {
  readonly role?: ShiftRole | undefined;
  readonly facilityId?: string | undefined;
  readonly dateFrom?: Date | undefined;
  readonly dateTo?: Date | undefined;
  readonly sortBy?: 'date' | 'facility' | undefined;
}

export interface MarketplaceShift {
  readonly id: string;
  readonly facilityId: string;
  readonly departmentId?: string | undefined;
  readonly role: ShiftRole;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly businessDate: string;
  readonly payRateCents: number;
  readonly availableSlots: number;
}

/**
 * Filter shifts for marketplace visibility.
 * Pure function — no I/O.
 *
 * @param shifts All published shifts from the database
 * @param filter Marketplace query parameters
 * @param asOf Reference time for "future" check
 * @returns Shifts visible in the marketplace
 */
export function filterMarketplaceShifts(
  shifts: readonly Shift[],
  filter: MarketplaceFilter,
  asOf: Date = new Date(),
): MarketplaceShift[] {
  return shifts
    .filter((shift) => {
      // Must be published
      if (shift.status !== 'PUBLISHED' && shift.status !== 'PARTIALLY_FILLED') {
        return false;
      }
      // Must have capacity
      if (shift.filledWorkerCount >= shift.requiredWorkerCount) {
        return false;
      }
      // Must be in the future
      if (shift.startTime <= asOf) {
        return false;
      }
      // Role filter
      if (filter.role && shift.role !== filter.role) {
        return false;
      }
      // Facility filter
      if (filter.facilityId && shift.facilityId !== filter.facilityId) {
        return false;
      }
      // Date range filter
      if (filter.dateFrom && shift.startTime < filter.dateFrom) {
        return false;
      }
      if (filter.dateTo && shift.startTime > filter.dateTo) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filter.sortBy === 'facility') {
        return a.facilityId.localeCompare(b.facilityId);
      }
      // Default: sort by date ascending
      return a.startTime.getTime() - b.startTime.getTime();
    })
    .map((shift) => ({
      id: shift.id,
      facilityId: shift.facilityId,
      departmentId: shift.departmentId,
      role: shift.role,
      startTime: shift.startTime,
      endTime: shift.endTime,
      businessDate: shift.businessDate,
      payRateCents: shift.payRateCents,
      availableSlots: shift.requiredWorkerCount - shift.filledWorkerCount,
    }));
}
