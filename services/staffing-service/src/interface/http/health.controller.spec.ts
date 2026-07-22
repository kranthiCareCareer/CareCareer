import { describe, it, expect, vi } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  describe('liveness', () => {
    it('should return healthy status', () => {
      const mockTenantDb = { execute: vi.fn() } as never;
      const controller = new HealthController(mockTenantDb);
      const result = controller.liveness();
      expect(result.status).toBe('healthy');
      expect(result.service).toBe('staffing-service');
    });
  });

  describe('readiness', () => {
    it('should return unhealthy when module not initialized', async () => {
      const mockTenantDb = { execute: vi.fn() } as never;
      const controller = new HealthController(mockTenantDb);
      const result = await controller.readiness();
      expect(result.status).toBe('unhealthy');
      expect(result.checks['module']).toBe('not initialized');
    });

    it('should return unhealthy when database is unavailable', async () => {
      const mockTenantDb = {
        execute: vi.fn().mockRejectedValue(new Error('connection refused')),
      } as never;
      const controller = new HealthController(mockTenantDb);
      controller.onModuleInit();
      const result = await controller.readiness();
      expect(result.status).toBe('unhealthy');
      expect(result.checks['database']).toBe('unavailable');
    });

    it('should return healthy when database responds', async () => {
      const mockTenantDb = {
        execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      } as never;
      const controller = new HealthController(mockTenantDb);
      controller.onModuleInit();
      const result = await controller.readiness();
      expect(result.status).toBe('healthy');
      expect(result.checks['database']).toBe('ok');
    });
  });
});
