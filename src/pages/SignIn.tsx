import { type FormEvent, useEffect, useState } from 'react';
import type { Role } from '../api/types';
import { type Session, sessionFromToken } from '../lib/session';

const ROLES: { role: Role; title: string; can: string }[] = [
  { role: 'manager', title: 'Manager', can: 'Reads inventory, logs actions, and sets the aging threshold.' },
  { role: 'viewer', title: 'Viewer', can: 'Reads inventory, aging stock, and history.' },
  { role: 'ingest', title: 'Ingest feed', can: 'Uploads vehicle batches. Cannot read inventory.' },
];

type Health = 'checking' | 'up' | 'down';

export function SignIn({ notice, onSignIn }: { notice?: string; onSignIn: (s: Session) => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [health, setHealth] = useState<Health>('checking');

  useEffect(() => {
    let active = true;
    fetch('/readyz')
      .then((res) => active && setHealth(res.ok ? 'up' : 'down'))
      .catch(() => active && setHealth('down'));
    return () => {
      active = false;
    };
  }, []);

  const connect = (e: FormEvent) => {
    e.preventDefault();
    try {
      onSignIn(sessionFromToken(token));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="signin">
      <header className="signin-header">
        <h1>Inventory Dashboard</h1>
        <p>Choose how to open the dashboard.</p>
      </header>
      {notice && <p className="notice notice-error" role="alert">{notice}</p>}
      <div className="signin-grid">
        <section className="card" aria-labelledby="mock-heading">
          <h2 id="mock-heading">Explore with mock data</h2>
          <p className="small">Runs in this browser with about 500 sample vehicles. Nothing else needs to be running, and changes reset when you reload.</p>
          <ul className="role-list">
            {ROLES.map(({ role, title, can }) => (
              <li key={role}>
                <button
                  type="button"
                  className="role-button"
                  onClick={() => onSignIn({ mode: 'mock', role, subject: `demo-${role}` })}
                >
                  <span className="role-title">{title}</span>
                  <span className="small">{can}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="live-heading">
          <div className="card-title-row">
            <h2 id="live-heading">Connect to the backend</h2>
            <span className={`health health-${health}`} role="status">
              {health === 'checking' ? 'Checking…' : health === 'up' ? 'Backend ready' : 'Backend not reachable'}
            </span>
          </div>
          {health === 'down' && (
            <p className="small">Start it from <code>KL_Test</code> with <code>docker compose up -d</code>.</p>
          )}
          <form onSubmit={connect}>
            <div className="field">
              <label htmlFor="token">Access token</label>
              <textarea
                id="token"
                rows={4}
                className="mono"
                spellCheck={false}
                autoComplete="off"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setError('');
                }}
              />
              {error && <p className="field-error" role="alert">{error}</p>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={!token.trim()}>Connect</button>
          </form>
          <div className="hint-block">
            <p className="small">Mint a token from <code>KL_Test</code>. Use <code>viewer</code>, <code>manager</code>, or <code>ingest</code> as the role.</p>
            <pre><code>docker compose exec -T api /api token -role manager</code></pre>
          </div>
        </section>
      </div>
    </main>
  );
}
