/**
 * Authenticated NON-ADMIN attacker suite.
 *
 * `src/test/security.test.ts` proves the exploit primitives are dead for anon.
 * This file is the harder case: a real, signed-in, ordinary user.
 *
 * ## Non-mutation contract
 *
 * Verification must not move the test account's economy. Anything that could
 * legitimately pay out (today's `daily_login` claim, any banked surprise-roll
 * eligibility) is drained in a **warm-up phase** that runs BEFORE the baseline
 * snapshot is taken. Every assertion after that baseline is expected to be a
 * no-op, so the closing invariant demands *exact* equality — before === after
 * for xp, coins, gems, is_premium, premium_until and streak_freezes. No
 * tolerance window: any drift at all is a failure.
 *
 * Skipped automatically when E2E_EMAIL / E2E_PASSWORD are not configured.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = { ...(import.meta.env ?? {}), ...process.env } as Record<string, string | undefined>;

const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
const email = env.E2E_EMAIL ?? env.TEST_USER_EMAIL;
const password = env.E2E_PASSWORD ?? env.TEST_USER_PASSWORD;

const OTHER_USER = '00000000-0000-0000-0000-000000000000';

/** Columns the client must never be able to move. */
const PROTECTED_COLUMNS = [
  'xp',
  'coins',
  'gems',
  'is_premium',
  'premium_until',
  'streak_freezes',
  'daily_ai_messages',
] as const;

interface Snapshot {
  xp: number;
  coins: number;
  gems: number;
  is_premium: boolean;
  premium_until: string | null;
  streak_freezes: number;
  trial_started_at: string | null;
}

const RUN = Boolean(url && anon && email && password);
const d = RUN ? describe : describe.skip;

