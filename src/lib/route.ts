import { useEffect, useState } from 'react';

export type Page = 'dashboard' | 'inventory' | 'aging' | 'settings' | 'ingest';

export interface Route {
  page: Page | null;
  params: URLSearchParams;
}

function parse(): Route {
  const [path, query] = window.location.hash.replace(/^#\/?/, '').split('?');
  const pages: Page[] = ['dashboard', 'inventory', 'aging', 'settings', 'ingest'];
  return {
    page: pages.includes(path as Page) ? (path as Page) : null,
    params: new URLSearchParams(query),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function href(page: Page, params?: Record<string, string>): string {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  return `#/${page}${query}`;
}
