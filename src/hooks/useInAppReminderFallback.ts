import { formatLocalDate } from '@/lib/habitStore';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useHabits } from './useHabits';
import { isWebPushSupported } from '@/lib/webPush';

const PREF_KEY = 'habtastic-inapp-fallback-enabled';
const FIRED_KEY = 'habtastic-inapp-fallback-fired';

export function isInAppFallbackEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  // Default ON so users don't silently miss reminders
  const v = localStorage.getItem(PREF_KEY);
  return v === null ? true : v === '1';
}

export function setInAppFallbackEnabled(on: boolean) {
  localStorage.setItem(PREF_KEY, on ? '1' : '0');
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getFired(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); } catch { return {}; }
}

function markFired(habitId: string) {
  const all = getFired();
  const k = todayKey();
  const arr = new Set(all[k] || []);
  arr.add(habitId);
  // Keep only today's bucket
  localStorage.setItem(FIRED_KEY, JSON.stringify({ [k]: Array.from(arr) }));
}

function alreadyFired(habitId: string): boolean {
  const all = getFired();
  return (all[todayKey()] || []).includes(habitId);
}

async function pushIsActive(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch { return false; }
}

export function InAppReminderFallback() {
  const { habits } = useHabits();
  const habitsRef = useRef(habits);
  habitsRef.current = habits;

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (!isInAppFallbackEnabled()) return;
      const pushOk = await pushIsActive();
      if (pushOk) return; // push will handle it

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const cur = `${hh}:${mm}`;
      const dow = now.getDay();

      for (const h of habitsRef.current) {
        if (!h.reminder_enabled || !h.reminder_time) continue;
        if (h.reminder_time.slice(0, 5) !== cur) continue;
        // Skip if completed today
        const today = formatLocalDate(now);
        if (h.completions?.includes(today)) continue;
        // Respect custom_days if frequency is custom
        if (h.frequency === 'custom' && h.custom_days?.length && !h.custom_days.includes(dow)) continue;
        if (alreadyFired(h.id)) continue;
        markFired(h.id);
        toast(`${h.emoji} Time for ${h.name}`, {
          description: 'In-app reminder (push notifications are off)',
          duration: 10000,
        });
      }
    };

    tick();
    const id = window.setInterval(tick, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return null;
}
