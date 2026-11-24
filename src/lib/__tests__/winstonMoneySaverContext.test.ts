import { describe, expect, it, vi } from 'vitest';
import {
  buildMoneySaverContext,
  loadMoneySaverSnapshot,
} from '../../../supabase/functions/_shared/winstonMoneySaver';

function snapshot(currentAmount = 3_200) {
  return {
    goals: [{
      id: 'holiday-1', user_id: 'user-a', name: 'Holiday', target_amount: 10_000,
      starting_amount: 2_000, current_amount: currentAmount, target_date: '2026-12-20',
      currency: 'ZAR', regular_saving_amount: 400, saving_frequency: 'weekly', status: 'active',
      created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    }],
    entries: [{ id: 'e1', user_id: 'user-a', goal_id: 'holiday-1', amount: currentAmount, saved_at: '2026-09-01T00:00:00.000Z' }],
    challenges: [],
  };
}

describe('Winston Money Saver context', () => {
  it('uses current structured data across sessions instead of transient chat state', () => {
    const context = buildMoneySaverContext(snapshot(), new Date('2026-09-01T12:00:00.000Z'));
    expect(context).toContain('Goal: Holiday');
    expect(context).toContain('Current: R3,200');
    expect(context).toContain('Goal ID: holiday-1');
  });

  it('updated Supabase values override stale remembered values', () => {
    const context = buildMoneySaverContext(snapshot(4_100), new Date('2026-09-01T12:00:00.000Z'));
    expect(context).toContain('Current: R4,100');
    expect(context).not.toContain('Current: R3,200');
    expect(context).toContain('overrides conversation memory');
  });

  it('deleted goals are not referenced when absent from the structured snapshot', () => {
    const context = buildMoneySaverContext({ goals: [], entries: [], challenges: [] });
    expect(context).toContain('No Money Saver goals currently exist');
    expect(context).not.toContain('Holiday');
    expect(context).toContain('If a goal is not listed here, treat it as not currently existing');
  });

  it('preserves the stored currency', () => {
    const context = buildMoneySaverContext(snapshot());
    expect(context).toContain('Currency: ZAR');
    expect(context).toContain('R10,000');
  });

  it('explicitly tells Winston not to hallucinate missing savings values', () => {
    const context = buildMoneySaverContext({ goals: [], entries: [], challenges: [] });
    expect(context).toContain('Never invent a balance');
    expect(context).toContain('no structured value available');
  });

  it('scopes every Money Saver query to the authenticated user id', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const makeBuilder = (data: unknown[]) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, value: unknown) => { eqCalls.push([field, value]); return builder; }),
        order: vi.fn(() => builder),
        limit: vi.fn(async () => ({ data, error: null })),
        then: (resolve) => resolve({ data, error: null }),
      };
      return builder;
    };
    const client = {
      from: vi.fn((table: string) => makeBuilder(table === 'savings_goals' ? snapshot().goals : [])),
    };

    await loadMoneySaverSnapshot(client, 'authenticated-user-123');
    const userFilters = eqCalls.filter(([field]) => field === 'user_id');
    expect(userFilters.length).toBe(3);
    expect(userFilters.every(([, value]) => value === 'authenticated-user-123')).toBe(true);
  });
});
