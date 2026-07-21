import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { Public } from '../../infrastructure/public.decorator.js';

/**
 * Health and readiness endpoints for the staffing service.
 * These are public (no authentication required).
 */
@Controller()
@Public()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string; service: string } {
    return { status: 'healthy', service: 'staffing-service' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  readiness(): { status: string; checks: Record<string, string> } {
    return { status: 'healthy', checks: {} };
  }
}
