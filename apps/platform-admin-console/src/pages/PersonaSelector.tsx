import { useState } from 'react';
import { useAuth, DEMO_PERSONAS } from '../lib/auth-context';

/**
 * Demo-only persona selector screen.
 * Clearly labeled as development-only. Not production login.
 */
export function PersonaSelector() {
  const { selectPersona } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(personaId: string) {
    const persona = DEMO_PERSONAS.find((p) => p.id === personaId);
    if (!persona) return;

    setLoading(personaId);
    setError(null);

    try {
      await selectPersona(persona);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="persona-selector">
      <div className="persona-selector__header">
        <h1>CareCareer Platform Admin Console</h1>
        <div className="persona-selector__badge">⚠️ DEMO MODE — Development Only</div>
        <p>Select a persona to access the platform administration console.</p>
      </div>

      {error && (
        <div className="persona-selector__error" role="alert">
          {error}
        </div>
      )}

      <div className="persona-selector__grid">
        {DEMO_PERSONAS.map((persona) => (
          <button
            key={persona.id}
            className="persona-card"
            onClick={() => handleSelect(persona.id)}
            disabled={loading !== null}
            aria-busy={loading === persona.id}
          >
            <h3>{persona.label}</h3>
            <span className="persona-card__role">{persona.role}</span>
            <p>{persona.description}</p>
            {loading === persona.id && (
              <span className="persona-card__loading">Authenticating...</span>
            )}
          </button>
        ))}
      </div>

      <footer className="persona-selector__footer">
        <p>
          This persona selector is enabled only in demo/local configuration. Production
          authentication uses a proper identity provider.
        </p>
      </footer>
    </div>
  );
}
