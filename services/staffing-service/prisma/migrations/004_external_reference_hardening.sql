-- GP-06: External Reference Hardening
-- Enforce: one external ID per system maps to one worker per tenant.
-- Restrict system_name to approved values.

-- One external system ID cannot map to two different workers in the same tenant
CREATE UNIQUE INDEX idx_external_ref_system_id_tenant
  ON staffing.external_references (tenant_id, system_name, external_id);

-- Restrict system names to approved values
ALTER TABLE staffing.external_references
  ADD CONSTRAINT chk_system_name CHECK (
    system_name IN ('symplr', 'bullhorn', 'labor-edge', 'maestra', 'auth0')
  );
