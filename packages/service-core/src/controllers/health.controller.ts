import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';

import { HealthChecker } from '@carecareer/observability';

/**
 * Health endpoints.
 *
 * GET /health/live  — Is the process running? (Does NOT check dependencies)
 * GET /health/ready — Can it serve traffic? (Checks required dependencies)
 */
@Controller('health')
export class HealthController {
  private readonly healthChecker: HealthChecker;

  constructor(healthChecker: HealthChecker) {
    this.healthChecker = healthChecker;
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  async liveness(): Promise<{ status: string }> {
    const result = await this.healthChecker.liveness();
    if (result.status !== 'healthy') {
      throw new ServiceUnavailableException(result);
    }
    return { status: 'healthy' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<{ status: string; indicators: unknown }> {
    const result = await this.healthChecker.readiness();
    if (result.status !== 'healthy') {
      throw new ServiceUnavailableException(result);
    }
    return { status: 'healthy', indicators: result.indicators };
  }
}
