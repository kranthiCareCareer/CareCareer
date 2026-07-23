-- GP-08: Shift Creation and Publication
-- Shifts represent work opportunities at healthcare facilities

CREATE TABLE staffing.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    facility_id UUID NOT NULL REFERENCES staffing.facilities(id),
    department_id UUID REFERENCES staffing.departments(id),
    status TEXT NOT NULL DEFAULT 'DRAFT',
    role TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    business_date DATE NOT NULL,
    required_worker_count INTEGER NOT NULL DEFAULT 1,
    filled_worker_count INTEGER NOT NULL DEFAULT 0,
    pay_rate_cents INTEGER NOT NULL,
    bill_rate_cents INTEGER NOT NULL,
    notes TEXT,
    published_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_shift_status CHECK (
        status IN ('DRAFT', 'PUBLISHED', 'PARTIALLY_FILLED', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
    ),
    CONSTRAINT valid_shift_role CHECK (
        role IN ('RN', 'LPN', 'CNA', 'RT', 'ALLIED')
    ),
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT valid_worker_count CHECK (required_worker_count >= 1),
    CONSTRAINT valid_rates CHECK (pay_rate_cents > 0 AND bill_rate_cents > 0),
    CONSTRAINT valid_fill CHECK (filled_worker_count <= required_worker_count)
);

CREATE INDEX idx_shifts_tenant_facility ON staffing.shifts (tenant_id, facility_id);
CREATE INDEX idx_shifts_status ON staffing.shifts (status);
CREATE INDEX idx_shifts_business_date ON staffing.shifts (business_date);
CREATE INDEX idx_shifts_tenant_date ON staffing.shifts (tenant_id, business_date, status);

ALTER TABLE staffing.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.shifts
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.shifts TO staffing_app;
