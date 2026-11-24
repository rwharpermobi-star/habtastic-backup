// Weekly AI Review — Winston analyzes the user's last 7 days of habit data
// and returns 3 short sections: summary, weak_points, suggestion.

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
  reminder_time: string | null;
  completions: string[];
  created_at: string;
}

function isoDay(d: Date): string {
  return d.toISOString().split('T')[0];
}

function startOfThisWeek(): Date {
  // Monday as start of week
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const ws = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return ws;
}

function dayName(d: Date): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
}

function computeWindowStats(habits: HabitRow[], windowStart: Date) {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(windowStart);
    d.setUTCDate(windowStart.getUTCDate() + i);
    days.push(isoDay(d));
  }

  const perDay: Record<string, { done: number; total: number }> = {};
  for (const ds of days) perDay[ds] = { done: 0, total: 0 };

  let morning = 0;
  let evening = 0;
  const missedNames: Record<string, number> = {};

  for (const h of habits) {
    const created = h.created_at?.split('T')[0] ?? '1970-01-01';
    for (const ds of days) {
      if (ds < created) continue;
      perDay[ds].total += 1;
      const done = (h.completions || []).includes(ds);
      if (done) {
        perDay[ds].done += 1;
        if (h.reminder_time) {
          const hour = parseInt(h.reminder_time.split(':')[0] ?? '0', 10);
          if (hour < 12) morning++;
          else evening++;
        }
      } else {
        missedNames[h.name] = (missedNames[h.name] || 0) + 1;
      }
    }
  }

  let totalDone = 0;
  let totalSlots = 0;
  let bestDay = '';
  let worstDay = '';
  let bestRate = -1;
  let worstRate = 2;

  for (const ds of days) {
    const { done, total } = perDay[ds];
    totalDone += done;
    totalSlots += total;
    if (total === 0) continue;
    const rate = done / total;
    if (rate > bestRate) {
      bestRate = rate;
      bestDay = dayName(new Date(ds + 'T00:00:00Z'));
    }
    if (rate < worstRate) {
      worstRate = rate;
      worstDay = dayName(new Date(ds + 'T00:00:00Z'));
    }
  }

  const completionRate = totalSlots > 0 ? Math.round((totalDone / totalSlots) * 100) : 0;
  const topMissed = Object.entries(missedNames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count}x)`);

  return {
    days,
    perDay,
    completionRate,
    bestDay: bestRate >= 0 ? bestDay : null,
    worstDay: worstRate <= 1 ? worstDay : null,
    morning,
    evening,
    topMissed,
    totalDone,
    totalSlots,
  };
}

interface ReviewSections {
  summary: string;
  weak_points: string;
  suggestion: string;
}

async function generateReview(stats: any, prevRate: number | null): Promise<ReviewSections> {
  const trend =
    prevRate == null
      ? 'No previous week to compare.'
      : `Previous week completion rate was ${prevRate}%.`;

  const userPayload = {
    completion_rate_pct: stats.completionRate,
    previous_week_completion_rate_pct: prevRate,
    best_day: stats.bestDay,
    worst_day: stats.worstDay,
    morning_completions: stats.morning,
    evening_completions: stats.evening,
    most_missed_habits: stats.topMissed,
    total_completed: stats.totalDone,
    total_slots: stats.totalSlots,
  };

  const systemPrompt = `You are Winston, a warm, encouraging habit coach. Speak directly to the user ("you").
Never swear. Be concise and powerful — every sentence should feel earned.
You will receive structured weekly habit stats and must return THREE short sections via the tool call.

