import { calculateSavingsMetrics, formatMoney } from './savingsCalculations.ts';

type AnyClient = any;

type MoneySnapshot = {
  goals: any[];
  entries: any[];
  challenges: any[];
};

const YES = /^(yes|yep|yeah|confirm|confirmed|do it|go ahead|add it|create it|start it|update it|please do)$/i;
const NO = /^(no|nope|cancel|don't|do not|leave it|never mind|nevermind)$/i;
const WRITE_HINT = /\b(add|record|log|put|create|make|start|change|update|set|move|increase|decrease)\b/i;
const MONEY_HINT = /\b(save|saved|saving|savings|budget|fund|money|rand|zar|usd|dollar|pound|gbp|euro|goal|challenge)\b|[R$£€]\s?\d/i;

function latestUserText(messages: any[]): string {
  return [...messages].reverse().find(m => m?.role === 'user' && typeof m.content === 'string')?.content?.trim() ?? '';
}

function directReplyResponse(reply: string, stream: boolean, corsHeaders: Record<string, string>) {
  if (!stream) {
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const chunk = JSON.stringify({ choices: [{ delta: { content: reply } }] });
  return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
  });
}

async function persistAssistant(admin: AnyClient, userId: string, reply: string) {
  try {
    await admin.from('chat_messages').insert({ user_id: userId, coach_id: 'winston', role: 'assistant', content: reply });
  } catch (e) {
    console.error('[money-saver] assistant persistence failed', e);
  }
}

export async function loadMoneySaverSnapshot(client: AnyClient, userId: string): Promise<MoneySnapshot> {
  const [goalsRes, entriesRes, challengesRes] = await Promise.all([
    client.from('savings_goals').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    client.from('savings_entries').select('*').eq('user_id', userId).order('saved_at', { ascending: false }).limit(250),
    client.from('savings_challenges').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }),
  ]);
  return {
    goals: goalsRes.error ? [] : (goalsRes.data ?? []),
    entries: entriesRes.error ? [] : (entriesRes.data ?? []),
    challenges: challengesRes.error ? [] : (challengesRes.data ?? []),
  };
}

