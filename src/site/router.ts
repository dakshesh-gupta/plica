import { useEffect, useState } from 'react';

export type Route = { path: '/' | '/verify' | '/demo'; query: URLSearchParams };

export function parseHash(h = location.hash): Route {
  const raw = h.replace(/^#/, '') || '/';
  const [p, qs = ''] = raw.split('?');
  const path = (['/verify', '/demo'].includes(p) ? p : '/') as Route['path'];
  return { path, query: new URLSearchParams(qs) };
}
export function useRoute(): Route {
  const [r, setR] = useState<Route>(parseHash());
  useEffect(() => {
    const on = () => setR(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
export function go(path: Route['path'], query?: string) {
  location.hash = '#' + path + (query ? '?' + query : '');
}

let pendingSection: string | null = null;
export function goSection(id: string) {
  if (parseHash().path === '/') {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    pendingSection = id;
    go('/');
  }
}
export function consumePendingSection(): string | null {
  const s = pendingSection;
  pendingSection = null;
  return s;
}
