// Winston Daily Coaching — generates a personalized daily coaching record:
// engagement score, at-risk habits, daily message, recommendations and an
// optional suggested challenge. Cached per user/day; force=true to regenerate.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

interface HabitRow {
  id: string;
  name: string;
  emoji: string;
  category: string;
  difficulty: string;
  reminder_time: string | null;
  completions: string[];
  created_at: string;
}

function isoDay(d: Date) { return d.toISOString().split('T')[0]; }

function computeStats(habits: HabitRow[]) {
  const today = new Date();
  // Last 7 days inclusive of today
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    days.push(isoDay(d));
  }

  let totalDone = 0, totalSlots = 0, bestStreak = 0;
  const atRisk: { id: string; name: string; emoji: string; rate: number; days_active: number }[] = [];

  for (const h of habits) {
    const created = (h.created_at || '').split('T')[0] || '1970-01-01';
    let done = 0, slots = 0;
    for (const ds of days) {
      if (ds < created) continue;
      slots += 1;
      if ((h.completions || []).includes(ds)) done += 1;
    }
    totalDone += done;
    totalSlots += slots;

    // Per-habit risk
    if (slots >= 3) {
      const rate = done / slots;
      if (rate < 0.5) {
        atRisk.push({
          id: h.id,
          name: h.name,
          emoji: h.emoji,
          rate: Math.round(rate * 100),
          days_active: slots,
        });
      }
    }

    // Streak (current, walking back from today)
    let s = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      if ((h.completions || []).includes(isoDay(d))) s++;
      else if (i > 0) break;
    }
    if (s > bestStreak) bestStreak = s;
  }

  const completionRate7d = totalSlots > 0 ? Math.round((totalDone / totalSlots) * 100) : 0;

  // Engagement score 0-100:
  // 70% weight = 7-day completion rate, 30% = streak bonus capped at 30
  const streakBonus = Math.min(30, bestStreak * 3);
  const engagement = Math.max(0, Math.min(100, Math.round(completionRate7d * 0.7 + streakBonus)));

  return { completionRate7d, bestStreak, engagement, atRisk, days };
}

interface AIResult {
  message: string;
  recommendations: string[];
  suggested_challenge?: {
    title: string;
    description: string;
    duration_days: number;
    target_habit_id?: string | null;
    reward_xp?: number;
    reward_coins?: number;
  } | null;
}

async function generate(payload: unknown, habits: HabitRow[]): Promise<AIResult> {
  const habitList = habits.map(h => `- ${h.id} | ${h.emoji} ${h.name} (${h.category}, ${h.difficulty})`).join('\n');
  const systemPrompt = `You are Winston, a warm but direct AI habit coach.
Speak to the user as "you". Never swear. Be concise — every sentence earns its place.
Return THREE things via the tool call:
1. message: ONE motivational coaching sentence (max ~25 words) tailored to today's stats.
2. recommendations: 2-3 short actionable suggestions (max ~12 words each). Plain text, no markdown.
3. suggested_challenge: optional. If the user would benefit from a short focused challenge, propose ONE.
   - title: max 6 words
   - description: max 18 words, second person
   - duration_days: 3, 5 or 7
   - target_habit_id: pick from the user's habit list when relevant, else null
   - reward_xp and reward_coins: leave null to use defaults
If data is very thin (few habits, brand new user), still produce a helpful message and skip the challenge.`;

  const userMsg = `User stats JSON:\n${JSON.stringify(payload, null, 2)}\n\nUser's habits (id | emoji name | category, difficulty):\n${habitList || '(none)'}`;

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'daily_coaching',
          description: "Return Winston's daily coaching.",
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              recommendations: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
              suggested_challenge: {
                type: ['object', 'null'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  duration_days: { type: 'integer' },
                  target_habit_id: { type: ['string', 'null'] },
                  reward_xp: { type: ['integer', 'null'] },
                  reward_coins: { type: ['integer', 'null'] },
                },
                required: ['title', 'description', 'duration_days'],
              },
            },
            required: ['message', 'recommendations'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'daily_coaching' } },
    }),
  });

  if (resp.status === 429) throw new Error('rate_limited');
  if (resp.status === 402) throw new Error('payment_required');
  if (!resp.ok) {
    console.error('AI gateway error', resp.status, await resp.text());
    throw new Error('ai_error');
  }
  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('no_tool_call');
  return JSON.parse(args) as AIResult;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { id: userId } = await userResp.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { force?: boolean } = {};
    try { body = await req.json(); } catch { /* none */ }
    const force = !!body.force;

    const today = isoDay(new Date());
    const dbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const premiumResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/user_is_premium`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ _user_id: userId }),
    });
    if (!premiumResponse.ok) {
      console.error('Daily coaching entitlement check failed', premiumResponse.status);
      return new Response(JSON.stringify({ error: 'premium_check_failed' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (await premiumResponse.json() !== true) {
      return new Response(JSON.stringify({ error: 'premium_required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!force) {
      const cached = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_daily_coaching?user_id=eq.${userId}&coaching_date=eq.${today}&select=*`,
        { headers: dbHeaders },
      ).then(r => r.json());
      if (Array.isArray(cached) && cached.length > 0) {
        return new Response(JSON.stringify({ coaching: cached[0], cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const habits: HabitRow[] = await fetch(
      `${SUPABASE_URL}/rest/v1/habits?user_id=eq.${userId}&select=id,name,emoji,category,difficulty,reminder_time,completions,created_at`,
      { headers: dbHeaders },
    ).then(r => r.json());

    const stats = computeStats(Array.isArray(habits) ? habits : []);

    const aiPayload = {
      total_habits: habits.length,
      completion_rate_7d_pct: stats.completionRate7d,
      best_current_streak_days: stats.bestStreak,
      engagement_score: stats.engagement,
      at_risk_habits: stats.atRisk,
      date: today,
    };

    let ai: AIResult;
    try {
      ai = await generate(aiPayload, habits);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ai_error';
      const status = msg === 'rate_limited' ? 429 : msg === 'payment_required' ? 402 : 500;
      const publicError = msg === 'rate_limited'
        ? 'rate_limited'
        : msg === 'payment_required'
          ? 'payment_required'
          : 'Daily coaching temporarily unavailable';
      return new Response(JSON.stringify({ error: publicError }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = {
      user_id: userId,
      coaching_date: today,
      message: ai.message,
      recommendations: ai.recommendations ?? [],
      engagement_score: stats.engagement,
      completion_rate_7d: stats.completionRate7d,
      best_streak: stats.bestStreak,
      at_risk_habits: stats.atRisk,
      suggested_challenge: ai.suggested_challenge ?? null,
      model: 'google/gemini-3-flash-preview',
    };

    const upsert = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_daily_coaching?on_conflict=user_id,coaching_date`,
      {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row),
      },
    );
    if (!upsert.ok) {
      console.error('Upsert failed', upsert.status, await upsert.text());
      return new Response(JSON.stringify({ error: 'db_error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const saved = await upsert.json();
    const coaching = Array.isArray(saved) ? saved[0] : saved;
    return new Response(JSON.stringify({ coaching, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('winston-coach-daily error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
