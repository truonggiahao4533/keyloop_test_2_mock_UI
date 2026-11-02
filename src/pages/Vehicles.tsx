import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Api, ListQuery, Role, Vehicle, VehiclePage } from '../api/types';
import { AgingBadge, EmptyState, ErrorNotice, LastUpdated } from '../components/States';
import { VehicleDrawer } from '../components/VehicleDrawer';
import { actionLabel, formatDate, formatDateTime, formatPrice } from '../lib/format';
import { usePolling } from '../lib/usePolling';

interface Filters {
  make: string;
  model: string;
  min: string;
  max: string;
  agingOnly: boolean;
}

interface Props {
  api: Api;
  role: Role;
  /** The aging-stock page: uses /v1/vehicles/aging. */
  aging: boolean;
  initialMake?: string;
}

const COMMON_MAKES = ['Chevrolet', 'Ford', 'Honda', 'Hyundai', 'Kia', 'Nissan', 'Subaru', 'Toyota'];
const emptyFilters = (make = ''): Filters => ({ make, model: '', min: '', max: '', agingOnly: false });

function toQuery(f: Filters): ListQuery {
  return {
    make: f.make.trim() || undefined,
    model: f.model.trim() || undefined,
    min_age_days: f.min === '' ? undefined : Number(f.min),
    max_age_days: f.max === '' ? undefined : Number(f.max),
    aging: f.agingOnly || undefined,
  };
}

