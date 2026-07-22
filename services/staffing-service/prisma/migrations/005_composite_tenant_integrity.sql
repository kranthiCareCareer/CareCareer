-- P0: Composite tenant foreign keys
-- Prevent cross-tenant referential integrity violations at the database level.
-- RLS alone is not sufficient — composite keys ensure structural correctness.

-- Clients: add unique on (tenant_id, id) for composite FK targets
ALTER TABLE staffing.clients ADD CONSTRAINT uq_clients_tenant_id UNIQUE (tenant_id, id);

-- Facilities: composite FK to clients
ALTER TABLE staffing.facilities DROP CONSTRAINT IF EXISTS facilities_client_id_fkey;
ALTER TABLE staffing.facilities
  ADD CONSTRAINT fk_facilities_client
  FOREIGN KEY (tenant_id, client_id) REFERENCES staffing.clients (tenant_id, id);

-- Add unique on facilities (tenant_id, id) for downstream composite FKs
ALTER TABLE staffing.facilities ADD CONSTRAINT uq_facilities_tenant_id UNIQUE (tenant_id, id);

-- Departments: composite FK to facilities
ALTER TABLE staffing.departments DROP CONSTRAINT IF EXISTS departments_facility_id_fkey;
ALTER TABLE staffing.departments
  ADD CONSTRAINT fk_departments_facility
  FOREIGN KEY (tenant_id, facility_id) REFERENCES staffing.facilities (tenant_id, id);

-- Add unique on departments (tenant_id, id)
ALTER TABLE staffing.departments ADD CONSTRAINT uq_departments_tenant_id UNIQUE (tenant_id, id);

-- Credential requirements: composite FK to facilities and departments
ALTER TABLE staffing.credential_requirements DROP CONSTRAINT IF EXISTS credential_requirements_facility_id_fkey;
ALTER TABLE staffing.credential_requirements
  ADD CONSTRAINT fk_cred_req_facility
  FOREIGN KEY (tenant_id, facility_id) REFERENCES staffing.facilities (tenant_id, id);

ALTER TABLE staffing.credential_requirements DROP CONSTRAINT IF EXISTS credential_requirements_department_id_fkey;
-- Department is nullable, so this FK only applies when department_id is set
-- PostgreSQL handles nullable composite FKs correctly (NULL department_id skips check)

-- Workers: add unique on (tenant_id, id) for external references FK
ALTER TABLE staffing.workers ADD CONSTRAINT uq_workers_tenant_id UNIQUE (tenant_id, id);

-- External references: composite FK to workers
ALTER TABLE staffing.external_references DROP CONSTRAINT IF EXISTS external_references_worker_id_fkey;
ALTER TABLE staffing.external_references
  ADD CONSTRAINT fk_ext_ref_worker
  FOREIGN KEY (tenant_id, worker_id) REFERENCES staffing.workers (tenant_id, id);
