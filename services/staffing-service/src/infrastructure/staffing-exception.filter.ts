import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';

import { StaffingDomainError, type InvalidRequestError } from '../domain/errors.js';

/**
 * Centralized exception filter for the staffing-service.
 *
 * Maps typed domain errors to HTTP responses without leaking internal details.
 * All other exceptions become 500 with a generic message.
 */
@Catch()
export class StaffingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    if (exception instanceof StaffingDomainError) {
      const body: Record<string, unknown> = {
        code: exception.code,
        message: exception.message,
      };

      // Include validation details for InvalidRequestError
      if ('details' in exception && (exception as InvalidRequestError).details) {
        body['details'] = (exception as InvalidRequestError).details;
      }

      response.status(exception.httpStatus).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exResponse = exception.getResponse();
      response
        .status(status)
        .json(
          typeof exResponse === 'string' ? { code: 'HTTP_ERROR', message: exResponse } : exResponse,
        );
      return;
    }

    // Unknown error — never expose internals
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
}
