import { useCallback, useEffect, useMemo, useState } from 'react';
import { createHttpApi } from './api/http';
import { createMockApi } from './api/mock';
import type { Role } from './api/types';
import { Dashboard } from './pages/Dashboard';
import { Ingest } from './pages/Ingest';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';
import { Vehicles } from './pages/Vehicles';
import { href, type Page, useRoute } from './lib/route';
import { loadSession, saveSession, type Session } from './lib/session';

const NAV: Record<Role, { page: Page; label: string }[]> = {
  viewer: [
    { page: 'dashboard', label: 'Dashboard' },
    { page: 'inventory', label: 'Inventory' },
    { page: 'aging', label: 'Aging stock' },
    { page: 'settings', label: 'Settings' },
  ],
  manager: [
    { page: 'dashboard', label: 'Dashboard' },
    { page: 'inventory', label: 'Inventory' },
    { page: 'aging', label: 'Aging stock' },
    { page: 'settings', label: 'Settings' },
  ],
  ingest: [{ page: 'ingest', label: 'Ingest vehicles' }],
};

const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', manager: 'Manager', ingest: 'Ingest feed' };

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [notice, setNotice] = useState('');
  const route = useRoute();

  const signOut = useCallback((message = '') => {
    saveSession(null);
    setSession(null);
    setNotice(message);
  }, []);

  const api = useMemo(() => {
    if (!session) return null;
    return session.mode === 'mock'
      ? createMockApi(session.role)
      : createHttpApi(session.token, () => signOut('Your token was rejected or has expired. Sign in with a new one.'));
  }, [session, signOut]);

  const nav = session ? NAV[session.role] : [];
  const allowed = route.page !== null && nav.some((n) => n.page === route.page);

  useEffect(() => {
    if (session && !allowed) window.location.replace(href(nav[0].page));
  }, [session, allowed, nav]);

  if (!session || !api) {
    return (
      <SignIn
        notice={notice}
        onSignIn={(s) => {
          saveSession(s);
          setNotice('');
          setSession(s);
        }}
      />
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="brand">Inventory Dashboard</p>
        <nav aria-label="Main">
          <ul>
            {nav.map((n) => (
              <li key={n.page}>
                <a href={href(n.page)} aria-current={route.page === n.page ? 'page' : undefined}>{n.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="account">
          <span className={`mode mode-${session.mode}`}>{session.mode === 'mock' ? 'Mock data' : 'Live backend'}</span>
          <p className="small account-who"><span>{session.subject}</span><span>{ROLE_LABEL[session.role]}</span></p>
          <button type="button" className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        {allowed && route.page === 'dashboard' && <Dashboard api={api} />}
        {allowed && route.page === 'inventory' && (
          <Vehicles key={`inventory-${route.params}`} api={api} role={session.role} aging={false} initialMake={route.params.get('make') ?? undefined} />
        )}
        {allowed && route.page === 'aging' && (
          <Vehicles key={`aging-${route.params}`} api={api} role={session.role} aging initialMake={route.params.get('make') ?? undefined} />
        )}
        {allowed && route.page === 'settings' && <Settings api={api} role={session.role} />}
        {allowed && route.page === 'ingest' && <Ingest api={api} />}
      </main>
    </div>
  );
}
