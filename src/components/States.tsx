import type { ReactNode } from 'react';
import { ApiError } from '../api/types';
import { formatTime } from '../lib/format';

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div className="notice notice-error" role="alert">
      <div>
        <p className="notice-title">{message}</p>
        {requestId && <p className="small">Request ID: <code>{requestId}</code></p>}
      </div>
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

/** When the data on screen was fetched, and whether the latest refresh failed. */
export function LastUpdated({ at, failed }: { at: Date | null; failed: boolean }) {
  if (!at) return null;
  return failed ? (
    <p className="updated updated-failed" role="status">Could not refresh. Showing data from {formatTime(at)}.</p>
  ) : (
    <p className="updated">Updated {formatTime(at)}. Refreshes every 30 seconds.</p>
  );
}

export function AgingBadge() {
  return (
    <span className="badge">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M6 1 11.5 11h-11z" fill="var(--status-warning)" />
        <path d="M6 4.6v2.8M6 8.8v.6" stroke="#0b0b0b" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      Aging
    </span>
  );
}
