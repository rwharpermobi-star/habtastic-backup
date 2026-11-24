import { formatLocalDate } from '@/lib/habitStore';
import { useState, useEffect, useCallback } from 'react';
import type { DbHabit } from '@/hooks/useHabits';
import { usePremium } from '@/hooks/usePremium';

interface NotificationPrefs {
  enabled: boolean;
  streakDanger: boolean;
  dailyReminder: boolean;
  optimalTime: string; // HH:MM
}

const STORAGE_KEY = 'habtastic-notif-prefs';
const ACTIVITY_KEY = 'habtastic-activity-log';

function getDefaultPrefs(): NotificationPrefs {
  return { enabled: false, streakDanger: true, dailyReminder: true, optimalTime: '09:00' };
}

function loadPrefs(): NotificationPrefs {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...getDefaultPrefs(), ...JSON.parse(stored) } : getDefaultPrefs();
  } catch { return getDefaultPrefs(); }
}

// Track when user typically completes habits to find optimal reminder time
function logActivity() {
  try {
    const log: number[] = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    log.push(new Date().getHours());
    // Keep last 50 entries
    if (log.length > 50) log.splice(0, log.length - 50);
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
  } catch { /* ignore: best effort */ }
}

function getOptimalHour(): number {
  try {
    const log: number[] = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    if (log.length < 5) return 9; // Default to 9am
    // Find the most common hour, then suggest 1 hour before
    const counts: Record<number, number> = {};
    log.forEach(h => { counts[h] = (counts[h] || 0) + 1; });
    const peakHour = parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
    return Math.max(6, peakHour - 1); // Remind 1hr before peak, minimum 6am
  } catch { return 9; }
}

export function useSmartNotifications(habits: DbHabit[]) {
  const { isPremium } = usePremium();
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Save prefs whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setPrefs(p => ({ ...p, enabled: true }));
    }
    return result === 'granted';
  }, []);

  const updatePrefs = useCallback((updates: Partial<NotificationPrefs>) => {
    setPrefs(p => ({ ...p, ...updates }));
  }, []);

  const sendNotification = useCallback((title: string, body: string, icon = '🔔') => {
    if (!isPremium || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: '/placeholder.svg', badge: '/placeholder.svg', tag: 'habtastic' });
    } catch { /* ignore: best effort */ }
  }, [isPremium]);

  // Track activity for optimal time calculation
  const trackActivity = useCallback(() => {
    logActivity();
  }, []);

  // Smart streak danger check — runs on mount
  useEffect(() => {
    if (!isPremium || !prefs.enabled || !prefs.streakDanger) return;
    const hour = new Date().getHours();

    // Evening streak danger notification (8pm+)
    if (hour >= 20) {
      const today = formatLocalDate(new Date());
      const unfinished = habits.filter(h => !h.completions.includes(today));
      const hasStreak = habits.some(h => {
        // Check if habit has a streak >= 3
        let streak = 0;
        for (let i = 1; i < 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          if (h.completions.includes(formatLocalDate(d))) streak++;
          else break;
        }
        return streak >= 3 && !h.completions.includes(today);
      });

      if (hasStreak && unfinished.length > 0) {
        const lastNotif = localStorage.getItem('habtastic-last-streak-notif');
        if (lastNotif !== today) {
          localStorage.setItem('habtastic-last-streak-notif', today);
          sendNotification(
            '🚨 Streak in Danger!',
            `${unfinished.length} habit${unfinished.length > 1 ? 's' : ''} left. Your streak dies at midnight!`
          );
        }
      }
    }
  }, [isPremium, habits, prefs.enabled, prefs.streakDanger, sendNotification]);

  // Daily reminder at optimal time
  useEffect(() => {
    if (!isPremium || !prefs.enabled || !prefs.dailyReminder) return;

    const checkTime = () => {
      const now = new Date();
      const [targetH] = prefs.optimalTime.split(':').map(Number);
      if (now.getHours() === targetH && now.getMinutes() === 0) {
        const today = formatLocalDate(now);
        const pending = habits.filter(h => !h.completions.includes(today)).length;
        if (pending > 0) {
          const lastDaily = localStorage.getItem('habtastic-last-daily-notif');
          if (lastDaily !== today) {
            localStorage.setItem('habtastic-last-daily-notif', today);
            sendNotification(
              '🌟 Time to shine!',
              `You have ${pending} habit${pending > 1 ? 's' : ''} waiting. Let's make today count!`
            );
          }
        }
      }
    };

    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [isPremium, habits, prefs.enabled, prefs.dailyReminder, prefs.optimalTime, sendNotification]);

  return {
    prefs,
    permission,
    optimalHour: getOptimalHour(),
    requestPermission,
    updatePrefs,
    trackActivity,
    sendNotification,
  };
}
