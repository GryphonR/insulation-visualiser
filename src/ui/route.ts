import { useEffect, useState } from 'react';

/** Hash routes (#/room/r1/N): GitHub Pages can't rewrite deep links to index.html. */
export const parseHash = (h: string): string[] => h.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

export function useRoute(): string[] {
  const [r, setR] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setR(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const href = (...parts: string[]) => `#/${parts.map(encodeURIComponent).join('/')}`;
export const go = (...parts: string[]) => { location.hash = href(...parts); };
