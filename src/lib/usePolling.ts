import { useEffect, useRef } from 'react';
import { startPolling } from './poller';

/** Runs poll on the shared polling schedule while the component is mounted. */
export function usePolling(poll: () => void): void {
  const latest = useRef(poll);
  useEffect(() => {
    latest.current = poll;
  });
  useEffect(() => startPolling(() => latest.current()), []);
}
