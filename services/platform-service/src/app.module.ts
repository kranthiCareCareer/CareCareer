import { Module } from '@nestjs/common';

import { ServiceCoreModule } from '@carecareer/service-core';

import { PlatformModule } from './platform.module.js';

/**
 * Root application module.
 * Imports ServiceCoreModule for all platform infrastructure.
 * Imports PlatformModule for domain controllers and services.
 */
@Module({
  imports: [ServiceCoreModule, PlatformModule],
})
export class AppModule {}
