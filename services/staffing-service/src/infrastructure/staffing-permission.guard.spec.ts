import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi } from 'vitest';

import type { PermissionAdapter } from './authorization-adapter.js';
import { StaffingPermissionGuard } from './staffing-permission.guard.js';

describe('StaffingPermissionGuard', () => {
  function createContext(principal?: Record<string, unknown>): never {
    const req = { principal };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as never;
  }

  describe('no @RequirePermission decorator', () => {
    it('should allow when no permission is required', async () => {
      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue(undefined),
      } as unknown as Reflector;
      const guard = new StaffingPermissionGuard(reflector, null);
      const result = await guard.canActivate(createContext({ subject: 'u' }));
      expect(result).toBe(true);
    });
  });

  describe('fail-closed in production', () => {
    it('should deny when adapter is null and not in local mode', async () => {
      const originalEnv = process.env['STAFFING_AUTH_MODE'];
      delete process.env['STAFFING_AUTH_MODE'];

      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue('facility.create'),
      } as unknown as Reflector;
      const guard = new StaffingPermissionGuard(reflector, null);
      const ctx = createContext({ subject: 'u', selectedTenantId: 't' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      process.env['STAFFING_AUTH_MODE'] = originalEnv ?? '';
    });

    it('should allow when adapter is null in local dev mode', async () => {
      process.env['STAFFING_AUTH_MODE'] = 'local';

      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue('facility.create'),
      } as unknown as Reflector;
      const guard = new StaffingPermissionGuard(reflector, null);
      const ctx = createContext({ subject: 'u', selectedTenantId: 't' });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);

      delete process.env['STAFFING_AUTH_MODE'];
    });
  });

  describe('permission adapter interaction', () => {
    it('should allow when adapter returns allowed', async () => {
      const adapter: PermissionAdapter = {
        hasPermission: vi.fn().mockResolvedValue({ allowed: true }),
      };
      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue('worker.create'),
      } as unknown as Reflector;
      const guard = new StaffingPermissionGuard(reflector, adapter);
      const ctx = createContext({ subject: 'u', selectedTenantId: 't', membershipId: 'm' });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });

    it('should deny when adapter returns not allowed', async () => {
      const adapter: PermissionAdapter = {
        hasPermission: vi.fn().mockResolvedValue({ allowed: false, reason: 'EXPLICIT_DENY' }),
      };
      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue('worker.create'),
      } as unknown as Reflector;
      const guard = new StaffingPermissionGuard(reflector, adapter);
      const ctx = createContext({ subject: 'u', selectedTenantId: 't' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should deny when no principal is present', async () => {
      const adapter: PermissionAdapter = {
        hasPermission: vi.fn().mockResolvedValue({ allowed: true }),
      };
      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue('facility.read'),
      } as unknown as Reflector;
      const guard = new StaffingPermissionGuard(reflector, adapter);
      const ctx = createContext(undefined); // no principal

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });
});
