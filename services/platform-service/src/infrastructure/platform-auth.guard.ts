import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthenticationError, type TokenValidator } from '@carecareer/auth';

import { TOKEN_VALIDATOR } from '../application/ports/injection-tokens.js';

/**
 * Global authentication guard for platform-service.
 * Validates JWT tokens. Health endpoints are excluded by path.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_VALIDATOR) private readonly tokenValidator: TokenValidator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      url?: string;
      headers: Record<string, string | undefined>;
      principal?: unknown;
    }>();

    // Health and demo endpoints are public
    if (request.url?.startsWith('/health') || request.url?.startsWith('/demo')) {
      return true;
    }

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
