import { useEffect, useMemo } from 'react';
import { useHabits } from '@/hooks/useHabits';
import { usePremium } from '@/hooks/usePremium';
import { cancelHabitReminders, scheduleHabitReminders } from '@/lib/habitNotifications';
import { EXACT_ALARM_CHANGED_EVENT } from '@/lib/exactAlarms';

// One scheduler for the signed-in app, so leaving Habits does not cancel all
// reminders. Future native reminders also respect the entitlement end date.
export default function HabitReminderEffects() {
  const { allHabits } = useHabits();
  const { isPremium, isPaidPremium, nextBillingDate, trialEndDate } = usePremium();
  const end = (isPaidPremium ? nextBillingDate : trialEndDate)?.getTime();
  const access = useMemo(() => ({
    isPremium,
    premiumUntil: end !== undefined && Number.isFinite(end) ? end : undefined,
  }), [isPremium, end]);

  useEffect(() => {
    const schedule = () => scheduleHabitReminders(allHabits, access);
    schedule();
    window.addEventListener('focus', schedule);
    // Re-schedule as exact (or inexact) right after the Alarms & reminders switch changes.
    window.addEventListener(EXACT_ALARM_CHANGED_EVENT, schedule);
    return () => {
      window.removeEventListener('focus', schedule);
      window.removeEventListener(EXACT_ALARM_CHANGED_EVENT, schedule);
      cancelHabitReminders();
    };
  }, [allHabits, access]);

  return null;
}
