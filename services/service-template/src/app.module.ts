import { Module } from '@nestjs/common';

import { ServiceCoreModule } from '@carecareer/service-core';

/**
 * Root application module.
 * Imports ServiceCoreModule for all platform infrastructure.
 * Domain modules added below.
 */
@Module({
  imports: [ServiceCoreModule],
})
export class AppModule {}
