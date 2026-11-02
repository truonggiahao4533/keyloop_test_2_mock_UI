import { type FormEvent, useState } from 'react';
import type { Api, IngestResult } from '../api/types';
import { ErrorNotice } from '../components/States';

function sampleBatch(): string {
  const received = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return JSON.stringify(
    {
      vehicles: [
        { vin: 'JTMWRREV0RD000001', make: 'Toyota', model: 'RAV4', year: 2025, price: 31999, received_at: received },
        { vin: '1HGCM82633A004352', make: 'Honda', model: 'Accord', year: 2024, price: 27499.5, received_at: received, status: 'IN_STOCK' },
      ],
    },
    null,
    2,
  );
}

export function Ingest({ api }: { api: Api }) {
  const [text, setText] = useState(sampleBatch);
  const [parseError, setParseError] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<(IngestResult & { sent: number }) | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setParseError('');
    setError(null);
    setResult(null);
    let body: { vehicles?: unknown[] };
    try {
      body = JSON.parse(text) as { vehicles?: unknown[] };
    } catch (err) {
      setParseError(`This is not valid JSON: ${(err as Error).message}`);
      return;
    }
    setSending(true);
    try {
      const res = await api.ingest(body);
      setResult({ ...res, sent: Array.isArray(body.vehicles) ? body.vehicles.length : 0 });
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  };

  const unchanged = result ? result.sent - result.inserted - result.updated : 0;

  return (
    <>
      <header className="page-header">
        <h1>Ingest vehicles</h1>
        <p>Upload a batch from the inventory feed. Vehicles are matched by VIN.</p>
      </header>
      <form className="card stack" onSubmit={send}>
        <div className="field">
          <label htmlFor="batch">Batch JSON (up to 1000 vehicles)</label>
          <textarea
            id="batch"
            rows={16}
            className="mono"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {parseError && <p className="field-error" role="alert">{parseError}</p>}
          <p className="small field-hint">
            Always send <code>status</code> for existing vehicles. If it is left out, the vehicle is set to <code>IN_STOCK</code>, even if it was sold.
          </p>
        </div>
        {error != null && <ErrorNotice error={error} />}
        <div className="form-footer">
          <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>
            {sending ? 'Uploading…' : 'Upload batch'}
          </button>
        </div>
      </form>
      {result && (
        <section className="kpis kpis-three" aria-label="Upload result" role="status">
          <div className="card stat"><p className="stat-label">Inserted</p><p className="stat-value">{result.inserted}</p></div>
          <div className="card stat"><p className="stat-label">Updated</p><p className="stat-value">{result.updated}</p></div>
          <div className="card stat"><p className="stat-label">Unchanged</p><p className="stat-value">{unchanged}</p></div>
        </section>
      )}
    </>
  );
}
