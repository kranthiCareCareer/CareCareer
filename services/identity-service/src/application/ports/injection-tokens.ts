/**
 * NestJS injection tokens for identity-service application ports.
 */
export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');
export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
export const ADMINISTRATIVE_DATABASE = Symbol('ADMINISTRATIVE_DATABASE');
export const TENANT_DATABASE = Symbol('TENANT_DATABASE');
export const OUTBOX_WRITER = Symbol('OUTBOX_WRITER');
export const TOKEN_VALIDATOR = Symbol('TOKEN_VALIDATOR');
