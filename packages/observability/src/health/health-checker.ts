/**
 * Health status for a dependency or the overall service.
 */
export interface HealthStatus {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly details?: Record<string, unknown>;
}

/**
 * A health indicator checks one dependency.
 */
export interface HealthIndicator {
  readonly name: string;
  /** Whether this indicator is required for readiness (true) or only liveness (false) */
  readonly requiredForReadiness: boolean;
  check(): Promise<HealthStatus>;
}

/**
 * Health checker with distinct liveness and readiness semantics.
 *
 * LIVENESS: Is the process running and not deadlocked?
 * - Confirms event loop is responsive
 * - Does NOT check external dependencies
 * - A PostgreSQL outage should NOT kill the process
 *
 * READINESS: Can the service handle traffic?
 * - Checks required dependencies (database, critical config)
 * - PostgreSQL unavailable → NOT ready
 * - Used by load balancers to route traffic away
 */
export class HealthChecker {
  private readonly indicators: HealthIndicator[] = [];
  private shuttingDown = false;

  registerIndicator(indicator: HealthIndicator): void {
    this.indicators.push(indicator);
  }

  markShuttingDown(): void {
    this.shuttingDown = true;
  }

  /**
   * Liveness check.
   * Returns healthy if the process is running and not in shutdown.
   * Does NOT check external dependencies.
   */
  async liveness(): Promise<HealthStatus> {
    if (this.shuttingDown) {
      return { status: 'unhealthy', details: { reason: 'shutting_down' } };
    }
    return { status: 'healthy' };
  }

  /**
   * Readiness check.
   * Checks all indicators marked as requiredForReadiness.
   * Returns unhealthy if ANY required indicator is unhealthy.
   */
  async readiness(): Promise<HealthStatus & { indicators: Record<string, HealthStatus> }> {
    if (this.shuttingDown) {
      return {
        status: 'unhealthy',
        details: { reason: 'shutting_down' },
        indicators: {},
      };
    }

    const results: Record<string, HealthStatus> = {};
    let overallHealthy = true;

    for (const indicator of this.indicators) {
      try {
        const result = await indicator.check();
        results[indicator.name] = result;

        if (indicator.requiredForReadiness && result.status === 'unhealthy') {
          overallHealthy = false;
        }
      } catch {
        results[indicator.name] = { status: 'unhealthy', details: { error: 'check_failed' } };
        if (indicator.requiredForReadiness) {
          overallHealthy = false;
        }
      }
    }

    return {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      indicators: results,
    };
  }
}