export function Vehicles({ api, role, aging, initialMake }: Props) {
  const [filters, setFilters] = useState(() => emptyFilters(initialMake));
  const [applied, setApplied] = useState(() => JSON.stringify(emptyFilters(initialMake)));
  const [limit, setLimit] = useState(50);
  const [cursors, setCursors] = useState<string[]>([]); // cursors of the pages before the next one
  const [page, setPage] = useState<VehiclePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const latestRequest = useRef(0);

  // Wait for a pause in typing before querying.
  const draft = useMemo(() => JSON.stringify(filters), [filters]);
  useEffect(() => {
    if (draft === applied) return;
    const timer = setTimeout(() => {
      setApplied(draft);
      setCursors([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, applied]);

  // A background refresh leaves the table alone while it runs, and a failed one
  // keeps the rows on screen. Only the newest request may update the page.
  const fetchPage = useCallback(
    (background: boolean) => {
      const id = ++latestRequest.current;
      if (!background) {
        setLoading(true);
        setError(null);
      }
      const query = { ...toQuery(JSON.parse(applied) as Filters), limit, cursor: cursors[cursors.length - 1] };
      (aging ? api.listAging(query) : api.listVehicles(query)).then(
        (result) => {
          if (id !== latestRequest.current) return;
          // Vehicles can leave stock, so a later page can end up empty.
          if (result.items.length === 0 && cursors.length > 0) {
            setCursors([]);
            return;
          }
          setPage(result);
          setUpdatedAt(new Date());
          setRefreshFailed(false);
          setError(null);
          setLoading(false);
          setSelected((v) => v && (result.items.find((item) => item.id === v.id) ?? v));
        },
        (err: unknown) => {
          if (id !== latestRequest.current) return;
          if (background) {
            setRefreshFailed(true);
          } else {
            setError(err);
            setLoading(false);
          }
        },
      );
    },
    [api, aging, applied, cursors, limit],
  );

  useEffect(() => fetchPage(false), [fetchPage, reload]);

  useEffect(() => {
    api.getThreshold().then(setThreshold, () => setThreshold(null));
  }, [api, reload]);

  usePolling(() => {
    if (loading) return;
    fetchPage(true);
    api.getThreshold().then(setThreshold, () => undefined);
  });

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = draft !== JSON.stringify(emptyFilters());
  const firstRow = cursors.length * limit + 1;
  const rows = page?.items ?? [];

  return (
    <>
      <header className="page-header">
        <h1>{aging ? 'Aging stock' : 'Inventory'}</h1>
        <p>
          {aging && threshold !== null ? `In stock for more than ${threshold} days. ` : ''}
          {aging ? 'Oldest first.' : 'All in-stock vehicles, oldest first.'}
        </p>
        {error == null && <LastUpdated at={updatedAt} failed={refreshFailed} />}
      </header>

      <form className="filters" aria-label="Filter vehicles" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor="f-make">Make</label>
          <input id="f-make" list="makes" placeholder="Exact, e.g. Toyota" value={filters.make} onChange={(e) => set({ make: e.target.value })} />
          <datalist id="makes">{COMMON_MAKES.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="field">
          <label htmlFor="f-model">Model</label>
          <input id="f-model" placeholder="Exact, e.g. Camry" value={filters.model} onChange={(e) => set({ model: e.target.value })} />
        </div>
        <div className="field field-narrow">
          <label htmlFor="f-min">Min age (days)</label>
          <input id="f-min" type="number" min={0} inputMode="numeric" value={filters.min} onChange={(e) => set({ min: e.target.value })} />
        </div>
        <div className="field field-narrow">
          <label htmlFor="f-max">Max age (days)</label>
          <input id="f-max" type="number" min={0} inputMode="numeric" value={filters.max} onChange={(e) => set({ max: e.target.value })} />
        </div>
        {!aging && (
          <label className="check">
            <input type="checkbox" checked={filters.agingOnly} onChange={(e) => set({ agingOnly: e.target.checked })} />
            Aging only
          </label>
        )}
        {hasFilters && (
          <button type="button" className="btn btn-ghost" onClick={() => setFilters(emptyFilters())}>Clear filters</button>
        )}
      </form>

      {error != null && <ErrorNotice error={error} onRetry={() => setReload((n) => n + 1)} />}

      {!error && rows.length === 0 && !loading && (
        <EmptyState title={hasFilters ? 'No vehicles match these filters' : aging ? 'No aging stock' : 'No vehicles in stock'}>
          {hasFilters
            ? <p className="small">Make and model must match exactly, including capitals.</p>
            : aging ? <p className="small">Every in-stock vehicle is within the threshold.</p> : null}
        </EmptyState>
      )}

      {!error && (rows.length > 0 || loading) && (
        <div className="table-card" aria-busy={loading}>
          <div className="table-wrap">
            <table className={loading && page ? 'is-loading' : undefined}>
              <caption className="sr-only">{aging ? 'Aging stock' : 'In-stock vehicles'}, oldest first</caption>
              <thead>
                <tr>
                  <th scope="col">Vehicle</th>
                  <th scope="col" className="col-vin">VIN</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col" className="col-received">Received</th>
                  <th scope="col" className="num">Age (days)</th>
                  <th scope="col">Current action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="skeleton-row" aria-hidden="true"><td colSpan={6}><span className="skeleton" /></td></tr>
                ))}
                {rows.map((v) => (
                  <tr key={v.id} onClick={() => setSelected(v)}>
                    <td className="cell-vehicle">
                      <button type="button" className="link-button" onClick={(e) => { e.stopPropagation(); setSelected(v); }}>
                        {v.year} {v.make} {v.model}
                      </button>
                    </td>
                    <td className="col-vin mono small">{v.vin}</td>
                    <td className="num cell-price">{formatPrice(v.price)}</td>
                    <td className="col-received">{formatDate(v.received_at)}</td>
                    <td className="num cell-age"><span className="age-cell">{v.is_aging && <AgingBadge />}{v.age_days}</span></td>
                    <td className="cell-action">
                      {v.current_action ? (
                        <>
                          {actionLabel(v.current_action)}
                          {v.current_action_at && <span className="small block">{formatDateTime(v.current_action_at)}</span>}
                        </>
                      ) : (
                        <span className="small">None logged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="pager">
            <p className="small" role="status">
              {rows.length > 0 ? `Showing ${firstRow.toLocaleString()}–${(firstRow + rows.length - 1).toLocaleString()}` : 'Loading vehicles…'}
            </p>
            <div className="pager-controls">
              <label className="small" htmlFor="page-size">Rows per page</label>
              <select
                id="page-size"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setCursors([]);
                }}
              >
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button type="button" className="btn" disabled={cursors.length === 0 || loading} onClick={() => setCursors((c) => c.slice(0, -1))}>Previous</button>
              <button
                type="button"
                className="btn"
                disabled={!page?.next_cursor || loading}
                onClick={() => page?.next_cursor && setCursors((c) => [...c, page.next_cursor as string])}
              >
                Next
              </button>
            </div>
          </footer>
        </div>
      )}

      {selected && (
        <VehicleDrawer
          key={selected.id}
          api={api}
          role={role}
          vehicle={selected}
          onClose={() => setSelected(null)}
          onLogged={(action) => {
            setSelected((v) => v && { ...v, current_action: action.action_type, current_action_at: action.created_at });
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
