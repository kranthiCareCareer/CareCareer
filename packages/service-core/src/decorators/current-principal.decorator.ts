import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '@carecareer/auth';

/**
 * Parameter decorator that injects the authenticated principal.
 *
 * @example
 * async createShift(@CurrentPrincipal() principal: AuthenticatedPrincipal) {}
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ principal?: AuthenticatedPrincipal }>();
    if (!request.principal) {
      throw new Error('No authenticated principal on request — ensure AuthenticationGuard runs first');
    }
    return request.principal;
  },
);
