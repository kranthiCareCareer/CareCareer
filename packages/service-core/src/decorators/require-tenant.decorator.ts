import { SetMetadata } from '@nestjs/common';

export const TENANT_KEY = 'require_tenant';

/**
 * Decorator that marks a route handler as requiring tenant context.
 * Used with PermissionGuard to enforce that tenantId is resolved.
 *
 * @example
 * @RequireTenant()
 * @Get('/facilities')
 * async listFacilities() {}
 */
export const RequireTenant = (): MethodDecorator & ClassDecorator =>
  SetMetadata(TENANT_KEY, true);
