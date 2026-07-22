import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

/**
 * Declare the required permission for an endpoint.
 * The StaffingPermissionGuard will enforce this against
 * the authoritative permission state from the identity service.
 *
 * Example: @RequirePermission('facility.create')
 */
export const RequirePermission = (permission: string): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
