-- Fix: restore credential_requirements department FK as composite tenant key.
-- Migration 005 dropped the department FK but did not add it back as composite.

-- Add composite FK for credential_requirements → departments (nullable department_id)
ALTER TABLE staffing.credential_requirements
  ADD CONSTRAINT fk_cred_req_department
  FOREIGN KEY (tenant_id, department_id) REFERENCES staffing.departments (tenant_id, id);

-- Also fix confirmation_policies → facilities (missing from original composite migration)
ALTER TABLE staffing.confirmation_policies DROP CONSTRAINT IF EXISTS confirmation_policies_facility_id_fkey;
ALTER TABLE staffing.confirmation_policies
  ADD CONSTRAINT fk_confirm_policy_facility
  FOREIGN KEY (tenant_id, facility_id) REFERENCES staffing.facilities (tenant_id, id);
