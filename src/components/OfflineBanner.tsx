import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { logInfo, logWarn } from "@/lib/logger";
import { backendHealth } from "@/lib/backendHealthInstance";
import type { BackendHealthMonitor } from "@/lib/backendHealth";

const RECONNECTED_NOTICE_MS = 2500;

function useSecondsUntil(target: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (target === null) return null;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/**
 * Connection status bar.
 * - Device offline: offline notice (changes sync later).
 * - Device online but HabTastic servers unreachable: status, auto-retry
 *   countdown and a Retry button.
 * - Briefly confirms when the connection comes back, then refreshes data.
 */
export default function OfflineBanner({ monitor = backendHealth }: { monitor?: BackendHealthMonitor }) {
  const queryClient = useQueryClient();
  const health = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const secondsLeft = useSecondsUntil(health.status === "unreachable" ? health.nextRetryAt : null);

  useEffect(() => {
    const onOnline = () => { setOnline(true); logInfo("network", "online"); };
    const onOffline = () => { setOnline(false); logInfo("network", "offline"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const off = monitor.onRecovered(() => {
      logInfo("network", "backend reachable again");
      setShowReconnected(true);
      void queryClient.invalidateQueries({ refetchType: "active" });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShowReconnected(false), RECONNECTED_NOTICE_MS);
    });
    return () => { off(); window.clearTimeout(timer); };
  }, [monitor, queryClient]);

  useEffect(() => {
    if (health.status === "unreachable" && health.failures === 1) {
      logWarn("network", "backend unreachable");
    }
  }, [health.status, health.failures]);

  const base =
    "fixed top-0 inset-x-0 z-[100] text-xs font-medium px-3 pb-1.5 pt-[max(env(safe-area-inset-top),0.375rem)] flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-300";

  if (!online) {
    return (
      <div role="status" aria-live="polite" className={`${base} bg-destructive text-destructive-foreground`}>
        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden />
        You're offline — changes will sync when you're back online.
      </div>
    );
  }

  if (health.status === "unreachable") {
    const label = health.checking
      ? "Reconnecting…"
      : secondsLeft !== null && secondsLeft > 0
        ? `Retrying in ${secondsLeft}s`
        : "Retrying…";
    return (
      <div role="alert" aria-live="assertive" className={`${base} bg-warning text-warning-foreground`}>
        <CloudOff className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">
          Can't reach HabTastic servers. <span className="opacity-80">{label}</span>
        </span>
        <button
          type="button"
          onClick={() => { void monitor.checkNow(); }}
          disabled={health.checking}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-background/20 px-2.5 py-1 font-semibold transition hover:bg-background/30 active:scale-95 disabled:opacity-60"
        >
          {health.checking
            ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            : <RefreshCw className="w-3 h-3" aria-hidden />}
          Retry
        </button>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div role="status" aria-live="polite" className={`${base} bg-success text-success-foreground`}>
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
        Connected again — refreshing your data.
      </div>
    );
  }

  return null;
}
