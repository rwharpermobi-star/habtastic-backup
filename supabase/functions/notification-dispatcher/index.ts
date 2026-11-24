// Notification dispatcher: invoked every 5 minutes by pg_cron.
// Evaluates per-habit reminders, missed follow-ups, comeback nudges,
// streak pressure, weekly recap. Respects quiet hours and dedup.
// Fans out to Web-Push AND native FCM/APNs tokens.
//
// Lean mode (Nov 2026): the database first returns only the users who have
// something due in this 5-minute window (notification_due_users), then for
// those users only today's habit facts are read (notification_habit_snapshot)
// instead of full completion histories. Phones with the app schedule their own
// per-habit reminders locally, so the server sends per-habit reminders only to
// web push for users who have a phone token (no doubles on the phone).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";
import { sendNativePush } from "../_shared/nativePush.ts";


const responseHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:info@habtastic.com";

let vapidReady = false;
try {
  const subjectOk = VAPID_SUBJECT.startsWith("mailto:") || VAPID_SUBJECT.startsWith("https://");
  if (VAPID_PUBLIC && VAPID_PRIVATE && subjectOk) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
  } else {
    // Diagnostic log so we can see exactly which piece is missing/wrong
    console.warn("VAPID not configured properly — skipping push sends", {
      hasPublic: !!VAPID_PUBLIC,
      publicLen: VAPID_PUBLIC.length,
      hasPrivate: !!VAPID_PRIVATE,
      privateLen: VAPID_PRIVATE.length,
      subject: VAPID_SUBJECT,
      subjectOk,
    });
  }
} catch (e) {
  console.error("VAPID setup failed:", e instanceof Error ? e.message : e);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Prefs {
  user_id: string;
  timezone: string;
  default_tone: "normal" | "motivational" | "strong";
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  per_habit_enabled: boolean;
  missed_followups_enabled: boolean;
  comeback_enabled: boolean;
  streak_pressure_enabled: boolean;
  weekly_recap_enabled: boolean;
  weekly_recap_dow: number;
  weekly_recap_time: string;
}
interface Habit {
  id: string; user_id: string; name: string; emoji: string;
  frequency: string; custom_days: number[];
  reminder_time: string | null; reminder_enabled: boolean;
  reminder_tone: string;
  done_today: boolean; streak: number; week_count: number;
}
interface PushSub { id: string; endpoint: string; p256dh: string; auth: string }

function localParts(now: Date, tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hour: parseInt(parts.hour, 10),
      minute: parseInt(parts.minute, 10),
      dow: dowMap[parts.weekday as string] ?? new Date().getDay(),
    };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours(), minute: now.getUTCMinutes(), dow: now.getUTCDay() };
  }
}

function inQuietHours(prefs: Prefs, hour: number, minute: number) {
  if (!prefs.quiet_hours_enabled) return false;
  const [sh, sm] = prefs.quiet_hours_start.split(":").map(Number);
  const [eh, em] = prefs.quiet_hours_end.split(":").map(Number);
  const cur = hour * 60 + minute;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end; // wraps midnight
}

function isHabitDueOnDow(habit: Habit, dow: number) {
  if (habit.frequency === "daily" || habit.frequency === "weekly") return true;
  if (habit.frequency === "custom") return (habit.custom_days || []).includes(dow);
  return true;
}

/** Cron runs every 5 minutes: a slot fires on the first run at or after it. */
const WINDOW_MINUTES = 5;
function inWindow(minutesNow: number, target: number) {
  const d = minutesNow - target;
  return d >= 0 && d < WINDOW_MINUTES;
}

function toneCopy(tone: string, base: string, motiv: string, strong: string) {
  if (tone === "strong") return strong;
  if (tone === "motivational") return motiv;
  return base;
}

async function sendPush(subs: PushSub[], payload: Record<string, unknown>) {
  if (!vapidReady) return;
  const dead: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint);
      else console.warn("push failed", err?.statusCode);
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);
}

async function logAndSend(
  userId: string, kind: string, dedupKey: string,
  title: string, body: string, subs: PushSub[],
  habitId: string | null, url = "/",
  nativeTokens: { token: string; platform: "android" | "ios" | "web" }[] = [],
) {
  const { error } = await admin.from("notification_log").insert({
    user_id: userId, kind, habit_id: habitId, title, body, dedup_key: dedupKey,
  });
  if (error) return; // duplicate -> already sent (unique index on dedup_key)
  const [, native] = await Promise.all([
    sendPush(subs, { title, body, tag: dedupKey, url, habitId }),
    sendNativePush(nativeTokens, { title, body, tag: dedupKey, url, data: habitId ? { habitId } : {} }),
  ]);
  // Prune tokens FCM/APNs reported as unregistered so we stop wasting sends.
  if (native.invalid.length) {
    const { error } = await admin.from("device_tokens").delete().in("token", native.invalid);
    if (error) console.warn("[dispatcher] invalid token cleanup failed", error.message);
    else console.log("[dispatcher] removed invalid device tokens", native.invalid.length);
  }
}


