import { describe, it, expect } from 'vitest';

import {
  CredentialNotFoundError,
  CredentialWorkerMismatchError,
  InvalidCredentialTransitionError,
  InvalidRequestError,
  StaffingDomainError,
  TenantContextMissingError,
  VersionConflictError,
  WorkerNotFoundError,
} from './errors.js';

describe('Staffing Domain Errors', () => {
  it('should all extend StaffingDomainError', () => {
    expect(new CredentialNotFoundError('id')).toBeInstanceOf(StaffingDomainError);
    expect(new CredentialWorkerMismatchError()).toBeInstanceOf(StaffingDomainError);
    expect(new InvalidCredentialTransitionError('A', 'B')).toBeInstanceOf(StaffingDomainError);
    expect(new VersionConflictError('credential', 'id')).toBeInstanceOf(StaffingDomainError);
    expect(new TenantContextMissingError('subject')).toBeInstanceOf(StaffingDomainError);
    expect(new WorkerNotFoundError('wid')).toBeInstanceOf(StaffingDomainError);
    expect(new InvalidRequestError('bad')).toBeInstanceOf(StaffingDomainError);
  });

  it('CredentialNotFoundError should have code and 404 status', () => {
    const err = new CredentialNotFoundError('cred-123');
    expect(err.code).toBe('CREDENTIAL_NOT_FOUND');
    expect(err.httpStatus).toBe(404);
    expect(err.message).toContain('cred-123');
  });

  it('CredentialWorkerMismatchError should have code and 404 status', () => {
    const err = new CredentialWorkerMismatchError();
    expect(err.code).toBe('CREDENTIAL_WORKER_MISMATCH');
    expect(err.httpStatus).toBe(404);
  });

  it('InvalidCredentialTransitionError should have code and 400 status', () => {
    const err = new InvalidCredentialTransitionError('UPLOADED', 'VERIFIED');
    expect(err.code).toBe('INVALID_CREDENTIAL_TRANSITION');
    expect(err.httpStatus).toBe(400);
    expect(err.message).toContain('UPLOADED');
    expect(err.message).toContain('VERIFIED');
  });

  it('VersionConflictError should have code and 409 status', () => {
    const err = new VersionConflictError('credential', 'cred-1');
    expect(err.code).toBe('VERSION_CONFLICT');
    expect(err.httpStatus).toBe(409);
  });

  it('TenantContextMissingError should have code and 401 status', () => {
    const err = new TenantContextMissingError('selectedTenantId');
    expect(err.code).toBe('TENANT_CONTEXT_MISSING');
    expect(err.httpStatus).toBe(401);
    expect(err.message).toContain('selectedTenantId');
  });

  it('InvalidRequestError should carry details', () => {
    const details = [{ path: 'name', message: 'required' }];
    const err = new InvalidRequestError('Bad input', details);
    expect(err.code).toBe('INVALID_REQUEST');
    expect(err.httpStatus).toBe(400);
    expect(err.details).toEqual(details);
  });

  it('InvalidRequestError details should be undefined when not provided', () => {
    const err = new InvalidRequestError('Bad');
    expect(err.details).toBeUndefined();
  });
});
