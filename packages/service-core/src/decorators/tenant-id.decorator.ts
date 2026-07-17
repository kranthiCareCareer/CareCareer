import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator that injects the resolved tenant ID.
 *
 * @example
 * async listShifts(@TenantId() tenantId: string) {}
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ tenantId?: string }>();
    if (!request.tenantId) {
      throw new Error('No tenant ID on request — ensure PermissionGuard with @RequireTenant() runs first');
    }
    return request.tenantId;
  },
);
