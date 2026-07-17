import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticationError, type TokenValidator } from '@carecareer/auth';

import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Global authentication guard for platform-service.
 * Validates JWT tokens on all routes unless marked with @Public().
 *
 * Uses NestJS Reflector to check metadata — no URL path exceptions.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  private readonly tokenValidator: TokenValidator;
  private readonly reflector: Reflector;

  constructor(tokenValidator: TokenValidator, reflector: Reflector) {
    this.tokenValidator = tokenValidator;
    this.reflector = reflector;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @Public() decorator on handler or class
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      principal?: unknown;
    }>();

    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Authentication required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const token = parts[1];
    if (!token) {
      throw new UnauthorizedException('Token missing');
    }

    try {
      const principal = await this.tokenValidator.validate(token);
      request.principal = principal;
      return true;
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) {
        throw new UnauthorizedException(error.message);
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
