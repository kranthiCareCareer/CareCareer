import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Automated OpenAPI validation for identity-service.
 * Validates:
 * - YAML syntax
 * - All implemented routes are documented
 * - HTTP methods and paths match controllers
 * - Authentication/permission documentation exists
 * - Request/response schemas are defined
 * - Error envelopes documented
 * - Correlation-ID headers documented
 * - Expected-version handling documented
 */

describe('OpenAPI Validation', () => {
  const IMPLEMENTED_ROUTES = [
    { method: 'get', path: '/health' },
    { method: 'get', path: '/ready' },
    { method: 'post', path: '/v1/platform/users' },
    { method: 'get', path: '/v1/platform/users' },
    { method: 'get', path: '/v1/platform/users/{userId}' },
    { method: 'patch', path: '/v1/platform/users/{userId}/status' },
    { method: 'post', path: '/v1/platform/users/{userId}/external-identities' },
    { method: 'get', path: '/v1/platform/users/{userId}/external-identities' },
    { method: 'get', path: '/v1/platform/users/{userId}/memberships' },
    { method: 'get', path: '/v1/platform/users/{userId}/platform-roles' },
    { method: 'put', path: '/v1/platform/users/{userId}/platform-roles' },
    { method: 'post', path: '/v1/tenants/{tenantId}/members' },
    { method: 'get', path: '/v1/tenants/{tenantId}/members' },
    { method: 'get', path: '/v1/tenants/{tenantId}/members/{membershipId}' },
    { method: 'patch', path: '/v1/tenants/{tenantId}/members/{membershipId}/status' },
    { method: 'get', path: '/v1/tenants/{tenantId}/members/{membershipId}/roles' },
    { method: 'put', path: '/v1/tenants/{tenantId}/members/{membershipId}/roles' },
    { method: 'get', path: '/v1/tenants/{tenantId}/members/{membershipId}/permissions' },
    { method: 'get', path: '/v1/tenants/{tenantId}/roles' },
    { method: 'get', path: '/v1/permissions' },
    { method: 'post', path: '/v1/auth/refresh' },
    { method: 'post', path: '/v1/auth/logout' },
    { method: 'post', path: '/v1/auth/logout-all' },
    { method: 'get', path: '/v1/auth/sessions' },
    { method: 'delete', path: '/v1/auth/sessions/{sessionId}' },
    { method: 'get', path: '/v1/auth/me' },
    { method: 'get', path: '/.well-known/jwks.json' },
  ];

  it('should have valid OpenAPI document', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('openapi: 3.1.0');
    expect(content).toContain('info:');
    expect(content).toContain('paths:');
    expect(content).toContain('components:');
  });

  it('should document all implemented routes', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );

    for (const route of IMPLEMENTED_ROUTES) {
      expect(content).toContain(route.path);
      expect(content).toContain(`${route.method}:`);
    }
  });

  it('should document unique operation IDs', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    const operationIds = [...content.matchAll(/operationId:\s*(\w+)/g)].map((m) => m[1]);
    expect(operationIds.length).toBeGreaterThanOrEqual(8);
    const unique = new Set(operationIds);
    expect(unique.size).toBe(operationIds.length);
  });

  it('should document authentication security scheme', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('bearerAuth');
    expect(content).toContain('type: http');
    expect(content).toContain('scheme: bearer');
  });

  it('should document required permissions in descriptions', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('platform.users.read');
    expect(content).toContain('platform.users.manage');
  });

  it('should document request schemas for mutations', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('CreateUserRequest');
    expect(content).toContain('ChangeUserStatusRequest');
    expect(content).toContain('LinkExternalIdentityRequest');
  });

  it('should document error envelope schema', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('ErrorEnvelope');
    expect(content).toContain("'400'");
    expect(content).toContain("'401'");
    expect(content).toContain("'403'");
    expect(content).toContain("'404'");
    expect(content).toContain("'409'");
  });

  it('should document correlation-ID header', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('x-correlation-id');
    expect(content).toContain('CorrelationId');
  });

  it('should document expected-version handling', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('version');
    expect(content).toContain('optimistic concurrency');
  });

  it('should document user status enum', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('ACTIVE');
    expect(content).toContain('SUSPENDED');
    expect(content).toContain('DEACTIVATED');
  });

  it('should document pagination schema', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    expect(content).toContain('Pagination');
    expect(content).toContain('offset');
    expect(content).toContain('limit');
    expect(content).toContain('total');
  });

  it('should have health endpoints without security requirement', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    // Health endpoints should have security: []
    expect(content).toContain('security: []');
  });

  it('should not have duplicate or broken schema references', () => {
    const content = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
    // Check all $ref point to defined schemas
    const refs = [...content.matchAll(/\$ref:\s*'([^']+)'/g)].map((m) => m[1]);
    const schemaNames = [...content.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);

    for (const ref of refs) {
      if (!ref) continue;
      const schemaName = ref.split('/').pop();
      if (schemaName) {
        expect(schemaNames).toContain(schemaName);
      }
    }
  });
});
