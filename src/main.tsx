import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { installGlobalFetchTimeout } from "./lib/fetchWithTimeout";
import { startPerfMonitor } from "./lib/perfMonitor";
import { startTelemetrySink } from "./lib/telemetrySink";
import { startCrashlyticsSink } from "./lib/crashlyticsSink";
import { purgeStaleSupabaseAuth } from "./lib/purgeStaleSupabaseAuth";

// Drop any session keys left behind by a previous Supabase project so the app
// only ever holds credentials for the currently configured backend.
purgeStaleSupabaseAuth();

// Install global fetch timeout wrapper FIRST — before any Supabase client,
// telemetry sink or perf monitor grabs a reference to `window.fetch`. Every
// network call in the app (DB, auth, edge functions, external APIs) now has
// a hard ceiling and is safely aborted if it hangs.
installGlobalFetchTimeout();

// Performance monitor (auto-enabled in dev; prod opt-in via localStorage flag)
startPerfMonitor();

// Crash + RUM sink — forwards logger errors and perf samples to the
// `telemetry-ingest` edge function for the admin dashboard.
startTelemetrySink();

// Native-only Firebase Crashlytics sink. It is a no-op on web/preview and
// scrubs identity-bearing data before forwarding warnings/errors.
startCrashlyticsSink();

createRoot(document.getElementById("root")!).render(<App />);
