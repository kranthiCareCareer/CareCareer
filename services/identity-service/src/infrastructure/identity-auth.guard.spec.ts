import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi } from 'vitest';

import {
  AuthenticationError,
  type TokenValidator,
  type ValidatedTokenContext,
} from '@carecareer/auth';

import { IdentityAuthGuard } from './identity-auth.guard.js';
import type { SessionStateValidator } from './session-state-validator.js';

function createMockContext(headers: Record<string, string> = {}): {
  context: {
    switchToHttp: () => { getRequest: () => unknown };
    getHandler: () => unknown;
    getClass: () => unknown;
  };
  request: { headers: Record<string, string | undefined>; principal?: unknown };
} {
  const request = { headers, principal: undefined as unknown };
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    },
    request,
  };
}

function createMockValidator(result?: ValidatedTokenContext, error?: Error): TokenValidator {
  return {
    validate: vi.fn(async () => {
      if (error) throw error;
      return result!;
    }),
  };
}

const validToken: ValidatedTokenContext = {
  subject: 'user-001',
  actorId: 'user-001',
  actorType: 'user',
  tenantMemberships: [
    { tenantId: 'platform', roles: ['PLATFORM_ADMIN'], branchIds: [], status: 'active' },
  ],
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 900000),
  sessionId: 'session-001',
  tokenId: 'jti-001',
  userAuthorizationVersion: 1,
};

describe('IdentityAuthGuard', () => {
  const reflector = new Reflector();

  describe('Public route bypass', () => {
    it('should allow access to @Public() routes without a token', async () => {
      const guard = new IdentityAuthGuard(createMockValidator(), reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const { context } = createMockContext();
      const result = await guard.canActivate(context as never);
      expect(result).toBe(true);
    });
  });

  describe('Bearer token extraction', () => {
    it('should reject missing Authorization header', async () => {
      const guard = new IdentityAuthGuard(createMockValidator(validToken), reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const { context } = createMockContext({});
      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject malformed Bearer scheme (Basic)', async () => {
      const guard = new IdentityAuthGuard(createMockValidator(validToken), reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const { context } = createMockContext({ authorization: 'Basic dXNlcjpwYXNz' });
      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject Bearer with no token value', async () => {
      const guard = new IdentityAuthGuard(createMockValidator(validToken), reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const { context } = createMockContext({ authorization: 'Bearer ' });
      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Token validation error handling', () => {
    it('should convert AuthenticationError to UnauthorizedException', async () => {
      const authError = new AuthenticationError('bad token');
      const guard = new IdentityAuthGuard(createMockValidator(undefined, authError), reflector);
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const { context } = createMockContext({ authorization: 'Bearer some-token' });
      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });

    it('should convert unexpected errors to generic UnauthorizedException', async () => {
      const unexpectedError = new Error('unexpected failure');
      const guard = new IdentityAuthGuard(
        createMockValidator(undefined, unexpectedError),
        reflector,
      );
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const { context } = createMockContext({ authorization: 'Bearer some-token' });
      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Session-state enforcement', () => {
    it('should reject when session validator returns invalid', async () => {
      const sessionValidator: SessionStateValidator = {
        validate: vi.fn(async () => ({
          valid: false,
          code: 'AUTH_SESSION_REVOKED',
          message: 'Session revoked',
        })),
      } as unknown as SessionStateValidator;

      const guard = new IdentityAuthGuard(
        createMockValidator(validToken),
        reflector,
        sessionValidator,
      );
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const { context } = createMockContext({ authorization: 'Bearer real-token' });
      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });

    it('should pass when session validator returns valid', async () => {
      const sessionValidator: SessionStateValidator = {
        validate: vi.fn(async () => ({ valid: true })),
      } as unknown as SessionStateValidator;

      const guard = new IdentityAuthGuard(
        createMockValidator(validToken),
        reflector,
        sessionValidator,
      );
      vi.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(undefined);

      const { context, request } = createMockContext({ authorization: 'Bearer real-token' });
      const result = await guard.canActivate(context as never);
      expect(result).toBe(true);
      expect(request.principal).toBe(validToken);
    });
  });

  describe('Permission enforcement', () => {
    it('should reject when required permission is not met', async () => {
      const noAdminToken: ValidatedTokenContext = {
        ...validToken,
        tenantMemberships: [
          { tenantId: 'tenant-1', roles: ['VIEWER'], branchIds: [], status: 'active' },
        ],
      };
      const guard = new IdentityAuthGuard(createMockValidator(noAdminToken), reflector);
      vi.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false) // isPublic
        .mockReturnValueOnce(false) // isInternalService
        .mockReturnValueOnce('platform.admin'); // requiredPermission

      const { context } = createMockContext({ authorization: 'Bearer real-token' });
      await expect(guard.canActivate(context as never)).rejects.toThrow(ForbiddenException);
    });
  });
});
