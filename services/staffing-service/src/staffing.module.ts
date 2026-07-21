import { Module } from '@nestjs/common';

import { HealthController } from './interface/http/health.controller.js';

/**
 * Staffing service root module.
 * Manages facilities, departments, workers, shifts and assignments.
 */
@Module({
  controllers: [HealthController],
  providers: [],
})
export class StaffingModule {}
