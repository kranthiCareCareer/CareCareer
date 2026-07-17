import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { StandardErrorEnvelope } from '@carecareer/observability';
import { getContext } from '@carecareer/request-context';

/**
 * Global exception filter.
 * - Maps known exceptions to standard error envelopes
 * - Never exposes internal details (stack traces, SQL, vendor errors)
 * - Always includes correlationId for support reference
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();

    const requestContext = getContext();
    const correlationId = requestContext?.correlationId ?? 'unknown';
    const requestId = requestContext?.requestId ?? 'unknown';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let code = 'UNKNOWN_ERROR';
      let message = 'An error occurred';

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.httpStatusToCode(status);
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = typeof resp['message'] === 'string' ? resp['message'] : message;
        code = typeof resp['error'] === 'string' ? resp['error'] : this.httpStatusToCode(status);
      }

      response
        .status(status)
        .json(StandardErrorEnvelope.build({ code, message, correlationId, requestId }));
      return;
    }

    // Unknown errors — never expose internals
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(StandardErrorEnvelope.internalError({ correlationId, requestId }));
  }

  private httpStatusToCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'AUTHENTICATION_REQUIRED';
      case 403:
        return 'PERMISSION_DENIED';
      case 404:
        return 'RESOURCE_NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      case 429:
        return 'RATE_LIMIT_EXCEEDED';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
