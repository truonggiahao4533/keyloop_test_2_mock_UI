import type { ActionType } from '../api/types';

const ACTION_LABELS: Record<ActionType, string> = {
  PRICE_REDUCTION_PLANNED: 'Price reduction planned',
  PRICE_REDUCED: 'Price reduced',
  TRANSFER_PLANNED: 'Transfer planned',
  WHOLESALE_PLANNED: 'Wholesale planned',
  PROMOTION_PLANNED: 'Promotion planned',
  NO_ACTION_NEEDED: 'No action needed',
};

export const actionLabel = (a: ActionType): string => ACTION_LABELS[a];

const priceFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatPrice = (p: number | null): string => (p === null ? '—' : priceFormat.format(p));

export const formatCount = (n: number): string => n.toLocaleString();

// received_at is a calendar date: format it in UTC so it cannot shift a day.
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
export const formatDate = (ymd: string): string => dateFormat.format(new Date(`${ymd}T00:00:00Z`));

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });
export const formatTime = (date: Date): string => timeFormat.format(date);

export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID only exists in secure contexts, such as localhost or https.
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
