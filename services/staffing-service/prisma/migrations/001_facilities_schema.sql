-- GP-05: Facility and Department Management
-- Staffing service schema with tenant-scoped RLS

-- ─── Application Role ─────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'staffing_app') THEN
    CREATE ROLE staffing_app NOINHERIT LOGIN PASSWORD 'staffing_app_dev';
  END IF;
END
$$;

-- ─── Schema ───────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS staffing;

-- ─── Clients ──────────────────────────────────────────────────────────────────

CREATE TABLE staffing.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_client_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

ALTER TABLE staffing.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.clients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.clients
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Facilities ───────────────────────────────────────────────────────────────

CREATE TABLE staffing.facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    client_id UUID NOT NULL REFERENCES staffing.clients(id),
    name VARCHAR(200) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    address_line1 VARCHAR(300),
    address_line2 VARCHAR(300),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    country VARCHAR(3) DEFAULT 'US',
    timezone VARCHAR(50) NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    geofence_radius_meters INTEGER,
    geofence_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_facility_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    CONSTRAINT chk_timezone_not_empty CHECK (timezone <> '')
);

CREATE INDEX idx_facilities_tenant ON staffing.facilities (tenant_id);
CREATE INDEX idx_facilities_client ON staffing.facilities (client_id);

ALTER TABLE staffing.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.facilities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.facilities
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Departments ──────────────────────────────────────────────────────────────

CREATE TABLE staffing.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    facility_id UUID NOT NULL REFERENCES staffing.facilities(id),
    name VARCHAR(200) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_department_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT uq_department_name_facility UNIQUE (facility_id, name)
);

CREATE INDEX idx_departments_facility ON staffing.departments (facility_id);

ALTER TABLE staffing.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.departments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.departments
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Credential Requirements ──────────────────────────────────────────────────

CREATE TABLE staffing.credential_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    facility_id UUID NOT NULL REFERENCES staffing.facilities(id),
    department_id UUID REFERENCES staffing.departments(id),
    role VARCHAR(50) NOT NULL,
    credential_type VARCHAR(100) NOT NULL,
    required BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cred_req_facility ON staffing.credential_requirements (facility_id, role);
CREATE INDEX idx_cred_req_dept ON staffing.credential_requirements (department_id, role);

ALTER TABLE staffing.credential_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.credential_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.credential_requirements
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Confirmation Policies ────────────────────────────────────────────────────

CREATE TABLE staffing.confirmation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    facility_id UUID NOT NULL REFERENCES staffing.facilities(id),
    authority VARCHAR(30) NOT NULL DEFAULT 'SCHEDULER',
    auto_confirm BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_authority CHECK (authority IN ('SCHEDULER', 'CLIENT', 'AUTO'))
);

ALTER TABLE staffing.confirmation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.confirmation_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.confirmation_policies
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Event Outbox ─────────────────────────────────────────────────────────────

CREATE TABLE staffing.event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    event_type VARCHAR(200) NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(200) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE staffing.event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.event_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.event_outbox
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Audit Records ────────────────────────────────────────────────────────────

CREATE TABLE staffing.audit_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    actor_id VARCHAR(200) NOT NULL,
    action VARCHAR(200) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    before_summary JSONB,
    after_summary JSONB,
    correlation_id VARCHAR(200) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE staffing.audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.audit_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.audit_records
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA staffing TO staffing_app;
GRANT SELECT, INSERT, UPDATE ON staffing.clients TO staffing_app;
GRANT SELECT, INSERT, UPDATE ON staffing.facilities TO staffing_app;
GRANT SELECT, INSERT, UPDATE ON staffing.departments TO staffing_app;
GRANT SELECT, INSERT, UPDATE ON staffing.credential_requirements TO staffing_app;
GRANT SELECT, INSERT, UPDATE ON staffing.confirmation_policies TO staffing_app;
GRANT SELECT, INSERT ON staffing.event_outbox TO staffing_app;
GRANT SELECT, INSERT ON staffing.audit_records TO staffing_app;
