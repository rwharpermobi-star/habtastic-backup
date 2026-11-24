export type SavingsPaceStatus = 'ahead' | 'on_track' | 'slightly_behind' | 'significantly_behind';
export type SavingFrequency = 'daily' | 'weekly' | 'monthly';

export interface SavingsGoalLike {
  id?: string;
  name?: string;
  target_amount: number | string;
  current_amount: number | string;
  starting_amount?: number | string | null;
  target_date: string;
  created_at: string;
  currency: string;
  regular_saving_amount?: number | string | null;
  saving_frequency?: SavingFrequency | string | null;
}

export interface SavingsEntryLike {
  amount: number | string;
  saved_at: string;
}

export interface SavingsMetrics {
  targetAmount: number;
  currentAmount: number;
  startingAmount: number;
  amountRemaining: number;
  progressPercent: number;
  daysRemaining: number;
  weeksRemaining: number;
  monthsRemaining: number;
  dailyNeeded: number;
  weeklyNeeded: number;
  monthlyNeeded: number;
  expectedAmountToday: number;
  progressDelta: number;
  paceStatus: SavingsPaceStatus;
  projectedCompletionDate: string | null;
  isComplete: boolean;
  isOverdue: boolean;
}

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 365.2425 / 12;

function numberValue(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseDateOnly(value: string): Date {
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addPeriods(start: Date, periods: number, frequency: SavingFrequency): Date {
  const next = new Date(start);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + periods);
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + periods * 7);
  if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + periods);
  return next;
}

export function projectSavings(
  currentSavings: number,
  regularSavingAmount: number,
  numberOfPeriods: number,
): number {
  return Math.max(0, currentSavings) + Math.max(0, regularSavingAmount) * Math.max(0, numberOfPeriods);
}

export function calculateSavingsMetrics(
  goal: SavingsGoalLike,
  nowInput: Date | string = new Date(),
): SavingsMetrics {
  const now = typeof nowInput === 'string' ? new Date(nowInput) : nowInput;
  const targetDate = parseDateOnly(goal.target_date);
  const createdAt = new Date(goal.created_at);
  const targetAmount = Math.max(0, numberValue(goal.target_amount));
  const currentAmount = Math.max(0, numberValue(goal.current_amount));
  const startingAmount = Math.max(0, numberValue(goal.starting_amount));
  const amountRemaining = Math.max(0, targetAmount - currentAmount);
  const progressPercent = targetAmount > 0 ? clamp((currentAmount / targetAmount) * 100, 0, 100) : 0;

  const rawDaysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / DAY_MS);
  const daysRemaining = Math.max(0, rawDaysRemaining);
  const weeksRemaining = daysRemaining / 7;
  const monthsRemaining = daysRemaining / AVG_MONTH_DAYS;
  const divisorOrNow = (value: number) => value > 0 ? amountRemaining / value : amountRemaining;
  const dailyNeeded = divisorOrNow(daysRemaining);
  const weeklyNeeded = divisorOrNow(weeksRemaining);
  const monthlyNeeded = divisorOrNow(monthsRemaining);

  const totalDuration = Math.max(DAY_MS, targetDate.getTime() - createdAt.getTime());
  const elapsedRatio = clamp((now.getTime() - createdAt.getTime()) / totalDuration, 0, 1);
  const expectedAmountToday = startingAmount + Math.max(0, targetAmount - startingAmount) * elapsedRatio;
  const progressDelta = currentAmount - expectedAmountToday;
  const tolerance = Math.max(0.01, targetAmount * 0.02);
  const significantTolerance = Math.max(0.01, targetAmount * 0.10);

  let paceStatus: SavingsPaceStatus;
  if (progressDelta > tolerance) paceStatus = 'ahead';
  else if (progressDelta >= -tolerance) paceStatus = 'on_track';
  else if (progressDelta >= -significantTolerance) paceStatus = 'slightly_behind';
  else paceStatus = 'significantly_behind';

  const regularSavingAmount = Math.max(0, numberValue(goal.regular_saving_amount));
  const rawFrequency = goal.saving_frequency;
  const savingFrequency: SavingFrequency = rawFrequency === 'daily' || rawFrequency === 'monthly' ? rawFrequency : 'weekly';
  let projectedCompletionDate: string | null = null;
  if (amountRemaining <= 0) {
    projectedCompletionDate = isoDate(now);
  } else if (regularSavingAmount > 0) {
    const periods = Math.ceil(amountRemaining / regularSavingAmount);
    projectedCompletionDate = isoDate(addPeriods(now, periods, savingFrequency));
  }

  return {
    targetAmount,
    currentAmount,
    startingAmount,
    amountRemaining,
    progressPercent,
    daysRemaining,
    weeksRemaining,
    monthsRemaining,
    dailyNeeded,
    weeklyNeeded,
    monthlyNeeded,
    expectedAmountToday,
    progressDelta,
    paceStatus,
    projectedCompletionDate,
    isComplete: targetAmount > 0 && currentAmount >= targetAmount,
    isOverdue: rawDaysRemaining < 0 && amountRemaining > 0,
  };
}

