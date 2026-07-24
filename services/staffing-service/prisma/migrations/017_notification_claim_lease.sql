-- Atomic notification claim and lease support
-- Prevents duplicate delivery when multiple workers process concurrently

ALTER TABLE staffing.notifications
  ADD COLUMN IF NOT EXISTS claim_owner TEXT,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_failure BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient claim queries (pending + unclaimed or expired lease)
CREATE INDEX IF NOT EXISTS idx_notifications_claimable
  ON staffing.notifications (status, lease_expires_at)
  WHERE status = 'PENDING' AND terminal_failure = FALSE;
