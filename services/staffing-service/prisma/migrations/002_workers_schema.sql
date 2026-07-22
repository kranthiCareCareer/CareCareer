-- GP-06: Worker Minimum Profile
-- Workers table with lifecycle state machine and RLS

-- ─── Workers ──────────────────────────────────────────────────────────────────

CREATE TABLE staffing.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(30),
    status VARCHAR(30) NOT NULL DEFAULT 'APPLICANT',
    profession VARCHAR(50) NOT NULL,
    specialty VARCHAR(100),
    home_latitude DECIMAL(10, 7),
    home_longitude DECIMAL(10, 7),
    home_city VARCHAR(100),
    home_state VARCHAR(50),
    home_zip VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_worker_status CHECK (status IN (
        'APPLICANT', 'SCREENING', 'QUALIFIED', 'CREDENTIALING',
        'READY', 'ACTIVE', 'INACTIVE', 'BLOCKED', 'ALUMNI'
    )),
    CONSTRAINT uq_worker_email_tenant UNIQUE (tenant_id, email)
);

CREATE INDEX idx_workers_tenant ON staffing.workers (tenant_id);
CREATE INDEX idx_workers_status ON staffing.workers (tenant_id, status);
CREATE INDEX idx_workers_profession ON staffing.workers (tenant_id, profession);

ALTER TABLE staffing.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.workers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.workers
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── External References ──────────────────────────────────────────────────────

CREATE TABLE staffing.external_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    worker_id UUID NOT NULL REFERENCES staffing.workers(id),
    system_name VARCHAR(50) NOT NULL,
    external_id VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_external_ref UNIQUE (tenant_id, worker_id, system_name)
);

ALTER TABLE staffing.external_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.external_references FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.external_references
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON staffing.workers TO staffing_app;
GRANT SELECT, INSERT ON staffing.external_references TO staffing_app;
