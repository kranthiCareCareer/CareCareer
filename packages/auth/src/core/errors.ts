/**
 * Base authentication error.
 * NEVER include token values, cookies, or credentials in error messages.
 */
export class AuthenticationError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'AUTHENTICATION_REQUIRED') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor() {
    super('Token has expired', 'TOKEN_EXPIRED');
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor(reason: string) {
    // Never include the actual token value in the error message
    super(`Token validation failed: ${reason}`, 'TOKEN_INVALID');
    this.name = 'InvalidTokenError';
  }
}

/**
 * Authorization error — authenticated but not permitted.
 */
export class AuthorizationError extends Error {
  public readonly code: string;
  public readonly permission: string;
  public readonly reasonCode: string;

  constructor(permission: string, reasonCode: string) {
    super(`Permission denied: ${permission}`);
    this.name = 'AuthorizationError';
    this.code = 'PERMISSION_DENIED';
    this.permission = permission;
    this.reasonCode = reasonCode;
  }
}
