// Hidden diagnostics screen for FCM push registration + delivery status.
// Route: /fcm-debug — admin-only. No navigation link; visit directly on device.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";

/**
 * Masks an FCM registration token for display. A token is a bearer credential
 * for pushing to that device, so only enough is shown to correlate rows.
 */
const maskToken = (t: string) =>
  t.length <= 14 ? `…(len=${t.length})` : `${t.slice(0, 8)}…${t.slice(-6)} (len=${t.length})`;

type Line = { label: string; value: string; ok?: boolean };

const LS = {
  lastRegAt: "fcm.lastRegistrationAt",
  lastToken: "fcm.lastToken",
  lastErrorAt: "fcm.lastErrorAt",
  lastErrorCode: "fcm.lastErrorCode",
  lastSendAt: "fcm.lastSendAt",
  lastSendResult: "fcm.lastSendResult",
};

function fmt(ts: string | null | undefined) {
  if (!ts) return "never";
  try {
    const d = new Date(ts);
    const ago = Math.round((Date.now() - d.getTime()) / 1000);
    const rel =
      ago < 60 ? `${ago}s ago` :
      ago < 3600 ? `${Math.round(ago / 60)}m ago` :
      ago < 86400 ? `${Math.round(ago / 3600)}h ago` :
      `${Math.round(ago / 86400)}d ago`;
    return `${d.toLocaleString()} (${rel})`;
  } catch { return String(ts); }
}

