import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { Public } from '../../infrastructure/public.decorator.js';

/**
 * Health endpoints — public (no auth required).
 */
@Controller('health')
@Public()
export class PlatformHealthController {
  @Get('live')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string } {
    return { status: 'healthy' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  readiness(): { status: string } {
    return { status: 'healthy' };
  }
}
