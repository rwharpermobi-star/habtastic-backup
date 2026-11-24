import { useEffect, useState } from 'react';

const CACHE_KEY = 'fx_usd_zar_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FALLBACK_RATE = 18.5;

interface CachedRate {
  rate: number;
  fetchedAt: number;
}

/**
 * Fetches the live USD→ZAR exchange rate. Cached in localStorage for 24h.
 * Falls back to a sensible default if the network call fails.
 */
export function useUsdToZarRate() {
  const [rate, setRate] = useState<number>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedRate;
        if (parsed?.rate) return parsed.rate;
      }
    } catch { /* ignore: best effort */ }
    return FALLBACK_RATE;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedRate;
        if (parsed?.rate && Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
          return; // cache still fresh
        }
      }
    } catch { /* ignore: best effort */ }

    setLoading(true);
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => r.json())
      .then((data) => {
        const fresh = data?.rates?.ZAR;
        if (typeof fresh === 'number' && fresh > 0 && !cancelled) {
          setRate(fresh);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ rate: fresh, fetchedAt: Date.now() } as CachedRate));
          } catch { /* ignore: best effort */ }
        }
      })
      .catch(() => { /* silent — keep fallback */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return { rate, loading };
}