export default function FCMDebug() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);

  const push = (l: Line) => setLines((prev) => [...prev, l]);


  async function loadDeliveryStatus() {
    const rows: Line[] = [];
    const { data: { user } } = await supabase.auth.getUser();
    rows.push({ label: "Signed-in user", value: user?.id ?? "none", ok: !!user });

    // Local (this device) registration history
    rows.push({
      label: "Last token registration (this device)",
      value: fmt(localStorage.getItem(LS.lastRegAt)),
      ok: !!localStorage.getItem(LS.lastRegAt),
    });
    const tok = localStorage.getItem(LS.lastToken);
    if (tok) rows.push({ label: "Last token (local, masked)", value: maskToken(tok) });
    const lastErrAt = localStorage.getItem(LS.lastErrorAt);
    const lastErrCode = localStorage.getItem(LS.lastErrorCode);
    rows.push({
      label: "Last registration error",
      value: lastErrCode ? `${lastErrCode} @ ${fmt(lastErrAt)}` : "none",
      ok: !lastErrCode,
    });
    rows.push({
      label: "Last test-send (this device)",
      value: `${localStorage.getItem(LS.lastSendResult) || "never"} @ ${fmt(localStorage.getItem(LS.lastSendAt))}`,
    });

    if (!user) { setStatus(rows); return; }

    // Server-side state
    const [{ data: tokens }, { data: subs }, { data: log }, { data: notif }, { data: prefs }] =
      await Promise.all([
        supabase.from("device_tokens")
          .select("platform,app_version,last_seen_at,created_at")
          .eq("user_id", user.id)
          .order("last_seen_at", { ascending: false })
          .limit(5),
        supabase.from("push_subscriptions")
          .select("endpoint,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("notification_log")
          .select("kind,title,sent_at")
          .eq("user_id", user.id)
          .order("sent_at", { ascending: false })
          .limit(1),
        supabase.from("notifications")
          .select("kind,title,created_at,read_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("notification_prefs")
          .select("timezone,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,per_habit_enabled,weekly_recap_enabled")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    rows.push({
      label: `device_tokens (server): ${tokens?.length ?? 0}`,
      value: tokens?.length
        ? tokens.map((t) => `${t.platform} v${t.app_version ?? "?"} — seen ${fmt(t.last_seen_at)}`).join("\n")
        : "❗ No native tokens registered — pushes to phone cannot be delivered.",
      ok: (tokens?.length ?? 0) > 0,
    });
    rows.push({
      label: `push_subscriptions (web): ${subs?.length ?? 0}`,
      value: subs?.length ? subs.map((s: any) => fmt(s.created_at)).join("\n") : "none",
    });
    rows.push({
      label: "Last dispatched notification (server log)",
      value: log?.[0] ? `${(log[0] as any).kind} — "${(log[0] as any).title}" — ${fmt((log[0] as any).sent_at ?? (log[0] as any).created_at)}` : "never",
      ok: !!log?.[0],
    });
    rows.push({
      label: "Last in-app bell notification",
      value: notif?.[0] ? `${notif[0].kind} — "${notif[0].title}" — ${fmt(notif[0].created_at)}` : "never",
      ok: !!notif?.[0],
    });
    const p = prefs;
    rows.push({
      label: "notification_prefs",
      value: p
        ? `tz=${p.timezone} per_habit=${p.per_habit_enabled} weekly=${p.weekly_recap_enabled} quiet=${p.quiet_hours_enabled ? `${p.quiet_hours_start}–${p.quiet_hours_end}` : "off"}`
        : "not set (defaults apply)",
      ok: true,
    });

    setStatus(rows);
  }

  async function sendTestPush() {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-push", {
        body: { title: "🔔 Diagnostic push", body: "Delivery test from /fcm-debug" },
      });
      const result = error ? `error: ${error.message}` : JSON.stringify(data);
      localStorage.setItem(LS.lastSendAt, new Date().toISOString());
      localStorage.setItem(LS.lastSendResult, result);
      push({ label: "send-test-push", value: result, ok: !error });
    } catch (e) {
      const result = `threw: ${e?.message || e}`;
      localStorage.setItem(LS.lastSendAt, new Date().toISOString());
      localStorage.setItem(LS.lastSendResult, result);
      push({ label: "send-test-push", value: result, ok: false });
    } finally {
      setSending(false);
      await loadDeliveryStatus();
    }
  }

  async function run() {
    setRunning(true);
    setLines([]);
    const platform = Capacitor.getPlatform();
    push({ label: "Capacitor.getPlatform()", value: platform });
    push({ label: "isNativePlatform", value: String(Capacitor.isNativePlatform()) });

    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      push({ label: "App id (package)", value: info.id, ok: info.id === "app.lovable.habtastic" });
      push({ label: "App version", value: `${info.version} (${info.build})` });
    } catch (e) {
      push({ label: "App.getInfo() error", value: String(e?.message || e), ok: false });
    }

    if (!Capacitor.isNativePlatform()) {
      push({ label: "Result", value: "Not native — FCM checks skipped", ok: false });
      setRunning(false);
      await loadDeliveryStatus();
      return;
    }

    let PN;
    try {
      PN = (await import("@capacitor/push-notifications")).PushNotifications;
      push({ label: "PushNotifications plugin", value: "loaded", ok: true });
    } catch (e) {
      push({ label: "PushNotifications plugin", value: `load failed: ${e?.message || e}`, ok: false });
      setRunning(false);
      await loadDeliveryStatus();
      return;
    }

    try {
      let perm = await PN.checkPermissions();
      push({ label: "checkPermissions()", value: JSON.stringify(perm) });
      if (perm.receive !== "granted") {
        perm = await PN.requestPermissions();
        push({ label: "requestPermissions()", value: JSON.stringify(perm) });
      }
      if (perm.receive !== "granted") {
        push({ label: "Result", value: "Permission not granted — cannot register", ok: false });
        setRunning(false);
        await loadDeliveryStatus();
        return;
      }
    } catch (e) {
      push({ label: "permissions error", value: String(e?.message || e), ok: false });
    }

    let gotRegistration = false;
    let gotError = false;

    const l1 = await PN.addListener("registration", (e: { value: string }) => {
      gotRegistration = true;
      localStorage.setItem(LS.lastRegAt, new Date().toISOString());
      localStorage.setItem(LS.lastToken, e.value);
      // Never render or copy the full FCM registration token — a screenshot of
      // this page would be enough to send pushes to the device.
      push({ label: "✅ registration event", value: `token ${maskToken(e.value)}`, ok: true });
      (async () => {
        try {
          const { error } = await supabase.functions.invoke("push-token-register", {
            body: { token: e.value, platform: "android", app_version: "fcm-debug" },
          });
          push({
            label: "push-token-register invoke",
            value: error ? `error: ${error.message}` : "ok — check device_tokens table",
            ok: !error,
          });
          await loadDeliveryStatus();
        } catch (err) {
          push({ label: "push-token-register invoke", value: String(err?.message || err), ok: false });
        }
      })();
    });

    const l2 = await PN.addListener("registrationError", (err) => {
      gotError = true;
      const code = typeof err === "string" ? err : (err?.error || err?.message || JSON.stringify(err));
      localStorage.setItem(LS.lastErrorAt, new Date().toISOString());
      localStorage.setItem(LS.lastErrorCode, String(code).slice(0, 200));
      push({ label: "❌ registrationError event", value: String(code), ok: false });
    });

    try {
      push({ label: "Calling register()…", value: "waiting for FCM…" });
      await PN.register();
    } catch (e) {
      push({ label: "register() threw", value: String(e?.message || e), ok: false });
    }

    await new Promise((r) => setTimeout(r, 15000));
    if (!gotRegistration && !gotError) {
      const msg = "No registration or registrationError fired within 15s. Almost always means google-services.json was NOT bundled, package name mismatch, or Google Play Services missing/disabled.";
      localStorage.setItem(LS.lastErrorAt, new Date().toISOString());
      localStorage.setItem(LS.lastErrorCode, "TIMEOUT_NO_EVENT");
      push({ label: "⏱ Timeout", value: msg, ok: false });
    }

    try { l1.remove(); l2.remove(); } catch { /* ignore: best effort */ }
    setRunning(false);
    await loadDeliveryStatus();
  }

  useEffect(() => {
    if (!isAdmin) return;
    void loadDeliveryStatus();
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const fmtLines = (arr: Line[]) =>
    arr.map((l) => `${l.ok === false ? "❌" : l.ok ? "✅" : "•"} ${l.label}:\n   ${l.value.replace(/\n/g, "\n   ")}`).join("\n\n");

  const text = `=== DELIVERY STATUS ===\n${fmtLines(status)}\n\n=== REGISTRATION RUN ===\n${fmtLines(lines)}`;

  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Shield className="w-10 h-10 text-muted-foreground mb-2" />
        <p className="text-sm font-semibold">Admins only</p>
        <button onClick={() => navigate("/profile")} className="mt-3 text-primary text-sm">← Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">FCM Diagnostics</h1>
          <p className="text-xs text-muted-foreground">Delivery status + live registration trace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={run}
            disabled={running}
          >
            {running ? "Running…" : "Re-run registration"}
          </button>
          <button
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            onClick={loadDeliveryStatus}
          >
            Refresh status
          </button>
          <button
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            onClick={sendTestPush}
            disabled={sending}
          >
            {sending ? "Sending…" : "Send test push to me"}
          </button>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => { try { navigator.clipboard.writeText(text); } catch { /* ignore: best effort */ } }}
          >
            Copy report
          </button>
        </div>

        <section>
          <h2 className="mb-1 text-sm font-semibold">Delivery status</h2>
          <pre className="whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
            {status.length ? fmtLines(status) : "Loading…"}
          </pre>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold">Registration trace</h2>
          <pre className="whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
            {lines.length ? fmtLines(lines) : "Starting…"}
          </pre>
        </section>
      </div>
    </div>
  );
}
