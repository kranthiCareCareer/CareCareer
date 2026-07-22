-- P0 #12: Operational outbox — add dispatch, retry, and dead-letter support

ALTER TABLE staffing.event_outbox
  ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN next_attempt_at TIMESTAMPTZ,
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD COLUMN failed_at TIMESTAMPTZ,
  ADD COLUMN last_error TEXT,
  ADD COLUMN leased_by VARCHAR(100),
  ADD COLUMN leased_at TIMESTAMPTZ;

-- Status extended: PENDING → LEASED → PUBLISHED | DEAD_LETTER
ALTER TABLE staffing.event_outbox
  DROP CONSTRAINT IF EXISTS chk_outbox_status;

-- PostgreSQL does not name default CHECK constraints, drop by value match if needed
DO $$
BEGIN
  -- Add the updated CHECK constraint
  ALTER TABLE staffing.event_outbox
    ADD CONSTRAINT chk_outbox_status CHECK (
      status IN ('PENDING', 'LEASED', 'PUBLISHED', 'DEAD_LETTER')
    );
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists
END
$$;

-- Index for dispatcher polling: find PENDING events ready for processing
CREATE INDEX idx_outbox_pending ON staffing.event_outbox (status, next_attempt_at)
  WHERE status = 'PENDING';

-- Index for lease expiration detection
CREATE INDEX idx_outbox_leased ON staffing.event_outbox (status, leased_at)
  WHERE status = 'LEASED';

-- Grant UPDATE on outbox (needed for dispatcher to mark PUBLISHED/DEAD_LETTER)
GRANT UPDATE ON staffing.event_outbox TO staffing_app;
