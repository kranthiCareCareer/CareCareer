import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';

import type { AdministrativeDatabase } from '@carecareer/database';

import { ADMINISTRATIVE_DATABASE } from '../../application/ports/injection-tokens.js';
import { Public } from '../../infrastructure/public.decorator.js';

/**
 * Health endpoints — public (no auth required).
 * GET /health → liveness
 * GET /ready → readiness (checks PostgreSQL)
 */
@Controller()
@Public()
export class HealthController {
  constructor(@Inject(ADMINISTRATIVE_DATABASE) private readonly adminDb: AdministrativeDatabase) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string; service: string } {
    return { status: 'healthy', service: 'identity-service' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<{ status: string; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};

    try {
      await this.adminDb.execute(
        { actorId: 'system', reason: 'health-check', correlationId: 'health' },
        async (tx) => {
          await tx.$queryRaw`SELECT 1`;
        },
      );
      checks['postgresql'] = 'healthy';
    } catch {
      checks['postgresql'] = 'unhealthy';
      return { status: 'unhealthy', checks };
    }

    return { status: 'healthy', checks };
  }
}
