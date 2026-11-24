// User-facing notification setup checklist. Runs live status checks and
// deep-links to the right Android system screens so users can self-fix
// permission + battery-optimization issues that silently block push delivery.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { ArrowLeft, Check, X, Loader2, ChevronRight, Bug, RefreshCw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensurePushSubscriptionWithRetry, lastPushFailure } from "@/lib/webPush";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { announceNotificationGranted } from "@/lib/notificationPermission";
import {
  openAppNotificationSettings,
  openBatteryOptimizationSettings,
} from "@/lib/androidSettings";

type StepStatus = "pending" | "ok" | "fail" | "checking";

type Step = {
  id: string;
  title: string;
  detail: string;
  status: StepStatus;
  action?: { label: string; onClick: () => void | Promise<void> };
  hint?: string;
};

function fmtAgo(ts?: string | null): string {
  if (!ts) return "never";
  const d = new Date(ts).getTime();
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function NotificationSetup() {
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const showBatteryStep = platform === "android";

  const [perm, setPerm] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  const [tokenRow, setTokenRow] = useState<any | null>(null);
  const [webSubs, setWebSubs] = useState<number>(0);
  const [prefs, setPrefs] = useState<any | null>(null);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null); // unknown by default
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; at: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [registering, setRegistering] = useState(false);

  const runChecks = useCallback(async () => {
    setChecking(true);
    try {
      // Permission
      if (isNative) {
        try {
          const PN: any = (await import("@capacitor/push-notifications")).PushNotifications;
          const p = await PN.checkPermissions();
          setPerm(p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt");
        } catch {
          setPerm("unknown");
        }
      } else if ("Notification" in window) {
        setPerm(Notification.permission as any);
      }

      // Server state
      const { data: { user } } = await supabase.auth.getUser();
      console.log("[notifSetup] auth user =", user?.id ?? null);
      if (user) {
        const [tokensRes, subsRes, prefsRes] = await Promise.all([
          supabase.from("device_tokens")
            .select("platform,app_version,last_seen_at,token")
            .eq("user_id", user.id)
            .order("last_seen_at", { ascending: false })
            .limit(1),
          supabase.from("push_subscriptions")
            .select("endpoint")
            .eq("user_id", user.id),
          supabase.from("notification_prefs")
            .select("push_enabled,email_enabled,quiet_hours_start,quiet_hours_end")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
        // Surface query failures instead of silently showing "No token on file".
        for (const [label, res] of [["device_tokens", tokensRes], ["push_subscriptions", subsRes], ["notification_prefs", prefsRes]] as const) {
          if (res.error) console.error(`[notifSetup] ${label} query failed`, res.error.message, res.error.details);
        }
        console.log("[notifSetup] state", {
          nativeTokens: tokensRes.data?.length ?? 0,
          webSubs: subsRes.data?.length ?? 0,
          prefs: prefsRes.data,
        });
        setTokenRow(tokensRes.data?.[0] ?? null);
        setWebSubs(subsRes.data?.length ?? 0);
        setPrefs(prefsRes.data ?? null);
      }

    } finally {
      setChecking(false);
    }
  }, [isNative]);

  useEffect(() => { void runChecks(); }, [runChecks]);

  async function requestPerm() {
    try {
      if (isNative) {
        const PN = (await import("@capacitor/push-notifications")).PushNotifications;
        const p = await PN.requestPermissions();
        if (p.receive === "granted") {
          announceNotificationGranted();
          toast.success("Permission granted");
        } else {
          toast.error("Denied — open system settings to allow");
          await openAppNotificationSettings();
        }
      } else if ("Notification" in window) {
        const r = await Notification.requestPermission();
        toast[r === "granted" ? "success" : "error"](`Permission: ${r}`);
      }
    } catch (e) {
      toast.error(e?.message || "Failed");
    } finally {
      await runChecks();
    }
  }

  async function reRegisterToken() {
    setRegistering(true);
    try {
      if (!isNative) {
        // Web: register a browser Web Push subscription instead of an FCM token.
        const ok = await ensurePushSubscriptionWithRetry(2);
        toast[ok ? "success" : "error"](
          ok ? "Browser registered for push" : (lastPushFailure || "Could not register this browser"),
          { duration: 8000 },
        );
        await runChecks();
        return;
      }

      // The app-wide useNativePush hook owns the registration listener and
      // authenticated upload. Do not create a second listener here: doing so
      // posted the same FCM token repeatedly and caused a 409 retry storm.
      const PN = (await import("@capacitor/push-notifications")).PushNotifications;
      await PN.register();
      await new Promise((r) => setTimeout(r, 2500));
      await runChecks();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: rows, error: lookupError } = await supabase
          .from("device_tokens")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);
        if (!lookupError && rows?.length) toast.success("Device registered");
        else toast.info("Registration requested. If it still fails, refresh checks in a few seconds.");
      }
    } catch (e) {
      toast.error(e?.message || "Register failed");
    } finally {
      setRegistering(false);
    }
  }

  async function openBattery() {
    const r = await openBatteryOptimizationSettings();
    if (!r.ok) toast.error(r.reason || "Couldn't open settings");
    // We can't detect the allowlist result — mark the row as unknown/manual.
    setBatteryOk(null);
  }

  async function sendTest() {
    setSending(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-push", {
        body: { title: "🔔 Test notification", body: "If you see this, push delivery works." },
      });
      const ok = !error;
      const msg = error ? error.message : (typeof data === "string" ? data : JSON.stringify(data));
      setTestResult({ ok, message: msg, at: new Date().toISOString() });
      toast[ok ? "success" : "error"](ok ? "Test sent — watch for the notification" : `Failed: ${msg}`);
    } catch (e) {
      setTestResult({ ok: false, message: e?.message || String(e), at: new Date().toISOString() });
      toast.error(e?.message || "Failed");
    } finally {
      setSending(false);
      await runChecks();
    }
  }

  const steps: Step[] = useMemo(() => {
    const s: Step[] = [];

    // 1. OS permission
    s.push({
      id: "perm",
      title: "OS notification permission",
      detail:
        perm === "granted" ? "Granted" :
        perm === "denied" ? "Denied — enable in system settings" :
        perm === "prompt" ? "Not yet requested" : "Unknown",
      status: perm === "granted" ? "ok" : perm === "unknown" ? "pending" : "fail",
      action:
        perm !== "granted"
          ? { label: perm === "denied" ? "Open system settings" : "Allow notifications", onClick: requestPerm }
          : undefined,
    });

    // 2. Battery optimization (Android only)
    if (showBatteryStep) {
      s.push({
        id: "battery",
        title: "Battery optimization",
        detail:
          batteryOk === true ? "Ignored (reliable delivery)"
          : batteryOk === false ? "Enabled — pushes may be delayed"
          : "Manual check — Android hides this from apps",
        status: batteryOk === true ? "ok" : batteryOk === false ? "fail" : "pending",
        action: { label: "Open battery settings", onClick: openBattery },
        hint: "Tap ‘Open battery settings’, find HabTastic, and choose Unrestricted / Don't optimize.",
      });
    }

    // 3. Device token
    const hasNative = !!tokenRow;
    s.push({
      id: "token",
      title: "Device registered for push",
      detail: hasNative
        ? `${tokenRow.platform} · v${tokenRow.app_version ?? "?"} · seen ${fmtAgo(tokenRow.last_seen_at)}`
        : webSubs > 0
        ? `${webSubs} web subscription${webSubs === 1 ? "" : "s"} — no native token`
        : "No token on file",
      status: hasNative || webSubs > 0 ? "ok" : "fail",
      action: !hasNative && webSubs === 0
        ? { label: registering ? "Registering…" : "Register this device", onClick: reRegisterToken }
        : undefined,
    });

    // 4. In-app prefs
    const p = prefs;
    const quietHoursOn = !!(p?.quiet_hours_start && p?.quiet_hours_end);
    s.push({
      id: "prefs",
      title: "In-app notifications enabled",
      detail: p
        ? `Push ${p.push_enabled ? "on" : "off"} · Email ${p.email_enabled ? "on" : "off"} · Quiet hours ${quietHoursOn ? "on" : "off"}`
        : "Using defaults (all channels on)",
      status: !p || p.push_enabled ? "ok" : "fail",
      action: { label: "Notification settings", onClick: () => navigate("/settings/notifications") },
    });


    // 5. Test delivery
    s.push({
      id: "test",
      title: "Test delivery",
      detail: testResult
        ? `${testResult.ok ? "Sent" : "Failed"} · ${fmtAgo(testResult.at)}${testResult.message ? ` — ${testResult.message.slice(0, 80)}` : ""}`
        : "Not run yet",
      status: testResult ? (testResult.ok ? "ok" : "fail") : "pending",
      action: { label: sending ? "Sending…" : "Send test push", onClick: sendTest },
    });

    return s;
  }, [perm, batteryOk, tokenRow, webSubs, prefs, testResult, isNative, showBatteryStep, sending, registering, navigate]);

  const failing = steps.filter((x) => x.status === "fail").length;

  return (
    <div className="min-h-screen bg-background text-foreground pb-safe">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/50">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-4 py-3">
          <button aria-label="Back" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Notification setup</h1>
            <p className="text-xs text-muted-foreground">
              {failing === 0 ? "All checks passing" : `${failing} issue${failing === 1 ? "" : "s"} to fix`}
            </p>
          </div>
          <button
            aria-label="Re-check"
            onClick={runChecks}
            disabled={checking}
            className="p-2 rounded-full hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${checking ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl w-full px-4 py-4 space-y-3 max-h-[calc(100dvh-220px)] overflow-y-auto overscroll-y-contain touch-pan-y pb-28" style={{ WebkitOverflowScrolling: "touch" }}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Follow these steps so HabTastic can reliably deliver reminders, streak alerts, and Winston nudges.
        </p>

        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={step.id} className="glass rounded-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <StatusIcon status={step.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-semibold text-sm">
                      <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                      {step.title}
                    </h2>
                  </div>
                  <p className={`text-xs mt-1 ${step.status === "fail" ? "text-destructive" : "text-muted-foreground"}`}>
                    {step.detail}
                  </p>
                  {step.hint && (
                    <p className="text-[11px] mt-1 text-muted-foreground/80 italic">{step.hint}</p>
                  )}
                  {step.action && (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant={step.status === "fail" ? "default" : "secondary"}
                        onClick={() => void step.action!.onClick()}
                        disabled={sending || registering || checking}
                      >
                        {step.id === "test" && <Send className="w-3.5 h-3.5 mr-1.5" />}
                        {step.action.label}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {testResult && (
          <div className={`rounded-card p-3 text-xs ${testResult.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>
            <div className="font-medium mb-1">Last test result · {new Date(testResult.at).toLocaleTimeString()}</div>
            <pre className="whitespace-pre-wrap break-all">{testResult.message}</pre>
          </div>
        )}

      </main>
    </div>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  const base = "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5";
  if (status === "ok") return <div className={`${base} bg-emerald-500/15 text-emerald-500`}><Check className="w-4 h-4" /></div>;
  if (status === "fail") return <div className={`${base} bg-destructive/15 text-destructive`}><X className="w-4 h-4" /></div>;
  if (status === "checking") return <div className={`${base} bg-muted text-muted-foreground`}><Loader2 className="w-4 h-4 animate-spin" /></div>;
  return <div className={`${base} bg-muted text-muted-foreground text-xs font-semibold`}>·</div>;
}