export function formatMoney(amountInput: number | string, currencyInput: string): string {
  const amount = numberValue(amountInput);
  const currency = String(currencyInput || 'USD').toUpperCase();
  const symbols: Record<string, string> = {
    ZAR: 'R', USD: '$', GBP: '£', EUR: '€', JPY: '¥', CNY: '¥',
    INR: '₹', NGN: '₦', KRW: '₩', RUB: '₽', TRY: '₺', PHP: '₱',
    THB: '฿', VND: '₫', ILS: '₪', UAH: '₴', PLN: 'zł', BRL: 'R$',
  };
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return symbols[currency] ? `${symbols[currency]}${formatted}` : `${currency} ${formatted}`;
}

export function getCurrencyOptions(): string[] {
  try {
    const values = (Intl as any).supportedValuesOf?.('currency');
    if (Array.isArray(values) && values.length) return values;
  } catch { /* Android WebView/browser fallback below */ }
  return [
    'AED','ARS','AUD','BDT','BRL','CAD','CHF','CLP','CNY','COP','CZK','DKK','EGP','EUR','GBP','GHS','HKD','HUF','IDR','ILS','INR','JPY','KES','KRW','MAD','MXN','MYR','NGN','NOK','NZD','PHP','PKR','PLN','QAR','RON','RUB','SAR','SEK','SGD','THB','TRY','TWD','UAH','USD','VND','ZAR',
  ];
}

export function buildSavingsChartData(
  goal: SavingsGoalLike,
  entries: SavingsEntryLike[],
  nowInput: Date | string = new Date(),
) {
  const now = typeof nowInput === 'string' ? new Date(nowInput) : nowInput;
  const created = new Date(goal.created_at);
  const target = parseDateOnly(goal.target_date);
  const targetAmount = numberValue(goal.target_amount);
  const startingAmount = numberValue(goal.starting_amount);
  const sortedEntries = [...entries]
    .filter(e => Number.isFinite(new Date(e.saved_at).getTime()))
    .sort((a, b) => new Date(a.saved_at).getTime() - new Date(b.saved_at).getTime());

  const dates = new Set<string>();
  dates.add(isoDate(created));
  dates.add(isoDate(now));
  dates.add(isoDate(target));
  sortedEntries.forEach(e => dates.add(isoDate(new Date(e.saved_at))));

  const span = Math.max(DAY_MS, target.getTime() - created.getTime());
  for (let i = 1; i < 8; i++) {
    dates.add(isoDate(new Date(created.getTime() + (span * i) / 8)));
  }

  return [...dates]
    .map(date => parseDateOnly(date))
    .sort((a, b) => a.getTime() - b.getTime())
    .map(pointDate => {
      const elapsed = clamp((pointDate.getTime() - created.getTime()) / span, 0, 1);
      const planned = startingAmount + Math.max(0, targetAmount - startingAmount) * elapsed;
      const actual = pointDate.getTime() <= now.getTime()
        ? sortedEntries
            .filter(e => new Date(e.saved_at).getTime() <= pointDate.getTime() + DAY_MS - 1)
            .reduce((sum, e) => sum + Math.max(0, numberValue(e.amount)), 0)
        : null;
      return {
        date: isoDate(pointDate),
        planned: Math.round(planned * 100) / 100,
        actual: actual == null ? null : Math.round(actual * 100) / 100,
        goal: targetAmount,
      };
    });
}
