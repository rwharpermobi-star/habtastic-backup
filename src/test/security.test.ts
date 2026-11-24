/**
 * Phase 9.3 — Security verification suite.
 *
 * Runs against the live anon key as an UNAUTHENTICATED client. Most asserts
 * are negative: the operation MUST fail (permission error) or be silently
 * stripped. We do NOT require an authed user here — the goal is to prove the
 * exploit primitives are dead. Authed-user variants are covered manually in
 * the dev `/admin/security` view.
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Skip if env not present (e.g. CI without secrets).
const RUN = Boolean(url && anon);
const d = RUN ? describe : describe.skip;
const LIVE_SECURITY_TIMEOUT_MS = 15_000;

d('Phase 9.3 — economy lockdown', () => {
  // describe.skip still executes suite-definition code, so never construct a
  // Supabase client with empty env values. CI jobs that provide the VITE_
  // variables exercise the live RLS assertions; other unit-test contexts skip.
  const client = RUN ? createClient(url, anon) : null;
  if (!client) return;

  it('anon cannot insert into coin_transactions', async () => {
    const { error } = await client
      .from('coin_transactions')
      .insert({ user_id: '00000000-0000-0000-0000-000000000000', delta: 999, balance_after: 999, reason: 'hack' });
    expect(error).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('anon cannot insert into xp_transactions', async () => {
    const { error } = await client
      .from('xp_transactions')
      .insert({ user_id: '00000000-0000-0000-0000-000000000000', delta: 999, balance_after: 999, reason: 'hack' });
    expect(error).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('anon cannot upsert into weekly_scores', async () => {
    const { error } = await client
      .from('weekly_scores')
      .upsert({
        user_id: '00000000-0000-0000-0000-000000000000',
        week_start: '2026-01-05',
        display_name: 'hack',
        growth_score: 100,
        grade: 'S',
        habits_completed: 99,
        total_habits: 99,
        best_streak: 99,
        perfect_days: 7,
      });
    expect(error).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('anon cannot insert into referrals', async () => {
    const { error } = await client
      .from('referrals')
      .insert({ referrer_id: '00000000-0000-0000-0000-000000000000', referral_code: 'HACK01' });
    expect(error).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('anon cannot insert into premium_grants', async () => {
    const { error } = await client
      .from('premium_grants')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        kind: 'yearly',
        premium_until: '2099-12-31T00:00:00Z',
      });
    expect(error).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('anon cannot update profiles.xp directly', async () => {
    const { error, data } = await client
      .from('profiles')
      .update({ xp: 999999 })
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .select();
    // Either an explicit permission error OR an empty result set (RLS strip).
    expect(error || (Array.isArray(data) && data.length === 0)).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('award_xp RPC cannot mutate other users (returns 0 or errors for anon)', async () => {
    const { error, data } = await client.rpc('award_xp', {
      _user_id: '00000000-0000-0000-0000-000000000000',
      _amount: 9999,
      _reason: 'habit_complete',
      _metadata: {},
    });
    // Function is SECURITY DEFINER and guards on auth.uid() != _user_id → returns 0.
    // Anon should either error or receive 0 (no XP awarded).
    expect(error || data === 0 || data === null).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('submit_weekly_score RPC requires auth', async () => {
    const { error } = await client.rpc('submit_weekly_score');
    expect(error).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);

  it('create_referral_code RPC requires auth', async () => {
    const { error } = await client.rpc('create_referral_code');
    expect(error).toBeTruthy();
  }, LIVE_SECURITY_TIMEOUT_MS);
});
