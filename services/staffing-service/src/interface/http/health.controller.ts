import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

/**
 * Health and readiness endpoints for the staffing service.
 */
@Controller()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string; service: string } {
    return { status: 'healthy', service: 'staffing-service' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  readiness(): { status: string; checks: Record<string, string> } {
    // TODO: Add database readiness check when DB is wired
    return { status: 'healthy', checks: {} };
  }
}
