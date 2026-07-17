import { Injectable, type NestMiddleware } from '@nestjs/common';

import {
  generateRequestId,
  requestContextStorage,
  RequestContext,
  validateCorrelationId,
} from '@carecareer/request-context';

/**
 * Middleware that establishes AsyncLocalStorage request context for every request.
 * Extracts correlation ID from header (validated) or generates a new one.
 * Sets requestId, correlationId, and startedAt before any handler runs.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void): void {
    const rawCorrelationId = Array.isArray(req.headers['x-correlation-id'])
      ? req.headers['x-correlation-id'][0]
      : req.headers['x-correlation-id'];

    const correlationId = validateCorrelationId(rawCorrelationId) ?? generateRequestId();
    const requestId = generateRequestId();

    const context = new RequestContext({
      requestId,
      correlationId,
      startedAt: Date.now(),
    });

    requestContextStorage.run(context, next);
  }
}
