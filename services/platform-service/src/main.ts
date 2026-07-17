import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { loadConfig } from '@carecareer/config';

import { AppModule } from './app.module.js';

/**
 * Service bootstrap.
 * Validates configuration before anything else — fails fast if invalid.
 */
async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(config.PORT, config.HOST);
}

void bootstrap();
