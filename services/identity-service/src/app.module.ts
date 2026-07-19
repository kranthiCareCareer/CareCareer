import { Module } from '@nestjs/common';

import { IdentityModule } from './identity.module.js';

/**
 * Root application module for identity-service.
 */
@Module({
  imports: [IdentityModule],
})
export class AppModule {}
