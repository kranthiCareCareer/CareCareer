import { describe, it, expect } from 'vitest';

import { filterMarketplaceShifts, type MarketplaceFilter } from './marketplace.js';
import type { Shift } from './shift.js';

describe('Marketplace Domain', () => {
  const now = new Date('2027-03-01T12:00:00Z');

  function makeShift(overrides: Partial<Shift> = {}): Shift {
    return {
      id: crypto.randomUUID(),
      tenantId: 'tenant-1',
      facilityId: 'facility-1',
      departmentId: undefined,
      status: 'PUBLISHED',
      role: 'RN',
      startTime: new Date('2027-03-02T07:00:00Z'),
      endTime: new Date('2027-03-02T19:00:00Z'),
      businessDate: '2027-03-02',
      requiredWorkerCount: 2,
      filledWorkerCount: 0,
      payRateCents: 5000,
      billRateCents: 7500,
      notes: undefined,
      publishedAt: new Date('2027-03-01T10:00:00Z'),
      cancelledAt: undefined,
      cancellationReason: undefined,
      version: 2,
      createdBy: 'scheduler-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe('filterMarketplaceShifts', () => {
    it('should return published shifts with capacity in the future', () => {
      const shifts = [makeShift()];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.availableSlots).toBe(2);
    });

    it('should include PARTIALLY_FILLED shifts', () => {
      const shifts = [makeShift({ status: 'PARTIALLY_FILLED', filledWorkerCount: 1 })];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.availableSlots).toBe(1);
    });

    it('should exclude DRAFT shifts', () => {
      const shifts = [makeShift({ status: 'DRAFT' })];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result).toHaveLength(0);
    });

    it('should exclude CANCELLED shifts', () => {
      const shifts = [makeShift({ status: 'CANCELLED' })];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result).toHaveLength(0);
    });

    it('should exclude FILLED shifts (no capacity)', () => {
      const shifts = [makeShift({ status: 'FILLED', filledWorkerCount: 2 })];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result).toHaveLength(0);
    });

    it('should exclude shifts where filled equals required', () => {
      const shifts = [makeShift({ filledWorkerCount: 2, requiredWorkerCount: 2 })];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result).toHaveLength(0);
    });

    it('should exclude shifts in the past', () => {
      const shifts = [makeShift({ startTime: new Date('2027-02-28T07:00:00Z') })];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result).toHaveLength(0);
    });

    it('should filter by role', () => {
      const shifts = [makeShift({ role: 'RN' }), makeShift({ role: 'CNA' })];
      const filter: MarketplaceFilter = { role: 'RN' };
      const result = filterMarketplaceShifts(shifts, filter, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe('RN');
    });

    it('should filter by facility', () => {
      const shifts = [makeShift({ facilityId: 'fac-a' }), makeShift({ facilityId: 'fac-b' })];
      const filter: MarketplaceFilter = { facilityId: 'fac-a' };
      const result = filterMarketplaceShifts(shifts, filter, now);
      expect(result).toHaveLength(1);
      expect(result[0]!.facilityId).toBe('fac-a');
    });

    it('should filter by date range (from)', () => {
      const shifts = [
        makeShift({ startTime: new Date('2027-03-02T07:00:00Z') }),
        makeShift({ startTime: new Date('2027-03-05T07:00:00Z') }),
      ];
      const filter: MarketplaceFilter = { dateFrom: new Date('2027-03-04T00:00:00Z') };
      const result = filterMarketplaceShifts(shifts, filter, now);
      expect(result).toHaveLength(1);
    });

    it('should filter by date range (to)', () => {
      const shifts = [
        makeShift({ startTime: new Date('2027-03-02T07:00:00Z') }),
        makeShift({ startTime: new Date('2027-03-10T07:00:00Z') }),
      ];
      const filter: MarketplaceFilter = { dateTo: new Date('2027-03-05T00:00:00Z') };
      const result = filterMarketplaceShifts(shifts, filter, now);
      expect(result).toHaveLength(1);
    });

    it('should sort by date ascending by default', () => {
      const shifts = [
        makeShift({ startTime: new Date('2027-03-05T07:00:00Z') }),
        makeShift({ startTime: new Date('2027-03-02T07:00:00Z') }),
      ];
      const result = filterMarketplaceShifts(shifts, {}, now);
      expect(result[0]!.startTime.getTime()).toBeLessThan(result[1]!.startTime.getTime());
    });

    it('should sort by facility when requested', () => {
      const shifts = [
        makeShift({ facilityId: 'zzz-facility' }),
        makeShift({ facilityId: 'aaa-facility' }),
      ];
      const filter: MarketplaceFilter = { sortBy: 'facility' };
      const result = filterMarketplaceShifts(shifts, filter, now);
      expect(result[0]!.facilityId).toBe('aaa-facility');
    });

    it('should return empty array for no matching shifts', () => {
      const result = filterMarketplaceShifts([], {}, now);
      expect(result).toHaveLength(0);
    });

    it('should map to MarketplaceShift shape (no internal fields)', () => {
      const shifts = [makeShift()];
      const result = filterMarketplaceShifts(shifts, {}, now);
      const item = result[0]!;
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('facilityId');
      expect(item).toHaveProperty('role');
      expect(item).toHaveProperty('startTime');
      expect(item).toHaveProperty('endTime');
      expect(item).toHaveProperty('payRateCents');
      expect(item).toHaveProperty('availableSlots');
      expect(item).not.toHaveProperty('tenantId');
      expect(item).not.toHaveProperty('billRateCents');
      expect(item).not.toHaveProperty('version');
    });
  });
});
