import { describe, it, expect } from 'vitest';

import { createDepartment } from './department.js';

describe('Department Domain', () => {
  const validInput = {
    tenantId: 'tenant-1',
    facilityId: 'facility-1',
    name: 'Emergency Department',
  };

  describe('createDepartment', () => {
    it('should create a department with valid input', () => {
      const dept = createDepartment(validInput);
      expect(dept.id).toBeDefined();
      expect(dept.tenantId).toBe('tenant-1');
      expect(dept.facilityId).toBe('facility-1');
      expect(dept.name).toBe('Emergency Department');
      expect(dept.status).toBe('ACTIVE');
      expect(dept.version).toBe(1);
    });

    it('should reject empty name', () => {
      expect(() => createDepartment({ ...validInput, name: '' })).toThrow(
        'Department name is required',
      );
    });

    it('should reject whitespace-only name', () => {
      expect(() => createDepartment({ ...validInput, name: '   ' })).toThrow(
        'Department name is required',
      );
    });

    it('should trim name whitespace', () => {
      const dept = createDepartment({ ...validInput, name: '  ICU  ' });
      expect(dept.name).toBe('ICU');
    });
  });
});
