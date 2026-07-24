-- Timekeeping: Clock events and timecards
-- Immutable event history for clock-in, breaks, clock-out
-- Timecards aggregate events for approval workflow

CREATE TABLE staffing.clock_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    assignment_id UUID NOT NULL REFERENCES staffing.assignments(id),
    worker_id UUID NOT NULL REFERENCES staffing.workers(id),
    event_type TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude DECIMAL,
    longitude DECIMAL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_clock_event_type CHECK (
        event_type IN ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT')
    )
);

CREATE INDEX idx_clock_events_assignment ON staffing.clock_events (assignment_id, occurred_at);
CREATE INDEX idx_clock_events_worker ON staffing.clock_events (worker_id, occurred_at);

ALTER TABLE staffing.clock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.clock_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.clock_events
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT ON staffing.clock_events TO staffing_app;

CREATE TABLE staffing.timecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    assignment_id UUID NOT NULL REFERENCES staffing.assignments(id),
    worker_id UUID NOT NULL REFERENCES staffing.workers(id),
    shift_id UUID NOT NULL REFERENCES staffing.shifts(id),
    status TEXT NOT NULL DEFAULT 'DRAFT',
    clock_in_at TIMESTAMPTZ,
    clock_out_at TIMESTAMPTZ,
    total_hours_worked DECIMAL,
    total_break_minutes INTEGER DEFAULT 0,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    rejected_at TIMESTAMPTZ,
    rejected_by TEXT,
    rejection_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_timecard_status CHECK (
        status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CORRECTION_REQUESTED')
    )
);

CREATE INDEX idx_timecards_assignment ON staffing.timecards (assignment_id);
CREATE INDEX idx_timecards_worker ON staffing.timecards (worker_id, status);
CREATE INDEX idx_timecards_tenant ON staffing.timecards (tenant_id, status);

ALTER TABLE staffing.timecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.timecards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.timecards
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.timecards TO staffing_app;
