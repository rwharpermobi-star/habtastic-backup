import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retention-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sharedSecret = Deno.env.get('RETENTION_JOB_SECRET');

  // Auth: accept either the service-role key in Authorization, or the shared
  // secret header that pg_cron passes. Reject everything else.
  const auth = req.headers.get('authorization') ?? '';
  const headerSecret = req.headers.get('x-retention-secret') ?? '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  const isServiceRole = bearer === serviceKey;
  const hasSharedSecret = !!sharedSecret && headerSecret === sharedSecret;
  if (!isServiceRole && !hasSharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);



  try {
    const { data: rewardProgram, error: configError } = await supabase
      .from('referral_reward_program')
      .select('retention_xp_bonus')
      .eq('id', true)
      .maybeSingle();

    if (configError) throw configError;
    const retentionBonus = Number(rewardProgram?.retention_xp_bonus ?? 0);
    if (retentionBonus <= 0) {
      return new Response(
        JSON.stringify({ ok: true, disabled: true, reason: 'retention_bonus_not_approved', awarded: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: due, error: selErr } = await supabase
      .from('referrals')
      .select('id')
      .eq('purchase_completed', true)
      .eq('retention_xp_awarded', false)
      .not('retention_eligible_at', 'is', null)
      .lte('retention_eligible_at', new Date().toISOString())
      .limit(500);

    if (selErr) throw selErr;

    let awarded = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of due ?? []) {
      const { data: ok, error } = await supabase.rpc('award_referral_retention_xp', {
        _referral_id: row.id,
      });
      if (error) {
        console.error("[referral-retention-payout] award failed", { referral_id: row.id, code: error.code });
        errors.push(`${row.id}: award_failed`);
      } else if (ok) {
        awarded++;
      } else {
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        considered: due?.length ?? 0,
        awarded,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[referral-retention-payout] error', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Referral retention payout failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
