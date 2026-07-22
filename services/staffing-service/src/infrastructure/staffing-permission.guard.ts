import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { ValidatedTokenContext } from '@carecareer/auth';

import { REQUIRED_PERMISSION_KEY } from './permission.decorator.js';

/**
 * Authorization adapter port.
 *
 * Resolves whether a principal has a specific permission by querying
 * the authoritative identity state (NOT JWT claims).
 *
 * In production: calls the authorization decision service
 * In tests: uses a configurable mock
 *
 * Explicit deny overrides all grants.
 * Never authorize from JWT role or permission arrays — those are hints only.
 */
export interface PermissionAdapter {
  hasPermission(params: {
    userId: string;
    tenantId: string;
    permission: string;
    membershipId?: string | undefined;
  }): Promise<{ allowed: boolean; reason?: string | undefined }>;
}

/**
 * Staffing-service permission guard.
 *
 * Runs AFTER StaffingAuthGuard (principal is already validated and attached).
 * Checks the @RequirePermission() metadata against the authoritative
 * permission adapter.
 *
 * If no @RequirePermission is declared, the endpoint is open to
 * all authenticated users (permission-free).
 *
 * If the adapter is not configured, falls back to tenant-wide access
 * (any authenticated tenant member can access — for dev/early stages).
 */
@Injectable()
export class StaffingPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject('PERMISSION_ADAPTER') private readonly adapter?: PermissionAdapter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission declared — open to all authenticated users
    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest<{
      principal?: ValidatedTokenContext;
    }>();

    const principal = request.principal;
    if (!principal) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Permission required: ${requiredPermission}`,
      });
    }

    // If no adapter configured, fall back to tenant-wide access
    if (!this.adapter) return true;

    const result = await this.adapter.hasPermission({
      userId: principal.subject,
      tenantId: principal.selectedTenantId ?? '',
      permission: requiredPermission,
      membershipId: principal.membershipId,
    });

    if (!result.allowed) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: result.reason ?? `Permission required: ${requiredPermission}`,
      });
    }

    return true;
  }
}
