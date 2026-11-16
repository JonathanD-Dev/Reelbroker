import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { name: 'feed' }
  | { name: 'saved' }
  | { name: 'profile' }
  | { name: 'portfolio-new' }
  | { name: 'portfolio-first' }
  | { name: 'portfolio-edit'; id: string }
  | { name: 'signup' }
  | { name: 'buy'; ticker: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (/^\/signup\/?$/.test(path)) return { name: 'signup' };
  if (/^\/saved\/?$/.test(path)) return { name: 'saved' };
  if (/^\/profile\/?$/.test(path)) return { name: 'profile' };
  if (/^\/profile\/new\/?$/.test(path)) return { name: 'portfolio-new' };
  if (/^\/profile\/first\/?$/.test(path)) return { name: 'portfolio-first' };
  const edit = /^\/profile\/edit\/([\w-]{1,40})\/?$/.exec(path);
  if (edit) return { name: 'portfolio-edit', id: edit[1] };
  const match = /^\/buy\/([^/]+)\/?$/.exec(path);
  if (match) {
    try {
      return { name: 'buy', ticker: decodeURIComponent(match[1]) };
    } catch {
      return { name: 'feed' };
    }
  }
  return { name: 'feed' };
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((path: string) => {
    window.location.hash = path.startsWith('/') ? path : `/${path}`;
  }, []);

  return { route, navigate };
}