export function buildMoneySaverContext(snapshot: MoneySnapshot, now = new Date()): string {
  const activeGoals = snapshot.goals.filter(g => g.status === 'active' || g.status === 'completed');
  const monthKey = now.toISOString().slice(0, 7);
  const goalCurrency = new Map(snapshot.goals.map(g => [g.id, String(g.currency || '').toUpperCase()]));
  const monthTotals = new Map<string, number>();
  snapshot.entries
    .filter(e => String(e.saved_at).slice(0, 7) === monthKey && e.source !== 'initial')
    .forEach(e => {
      const currency = goalCurrency.get(e.goal_id);
      if (!currency) return;
      monthTotals.set(currency, (monthTotals.get(currency) || 0) + Number(e.amount || 0));
    });
  const monthTotalText = monthTotals.size
    ? [...monthTotals.entries()].map(([currency, amount]) => formatMoney(amount, currency)).join(' + ')
    : 'no structured value available';

  const lines = activeGoals.map(goal => {
    const m = calculateSavingsMetrics(goal, now);
    const recent = snapshot.entries.filter(e => e.goal_id === goal.id).slice(0, 5);
    const recentText = recent.length
      ? recent.map(e => `${formatMoney(e.amount, goal.currency)} on ${String(e.saved_at).slice(0, 10)}`).join('; ')
      : 'none';
    return [
      `Goal ID: ${goal.id}`,
      `Goal: ${goal.name}`,
      `Currency: ${goal.currency}`,
      `Saving frequency: ${goal.saving_frequency || 'weekly'}`,
      `Regular saving amount: ${goal.regular_saving_amount == null ? 'not set' : formatMoney(goal.regular_saving_amount, goal.currency)}`,
      `Current: ${formatMoney(m.currentAmount, goal.currency)}`,
      `Target: ${formatMoney(m.targetAmount, goal.currency)}`,
      `Remaining: ${formatMoney(m.amountRemaining, goal.currency)}`,
      `Progress: ${m.progressPercent.toFixed(1)}%`,
      `Target date: ${goal.target_date}`,
      `Pace: ${m.paceStatus}`,
      `Expected today: ${formatMoney(m.expectedAmountToday, goal.currency)}`,
      `Ahead/behind amount: ${formatMoney(m.progressDelta, goal.currency)}`,
      `Daily needed: ${formatMoney(m.dailyNeeded, goal.currency)}`,
      `Weekly needed: ${formatMoney(m.weeklyNeeded, goal.currency)}`,
      `Monthly needed: ${formatMoney(m.monthlyNeeded, goal.currency)}`,
      `Projected completion from saved regular amount: ${m.projectedCompletionDate ?? 'not available'}`,
      `Recent entries: ${recentText}`,
    ].join(' | ');
  });

  const challengeLines = snapshot.challenges.map(c =>
    `${c.title} (${c.challenge_type}) ${c.start_date}→${c.end_date}; target ${c.target_amount == null ? 'n/a' : formatMoney(c.target_amount, c.currency)}`
  );

  return `\n\n--- MONEY SAVER: AUTHORITATIVE USER DATA ---\n` +
    `${lines.length ? lines.join('\n') : 'No Money Saver goals currently exist for this user.'}\n` +
    `Saved this calendar month from new savings entries (starting balances excluded): ${monthTotalText}\n` +
    `Active savings challenges: ${challengeLines.length ? challengeLines.join(' | ') : 'none'}\n` +
    `\nMONEY SAVER TRUTH RULES:\n` +
    `- This block comes from the authenticated user's latest Supabase rows and overrides conversation memory.\n` +
    `- Never invent a balance, target, entry, currency, date, challenge, milestone, or savings history.\n` +
    `- If a goal is not listed here, treat it as not currently existing even if old chat/memory mentions it.\n` +
    `- Exact balances must always come from this block, never from remembered chat text.\n` +
    `- Shared formulas: remaining=target-current; daily=remaining/days; weekly=remaining/weeks; monthly=remaining/months; projection=current+(regular amount×periods).\n` +
    `- Pace is calculated from planned linear progress versus actual progress. If behind, use the recalculated daily/weekly/monthly values above.\n` +
    `- Use the stored currency for the specific goal; never assume USD.\n` +
    `- Saving, budgeting, debt and investing are different topics. Give practical educational guidance and never promise investment returns.\n` +
    `- Money Saver is manual tracking, not a bank account or bank balance.\n` +
    `--- END MONEY SAVER DATA ---`;
}

function findGoal(snapshot: MoneySnapshot, goalId?: string, goalName?: string) {
  if (goalId) {
    const exact = snapshot.goals.find(g => g.id === goalId);
    if (exact) return exact;
  }
  const needle = String(goalName || '').trim().toLowerCase();
  if (!needle) return null;
  return snapshot.goals.find(g => String(g.name).toLowerCase() === needle)
    ?? snapshot.goals.find(g => String(g.name).toLowerCase().includes(needle) || needle.includes(String(g.name).toLowerCase()))
    ?? null;
}

