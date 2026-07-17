import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { HealthController } from './controllers/health.controller.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';

/**
 * Core module that provides platform infrastructure to all services.
 * Registers middleware, guards, filters, and health endpoints.
 *
 * Services import this module to get:
 * - Request context propagation (correlation IDs, tenant, actor)
 * - Authentication and authorization guards
 * - Health/readiness endpoints
 * - Structured error handling
 *
 * Does NOT import domain entities, vendor SDKs, or infrastructure-specific code.
 */
@Module({
  controllers: [HealthController],
  providers: [],
  exports: [],
})
export class ServiceCoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
