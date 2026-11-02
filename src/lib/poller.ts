export const POLL_INTERVAL_MS = 5_000;

interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Calls poll every interval. It skips polls while the page is hidden, and polls
 * straight away on return if one is due. Returns a function that stops polling.
 */
export function startPolling(
  poll: () => void,
  intervalMs: number = POLL_INTERVAL_MS,
  page: VisibilitySource = document,
): () => void {
  let last = Date.now();
  let timer: ReturnType<typeof setTimeout>;

  const run = () => {
    last = Date.now();
    poll();
  };
  const arm = () => {
    timer = setTimeout(() => {
      if (!page.hidden) run();
      arm();
    }, intervalMs);
  };
  const onVisibilityChange = () => {
    if (page.hidden || Date.now() - last < intervalMs) return;
    clearTimeout(timer);
    run();
    arm();
  };

  arm();
  page.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    clearTimeout(timer);
    page.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
