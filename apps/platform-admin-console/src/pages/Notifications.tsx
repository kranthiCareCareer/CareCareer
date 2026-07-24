import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth-context';

interface Notification {
  id: string;
  notificationType: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
}

/**
 * Notifications page — worker views their notifications.
 */
export function Notifications() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/v1/notifications', {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { data: Notification[] };
        setNotifications(body.data);
        setError(null);
      } catch (e: unknown) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [token]);

  async function markRead(notificationId: string) {
    try {
      await fetch(`/api/v1/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, status: 'READ' } : n)),
      );
    } catch {
      // silently ignore
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Notifications</h1>
      </header>

      {loading && <p role="status">Loading notifications...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!loading && !error && notifications.length === 0 && (
        <p className="empty-state">No notifications.</p>
      )}

      {!loading && notifications.length > 0 && (
        <div className="notification-list">
          {notifications.map((n) => (
            <article
              key={n.id}
              className={`notification ${n.status === 'READ' ? 'notification--read' : ''}`}
            >
              <div className="notification__header">
                <span className="notification__type">{n.notificationType}</span>
                <time className="notification__time">
                  {new Date(n.createdAt).toLocaleString()}
                </time>
              </div>
              <h3 className="notification__subject">{n.subject}</h3>
              <p className="notification__body">{n.body}</p>
              {n.status !== 'READ' && (
                <button
                  className="btn btn--sm"
                  onClick={() => markRead(n.id)}
                  aria-label={`Mark notification "${n.subject}" as read`}
                >
                  Mark Read
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
