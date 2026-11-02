import type { Role } from '../api/types';

export type Session =
  | { mode: 'mock'; role: Role; subject: string }
  | { mode: 'live'; role: Role; subject: string; token: string };

const KEY = 'inventory.session';

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked; the session then lasts until reload.
  }
}

/**
 * Reads role and subject from a JWT so the UI can show the right screens. This
 * is not verification: the API checks the signature on every request.
 */
export function sessionFromToken(raw: string): Session {
  const token = raw.trim().replace(/^Bearer\s+/i, '');
  let claims: { sub?: string; role?: string; exp?: number };
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    claims = JSON.parse(atob(payload));
  } catch {
    throw new Error('That does not look like a JWT. Paste the whole token.');
  }
  if (claims.role !== 'viewer' && claims.role !== 'manager' && claims.role !== 'ingest') {
    throw new Error(`The token has an unknown role: ${String(claims.role)}.`);
  }
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    throw new Error('This token has expired. Mint a new one.');
  }
  return { mode: 'live', role: claims.role, subject: claims.sub ?? 'unknown', token };
}
