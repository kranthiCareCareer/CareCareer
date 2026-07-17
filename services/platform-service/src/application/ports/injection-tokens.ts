/**
 * NestJS injection tokens for platform-service application ports.
 * Controllers depend on these tokens, not concrete infrastructure classes.
 */
export const PLATFORM_REPOSITORY = Symbol('PLATFORM_REPOSITORY');
export const ADMINISTRATIVE_DATABASE = Symbol('ADMINISTRATIVE_DATABASE');
export const TENANT_DATABASE = Symbol('TENANT_DATABASE');
export const OUTBOX_WRITER = Symbol('OUTBOX_WRITER');
export const TOKEN_VALIDATOR = Symbol('TOKEN_VALIDATOR');
export const AUTHORIZATION_SERVICE = Symbol('AUTHORIZATION_SERVICE');