d('authenticated non-admin cannot escalate the economy', () => {
  let client: SupabaseClient;
  let userId: string;
  let before: Snapshot;

  const snapshot = async (): Promise<Snapshot> => {
    const { data, error } = await client
      .from('profiles')
      .select('xp, coins, gems, is_premium, premium_until, streak_freezes, trial_started_at')
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return data as unknown as Snapshot;
  };

  const claim = async (action: string, refId: string | null = null) => {
    const { data, error } = await client.rpc('claim_action_reward' as never, {
      _action: action,
      _ref_id: refId,
      _ref_key: null,
    } as never);
    const r = (data ?? {}) as { xp?: number; coins?: number; gems?: number };
    return {
      error,
      total: Number(r.xp ?? 0) + Number(r.coins ?? 0) + Number(r.gems ?? 0),
    };
  };

  const roll = async () => {
    const { data, error } = await client.rpc('roll_surprise_reward' as never, {} as never);
    return { error, payload: (data ?? {}) as { reward?: unknown; reason?: string } };
  };

  beforeAll(async () => {
    client = createClient(url as string, anon as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: email as string,
      password: password as string,
    });
    if (error) throw error;
    userId = data.user!.id;

    // ── warm-up: drain everything that could legitimately pay out, so the
    // baseline below is a genuinely frozen state and the final invariant can
    // demand exact equality.
    await claim('daily_login');
    for (let i = 0; i < 12; i += 1) {
      const { payload } = await roll();
      if (payload.reason === 'not_eligible') break;
    }

    before = await snapshot();
  }, 60_000);

  afterAll(async () => {
    if (client) await client.auth.signOut();
  });

  it('is not an admin (the test account must be a plain user)', async () => {
    const { data } = await client.rpc('has_role' as never, {
      _user_id: userId,
      _role: 'admin',
    } as never);
    expect(data).not.toBe(true);
  });

  // ── 1. internal primitives are not client-callable ──────────────────────
  const INTERNAL_RPCS: [string, Record<string, unknown>][] = [
    ['award_xp', { _user_id: null, _amount: 999999, _reason: 'habit_complete', _metadata: {} }],
    ['award_coins', { _user_id: null, _amount: 999999, _reason: 'habit_complete', _metadata: {} }],
    ['spend_coins', { _user_id: null, _amount: -999999, _reason: 'hack', _metadata: {} }],
    ['adjust_gems_internal', { _user_id: null, _delta: 999999, _reason: 'hack', _metadata: {} }],
    ['update_profile_internal', { _user_id: null, _updates: { xp: 999999, is_premium: true } }],
    ['award_celebration', { _user_id: null }],
    ['qualify_referral_payment', { _user_id: null }],
  ];

  for (const [fn, args] of INTERNAL_RPCS) {
    it(`rejects a direct call to ${fn}()`, async () => {
      const payload = { ...args };
      if ('_user_id' in payload) payload._user_id = userId;
      const { error } = await client.rpc(fn as never, payload as never);
      // EXECUTE is revoked from `authenticated`, so PostgREST answers 404
      // (function not exposed) or 42501 (permission denied). Either is a pass.
      expect(error).toBeTruthy();
    });

    it(`rejects ${fn}() aimed at another user`, async () => {
      const payload = { ...args };
      if ('_user_id' in payload) payload._user_id = OTHER_USER;
      const { error } = await client.rpc(fn as never, payload as never);
      expect(error).toBeTruthy();
    });
  }

  // ── 2. protected profile columns ────────────────────────────────────────
  for (const column of PROTECTED_COLUMNS) {
    it(`cannot write profiles.${column} directly`, async () => {
      const value = column === 'is_premium'
        ? true
        : column === 'premium_until'
          ? '2099-12-31T00:00:00Z'
          : 999999;
      const { error, data } = await client
        .from('profiles')
        .update({ [column]: value } as never)
        .eq('user_id', userId)
        .select(column);
      expect(error || (Array.isArray(data) && data.length === 0)).toBeTruthy();
    });
  }

  it('cannot write protected fields through update_my_profile_state', async () => {
    await client.rpc('update_my_profile_state' as never, {
      _updates: { xp: 999999, coins: 999999, is_premium: true } as unknown as Record<string, never>,
    } as never);
    const after = await snapshot();
    expect(after.xp).toBe(before.xp);
    expect(after.coins).toBe(before.coins);
    expect(after.is_premium).toBe(before.is_premium);
  });

  // ── 3. the trial cannot be used to self-grant Premium ───────────────────
  it('cannot self-grant Premium with a future trial_started_at', async () => {
    // The historic hole: user_is_premium treated any trial_started_at newer
    // than now()-5d as an active trial, so a year-2099 value meant Premium
    // forever. The RPC must discard the supplied timestamp entirely.
    for (const attempt of ['2099-12-31T00:00:00Z', '2199-01-01T00:00:00Z']) {
      await client.rpc('update_my_profile_state' as never, {
        _updates: { trial_started_at: attempt } as unknown as Record<string, never>,
      } as never);
    }

    const after = await snapshot();

    // A trial date may never sit in the future.
    if (after.trial_started_at) {
      expect(new Date(after.trial_started_at).getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    }
    // And it must not have been overwritten to the attacker's value.
    expect(after.trial_started_at).toBe(before.trial_started_at);
    expect(after.is_premium).toBe(before.is_premium);
    expect(after.premium_until).toBe(before.premium_until);
  }, 30_000);

  it('start_my_trial() accepts no timestamp and never re-arms an existing trial', async () => {
    // Extra arg => signature mismatch; the function takes zero arguments.
    const spoofed = await client.rpc('start_my_trial' as never, {
      trial_started_at: '2099-12-31T00:00:00Z',
    } as never);
    expect(spoofed.error).toBeTruthy();

    await client.rpc('start_my_trial' as never, {} as never);
    const after = await snapshot();
    if (before.trial_started_at) {
      // Already-started trials are immutable — no repeated 5-day windows.
      expect(after.trial_started_at).toBe(before.trial_started_at);
    }
    expect(after.is_premium).toBe(before.is_premium);
  }, 30_000);

  it('server-side premium check agrees with the stored profile', async () => {
    const { data } = await client.rpc('user_is_premium' as never, { _user_id: userId } as never);
    const after = await snapshot();
    const trialActive = after.trial_started_at
      ? new Date(after.trial_started_at).getTime() > Date.now() - 5 * 864e5 &&
        new Date(after.trial_started_at).getTime() <= Date.now()
      : false;
    const paid = after.is_premium && (!after.premium_until || new Date(after.premium_until) > new Date());
    expect(Boolean(data)).toBe(Boolean(paid || trialActive));
  });

  // ── 4. reward amounts and events are server-derived ─────────────────────
  it('cannot inflate a reward by passing an amount to claim_action_reward', async () => {
    const { error } = await client.rpc('claim_action_reward' as never, {
      _action: 'daily_login',
      _ref_id: null,
      _ref_key: null,
      _amount: 999999,
      _xp: 999999,
    } as never);
    // The function has no amount parameter, so an extra key is a signature
    // mismatch (404). It must never be accepted.
    expect(error).toBeTruthy();
  });

  it('cannot claim a habit reward for a habit it does not own', async () => {
    const { error, total } = await claim('habit_complete', OTHER_USER);
    expect(error || total === 0).toBeTruthy();
  });

  it('cannot forge a journal reward without an owned entry', async () => {
    // No id at all, and an id we do not own — both must pay nothing.
    for (const refId of [null, OTHER_USER]) {
      const { error, total } = await claim('journal_write', refId);
      expect(error || total === 0).toBeTruthy();
    }
  }, 30_000);

  it('cannot mint rewards from action strings with no provable event', async () => {
    // These were removed from reward_rules: each has a trusted server path
    // (qualify_referral_payment, submit_habit_verification,
    // submit_daily_reflection, claim_level_rewards) and must not be claimable
    // from a plain client call.
    const UNPROVABLE = [
      'referral',
      'habit_verification',
      'daily_reflection',
      'gem_weekly_consistency',
      'gem_challenge_complete',
      'gem_level_up',
      'totally_made_up_action',
    ];
    for (const action of UNPROVABLE) {
      const { error, total } = await claim(action);
      expect(error || total === 0).toBeTruthy();
    }
  }, 60_000);

  it('cannot claim a streak milestone it has not actually reached', async () => {
    const { data: streak } = await client.rpc('my_best_habit_streak' as never, {} as never);
    const best = Number(streak ?? 0);
    for (const milestone of [7, 30, 100]) {
      if (best >= milestone) continue; // legitimately earned; skip
      const { error, total } = await claim(`streak_${milestone}`);
      expect(error || total === 0).toBeTruthy();
    }
  }, 60_000);

  // ── 5. replay / idempotency ────────────────────────────────────────────
  it('never pays a repeated daily_login claim (drained in warm-up)', async () => {
    for (let i = 0; i < 3; i += 1) {
      const { total } = await claim('daily_login');
      expect(total).toBe(0);
    }
  }, 30_000);

  it('refuses surprise-reward farming once eligibility is spent', async () => {
    // Eligibility is banked only by a verified habit completion, and each one
    // is consumed exactly once, so a loop must yield nothing.
    for (let i = 0; i < 8; i += 1) {
      const { error, payload } = await roll();
      if (error) continue;
      expect(payload.reward ?? null).toBeNull();
      expect(payload.reason).toBe('not_eligible');
    }
  }, 60_000);

  it('cannot bank its own surprise-roll eligibility', async () => {
    const { error } = await client
      .from('reward_eligibility' as never)
      .insert({ user_id: userId, kind: 'surprise_roll', source_key: 'forged' } as never);
    expect(error).toBeTruthy();
  });

  it('cannot forge a reward_claims ledger row', async () => {
    const { error } = await client
      .from('reward_claims' as never)
      .insert({ user_id: userId, action: 'streak_100', source_key: 'forged' } as never);
    expect(error).toBeTruthy();
  });

  it('cannot spend more coins than it holds', async () => {
    const { data, error } = await client.rpc('spend_my_coins' as never, {
      _amount: 999999,
      _reason: 'hack',
    } as never);
    expect(error || data === false).toBeTruthy();
  });

  it('cannot grant itself gems through spend_my_gems with a negative amount', async () => {
    const { data, error } = await client.rpc('spend_my_gems' as never, {
      _amount: -999999,
      _reason: 'hack',
    } as never);
    expect(error || data === false).toBeTruthy();
  });

  // ── 6. cross-user reads/writes ─────────────────────────────────────────
  it('cannot read another user xp/coins/gems rows it does not own', async () => {
    const { data } = await client
      .from('profiles')
      .select('user_id')
      .neq('user_id', userId)
      .limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it('cannot insert a coin_transactions ledger row', async () => {
    const { error } = await client
      .from('coin_transactions' as never)
      .insert({ user_id: userId, delta: 99999, balance_after: 99999, reason: 'hack' } as never);
    expect(error).toBeTruthy();
  });

  it('cannot insert an xp_transactions ledger row', async () => {
    const { error } = await client
      .from('xp_transactions' as never)
      .insert({ user_id: userId, delta: 99999, balance_after: 99999, reason: 'hack' } as never);
    expect(error).toBeTruthy();
  });

  it('cannot insert a gem_transactions ledger row', async () => {
    const { error } = await client
      .from('gem_transactions' as never)
      .insert({ user_id: userId, delta: 99999, balance_after: 99999, reason: 'hack' } as never);
    expect(error).toBeTruthy();
  });

  // ── final invariant: EXACT equality, no tolerance ──────────────────────
  it('left balances, premium and trial byte-identical after every attack', async () => {
    const after = await snapshot();
    expect(after.xp).toBe(before.xp);
    expect(after.coins).toBe(before.coins);
    expect(after.gems).toBe(before.gems);
    expect(after.is_premium).toBe(before.is_premium);
    expect(after.premium_until).toBe(before.premium_until);
    expect(after.streak_freezes).toBe(before.streak_freezes);
    expect(after.trial_started_at).toBe(before.trial_started_at);
  });
});
