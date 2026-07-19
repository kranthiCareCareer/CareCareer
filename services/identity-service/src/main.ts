import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { identityConfigSchema } from './config/identity-config.js';

/**
 * Identity service bootstrap.
 * Validates configuration at startup — fails fast if invalid.
 */
async function bootstrap(): Promise<void> {
  const config = identityConfigSchema.parse(process.env);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({
    origin: config.CORS_ORIGINS?.split(',') ?? ['http://localhost:4000'],
    credentials: true,
  });

  app.enableShutdownHooks();

  await app.listen(config.PORT, config.HOST);
}

void bootstrap();
