-- GP-09: Worker Marketplace and Shift Requests
-- Shift requests represent a worker's interest in working a shift

-- First, add composite unique keys to parent tables for referential integrity
ALTER TABLE staffing.shifts ADD CONSTRAINT uq_shifts_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE staffing.workers ADD CONSTRAINT uq_workers_tenant_id UNIQUE (tenant_id, id);

CREATE TABLE staffing.shift_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    shift_id UUID NOT NULL,
    worker_id UUID NOT NULL,
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
    -- Composite tenant FKs: prove shift and worker belong to same tenant
    CONSTRAINT fk_shift_requests_shift FOREIGN KEY (tenant_id, shift_id)
        REFERENCES staffing.shifts (tenant_id, id),
    CONSTRAINT fk_shift_requests_worker FOREIGN KEY (tenant_id, worker_id)
        REFERENCES staffing.workers (tenant_id, id),
    -- Eligibility evaluation FK (same tenant)
    CONSTRAINT fk_shift_requests_evaluation FOREIGN KEY (eligibility_evaluation_id)
        REFERENCES staffing.eligibility_evaluations (id),
    -- Only one ACTIVE request per worker per shift (allows re-request after terminal states)
    CONSTRAINT unique_active_worker_shift UNIQUE (tenant_id, shift_id, worker_id)
        DEFERRABLE INITIALLY DEFERRED
);

-- Partial unique index: only one non-terminal request per worker+shift
-- This allows re-requests after REJECTED, WITHDRAWN, or EXPIRED
CREATE UNIQUE INDEX idx_shift_requests_active_unique
    ON staffing.shift_requests (tenant_id, shift_id, worker_id)
    WHERE status IN ('REQUESTED', 'UNDER_REVIEW', 'CONFIRMED');

-- Drop the table-level constraint in favor of the partial index
ALTER TABLE staffing.shift_requests DROP CONSTRAINT unique_active_worker_shift;

CREATE INDEX idx_shift_requests_shift ON staffing.shift_requests (shift_id);
CREATE INDEX idx_shift_requests_worker ON staffing.shift_requests (worker_id);
CREATE INDEX idx_shift_requests_tenant_status ON staffing.shift_requests (tenant_id, status);
CREATE INDEX idx_shift_requests_expires ON staffing.shift_requests (expires_at) WHERE status = 'REQUESTED';

ALTER TABLE staffing.shift_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.shift_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.shift_requests
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.shift_requests TO staffing_app;
