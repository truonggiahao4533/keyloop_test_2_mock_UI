import { useCallback, useEffect, useState } from 'react';
import type { Api, Summary } from '../api/types';
import { BarList, type BarItem } from '../components/BarList';
import { EmptyState, ErrorNotice, LastUpdated } from '../components/States';
import { actionLabel, formatCount } from '../lib/format';
import { href } from '../lib/route';
import { usePolling } from '../lib/usePolling';

export function Dashboard({ api }: { api: Api }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const apply = useCallback((result: Summary) => {
    setSummary(result);
    setUpdatedAt(new Date());
    setRefreshFailed(false);
    setError(null);
  }, []);

  const load = useCallback(() => {
    setError(null);
    api.summary().then(apply, setError);
  }, [api, apply]);
  useEffect(load, [load]);

  usePolling(() => {
    api.summary().then(apply, (err: unknown) => {
      if (summary) setRefreshFailed(true);
      else setError(err);
    });
  });

  if (error != null && !summary) return <ErrorNotice error={error} onRetry={load} />;
  if (!summary) return <p className="small" role="status">Loading dashboard…</p>;

  const share = (count: number) => `${Math.round((100 * count) / Math.max(summary.aging_count, 1))}% of aging stock`;
  const noAction = summary.aging_by_action.find((a) => a.action === null)?.count ?? 0;

  const makes: BarItem[] = summary.aging_by_make.map((m) => ({
    key: m.make,
    label: m.make,
    value: m.count,
    detail: share(m.count),
    href: href('aging', { make: m.make }),
  }));
  const actions: BarItem[] = summary.aging_by_action.map((a) => ({
    key: a.action ?? 'none',
    label: a.action ? actionLabel(a.action) : 'No action logged',
    value: a.count,
    detail: share(a.count),
    emphasis: a.action === null,
  }));

  return (
    <>
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Vehicles count as aging after {summary.threshold_days} days in stock.</p>
        <LastUpdated at={updatedAt} failed={refreshFailed} />
      </header>

      <section className="kpis" aria-label="Key figures">
        <div className="card hero">
          <p className="stat-label">Aging with no action logged</p>
          <p className="hero-value">{formatCount(noAction)}</p>
          <p className="small">
            of {formatCount(summary.aging_count)} aging vehicles. <a href={href('aging')}>Review aging stock</a>
          </p>
        </div>
        <Stat label="In stock" value={formatCount(summary.total_in_stock)} />
        <Stat label="Aging" value={formatCount(summary.aging_count)} />
        <Stat label="Aging share" value={`${summary.aging_pct}%`} />
      </section>

      {summary.aging_count === 0 ? (
        <EmptyState title="No aging stock"><p className="small">Every in-stock vehicle is within the threshold.</p></EmptyState>
      ) : (
        <div className="chart-grid">
          <section className="card">
            <h2>Aging stock by make</h2>
            <p className="small chart-sub">Select a make to see its vehicles.</p>
            <BarList items={makes} label="Aging stock by make" />
          </section>
          <section className="card">
            <h2>Aging stock by current action</h2>
            <p className="small chart-sub">Vehicles nobody has acted on are highlighted.</p>
            <BarList items={actions} label="Aging stock by current action" muted />
          </section>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}
