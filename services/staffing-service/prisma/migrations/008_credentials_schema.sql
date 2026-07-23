-- GP-07: Credential and Eligibility Engine
-- Worker credentials + eligibility evaluations with RLS

-- ─── Worker Credentials ───────────────────────────────────────────────────────

CREATE TABLE staffing.worker_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    worker_id UUID NOT NULL REFERENCES staffing.workers(id),
    credential_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    issuing_authority TEXT,
    credential_number TEXT,
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    verified_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_credential_status CHECK (
        status IN ('UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'EXPIRING', 'EXPIRED')
    )
);

CREATE INDEX idx_worker_credentials_worker ON staffing.worker_credentials (worker_id);
CREATE INDEX idx_worker_credentials_tenant_worker ON staffing.worker_credentials (tenant_id, worker_id);
CREATE INDEX idx_worker_credentials_type_status ON staffing.worker_credentials (credential_type, status);

ALTER TABLE staffing.worker_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.worker_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.worker_credentials
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.worker_credentials TO staffing_app;

-- ─── Eligibility Evaluations ──────────────────────────────────────────────────

CREATE TABLE staffing.eligibility_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    worker_id UUID NOT NULL REFERENCES staffing.workers(id),
    facility_id UUID NOT NULL REFERENCES staffing.facilities(id),
    checkpoint TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reasons JSONB NOT NULL DEFAULT '[]',
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_by TEXT NOT NULL,
    correlation_id TEXT,
    CONSTRAINT valid_checkpoint CHECK (
        checkpoint IN ('MARKETPLACE_DISPLAY', 'REQUEST_SUBMISSION', 'ASSIGNMENT_CONFIRMATION', 'CLOCK_IN')
    ),
    CONSTRAINT valid_outcome CHECK (
        outcome IN ('ELIGIBLE', 'INELIGIBLE', 'ELIGIBLE_WITH_EXCEPTION', 'ERROR')
    )
);

CREATE INDEX idx_eligibility_evaluations_worker ON staffing.eligibility_evaluations (worker_id);
CREATE INDEX idx_eligibility_evaluations_facility ON staffing.eligibility_evaluations (facility_id);
CREATE INDEX idx_eligibility_evaluations_tenant_worker ON staffing.eligibility_evaluations (tenant_id, worker_id);

ALTER TABLE staffing.eligibility_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.eligibility_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.eligibility_evaluations
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT ON staffing.eligibility_evaluations TO staffing_app;
