import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { FeatureConfiguration, FeatureKey } from '../api/types';

const FEATURE_LABELS: Record<string, { label: string; type: 'boolean' | 'number' }> = {
  'scheduling.auto_confirm_enabled': { label: 'Auto-confirm shifts', type: 'boolean' },
  'scheduling.max_workers_per_shift': { label: 'Max workers per shift', type: 'number' },
  'timekeeping.geofence_required': { label: 'Geofence required', type: 'boolean' },
  'timekeeping.allowed_clock_in_minutes_before': {
    label: 'Clock-in window (before)',
    type: 'number',
  },
  'timekeeping.allowed_clock_in_minutes_after': {
    label: 'Clock-in window (after)',
    type: 'number',
  },
  'timekeeping.break_reminder_enabled': { label: 'Break reminders', type: 'boolean' },
  'recruiting.auto_post_to_boards': { label: 'Auto-post to job boards', type: 'boolean' },
  'notifications.sms_enabled': { label: 'SMS notifications', type: 'boolean' },
  'notifications.push_enabled': { label: 'Push notifications', type: 'boolean' },
};

export function Features() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [features, setFeatures] = useState<FeatureConfiguration[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) loadFeatures();
  }, [tenantId]);

  async function loadFeatures() {
    try {
      const data = await apiClient.getFeatures(tenantId!);
      setFeatures(data);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load');
    }
  }

  async function updateFeature(key: FeatureKey, value: unknown) {
    setError(null);
    try {
      await apiClient.updateFeature(tenantId!, key, value);
      await loadFeatures();
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Update failed');
    }
  }

  const featureMap = new Map(features.map((f) => [f.featureKey, f]));

  return (
    <div className="features-page">
      <header className="page-header">
        <div className="page-header__left">
          <Link to={`/tenants/${tenantId}`} className="breadcrumb">
            ← Tenant
          </Link>
          <h1>Feature Configuration</h1>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <p className="description">
        Feature settings are available only for entitled modules. The backend validates entitlements
        before applying changes.
      </p>
      <div className="features-grid">
        {Object.entries(FEATURE_LABELS).map(([key, meta]) => {
          const current = featureMap.get(key as FeatureKey);
          return (
            <div key={key} className="feature-card">
              <label className="feature-card__label">{meta.label}</label>
              <code className="feature-card__key">{key}</code>
              {meta.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={Boolean(current?.value)}
                  onChange={(e) => updateFeature(key as FeatureKey, e.target.checked)}
                  aria-label={meta.label}
                />
              ) : (
                <input
                  type="number"
                  value={Number(current?.value ?? 0)}
                  onChange={(e) => updateFeature(key as FeatureKey, parseInt(e.target.value, 10))}
                  className="input input--small"
                  min={0}
                  max={120}
                  aria-label={meta.label}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
