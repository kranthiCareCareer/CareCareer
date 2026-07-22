-- GP-06: Worker Identity Link
-- Canonical mapping between identity-service user and worker profile.
-- Do not infer worker identity from email.

ALTER TABLE staffing.workers
  ADD COLUMN user_id UUID;

-- One user maps to one worker per tenant
CREATE UNIQUE INDEX idx_workers_user_tenant ON staffing.workers (tenant_id, user_id)
  WHERE user_id IS NOT NULL;

-- Note: user_id is nullable because workers may be created by admins
-- before the worker has a platform account (pre-onboarding state).
-- The link is established when the worker accepts an invitation or
-- when admin explicitly binds the worker to a user account.
