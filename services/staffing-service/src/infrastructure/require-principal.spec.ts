import { describe, it, expect } from 'vitest';

import { TenantContextMissingError } from '../domain/errors.js';

import type { AuthenticatedStaffingRequest } from './authenticated-request.js';
import { requirePrincipal } from './require-principal.js';

describe('requirePrincipal', () => {
  const validRequest: AuthenticatedStaffingRequest = {
    principal: {
      subject: 'user-1',
      selectedTenantId: 'tenant-1',
      membershipId: 'mem-1',
      sessionId: 'sess-1',
      userAuthorizationVersion: 3,
      membershipAuthorizationVersion: 5,
    },
    headers: {},
  };

  it('should return validated principal when all fields present', () => {
    const result = requirePrincipal(validRequest);
    expect(result.subject).toBe('user-1');
    expect(result.selectedTenantId).toBe('tenant-1');
    expect(result.membershipId).toBe('mem-1');
    expect(result.sessionId).toBe('sess-1');
    expect(result.userAuthorizationVersion).toBe(3);
    expect(result.membershipAuthorizationVersion).toBe(5);
  });

  it('should throw TenantContextMissingError when principal is undefined', () => {
    expect(() => requirePrincipal({ headers: {} } as AuthenticatedStaffingRequest)).toThrow(
      TenantContextMissingError,
    );
  });

  it('should throw when subject is missing', () => {
    const req = {
      principal: { ...validRequest.principal!, subject: undefined },
      headers: {},
    };
    expect(() => requirePrincipal(req as unknown as AuthenticatedStaffingRequest)).toThrow(
      'subject',
    );
  });

  it('should throw when selectedTenantId is missing', () => {
    const req = {
      principal: { ...validRequest.principal!, selectedTenantId: undefined },
      headers: {},
    };
    expect(() => requirePrincipal(req as unknown as AuthenticatedStaffingRequest)).toThrow(
      'selectedTenantId',
    );
  });

  it('should throw when membershipId is missing', () => {
    const req = {
      principal: { ...validRequest.principal!, membershipId: undefined },
      headers: {},
    };
    expect(() => requirePrincipal(req as unknown as AuthenticatedStaffingRequest)).toThrow(
      'membershipId',
    );
  });

  it('should throw when sessionId is missing', () => {
    const req = {
      principal: { ...validRequest.principal!, sessionId: undefined },
      headers: {},
    };
    expect(() => requirePrincipal(req as unknown as AuthenticatedStaffingRequest)).toThrow(
      'sessionId',
    );
  });

  it('should throw when userAuthorizationVersion is missing', () => {
    const req = {
      principal: { ...validRequest.principal!, userAuthorizationVersion: undefined },
      headers: {},
    };
    expect(() => requirePrincipal(req as unknown as AuthenticatedStaffingRequest)).toThrow(
      'userAuthorizationVersion',
    );
  });

  it('should throw when membershipAuthorizationVersion is missing', () => {
    const req = {
      principal: { ...validRequest.principal!, membershipAuthorizationVersion: undefined },
      headers: {},
    };
    expect(() => requirePrincipal(req as unknown as AuthenticatedStaffingRequest)).toThrow(
      'membershipAuthorizationVersion',
    );
  });

  it('should never fall back to unknown - always throws', () => {
    expect(() =>
      requirePrincipal({ principal: {}, headers: {} } as unknown as AuthenticatedStaffingRequest),
    ).toThrow(TenantContextMissingError);
  });
});
