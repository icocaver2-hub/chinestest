/**
 * Hashルーティング（docs/02）。GitHub Pagesなどで深いURLへ再アクセスしても404にならない。
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'scenarios' }
  | { name: 'scenario'; id: string }
  | { name: 'practice' }
  | { name: 'review' }
  | { name: 'materials' }
  | { name: 'settings' }
  | { name: 'history' }
  | { name: 'not_found'; path: string };

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const path = (raw === '' ? '/' : raw).split('?')[0] ?? '/';
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  switch (normalized) {
    case '/':
      return { name: 'home' };
    case '/scenarios':
      return { name: 'scenarios' };
    case '/practice':
      return { name: 'practice' };
    case '/review':
      return { name: 'review' };
    case '/materials':
      return { name: 'materials' };
    case '/settings':
      return { name: 'settings' };
    case '/history':
      return { name: 'history' };
  }
  const m = /^\/scenarios\/([^/]+)$/.exec(normalized);
  if (m) {
    let id = m[1] ?? '';
    try {
      id = decodeURIComponent(id);
    } catch {
      return { name: 'not_found', path: normalized };
    }
    if (ID_RE.test(id)) return { name: 'scenario', id };
  }
  return { name: 'not_found', path: normalized };
}

export function hrefFor(route: Exclude<Route, { name: 'not_found' }>): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'scenario':
      return `#/scenarios/${encodeURIComponent(route.id)}`;
    default:
      return `#/${route.name}`;
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
