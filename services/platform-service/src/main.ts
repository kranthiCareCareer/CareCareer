import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

/**
 * Service bootstrap.
 * In development mode, uses minimal configuration.
 * In production, validates all required configuration.
 */
async function bootstrap(): Promise<void> {
  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // CORS for admin console
  app.enableCors({
    origin: ['http://localhost:4000', 'http://localhost:4001'],
    credentials: true,
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port, host);
}

void bootstrap();
