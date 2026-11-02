import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { Api, Role } from '../api/types';
import { ErrorNotice } from '../components/States';
import { usePolling } from '../lib/usePolling';

export function Settings({ api, role }: { api: Api; role: Role }) {
  const [current, setCurrent] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const canEdit = role === 'manager';

  const load = useCallback(() => {
    setLoadError(null);
    api.getThreshold().then((days) => {
      setCurrent(days);
      setValue(String(days));
    }, setLoadError);
  }, [api]);
  useEffect(load, [load]);

  usePolling(() => {
    if (current === null) return;
    api.getThreshold().then((days) => {
      setCurrent(days);
      // Follow the new value unless someone is part-way through changing it.
      setValue((v) => (v === String(current) ? String(days) : v));
    }, () => undefined);
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setStatus('');
    try {
      const days = await api.setThreshold(Number(value));
      setCurrent(days);
      setStatus(`Saved. Vehicles now count as aging after ${days} days.`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="page-header">
        <h1>Settings</h1>
        <p>Configuration for this dealership.</p>
      </header>
      {loadError != null && <ErrorNotice error={loadError} onRetry={load} />}
      {current === null && loadError == null && <p className="small" role="status">Loading settings…</p>}
      {current !== null && (
        <form className="card settings-card" onSubmit={save}>
          <h2>Aging threshold</h2>
          <p className="small">A vehicle is aging once it has been in stock for more than this many days. A change applies to every screen straight away.</p>
          <div className="field field-narrow">
            <label htmlFor="threshold">Days (1 to 3650)</label>
            <input
              id="threshold"
              type="number"
              min={1}
              max={3650}
              required
              disabled={!canEdit}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setStatus('');
              }}
            />
          </div>
          {saveError != null && <ErrorNotice error={saveError} />}
          {canEdit ? (
            <div className="form-footer">
              <button type="submit" className="btn btn-primary" disabled={saving || value === String(current) || value === ''}>
                {saving ? 'Saving…' : 'Save threshold'}
              </button>
              <p className="small" role="status">{status}</p>
            </div>
          ) : (
            <p className="small">Only managers can change this.</p>
          )}
        </form>
      )}
    </>
  );
}
