import { describe, it, expect } from 'vitest';

import { changeDepartmentStatus, createDepartment, type Department } from './department.js';

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

describe('changeDepartmentStatus', () => {
  const active: Department = {
    id: 'd-1', tenantId: 't-1', facilityId: 'f-1', name: 'ER',
    status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(), version: 1,
  };

  it('should allow ACTIVE → INACTIVE', () => {
    const result = changeDepartmentStatus(active, 'INACTIVE');
    expect(result.status).toBe('INACTIVE');
    expect(result.version).toBe(2);
  });

  it('should allow INACTIVE → ACTIVE', () => {
    const inactive: Department = { ...active, status: 'INACTIVE' };
    const result = changeDepartmentStatus(inactive, 'ACTIVE');
    expect(result.status).toBe('ACTIVE');
  });

  it('should reject ACTIVE → ACTIVE', () => {
    expect(() => changeDepartmentStatus(active, 'ACTIVE')).toThrow('Invalid department status');
  });

  it('should reject INACTIVE → INACTIVE', () => {
    const inactive: Department = { ...active, status: 'INACTIVE' };
    expect(() => changeDepartmentStatus(inactive, 'INACTIVE')).toThrow('Invalid department status');
  });
});
