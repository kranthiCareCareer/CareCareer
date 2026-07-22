import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi } from 'vitest';

import type { IdentityStateAdapter } from './identity-state-adapter.js';
import { StaffingAuthGuard } from './staffing-auth.guard.js';

describe('StaffingAuthGuard', () => {
  const mockTokenValidator = {
    validate: vi.fn(),
  };

  const mockReflector = {
    getAllAndOverride: vi.fn().mockReturnValue(false),
  } as unknown as Reflector;

  function createContext(headers: Record<string, string> = {}) {
    const req = { headers, principal: undefined };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as never;
  }

  describe('fail-closed behavior in production', () => {
    it('should deny when identity adapter is missing and not in local mode', async () => {
      // Simulate production: no STAFFING_AUTH_MODE=local
      const originalEnv = process.env['STAFFING_AUTH_MODE'];
      delete process.env['STAFFING_AUTH_MODE'];

      const guard = new StaffingAuthGuard(
        mockTokenValidator as never,
        mockReflector,
        undefined, // no adapter
      );

      mockTokenValidator.validate.mockResolvedValue({
        subject: 'user-1', sessionId: 's-1', selectedTenantId: 't-1',
        userAuthorizationVersion: 1, membershipId: 'm-1',
      });

      const ctx = createContext({ authorization: 'Bearer valid-token' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);

      process.env['STAFFING_AUTH_MODE'] = originalEnv ?? '';
    });

    it('should allow when identity adapter is missing in local dev mode', async () => {
      process.env['STAFFING_AUTH_MODE'] = 'local';

      const guard = new StaffingAuthGuard(
        mockTokenValidator as never,
        mockReflector,
        undefined,
      );

      mockTokenValidator.validate.mockResolvedValue({
        subject: 'user-1', sessionId: 's-1', selectedTenantId: 't-1',
        userAuthorizationVersion: 1,
      });

      const ctx = createContext({ authorization: 'Bearer valid-token' });
      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);

      delete process.env['STAFFING_AUTH_MODE'];
    });

    it('should deny when identity adapter returns invalid', async () => {
      const mockAdapter: IdentityStateAdapter = {
        validate: vi.fn().mockResolvedValue({ valid: false, code: 'SESSION_REVOKED' }),
      };

      process.env['STAFFING_AUTH_MODE'] = 'production';
      const guard = new StaffingAuthGuard(mockTokenValidator as never, mockReflector, mockAdapter);

      mockTokenValidator.validate.mockResolvedValue({
        subject: 'user-1', sessionId: 's-1', selectedTenantId: 't-1',
        userAuthorizationVersion: 1,
      });

      const ctx = createContext({ authorization: 'Bearer valid-token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);

      delete process.env['STAFFING_AUTH_MODE'];
    });
  });

  describe('public route bypass', () => {
    it('should bypass authentication for @Public routes', async () => {
      const publicReflector = {
        getAllAndOverride: vi.fn().mockReturnValue(true),
      } as unknown as Reflector;

      const guard = new StaffingAuthGuard(mockTokenValidator as never, publicReflector, undefined);
      const ctx = createContext(); // no auth header
      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });
  });

  describe('token extraction', () => {
    it('should reject missing Authorization header', async () => {
      const guard = new StaffingAuthGuard(mockTokenValidator as never, mockReflector, undefined);
      process.env['STAFFING_AUTH_MODE'] = 'local';
      const ctx = createContext({});
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      delete process.env['STAFFING_AUTH_MODE'];
    });

    it('should reject non-Bearer format', async () => {
      const guard = new StaffingAuthGuard(mockTokenValidator as never, mockReflector, undefined);
      process.env['STAFFING_AUTH_MODE'] = 'local';
      const ctx = createContext({ authorization: 'Basic abc123' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      delete process.env['STAFFING_AUTH_MODE'];
    });

    it('should reject empty token after Bearer', async () => {
      const guard = new StaffingAuthGuard(mockTokenValidator as never, mockReflector, undefined);
      process.env['STAFFING_AUTH_MODE'] = 'local';
      const ctx = createContext({ authorization: 'Bearer ' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      delete process.env['STAFFING_AUTH_MODE'];
    });
  });
});
