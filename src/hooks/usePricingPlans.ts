import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PricingPlan = {
  name: string;
  interval: string;
  amount: number;      // major units (e.g. 94.99)
  currency: string;    // ISO code, e.g. ZAR
  one_time: boolean;
  plan_code?: string;
  source?: 'paystack' | 'fallback';
};

export type PricingCatalog = {
  monthly: PricingPlan;
  yearly: PricingPlan;
};

// Fallback prices — used ONLY as a last resort if all retries to Paystack
// fail. Mirrors supabase/functions/_shared/paystack.ts so the UI never blanks.
const FALLBACK: PricingCatalog = {
  monthly: { name: 'Monthly', interval: 'monthly',  amount: 94.99,  currency: 'ZAR', one_time: false, source: 'fallback' },
  yearly:  { name: 'Yearly',  interval: 'annually', amount: 899.99, currency: 'ZAR', one_time: false, source: 'fallback' },
};

let cached: PricingCatalog | null = null;

function isCurrentCatalog(catalog: PricingCatalog | null) {
  if (!catalog) return false;
  return catalog.monthly.amount === 94.99 && catalog.yearly.amount === 899.99;
}

async function fetchOnce(): Promise<PricingCatalog | null> {
  try {
    const { data, error } = await supabase.functions.invoke('paystack-config', {
      body: { pricing_version: 'paystack-v9-r9499-r89999' },
    });
    if (error) throw error;
    const m = data?.plans?.monthly;
    const y = data?.plans?.yearly;
    if (!m || !y) return null;
    return { monthly: m, yearly: y };
  } catch {
    return null;
  }
}

/**
 * Live Premium pricing pulled from Paystack via `paystack-config` edge
 * function. Auto-retries with exponential backoff (up to 3 attempts). If
 * every attempt fails, exposes `error=true` while still returning the
 * fallback catalog so the CTA remains functional.
 */
export function usePricingPlans() {
  const [plans, setPlans] = useState<PricingCatalog | null>(isCurrentCatalog(cached) ? cached : null);
  const [loading, setLoading] = useState(!isCurrentCatalog(cached));
  const [error, setError] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (cached && !isCurrentCatalog(cached)) cached = null;
    if (cached) { setPlans(cached); setLoading(false); return; }

    let attempt = 0;
    const MAX = 3;

    const run = async () => {
      while (attempt < MAX && !cancelledRef.current) {
        const result = await fetchOnce();
        if (cancelledRef.current) return;
        if (result) {
          cached = result;
          setPlans(result);
          setError(false);
          setLoading(false);
          return;
        }
        attempt += 1;
        if (attempt < MAX) {
          await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
        }
      }
      if (cancelledRef.current) return;
      // All retries failed — surface error but keep fallback prices visible.
      setPlans(FALLBACK);
      setError(true);
      setLoading(false);
    };

    run();
    return () => { cancelledRef.current = true; };
  }, []);

  return {
    plans: plans ?? FALLBACK,
    loading,
    error,
    isFallback: (plans ?? FALLBACK).monthly.source !== 'paystack',
  };
}