async function extractAction(apiKey: string, userText: string, snapshot: MoneySnapshot) {
  const goalList = snapshot.goals
    .filter(g => g.status !== 'archived')
    .map(g => ({ id: g.id, name: g.name, currency: g.currency, target_amount: g.target_amount, target_date: g.target_date }));
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Classify ONLY explicit Money Saver data-change requests. Never infer an action from advice/questions.\nReturn JSON with action one of: none, record_savings, create_goal, update_target_amount, update_target_date, start_challenge.\nFields as relevant: goal_id, goal_name, amount, target_amount, already_saved, target_date (YYYY-MM-DD), currency (3-letter ISO), name, reason, challenge_type, title, start_date, end_date.\nFor phrases like "help me save" or "how much should I save", action=none unless the user explicitly asks to create/change/record/start something.\nOnly use goal_id from the supplied goal list. Do not invent IDs.`,
        },
        { role: 'user', content: `Existing goals: ${JSON.stringify(goalList)}\nUser message: ${userText}` },
      ],
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  try { return JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { return null; }
}

function validCurrency(value: unknown) {
  const c = String(value || '').toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

function normalizeProposal(raw: any, snapshot: MoneySnapshot) {
  if (!raw || raw.action === 'none') return null;
  const action = String(raw.action || '');
  const goal = findGoal(snapshot, raw.goal_id, raw.goal_name);

  if (action === 'record_savings') {
    const amount = Number(raw.amount);
    if (!goal || !Number.isFinite(amount) || amount <= 0) return null;
    return { action, payload: { goal_id: goal.id, goal_name: goal.name, amount, currency: goal.currency } };
  }
  if (action === 'update_target_amount') {
    const targetAmount = Number(raw.target_amount ?? raw.amount);
    if (!goal || !Number.isFinite(targetAmount) || targetAmount <= 0) return null;
    return { action, payload: { goal_id: goal.id, goal_name: goal.name, target_amount: targetAmount, currency: goal.currency } };
  }
  if (action === 'update_target_date') {
    const targetDate = String(raw.target_date || '');
    if (!goal || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
    return { action, payload: { goal_id: goal.id, goal_name: goal.name, target_date: targetDate, currency: goal.currency } };
  }
  if (action === 'create_goal') {
    const targetAmount = Number(raw.target_amount ?? raw.amount);
    const targetDate = String(raw.target_date || '');
    const name = String(raw.name || raw.goal_name || '').trim();
    const knownCurrencies = [...new Set(
      snapshot.goals
        .filter(g => g.status !== 'archived')
        .map(g => validCurrency(g.currency))
        .filter((c): c is string => !!c),
    )];
    const currency = validCurrency(raw.currency) ?? (knownCurrencies.length === 1 ? knownCurrencies[0] : null);
    const alreadySaved = Math.max(0, Number(raw.already_saved || 0));
    if (!name || !currency || !Number.isFinite(targetAmount) || targetAmount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
    return { action, payload: { name, target_amount: targetAmount, already_saved: alreadySaved, target_date: targetDate, currency, reason: String(raw.reason || '').trim() || null } };
  }
  if (action === 'start_challenge') {
    const activeGoals = snapshot.goals.filter(g => g.status === 'active');
    const challengeGoal = goal ?? (activeGoals.length === 1 ? activeGoals[0] : null);
    if (!challengeGoal) return null;
    const currency = validCurrency(raw.currency) ?? validCurrency(challengeGoal.currency);
    const type = ['daily_amount','weekly_amount','no_spend_weekend','seven_day','thirty_day','custom'].includes(raw.challenge_type) ? raw.challenge_type : 'custom';
    const hasExplicitStart = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.start_date || ''));
    let startDate = hasExplicitStart ? String(raw.start_date) : new Date().toISOString().slice(0, 10);
    if (!hasExplicitStart && type === 'no_spend_weekend') {
      const d = new Date(`${startDate}T00:00:00Z`);
      const daysUntilSaturday = (6 - d.getUTCDay() + 7) % 7;
      d.setUTCDate(d.getUTCDate() + daysUntilSaturday);
      startDate = d.toISOString().slice(0, 10);
    }
    let endDate = String(raw.end_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      const d = new Date(`${startDate}T00:00:00Z`);
      const durationMinusOne = type === 'seven_day' ? 6 : type === 'thirty_day' ? 29 : type === 'no_spend_weekend' ? 1 : type === 'weekly_amount' ? 27 : 6;
      d.setUTCDate(d.getUTCDate() + durationMinusOne);
      endDate = d.toISOString().slice(0, 10);
    }
    const targetAmountRaw = raw.target_amount ?? raw.amount;
    const targetAmount = targetAmountRaw == null ? null : Number(targetAmountRaw);
    if (!currency || (targetAmount != null && (!Number.isFinite(targetAmount) || targetAmount < 0))) return null;
    return { action, payload: { goal_id: challengeGoal.id, goal_name: challengeGoal.name, title: String(raw.title || 'Savings challenge').slice(0, 120), challenge_type: type, target_amount: targetAmount, currency, start_date: startDate, end_date: endDate } };
  }
  return null;
}

function confirmationText(action: string, p: any) {
  if (action === 'record_savings') return `Add ${formatMoney(p.amount, p.currency)} to your ${p.goal_name} goal?`;
  if (action === 'update_target_amount') return `Change your ${p.goal_name} target to ${formatMoney(p.target_amount, p.currency)}?`;
  if (action === 'update_target_date') return `Change your ${p.goal_name} target date to ${p.target_date}?`;
  if (action === 'create_goal') return `Create a ${p.name} savings goal for ${formatMoney(p.target_amount, p.currency)} by ${p.target_date}?`;
  if (action === 'start_challenge') return `Start the “${p.title}” savings challenge through ${p.end_date}?`;
  return 'Confirm this Money Saver change?';
}

async function executePendingAction(authClient: AnyClient, userId: string, row: any) {
  const p = row.payload || {};
  if (row.action_type === 'record_savings') {
    const { data, error } = await authClient.rpc('record_savings_entry', { _goal_id: p.goal_id, _amount: Number(p.amount), _source: 'winston', _note: 'Added through Winston' });
    if (error) throw error;
    const m = calculateSavingsMetrics(data);
    return `Done. You’re now at ${formatMoney(data.current_amount, data.currency)} of ${formatMoney(data.target_amount, data.currency)} — ${Math.round(m.progressPercent)}% complete.`;
  }
  if (row.action_type === 'create_goal') {
    const { data, error } = await authClient.rpc('create_savings_goal', {
      _name: p.name, _target_amount: Number(p.target_amount), _already_saved: Number(p.already_saved || 0),
      _target_date: p.target_date, _currency: p.currency, _reason: p.reason || null,
      _regular_saving_amount: null, _saving_frequency: 'weekly',
    });
    if (error) throw error;
    const m = calculateSavingsMetrics(data);
    return `Done. ${data.name} is set to ${formatMoney(data.target_amount, data.currency)} by ${data.target_date}. Your current weekly target is about ${formatMoney(m.weeklyNeeded, data.currency)}.`;
  }
  if (row.action_type === 'update_target_amount') {
    const { data, error } = await authClient.from('savings_goals').update({ target_amount: Number(p.target_amount) }).eq('id', p.goal_id).eq('user_id', userId).select().single();
    if (error) throw error;
    const m = calculateSavingsMetrics(data);
    return `Done. ${data.name} now targets ${formatMoney(data.target_amount, data.currency)}. Your updated weekly target is about ${formatMoney(m.weeklyNeeded, data.currency)}.`;
  }
  if (row.action_type === 'update_target_date') {
    const { data, error } = await authClient.from('savings_goals').update({ target_date: p.target_date }).eq('id', p.goal_id).eq('user_id', userId).select().single();
    if (error) throw error;
    const m = calculateSavingsMetrics(data);
    return `Done. ${data.name} now targets ${data.target_date}. Your updated weekly target is about ${formatMoney(m.weeklyNeeded, data.currency)}.`;
  }
  if (row.action_type === 'start_challenge') {
    const { error } = await authClient.from('savings_challenges').insert({
      user_id: userId, goal_id: p.goal_id || null, title: p.title, challenge_type: p.challenge_type,
      target_amount: p.target_amount, currency: p.currency, start_date: p.start_date, end_date: p.end_date,
    });
    if (error) throw error;
    return `Done. Your “${p.title}” savings challenge is active through ${p.end_date}.`;
  }
  throw new Error('unsupported_money_action');
}

export async function handleWinstonMoneySaverTurn(opts: {
  authClient: AnyClient;
  adminClient: AnyClient;
  userId: string;
  messages: any[];
  apiKey: string;
  stream: boolean;
  corsHeaders: Record<string, string>;
}) {
  const text = latestUserText(opts.messages);
  const snapshot = await loadMoneySaverSnapshot(opts.authClient, opts.userId);
  const context = buildMoneySaverContext(snapshot);

  // Expire old confirmation requests before looking for the active one.
  await opts.adminClient.from('winston_money_actions')
    .update({ status: 'expired', resolved_at: new Date().toISOString() })
    .eq('user_id', opts.userId).eq('status', 'pending').lt('expires_at', new Date().toISOString());

  const { data: pending } = await opts.adminClient.from('winston_money_actions')
    .select('*').eq('user_id', opts.userId).eq('status', 'pending')
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (pending && YES.test(text)) {
    try {
      const reply = await executePendingAction(opts.authClient, opts.userId, pending);
      await opts.adminClient.from('winston_money_actions').update({ status: 'confirmed', resolved_at: new Date().toISOString() }).eq('id', pending.id).eq('user_id', opts.userId);
      await persistAssistant(opts.adminClient, opts.userId, reply);
      return { context, response: directReplyResponse(reply, opts.stream, opts.corsHeaders) };
    } catch (e) {
      console.error('[money-saver] confirmed action failed', e);
      const reply = 'I couldn’t save that change safely. Nothing was changed.';
      await persistAssistant(opts.adminClient, opts.userId, reply);
      return { context, response: directReplyResponse(reply, opts.stream, opts.corsHeaders) };
    }
  }
  if (pending && NO.test(text)) {
    await opts.adminClient.from('winston_money_actions').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('id', pending.id).eq('user_id', opts.userId);
    const reply = 'No problem — I left your Money Saver data unchanged.';
    await persistAssistant(opts.adminClient, opts.userId, reply);
    return { context, response: directReplyResponse(reply, opts.stream, opts.corsHeaders) };
  }

  if (MONEY_HINT.test(text) && WRITE_HINT.test(text)) {
    try {
      const [minuteLimit, dayLimit] = await Promise.all([
        opts.authClient.rpc('rate_limit_check', { _action: 'winston_money_write_minute', _window_seconds: 60, _max: 10 }),
        opts.authClient.rpc('rate_limit_check', { _action: 'winston_money_write_day', _window_seconds: 86400, _max: 100 }),
      ]);
      const rateError = minuteLimit.error || dayLimit.error;
      if (rateError && String(rateError.message || '').includes('rate_limited')) {
        const reply = 'Too many Money Saver changes at once. Try again in a little while.';
        await persistAssistant(opts.adminClient, opts.userId, reply);
        return { context, response: directReplyResponse(reply, opts.stream, opts.corsHeaders) };
      }
      const raw = await extractAction(opts.apiKey, text, snapshot);
      const proposal = normalizeProposal(raw, snapshot);
      if (proposal) {
        if (pending) {
          await opts.adminClient.from('winston_money_actions').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('id', pending.id).eq('user_id', opts.userId);
        }
        await opts.adminClient.from('winston_money_actions').insert({
          user_id: opts.userId,
          action_type: proposal.action,
          payload: proposal.payload,
          status: 'pending',
          expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
        });
        const reply = confirmationText(proposal.action, proposal.payload);
        await persistAssistant(opts.adminClient, opts.userId, reply);
        return { context, response: directReplyResponse(reply, opts.stream, opts.corsHeaders) };
      }
    } catch (e) {
      console.error('[money-saver] action extraction failed', e);
      // Fall through to normal Winston conversation; no write has occurred.
    }
  }

  return { context, response: null };
}
