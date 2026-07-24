-- GP-10: Assignments
-- Created when a shift request is confirmed; tracks worker assignment lifecycle

CREATE TABLE staffing.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    shift_id UUID NOT NULL REFERENCES staffing.shifts(id),
    worker_id UUID NOT NULL REFERENCES staffing.workers(id),
    shift_request_id UUID REFERENCES staffing.shift_requests(id),
    status TEXT NOT NULL DEFAULT 'CONFIRMED',
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_by TEXT NOT NULL,
    checked_in_at TIMESTAMPTZ,
    checked_out_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancelled_by TEXT,
    no_show_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_assignment_status CHECK (
        status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
    )
);

CREATE INDEX idx_assignments_shift ON staffing.assignments (shift_id, status);
CREATE INDEX idx_assignments_worker ON staffing.assignments (worker_id, status);
CREATE INDEX idx_assignments_tenant ON staffing.assignments (tenant_id, status);

ALTER TABLE staffing.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.assignments
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.assignments TO staffing_app;
