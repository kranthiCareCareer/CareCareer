-- GP-07: Expand credential lifecycle states
-- Forward-only migration — adds REJECTED, REVOKED, CORRECTION_REQUIRED, SUPERSEDED
-- Existing rows remain valid (all current values are still in the new set)

-- Drop the old constraint and replace with expanded set
ALTER TABLE staffing.worker_credentials
  DROP CONSTRAINT valid_credential_status;

ALTER TABLE staffing.worker_credentials
  ADD CONSTRAINT valid_credential_status CHECK (
    status IN (
      'UPLOADED',
      'PENDING_VERIFICATION',
      'CORRECTION_REQUIRED',
      'VERIFIED',
      'EXPIRING',
      'EXPIRED',
      'REJECTED',
      'REVOKED',
      'SUPERSEDED'
    )
  );
