import { activeBackend } from '@/integrations/supabase/backendConfig';
import { createBackendHealthMonitor } from './backendHealth';

/** App-wide monitor for the active Supabase backend. */
export const backendHealth = createBackendHealthMonitor({
  healthUrl: `${activeBackend.url.replace(/\/+$/, '')}/auth/v1/health`,
  apiKey: activeBackend.publishableKey,
});

export const BACKEND_RECONNECTED_EVENT = 'habtastic:backend-reconnected';

if (typeof window !== 'undefined') {
  backendHealth.onRecovered(() => window.dispatchEvent(new Event(BACKEND_RECONNECTED_EVENT)));
  window.addEventListener('online', () => backendHealth.handleResume());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') backendHealth.handleResume();
  });
}
