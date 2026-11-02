import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_INTERVAL_MS, startPolling } from './poller';

function fakePage() {
  const listeners = new Set<() => void>();
  return {
    hidden: false,
    addEventListener: (_: 'visibilitychange', l: () => void) => void listeners.add(l),
    removeEventListener: (_: 'visibilitychange', l: () => void) => void listeners.delete(l),
    setHidden(value: boolean) {
      this.hidden = value;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

describe('startPolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls every 30 seconds, and not before', () => {
    const poll = vi.fn();
    const stop = startPolling(poll, POLL_INTERVAL_MS, fakePage());
    expect(POLL_INTERVAL_MS).toBe(30_000);
    vi.advanceTimersByTime(29_999);
    expect(poll).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(poll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(poll).toHaveBeenCalledTimes(3);
    stop();
  });

  it('skips polls while hidden and catches up on return', () => {
    const poll = vi.fn();
    const page = fakePage();
    const stop = startPolling(poll, 30_000, page);
    page.setHidden(true);
    vi.advanceTimersByTime(120_000);
    expect(poll).toHaveBeenCalledTimes(0);
    page.setHidden(false);
    expect(poll).toHaveBeenCalledTimes(1);
    // The schedule restarts from the catch-up poll.
    vi.advanceTimersByTime(29_999);
    expect(poll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not poll early when the page returns before one is due', () => {
    const poll = vi.fn();
    const page = fakePage();
    const stop = startPolling(poll, 30_000, page);
    vi.advanceTimersByTime(10_000);
    page.setHidden(true);
    vi.advanceTimersByTime(5_000);
    page.setHidden(false);
    expect(poll).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(15_000);
    expect(poll).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops when asked', () => {
    const poll = vi.fn();
    const page = fakePage();
    startPolling(poll, 30_000, page)();
    vi.advanceTimersByTime(120_000);
    expect(poll).toHaveBeenCalledTimes(0);
    expect(page.listenerCount()).toBe(0);
  });
});