type NativeTok = { token: string; platform: "android" | "ios" | "web" };

async function processUser(
  prefs: Prefs,
  habits: Habit[],
  subs: PushSub[],
  nativeTokens: NativeTok[],
  now: Date,
  premium: boolean,
  lastActiveAt: string | null,
) {
  if (!subs.length && !nativeTokens.length) return;
  const { date, hour, minute, dow } = localParts(now, prefs.timezone);
  if (inQuietHours(prefs, hour, minute)) return;

  const minutesNow = hour * 60 + minute;
  const dueHabits = habits.filter((h) => isHabitDueOnDow(h, dow));
  const incomplete = dueHabits.filter((h) => !h.done_today);
  // Phones with the app schedule per-habit reminders locally. For those users
  // the server sends per-habit reminders to web push only.
  const hasPhoneApp = nativeTokens.some((t) => t.platform === "android" || t.platform === "ios");

  // 1) PER-HABIT REMINDER (first run at or after reminder_time)
  const perHabitNative = hasPhoneApp ? [] : nativeTokens;
  if (prefs.per_habit_enabled && (subs.length || perHabitNative.length)) {
    for (const h of dueHabits) {
      if (!h.reminder_enabled || !h.reminder_time) continue;
      if (h.done_today) continue;
      const [hh, mm] = h.reminder_time.split(":").map(Number);
      const target = hh * 60 + mm;
      if (!inWindow(minutesNow, target)) continue;
      const tone = premium ? (h.reminder_tone || prefs.default_tone) : "normal";
      const title = toneCopy(tone, `Time for: ${h.name} ${h.emoji}`, `Let's go — ${h.name} ${h.emoji}`, `🚨 NOW: ${h.name} ${h.emoji}`);
      const body = toneCopy(tone, "Tap to complete and keep your streak alive.",
        "Small action, big momentum. You've got this 💪",
        "No excuses. Do it now and stack the win.");
      await logAndSend(prefs.user_id, "per_habit", `per_habit:${h.id}:${date}:${h.reminder_time}`, title, body, subs, h.id, "/", perHabitNative);
    }
  }

  // 2) MISSED FOLLOW-UPS (1h after reminder, and end-of-day at 21:00)
  if (premium && prefs.missed_followups_enabled) {
    for (const h of dueHabits) {
      if (!h.reminder_enabled || !h.reminder_time) continue;
      if (h.done_today) continue;
      const [hh, mm] = h.reminder_time.split(":").map(Number);
      const target = hh * 60 + mm;
      if (inWindow(minutesNow, target + 60)) {
        await logAndSend(prefs.user_id, "missed_1h", `missed_1h:${h.id}:${date}`,
          `Still time: ${h.name} ${h.emoji}`,
          "An hour late beats never. 2 minutes is all it takes.", subs, h.id, "/", nativeTokens);
      }
    }
    if (hour === 21 && minute < WINDOW_MINUTES && incomplete.length > 0) {
      await logAndSend(prefs.user_id, "missed_eod", `missed_eod:${date}`,
        "⚠️ Last chance today",
        `${incomplete.length} habit${incomplete.length > 1 ? "s" : ""} left — keep your streak alive.`, subs, null, "/", nativeTokens);
    }
  }

  // 3) STREAK PRESSURE
  if (premium && prefs.streak_pressure_enabled && hour === 19 && minute < WINDOW_MINUTES) {
    const atRisk = incomplete
      .map((h) => ({ h, s: h.streak }))
      .filter((x) => x.s >= 3)
      .sort((a, b) => b.s - a.s)[0];
    if (atRisk) {
      await logAndSend(prefs.user_id, "streak_pressure", `streak_pressure:${atRisk.h.id}:${date}`,
        `🔥 ${atRisk.s}-day streak on the line`,
        `Finish "${atRisk.h.name}" today and keep the chain going.`, subs, atRisk.h.id, "/", nativeTokens);
    }
  }

  // 4) COMEBACK
  if (premium && prefs.comeback_enabled && hour === 8 && minute < WINDOW_MINUTES) {
    if (lastActiveAt) {
      const days = Math.floor((now.getTime() - new Date(lastActiveAt).getTime()) / 86400000);
      if (days === 1) {
        await logAndSend(prefs.user_id, "comeback_1d", `comeback_1d:${date}`,
          "Missed you yesterday 👀", "Let's get back on track — start with one tiny win.", subs, null, "/", nativeTokens);
      } else if (days >= 2 && days <= 4) {
        await logAndSend(prefs.user_id, "comeback_3d", `comeback_3d:${date}`,
          "Your streak is waiting 🔥", "Tap to do just one habit today — momentum builds fast.", subs, null, "/", nativeTokens);
      } else if (days >= 5) {
        await logAndSend(prefs.user_id, "comeback_5d", `comeback_5d:${date}`,
          "Let's restart together 💚", "One small win today is all it takes. We've got you.", subs, null, "/", nativeTokens);
      }
    }
  }

  // 5) WEEKLY RECAP
  if (premium && prefs.weekly_recap_enabled) {
    const [rh, rm] = prefs.weekly_recap_time.split(":").map(Number);
    if (dow === prefs.weekly_recap_dow && inWindow(minutesNow, rh * 60 + rm)) {
      let total = 0; let bestStreak = 0;
      for (const h of habits) {
        total += h.week_count;
        bestStreak = Math.max(bestStreak, h.streak);
      }
      await logAndSend(prefs.user_id, "weekly_recap", `weekly_recap:${date}`,
        "📊 Your week in review",
        `${total} habit${total === 1 ? "" : "s"} completed${bestStreak ? ` · best streak ${bestStreak} days 🔥` : ""}.`, subs, null, "/progress", nativeTokens);
    }
  }
}


Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: responseHeaders,
    });
  }

  try {
    // Supabase's Edge gateway validates the JWT before this function runs.
    // A second independent 256-bit Vault secret is then required. Normal
    // signed-in users have a valid JWT but cannot know this server-only secret.
    const provided = (req.headers.get("x-internal-secret") || "").trim();
    if (provided.length < 32 || provided.length > 256) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: responseHeaders,
      });
    }

    const { data: expected, error: secretError } = await admin.rpc(
      "get_notification_dispatcher_secret",
    );
    if (
      secretError ||
      typeof expected !== "string" ||
      expected.length < 32 ||
      !constantTimeEqual(provided, expected)
    ) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: responseHeaders,
      });
    }

    const now = new Date();

    // 1) Ask the database who has something due in this 5-minute window.
    //    Usually this returns few or no rows, so a quiet run costs almost nothing.
    const { data: dueRows, error: dErr } = await admin.rpc("notification_due_users", { _now: now.toISOString() });
    if (dErr) throw dErr;
    const dueIds = ((dueRows || []) as { user_id: string }[]).map((r) => r.user_id);
    if (!dueIds.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, due: 0 }), { headers: responseHeaders });
    }

    const { data: prefsList, error: pErr } = await admin
      .from("notification_prefs")
      .select("user_id, timezone, default_tone, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, per_habit_enabled, missed_followups_enabled, comeback_enabled, streak_pressure_enabled, weekly_recap_enabled, weekly_recap_dow, weekly_recap_time")
      .in("user_id", dueIds);
    if (pErr) throw pErr;

    let processed = 0;
    const allPrefs = (prefsList || []) as Prefs[];
    // Bound database and push-provider load while avoiding one-user-at-a-time latency.
    const batchSize = 5;
    for (let i = 0; i < allPrefs.length; i += batchSize) {
      const batch = allPrefs.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (prefs) => {
        const { date, hour, minute } = localParts(now, prefs.timezone);
        if (inQuietHours(prefs, hour, minute)) return false;
        const [{ data: subs }, { data: tokens }] = await Promise.all([
          admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", prefs.user_id),
          admin.from("device_tokens").select("token, platform").eq("user_id", prefs.user_id),
        ]);
        const subsArr = (subs || []) as PushSub[];
        const tokArr = (tokens || []) as NativeTok[];
        if (!subsArr.length && !tokArr.length) return false;

        const [{ data: habits }, { data: profile }] = await Promise.all([
          admin.rpc("notification_habit_snapshot", { _user_id: prefs.user_id, _today: date }),
          admin.from("profiles").select("is_premium,premium_until,trial_started_at,last_active_at").eq("user_id", prefs.user_id).maybeSingle(),
        ]);

        const premiumUntil = profile?.premium_until ? new Date(profile.premium_until).getTime() : null;
        const trialStarted = profile?.trial_started_at ? new Date(profile.trial_started_at).getTime() : null;
        const nowMs = now.getTime();
        const paidPremium = Boolean(
          profile?.is_premium && (premiumUntil == null || premiumUntil > nowMs),
        );
        const trialPremium = Boolean(
          trialStarted != null &&
          trialStarted <= nowMs &&
          trialStarted > nowMs - 5 * 24 * 60 * 60 * 1000,
        );
        const premium = paidPremium || trialPremium;

        const savedHabits = (habits || []) as Habit[];
        const activeHabits = premium ? savedHabits : savedHabits.slice(0, 4);
        await processUser(prefs, activeHabits, subsArr, tokArr, now, premium, profile?.last_active_at ?? null);
        return true;
      }));
      processed += results.filter(Boolean).length;
    }

    return new Response(JSON.stringify({ ok: true, processed, due: dueIds.length, ts: now.toISOString() }), { headers: responseHeaders });
  } catch (e) {
    console.error("dispatcher error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: responseHeaders });
  }
});
