import { describe, it, expect } from 'vitest';

import {
  changeWorkerStatus,
  createWorker,
  updateWorker,
  VALID_PROFESSIONS,
  type Worker,
} from './worker.js';

describe('Worker Domain', () => {
  const validInput = {
    tenantId: 'tenant-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    profession: 'RN' as const,
  };

  describe('createWorker', () => {
    it('should create a worker with valid input', () => {
      const worker = createWorker(validInput);
      expect(worker.id).toBeDefined();
      expect(worker.tenantId).toBe('tenant-1');
      expect(worker.firstName).toBe('Jane');
      expect(worker.lastName).toBe('Doe');
      expect(worker.email).toBe('jane.doe@example.com');
      expect(worker.profession).toBe('RN');
      expect(worker.status).toBe('APPLICANT');
      expect(worker.version).toBe(1);
    });

    it('should lowercase email', () => {
      const worker = createWorker({ ...validInput, email: 'Jane.DOE@Example.COM' });
      expect(worker.email).toBe('jane.doe@example.com');
    });

    it('should trim names', () => {
      const worker = createWorker({ ...validInput, firstName: '  Jane  ', lastName: '  Doe  ' });
      expect(worker.firstName).toBe('Jane');
      expect(worker.lastName).toBe('Doe');
    });

    it('should reject empty first name', () => {
      expect(() => createWorker({ ...validInput, firstName: '' })).toThrow(
        'first name is required',
      );
    });

    it('should reject empty last name', () => {
      expect(() => createWorker({ ...validInput, lastName: '' })).toThrow('last name is required');
    });

    it('should reject empty email', () => {
      expect(() => createWorker({ ...validInput, email: '' })).toThrow('email is required');
    });

    it('should reject invalid profession', () => {
      expect(() => createWorker({ ...validInput, profession: 'INVALID' as never })).toThrow(
        'Invalid profession',
      );
    });

    it('should accept all valid professions', () => {
      for (const prof of VALID_PROFESSIONS) {
        const worker = createWorker({ ...validInput, profession: prof });
        expect(worker.profession).toBe(prof);
      }
    });
  });

  describe('changeWorkerStatus', () => {
    const applicant: Worker = {
      id: 'w-1',
      tenantId: 't-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      status: 'APPLICANT',
      profession: 'RN',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };

    it('should allow APPLICANT → SCREENING', () => {
      const result = changeWorkerStatus(applicant, 'SCREENING');
      expect(result.status).toBe('SCREENING');
      expect(result.version).toBe(2);
    });

    it('should allow ACTIVE → BLOCKED', () => {
      const active: Worker = { ...applicant, status: 'ACTIVE' };
      const result = changeWorkerStatus(active, 'BLOCKED');
      expect(result.status).toBe('BLOCKED');
    });

    it('should allow BLOCKED → ACTIVE (unblock)', () => {
      const blocked: Worker = { ...applicant, status: 'BLOCKED' };
      const result = changeWorkerStatus(blocked, 'ACTIVE');
      expect(result.status).toBe('ACTIVE');
    });

    it('should allow any non-ALUMNI → ALUMNI', () => {
      const statuses = [
        'APPLICANT',
        'SCREENING',
        'QUALIFIED',
        'CREDENTIALING',
        'READY',
        'ACTIVE',
        'INACTIVE',
        'BLOCKED',
      ] as const;
      for (const s of statuses) {
        const worker: Worker = { ...applicant, status: s };
        const result = changeWorkerStatus(worker, 'ALUMNI');
        expect(result.status).toBe('ALUMNI');
      }
    });

    it('should reject ALUMNI → anything (terminal state)', () => {
      const alumni: Worker = { ...applicant, status: 'ALUMNI' };
      expect(() => changeWorkerStatus(alumni, 'ACTIVE')).toThrow('Invalid worker status');
    });

    it('should reject APPLICANT → ACTIVE (skip steps)', () => {
      expect(() => changeWorkerStatus(applicant, 'ACTIVE')).toThrow('Invalid worker status');
    });

    it('should reject INACTIVE → BLOCKED', () => {
      const inactive: Worker = { ...applicant, status: 'INACTIVE' };
      expect(() => changeWorkerStatus(inactive, 'BLOCKED')).toThrow('Invalid worker status');
    });
  });

  describe('updateWorker', () => {
    const worker: Worker = {
      id: 'w-1',
      tenantId: 't-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      status: 'ACTIVE',
      profession: 'RN',
      phone: '555-1234',
      specialty: 'ICU',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 3,
    };

    it('should update firstName and increment version', () => {
      const updated = updateWorker(worker, { firstName: 'Janet' });
      expect(updated.firstName).toBe('Janet');
      expect(updated.version).toBe(4);
    });

    it('should preserve unchanged fields', () => {
      const updated = updateWorker(worker, { homeCity: 'Seattle' });
      expect(updated.firstName).toBe('Jane');
      expect(updated.lastName).toBe('Doe');
      expect(updated.homeCity).toBe('Seattle');
    });

    it('should reject empty first name on update', () => {
      expect(() => updateWorker(worker, { firstName: '' })).toThrow('first name is required');
    });
  });
});
