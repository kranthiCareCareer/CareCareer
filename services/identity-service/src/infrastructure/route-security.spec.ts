import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __dir = dirname(fileURLToPath(import.meta.url));

/**
 * Route security inventory test.
 *
 * Proves every internal controller source contains the required security
 * annotations. Fails at test time if @InternalService() or
 * @RequireServiceScope() is missing, preventing the fail-open risk of
 * adding @InternalService() without ServiceIdentityGuard.
 *
 * Checks source code directly (not reflect-metadata) because NestJS
 * decorator metadata requires a full DI container to resolve reliably
 * in unit test contexts. A source-code check provides a deterministic
 * compile-time guarantee.
 */
describe('Internal route security inventory', () => {
  function readController(filename: string): string {
    return readFileSync(
      resolve(__dir, '..', 'interface', 'http', filename),
      'utf-8',
    );
  }

  describe('InternalIdentityController', () => {
    const src = readController('internal-identity.controller.ts');

    it('must have @InternalService() decorator', () => {
      expect(src).toContain('@InternalService()');
    });

    it('must have @UseGuards(ServiceIdentityGuard)', () => {
      expect(src).toContain('@UseGuards(ServiceIdentityGuard)');
    });

    it('must have @RequireServiceScope for state-validations', () => {
      expect(src).toContain("@RequireServiceScope('identity.state.validate')");
    });

    it('must import InternalService decorator', () => {
      expect(src).toContain('InternalService');
    });
  });

  describe('InternalAuthorizationController', () => {
    const src = readController('internal-authorization.controller.ts');

    it('must have @InternalService() decorator', () => {
      expect(src).toContain('@InternalService()');
    });

    it('must have @UseGuards(ServiceIdentityGuard)', () => {
      expect(src).toContain('@UseGuards(ServiceIdentityGuard)');
    });

    it('must have @RequireServiceScope for decisions', () => {
      expect(src).toContain("@RequireServiceScope('authorization.decide')");
    });
  });

  describe('InternalOAuthController (token endpoint)', () => {
    const src = readController('internal-oauth.controller.ts');

    it('must NOT have @InternalService() (token endpoint validates credentials in body)', () => {
      expect(src).not.toContain('@InternalService()');
    });

    it('must have @Public() to skip user-JWT guard', () => {
      expect(src).toContain('@Public()');
    });
  });
});
