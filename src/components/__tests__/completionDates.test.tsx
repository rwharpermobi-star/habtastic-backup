import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HabitHeatmap from '@/components/HabitHeatmap';
import WeeklyReportCard from '@/components/WeeklyReportCard';
import type { DbHabit } from '@/hooks/useHabits';

vi.mock('@/components/SocialShareSheet', () => ({ default: () => null }));

describe('completion date rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 12));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    { completions: ['2026-10-30', '2026-10-30T00:00:00Z', 'invalid'] },
    { completions: ['invalid'] },
    { completions: [] },
  ])('renders heatmap and report with completions $completions', ({ completions }) => {
    const habits = [{ id: 'habit', name: 'Read', emoji: '📖', completions } as DbHabit];
    render(<>
      <HabitHeatmap habits={habits} days={7} />
      <WeeklyReportCard habits={habits} xp={0} level={1} levelTitle="Beginner" levelEmoji="🌱" />
    </>);
    expect(screen.getByText('Consistency Heatmap')).toBeTruthy();
    expect(screen.getByText('View full report ↓')).toBeTruthy();
  });
});
