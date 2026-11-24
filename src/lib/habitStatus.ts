import { formatLocalDate } from '@/lib/habitStore';
// Shared habit completion status system used across Habits + Progress UI.
// Status colors (vibrant, dark-mode friendly):
//   completed  → Green  #16A34A
//   partial    → Orange #EA580C (rendered as a half-filled circle for clarity)
//   missed     → Red    #EF4444
//   today      → Blue outline #3B82F6 (no fill, awaiting input)
//   future     → neutral muted
//
// All hues are tuned to meet WCAG 2.1 non-text contrast (≥3.0) against BOTH
// the Arctic Mint light background and the Midnight Navy dark background.
// See `src/test/habit-status-contrast.test.ts` — those tests will fail if
// any color drifts below the AA threshold on either theme.

export type HabitDayStatus = 'completed' | 'partial' | 'missed' | 'today' | 'future';

export const STATUS_COLORS = {
  completed: '#16A34A',
  // Tuned from #F59E0B → #EA580C for WCAG AA non-text contrast (≥3.0)
  // against the Arctic Mint light background (was 2.03, now 3.36).
  partial: '#EA580C',
  missed: '#EF4444',
  today: '#3B82F6',
} as const;

export const STATUS_LABELS: Record<Exclude<HabitDayStatus, 'future'>, string> = {
  completed: 'Completed',
  partial: 'Partial',
  missed: 'Missed',
  today: 'Today',
};

/** Determine status for a given day given completion rate (0–1) and date context. */
export function getDayStatus(
  dateStr: string,
  completedCount: number,
  totalHabits: number,
): HabitDayStatus {
  const todayIso = formatLocalDate(new Date());
  const isFuture = dateStr > todayIso;
  const isToday = dateStr === todayIso;

  if (isFuture) return 'future';
  if (totalHabits === 0) return isToday ? 'today' : 'missed';

  const rate = completedCount / totalHabits;
  if (rate >= 1) return 'completed';
  if (rate > 0) return 'partial';
  // No completions
  return isToday ? 'today' : 'missed';
}

/** Tailwind/inline classes for filled circle by status. */
export function getStatusCircleClass(status: HabitDayStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-[#16A34A] text-white border-[#16A34A] shadow-[0_0_12px_rgba(22,163,74,0.4)]';
    case 'partial':
      // The fill itself is rendered by <PartialFillCircle/> as an SVG half-fill.
      // We keep the orange ring + subtle glow on the wrapper for emphasis.
      return 'bg-transparent text-white border-[#EA580C] shadow-[0_0_10px_rgba(234,88,12,0.4)]';
    case 'missed':
      return 'bg-[#EF4444] text-white border-[#EF4444]';
    case 'today':
      return 'bg-transparent text-[#3B82F6] border-[#3B82F6] ring-2 ring-[#3B82F6]/40';
    case 'future':
    default:
      return 'bg-secondary text-muted-foreground border-transparent';
  }
}

/** Progress-bar color based on % (0–100). */
export function getProgressBarColor(percent: number): string {
  if (percent >= 70) return '#16A34A';
  if (percent >= 30) return '#EA580C';
  return '#EF4444';
}

// ---------------------------------------------------------------------------
// WCAG contrast utilities
// ---------------------------------------------------------------------------

/** Convert "#RRGGBB" → {r,g,b} (0–255). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

/** Relative luminance per WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two hex colors. Returns a value in [1, 21]. */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Theme background reference colors used by the app (kept in sync with index.css). */
export const THEME_BG = {
  light: '#F0FBF7', // --background light (Arctic Mint)
  dark: '#0B1220', // --background dark (Midnight Navy)
  cardLight: '#FFFFFF',
  cardDark: '#131C2E',
} as const;