Rules:
- "summary": 1-2 sentences (max ~25 words). Highlight the headline number or trend.
- "weak_points": 1-2 sentences (max ~25 words). Name the soft spot honestly but kindly.
- "suggestion": 1 sentence (max ~20 words). One specific, actionable next step for the coming week.
- Use plain text. No markdown, no emojis, no lists.
- If data is sparse, acknowledge it gently instead of inventing patterns.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${trend}\n\nWeekly stats JSON:\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'weekly_review',
            description: "Return Winston's three-section weekly review.",
            parameters: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                weak_points: { type: 'string' },
                suggestion: { type: 'string' },
              },
              required: ['summary', 'weak_points', 'suggestion'],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'weekly_review' } },
    }),
  });

  if (response.status === 429) {
    throw new Error('rate_limited');
  }
  if (response.status === 402) {
    throw new Error('payment_required');
  }
  if (!response.ok) {
    const t = await response.text();
    console.error('AI gateway error:', response.status, t);
    throw new Error('ai_error');
  }

  const data = await response.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!call) throw new Error('no_tool_call');
  const parsed = JSON.parse(call) as ReviewSections;
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Identify user via anon-key client + bearer token
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userJson = await userResp.json();
    const userId: string | undefined = userJson?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Weekly AI reviews are a Premium feature. Check entitlement with the
    // caller's JWT so an expired trial cannot bypass the UI and invoke this
    // Edge Function directly. Existing review rows are preserved.
    const premiumResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/user_is_premium`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ _user_id: userId }),
    });
    if (!premiumResp.ok) {
      console.error('weekly-ai-review premium check failed', premiumResp.status);
      return new Response(JSON.stringify({ error: 'premium_check_failed' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const premium = await premiumResp.json();
    if (premium !== true) {
      return new Response(JSON.stringify({ error: 'premium_required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { force?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      /* no body */
    }
    const force = !!body.force;

    const weekStart = startOfThisWeek();
    const weekStartStr = isoDay(weekStart);

    // Service-role REST for DB ops (bypasses RLS, scoped via user_id filters)
    const dbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    // Check for existing review for this week
    if (!force) {
      const existingResp = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_weekly_reviews?user_id=eq.${userId}&week_start=eq.${weekStartStr}&select=*`,
        { headers: dbHeaders },
      );
      const existing = await existingResp.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return new Response(JSON.stringify({ review: existing[0], cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Load habits
    const habitsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/habits?user_id=eq.${userId}&select=id,name,reminder_time,completions,created_at`,
      { headers: dbHeaders },
    );
    const habits: HabitRow[] = await habitsResp.json();
    if (!Array.isArray(habits) || habits.length === 0) {
      return new Response(
        JSON.stringify({ error: 'no_habits', message: 'Add some habits before requesting a review.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const stats = computeWindowStats(habits, weekStart);

    // Previous week stats for trend comparison
    const prevStart = new Date(weekStart);
    prevStart.setUTCDate(weekStart.getUTCDate() - 7);
    const prevStats = computeWindowStats(habits, prevStart);
    const prevRate = prevStats.totalSlots > 0 ? prevStats.completionRate : null;

    let sections: ReviewSections;
    try {
      sections = await generateReview(stats, prevRate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ai_error';
      const status = msg === 'rate_limited' ? 429 : msg === 'payment_required' ? 402 : 500;
      const publicError = msg === 'rate_limited'
        ? 'rate_limited'
        : msg === 'payment_required'
          ? 'payment_required'
          : 'AI review temporarily unavailable';
      return new Response(JSON.stringify({ error: publicError }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = {
      user_id: userId,
      week_start: weekStartStr,
      summary: sections.summary,
      weak_points: sections.weak_points,
      suggestion: sections.suggestion,
      completion_rate: stats.completionRate,
      prev_completion_rate: prevRate,
      best_day: stats.bestDay,
      worst_day: stats.worstDay,
      morning_count: stats.morning,
      evening_count: stats.evening,
      habits_total: stats.totalSlots,
      habits_completed: stats.totalDone,
      model: 'google/gemini-3-flash-preview',
    };

    // Upsert by (user_id, week_start)
    const upsertResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_weekly_reviews?on_conflict=user_id,week_start`,
      {
        method: 'POST',
        headers: {
          ...dbHeaders,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(row),
      },
    );
    if (!upsertResp.ok) {
      const t = await upsertResp.text();
      console.error('Upsert failed', upsertResp.status, t);
      return new Response(JSON.stringify({ error: 'db_error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const saved = await upsertResp.json();
    const review = Array.isArray(saved) ? saved[0] : saved;

    return new Response(JSON.stringify({ review, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('weekly-ai-review error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
