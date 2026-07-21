import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { StaffingModule } from './staffing.module.js';

/**
 * Staffing service bootstrap.
 * Manages facilities, departments, workers, shifts and assignments.
 */
async function bootstrap(): Promise<void> {
  const port = parseInt(process.env['PORT'] ?? '3200', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';

  const app = await NestFactory.create(StaffingModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();
  await app.listen(port, host);
}

void bootstrap();
