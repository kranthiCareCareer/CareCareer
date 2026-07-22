---
inclusion: always
description: Structured JSON logging, correlation IDs, metrics, and health checks
---

# CareCareer Logging & Observability Standards

## 1. Logging Format (Structured JSON — Always)

Every log line MUST be structured JSON. No unstructured console.log.

```typescript
// ✅ CORRECT — structured, contextual, actionable
logger.info('Shift assigned to worker', {
  event: 'shift.assigned',
  tenantId: ctx.tenantId,
  shiftId: shift.id,
  workerId: worker.id,
  facilityId: shift.facilityId,
  correlationId: ctx.correlationId,
  duration_ms: elapsed,
});

// ❌ WRONG — unstructured, no context, useless in production
console.log('shift assigned');
console.log(`Assigned ${workerId} to ${shiftId}`);
```

## 2. Log Levels (Use Correctly)

| Level   | When to Use                          | Example                                                |
| ------- | ------------------------------------ | ------------------------------------------------------ |
| `error` | Something failed and requires action | Database connection lost, payment failed               |
| `warn`  | Something unexpected but handled     | Retry succeeded on 2nd attempt, rate limit approaching |
| `info`  | Significant business event happened  | Shift created, worker placed, timecard approved        |
| `debug` | Detailed flow for troubleshooting    | Query parameters, cache hit/miss, function entry/exit  |

### Rules:

- Production runs at `info` level (debug is off)
- NEVER log at `error` for expected business rejections (use `warn` or `info`)
- NEVER log sensitive data: passwords, SSN, tokens, full credit cards, PHI
- Log REDACTED versions of sensitive IDs: `workerId: 'wkr_***abc'`

## 3. Required Context on Every Log

Every log entry MUST include:

```typescript
{
  // WHO
  tenantId: string; // Which tenant
  userId: string; // Who performed the action (or 'system')
  actorType: 'user' | 'service' | 'agent' | 'system';

  // WHAT
  event: string; // Dot-notation event name
  service: string; // Which service produced this log

  // WHEN
  timestamp: string; // ISO 8601 (auto by logger)

  // TRACE
  correlationId: string; // Request correlation (trace across services)
  requestId: string; // Individual request ID

  // WHERE
  environment: string; // dev | staging | production
}
```

## 4. Correlation IDs (Cross-Service Tracing)

Every incoming HTTP request gets a `correlationId`:

- If request header `X-Correlation-ID` exists, use it
- Otherwise, generate a new UUID
- Pass it to ALL downstream service calls, events, jobs
- Include it in ALL log entries for that request

This lets you trace a single user action across 5+ services.

## 5. Request/Response Logging (HTTP Layer)

Every HTTP request and response is logged automatically by middleware:

```typescript
// REQUEST (info level)
{
  event: 'http.request.received',
  method: 'POST',
  path: '/api/v1/shifts',
  tenantId: 'tenant_abc',
  userId: 'user_xyz',
  correlationId: 'corr_123',
  userAgent: 'CareCareer-Mobile/1.0',
}

// RESPONSE (info level)
{
  event: 'http.response.sent',
  method: 'POST',
  path: '/api/v1/shifts',
  statusCode: 201,
  duration_ms: 45,
  correlationId: 'corr_123',
}

// ERROR (error level — only for 5xx)
{
  event: 'http.response.error',
  method: 'POST',
  path: '/api/v1/shifts',
  statusCode: 500,
  error: { message: '...', stack: '...' },
  correlationId: 'corr_123',
}
```

## 6. Domain Event Logging

Every published domain event is logged:

```typescript
{
  event: 'domain.event.published',
  eventType: 'schedule.shift.confirmed.v1',
  aggregateType: 'shift',
  aggregateId: 'shift_abc',
  tenantId: 'tenant_xyz',
  correlationId: 'corr_123',
}
```

## 7. Performance Logging

Log timing for any operation >100ms:

```typescript
{
  event: 'performance.slow_query',
  query: 'findShiftsByFacility',
  duration_ms: 340,
  threshold_ms: 100,
  tenantId: 'tenant_abc',
}
```

## 8. Health Checks

Every service exposes:

- `GET /health` — am I alive? (200 OK or 503)
- `GET /health/ready` — am I ready to serve traffic? (checks DB, Redis, etc.)
- `GET /health/detailed` — internal only, shows dependency status

## 9. Metrics (Emit from Day One)

Even locally, emit metrics (use prom-client for Prometheus format):

- `http_requests_total` (method, path, status_code, tenant_id)
- `http_request_duration_seconds` (histogram)
- `domain_events_published_total` (event_type)
- `domain_events_consumed_total` (event_type, success/failure)
- `database_query_duration_seconds` (query_name)
- `queue_job_duration_seconds` (job_type)
- `queue_depth` (queue_name)

## 10. What NEVER Goes in Logs

- Passwords or password hashes
- JWT tokens or API keys
- Social Security Numbers
- Full credit card numbers
- Protected Health Information (PHI)
- Background check results
- Drug test results
- Full request/response bodies (log summary only)
- Stack traces at info/warn level (only at error level)

If in doubt: would you be comfortable if this log line appeared on a public dashboard? If no, redact it.

---
