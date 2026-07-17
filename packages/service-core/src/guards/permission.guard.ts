import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedPrincipal, AuthorizationService } from '@carecareer/auth';

import { PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import { TENANT_KEY } from '../decorators/require-tenant.decorator.js';

/**
 * Guard that evaluates authorization for the current request.
 * Checks RBAC+ABAC permissions through the AuthorizationService interface.
 *
 * Fails with 403 if:
 * - No authenticated principal on request
 * - Required permission not granted
 * - Tenant membership missing or inactive
 * - Explicit deny rule matches
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requireTenant = this.reflector.getAllAndOverride<boolean | undefined>(TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no permission required and no tenant required, allow
    if (!requiredPermission && !requireTenant) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      principal?: AuthenticatedPrincipal;
      headers: Record<string, string | undefined>;
      tenantId?: string;
    }>();

    const principal = request.principal;
    if (!principal) {
      throw new ForbiddenException('Authentication required before authorization');
    }

    // Resolve tenant ID from principal memberships or request context
    const tenantId = this.resolveTenantId(principal, request.headers);
    if (requireTenant && !tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    // Store resolved tenant for downstream use
    if (tenantId) {
      request.tenantId = tenantId;
    }

    if (requiredPermission && tenantId) {
      const decision = await this.authorizationService.evaluate({
        principal,
        tenantId,
        permission: requiredPermission,
      });

      if (!decision.allowed) {
        throw new ForbiddenException(`Permission denied: ${requiredPermission}`);
      }
    }

    return true;
  }

  private resolveTenantId(
    principal: AuthenticatedPrincipal,
    _headers: Record<string, string | undefined>,
  ): string | undefined {
    // Use the first active tenant membership
    // In production, multi-tenant users select via header or route
    const activeMembership = principal.tenantMemberships.find((m) => m.status === 'active');
    return activeMembership?.tenantId;
  }
}
