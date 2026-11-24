import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = { ...(import.meta.env ?? {}), ...process.env } as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
const email = env.E2E_EMAIL ?? env.TEST_USER_EMAIL;
const password = env.E2E_PASSWORD ?? env.TEST_USER_PASSWORD;
const suite = url && key && email && password ? describe : describe.skip;

// Read-only contract check: select a deliberately nonexistent ID so no private
// diary content is fetched. PostgREST still validates every requested column.
suite('deployed diary cloud contract', () => {
  let client: SupabaseClient;
  let userId: string;
  beforeAll(async () => {
    client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error) throw error;
    userId = data.user!.id;
  }, 30_000);
  afterAll(async () => { if (client) await client.auth.signOut(); });

  it('accepts the exact columns used by diary sync', async () => {
    const result = await client.from('diary_entries')
      .select('id,title,content,entry_at,mood,created_at,updated_at')
      .eq('user_id', userId).eq('id', '00000000-0000-0000-0000-000000000000');
    expect(result.error).toBeNull(); expect(result.data).toEqual([]);
  });

  it('never treats another account as PIN-unlocked', async () => {
    const result = await client.rpc('journal_is_unlocked', { p_user_id: '00000000-0000-0000-0000-000000000000' });
    expect(result.error).toBeNull(); expect(result.data).toBe(false);
  });
});
