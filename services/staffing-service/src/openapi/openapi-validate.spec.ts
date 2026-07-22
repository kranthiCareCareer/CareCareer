import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * OpenAPI validation for staffing-service.
 * Validates all GP-05 and GP-06 routes are documented.
 */
describe('Staffing Service OpenAPI Validation', () => {
  const IMPLEMENTED_ROUTES = [
    { method: 'get', path: '/health' },
    { method: 'get', path: '/ready' },
    { method: 'post', path: '/v1/facilities' },
    { method: 'get', path: '/v1/facilities' },
    { method: 'get', path: '/v1/facilities/{facilityId}' },
    { method: 'patch', path: '/v1/facilities/{facilityId}' },
    { method: 'post', path: '/v1/facilities/{facilityId}/status' },
    { method: 'post', path: '/v1/facilities/{facilityId}/departments' },
    { method: 'get', path: '/v1/facilities/{facilityId}/departments' },
    { method: 'post', path: '/v1/facilities/{facilityId}/departments/{departmentId}/status' },
    { method: 'post', path: '/v1/facilities/{facilityId}/credential-requirements' },
    { method: 'get', path: '/v1/facilities/{facilityId}/credential-requirements' },
    { method: 'post', path: '/v1/workers' },
    { method: 'get', path: '/v1/workers' },
    { method: 'get', path: '/v1/workers/{workerId}' },
    { method: 'patch', path: '/v1/workers/{workerId}' },
    { method: 'post', path: '/v1/workers/{workerId}/status' },
    { method: 'get', path: '/v1/my-profile' },
    { method: 'patch', path: '/v1/my-profile' },
  ];

  let content: string;

  function loadOpenApi(): string {
    return readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.yaml'),
      'utf-8',
    );
  }

  it('should have valid OpenAPI 3.1 document', () => {
    content = loadOpenApi();
    expect(content).toContain('openapi: 3.1.0');
    expect(content).toContain('info:');
    expect(content).toContain('paths:');
    expect(content).toContain('components:');
  });

  it('should document all implemented routes', () => {
    content = loadOpenApi();
    for (const route of IMPLEMENTED_ROUTES) {
      expect(content, `Missing: ${route.method} ${route.path}`).toContain(route.path);
    }
  });

  it('should document unique operation IDs', () => {
    content = loadOpenApi();
    const operationIds = [...content.matchAll(/operationId:\s*(\w+)/g)].map((m) => m[1]);
    expect(operationIds.length).toBeGreaterThanOrEqual(15);
    const unique = new Set(operationIds);
    expect(unique.size).toBe(operationIds.length);
  });

  it('should document bearerAuth security scheme', () => {
    content = loadOpenApi();
    expect(content).toContain('bearerAuth');
    expect(content).toContain('type: http');
    expect(content).toContain('scheme: bearer');
  });

  it('should document required permissions', () => {
    content = loadOpenApi();
    expect(content).toContain('facility.create');
    expect(content).toContain('facility.list');
    expect(content).toContain('facility.read');
    expect(content).toContain('facility.update');
    expect(content).toContain('department.create');
    expect(content).toContain('worker.create');
    expect(content).toContain('worker.change-status');
    expect(content).toContain('credential-requirement.manage');
  });

  it('should document additionalProperties: false on request schemas', () => {
    content = loadOpenApi();
    const matches = content.match(/additionalProperties: false/g);
    expect(matches?.length).toBeGreaterThanOrEqual(5);
  });

  it('should document error envelope schema', () => {
    content = loadOpenApi();
    expect(content).toContain('ErrorEnvelope');
    expect(content).toContain("'400'");
    expect(content).toContain("'401'");
    expect(content).toContain("'403'");
    expect(content).toContain("'404'");
    expect(content).toContain("'409'");
  });

  it('should document x-correlation-id header', () => {
    content = loadOpenApi();
    expect(content).toContain('x-correlation-id');
    expect(content).toContain('CorrelationId');
  });

  it('should document optimistic concurrency (expectedVersion)', () => {
    content = loadOpenApi();
    expect(content).toContain('expectedVersion');
    expect(content).toContain('optimistic concurrency');
  });

  it('should document facility status enum', () => {
    content = loadOpenApi();
    expect(content).toContain('ACTIVE');
    expect(content).toContain('INACTIVE');
    expect(content).toContain('SUSPENDED');
  });

  it('should document worker status enum', () => {
    content = loadOpenApi();
    expect(content).toContain('APPLICANT');
    expect(content).toContain('SCREENING');
    expect(content).toContain('BLOCKED');
    expect(content).toContain('ALUMNI');
  });

  it('should document Pagination schema', () => {
    content = loadOpenApi();
    expect(content).toContain('Pagination');
    expect(content).toContain('offset');
    expect(content).toContain('limit');
    expect(content).toContain('total');
  });

  it('should have health endpoints without security', () => {
    content = loadOpenApi();
    expect(content).toContain('security: []');
  });

  it('should document self-service endpoints without permission requirement', () => {
    content = loadOpenApi();
    expect(content).toContain('/v1/my-profile');
    expect(content).toContain('No special permission required');
  });

  it('should document external reference system names', () => {
    content = loadOpenApi();
    expect(content).toContain('symplr');
    expect(content).toContain('bullhorn');
    expect(content).toContain('labor-edge');
    expect(content).toContain('maestra');
    expect(content).toContain('auth0');
  });
});
