import { useParams, Link } from 'react-router-dom';

/**
 * Audit timeline page — read-only display of tenant activity.
 * Connects to GET /v1/tenants/:tenantId/audit-records when available.
 * For now displays placeholder until the backend endpoint is added.
 */
export function AuditTimeline() {
  const { tenantId } = useParams<{ tenantId: string }>();

  return (
    <div className="audit-page">
      <header className="page-header">
        <div className="page-header__left">
          <Link to={`/tenants/${tenantId}`} className="breadcrumb">
            ← Tenant
          </Link>
          <h1>Audit Timeline</h1>
        </div>
      </header>

      <p className="description">
        Administrative actions are recorded in an immutable, append-only audit log. Sensitive values
        are redacted. This view is read-only.
      </p>

      <div className="audit-placeholder">
        <p className="empty-state">
          Audit timeline will display after tenant operations are performed. Each entry shows:
          timestamp, actor, action, resource, reason, and correlation ID.
        </p>
      </div>
    </div>
  );
}
