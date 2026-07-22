import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { ValidatedTokenContext } from '@carecareer/auth';

import type { PermissionAdapter } from './authorization-adapter.js';
import { REQUIRED_PERMISSION_KEY } from './permission.decorator.js';

/**
 * Staffing-service permission guard.
 *
 * Runs AFTER StaffingAuthGuard (principal is already validated and attached).
 * Checks the @RequirePermission() metadata against the authoritative
 * authorization decision service via PermissionAdapter.
 *
 * FAIL-CLOSED BEHAVIOR:
 * - Missing adapter in production → DENY (service must not start without it)
 * - Adapter returns error → DENY
 * - Timeout → DENY
 * - Unknown response → DENY
 *
 * The only case where a missing adapter is allowed is when
 * STAFFING_AUTH_MODE=local (local development only, not production).
 */
@Injectable()
export class StaffingPermissionGuard implements CanActivate {
  private readonly localDevMode: boolean;

  constructor(
    private readonly reflector: Reflector,
    @Inject('PERMISSION_ADAPTER') private readonly adapter: PermissionAdapter | null,
  ) {
    // Local dev mode only — NEVER in production
    this.localDevMode = process.env['STAFFING_AUTH_MODE'] === 'local';
  }

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

    // FAIL CLOSED: no adapter in production = deny
    if (!this.adapter) {
      if (this.localDevMode) {
        // Local dev only — allow all authenticated users
        return true;
      }
      throw new ForbiddenException({
        code: 'AUTHORIZATION_UNAVAILABLE',
        message: 'Authorization service not configured — access denied',
      });
    }

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
