import { SetMetadata } from '@nestjs/common';

export const IS_INTERNAL_SERVICE_KEY = 'isInternalService';

/**
 * Mark an endpoint or controller as internal-service-authenticated.
 * The global IdentityAuthGuard will SKIP these routes, allowing
 * ServiceIdentityGuard (applied via @UseGuards) to authenticate them.
 *
 * This is NOT @Public() — the endpoint still requires authentication,
 * just via a service JWT instead of a user JWT.
 */
export const InternalService = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_INTERNAL_SERVICE_KEY, true);
