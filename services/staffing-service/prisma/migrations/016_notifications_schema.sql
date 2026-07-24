-- Notifications: In-app notifications and delivery tracking
-- Outbox-driven, supports email (MailHog) and in-app

CREATE TABLE staffing.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    recipient_type TEXT NOT NULL DEFAULT 'USER',
    channel TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'PENDING',
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_notification_channel CHECK (
        channel IN ('EMAIL', 'IN_APP', 'SMS')
    ),
    CONSTRAINT valid_notification_status CHECK (
        status IN ('PENDING', 'DELIVERED', 'FAILED', 'READ')
    )
);

CREATE INDEX idx_notifications_recipient ON staffing.notifications (recipient_id, status);
CREATE INDEX idx_notifications_tenant_status ON staffing.notifications (tenant_id, status);
CREATE INDEX idx_notifications_pending ON staffing.notifications (status, created_at)
    WHERE status = 'PENDING';

ALTER TABLE staffing.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.notifications
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT, UPDATE ON staffing.notifications TO staffing_app;

-- Audit log for the staffing service (append-only)
CREATE TABLE staffing.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    actor_id TEXT NOT NULL,
    actor_type TEXT NOT NULL DEFAULT 'USER',
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    correlation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tenant ON staffing.audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON staffing.audit_log (resource_type, resource_id);

ALTER TABLE staffing.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staffing.audit_log
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
GRANT SELECT, INSERT ON staffing.audit_log TO staffing_app;
