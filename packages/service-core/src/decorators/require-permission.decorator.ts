import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/**
 * Decorator that marks a route handler as requiring a specific permission.
 * Used with PermissionGuard.
 *
 * @example
 * @RequirePermission('shifts:create')
 * @Post('/shifts')
 * async createShift() {}
 */
export const RequirePermission = (permission: string): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);
