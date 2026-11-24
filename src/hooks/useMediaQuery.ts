import * as React from 'react';

/**
 * Reactive media query hook. Returns true while the query matches.
 * Safe for SSR (returns false on first render).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
