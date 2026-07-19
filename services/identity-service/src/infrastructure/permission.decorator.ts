import { SetMetadata } from '@nestjs/common';

import { REQUIRED_PERMISSION_KEY } from './identity-auth.guard.js';

/**
 * Requires the specified permission for the endpoint.
 */
export const RequirePermission = (permission: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
