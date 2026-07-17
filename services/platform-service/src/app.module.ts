import { Module } from '@nestjs/common';

import { PlatformModule } from './platform.module.js';

/**
 * Root application module.
 * PlatformModule provides all controllers, guards, and services.
 */
@Module({
  imports: [PlatformModule],
})
export class AppModule {}
