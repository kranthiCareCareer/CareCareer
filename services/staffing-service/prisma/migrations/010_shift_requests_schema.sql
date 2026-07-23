-- GP-09: Worker Marketplace and Shift Requests
-- Shift requests represent a worker's interest in working a shift

CREATE TABLE staffing.shift_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    shift_id UUID NOT NULL REFERENCES staffing.shifts(id),
    worker_id UUID NOT NULL REFERENCES staffing.workers(id),
    status TEXT NOT NULL DEFAULT 'REQUESTED',
    eligibility_evaluation_id UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    rejection_reason TEXT,
    withdrawn_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    correlation_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_request_status CHECK (
        status IN ('REQUESTED', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')
    ),
    CONSTRAINT unique_worker_shift UNIQUE (tenant_id, shift_id, worker_id)
);

CREATE INDEX idx_shift_requests_shift ON staffing.shift_requests (shift_id);
CREATE INDEX idx_shift_requests_worker ON staffing.shift_requests (worker_id);
CREATE INDEX idx_shift_requests_tenant_status ON staffing.shift_requests (tenant_id, status);
CREATE INDEX idx_shift_requests_expires ON staffing.shift_requests (expires_at) WHERE status = 'REQUESTED';

ALTER TABLE staffing.shift_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.shift_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.shift_requests
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.shift_requests TO staffing_app;
