-- GP-07: Idempotency for credential mutations
-- Ensures exactly-once semantics for create, submit, verify, reject, revoke, renew

CREATE TABLE staffing.idempotency_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    http_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    completed_at TIMESTAMPTZ,
    CONSTRAINT valid_idempotency_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    CONSTRAINT unique_tenant_operation_key UNIQUE (tenant_id, operation, idempotency_key)
);

CREATE INDEX idx_idempotency_expires ON staffing.idempotency_records (expires_at)
    WHERE status = 'IN_PROGRESS';

ALTER TABLE staffing.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.idempotency_records
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.idempotency_records TO staffing_app;
