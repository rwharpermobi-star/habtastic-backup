import { z } from 'zod';

const KEY = 'habtastic-email-reminder';

export const emailReminderSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: 'Enter a valid email address' })
    .max(255, { message: 'Email is too long' }),
});

export interface EmailReminderPrefs {
  enabled: boolean;
  email: string | null;
  verifiedAt: string | null;
}

export function getEmailReminderPrefs(): EmailReminderPrefs {
  if (typeof window === 'undefined') return { enabled: false, email: null, verifiedAt: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { enabled: false, email: null, verifiedAt: null };
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      email: parsed.email ?? null,
      verifiedAt: parsed.verifiedAt ?? null,
    };
  } catch {
    return { enabled: false, email: null, verifiedAt: null };
  }
}

export function setEmailReminderPrefs(prefs: EmailReminderPrefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
