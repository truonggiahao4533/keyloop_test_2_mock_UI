import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TYPES, type Action, type Api, type Role, type Vehicle } from '../api/types';
import { actionLabel, formatDate, formatDateTime, formatPrice, newIdempotencyKey } from '../lib/format';
import { usePolling } from '../lib/usePolling';
import { AgingBadge, EmptyState, ErrorNotice } from './States';

const NOTE_LIMIT = 1000;

interface Props {
  api: Api;
  role: Role;
  vehicle: Vehicle;
  onClose: () => void;
  onLogged: (action: Action) => void;
}

export function VehicleDrawer({ api, role, vehicle, onClose, onLogged }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<Action[] | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  // Only the newest request may update the history, so a slow refresh cannot
  // hide an action that was logged after it started.
  const latestRequest = useRef(0);
  const fetchHistory = useCallback(
    (background: boolean) => {
      const id = ++latestRequest.current;
      if (!background) setHistoryError(null);
      api.history(vehicle.id).then(
        (result) => {
          if (id !== latestRequest.current) return;
          setHistory(result);
          setHistoryError(null);
        },
        (err: unknown) => {
          if (id === latestRequest.current && !background) setHistoryError(err);
        },
      );
    },
    [api, vehicle.id],
  );
  const loadHistory = useCallback(() => fetchHistory(false), [fetchHistory]);
  useEffect(loadHistory, [loadHistory]);
  usePolling(() => fetchHistory(true));

  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="drawer-body">
        <header className="drawer-header">
          <div>
            <h2>{title}</h2>
            <p className="small mono">{vehicle.vin}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>Close</button>
        </header>

        <dl className="facts">
          <div><dt>Price</dt><dd>{formatPrice(vehicle.price)}</dd></div>
          <div><dt>Received</dt><dd>{formatDate(vehicle.received_at)}</dd></div>
          <div>
            <dt>Age</dt>
            <dd className="with-badge">{vehicle.age_days} days {vehicle.is_aging && <AgingBadge />}</dd>
          </div>
          <div>
            <dt>Current action</dt>
            <dd>{vehicle.current_action ? actionLabel(vehicle.current_action) : 'None logged'}</dd>
          </div>
        </dl>

        {role === 'manager' ? (
          <LogActionForm
            api={api}
            vehicleId={vehicle.id}
            onLogged={(action) => {
              onLogged(action);
              loadHistory();
            }}
          />
        ) : (
          <p className="small notice">Only managers can log actions.</p>
        )}

        <section aria-labelledby="history-heading">
          <h3 id="history-heading">Action history</h3>
          {historyError != null && <ErrorNotice error={historyError} onRetry={loadHistory} />}
          {history === null && historyError == null && <p className="small">Loading history…</p>}
          {history?.length === 0 && (
            <EmptyState title="No actions yet"><p className="small">Logged actions appear here, newest first.</p></EmptyState>
          )}
          {history && history.length > 0 && (
            <ol className="timeline">
              {history.map((a) => (
                <li key={a.id}>
                  <p className="timeline-title">{actionLabel(a.action_type)}</p>
                  {a.note && <p className="timeline-note">{a.note}</p>}
                  <p className="small">{a.created_by} · {formatDateTime(a.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </dialog>
  );
}

function LogActionForm({ api, vehicleId, onLogged }: { api: Api; vehicleId: string; onLogged: (a: Action) => void }) {
  const [actionType, setActionType] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState('');
  // One key per intent: a retry after a failure reuses it, so a request whose
  // response was lost is not logged twice. Editing the form starts a new intent.
  const key = useRef(newIdempotencyKey());

  const newIntent = () => {
    key.current = newIdempotencyKey();
    setStatus('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!actionType || saving) return;
    setSaving(true);
    setError(null);
    setStatus('');
    try {
      const { action, replayed } = await api.logAction(
        vehicleId,
        { action_type: actionType, ...(note.trim() ? { note: note.trim() } : {}) },
        key.current,
      );
      setStatus(replayed ? 'This action was already logged, so it was not added again.' : 'Action logged.');
      setActionType('');
      setNote('');
      key.current = newIdempotencyKey();
      onLogged(action);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h3>Log an action</h3>
      <div className="field">
        <label htmlFor="action-type">Action</label>
        <select
          id="action-type"
          value={actionType}
          required
          onChange={(e) => {
            setActionType(e.target.value);
            newIntent();
          }}
        >
          <option value="" disabled>Choose an action</option>
          {ACTION_TYPES.map((t) => <option key={t} value={t}>{actionLabel(t)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="action-note">Note (optional)</label>
        <textarea
          id="action-note"
          rows={3}
          maxLength={NOTE_LIMIT}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            newIntent();
          }}
        />
        <p className="small field-hint">{note.length} of {NOTE_LIMIT} characters</p>
      </div>
      {error != null && <ErrorNotice error={error} />}
      <div className="form-footer">
        <button type="submit" className="btn btn-primary" disabled={!actionType || saving}>
          {saving ? 'Logging…' : error != null ? 'Try again' : 'Log action'}
        </button>
        <p className="small" role="status">{status}</p>
      </div>
    </form>
  );
}
