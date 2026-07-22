import { Controller, Get, HttpCode, HttpStatus, Inject, type OnModuleInit } from '@nestjs/common';

import type { TenantAwareTransaction } from '@carecareer/database';

import { Public } from '../../infrastructure/public.decorator.js';

/**
 * Health and readiness endpoints for the staffing service.
 * These are public (no authentication required).
 */
@Controller()
@Public()
export class HealthController implements OnModuleInit {
  private ready = false;

  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly tenantDb: TenantAwareTransaction,
  ) {}

  onModuleInit(): void {
    this.ready = true;
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string; service: string } {
    return { status: 'healthy', service: 'staffing-service' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<{ status: string; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};

    // Check module initialization
    if (!this.ready) {
      return { status: 'unhealthy', checks: { module: 'not initialized' } };
    }
    checks['module'] = 'ok';

    // Check database connectivity (use a known-safe tenant ID for the probe)
    try {
      await this.tenantDb.execute('00000000-0000-0000-0000-000000000000', async (tx) => {
        await tx.$queryRaw`SELECT 1`;
      });
      checks['database'] = 'ok';
    } catch {
      checks['database'] = 'unavailable';
      return { status: 'unhealthy', checks };
    }

    return { status: 'healthy', checks };
  }
}
