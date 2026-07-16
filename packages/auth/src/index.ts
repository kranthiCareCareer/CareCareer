// Core types and abstractions
export type {
  AuthenticatedPrincipal,
  TenantMembershipClaim,
} from './core/authenticated-principal.js';
export type { TokenValidator, TokenValidationConfig } from './core/token-validator.js';
export type {
  AuthorizationService,
  AuthorizationRequest,
  AuthorizationDecision,
} from './core/authorization-service.js';
export {
  AuthenticationError,
  AuthorizationError,
  TokenExpiredError,
  InvalidTokenError,
} from './core/errors.js';

// OIDC implementation
export { JwksTokenValidator } from './oidc/jwks-token-validator.js';
export { ClaimsMapper, type ClaimsMapperConfig } from './oidc/claims-mapper.js';

// In-memory authorization (replaced by identity-service later)
export { InMemoryAuthorizationService } from './core/in-memory-authorization.js';
