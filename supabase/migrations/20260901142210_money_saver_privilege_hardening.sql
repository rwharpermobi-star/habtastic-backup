-- Money Saver least-privilege hardening.
-- Anonymous users should not have table privileges; authenticated access is RLS-scoped.
revoke all on public.savings_goals from anon;
revoke all on public.savings_entries from anon;
revoke all on public.savings_challenges from anon;
revoke all on public.winston_money_actions from anon;

-- Internal trigger helpers are not public RPCs.
revoke execute on function public.money_saver_set_updated_at() from public, anon, authenticated;
revoke execute on function public.money_saver_sync_goal() from public, anon, authenticated;
revoke execute on function public.money_saver_recompute_goal() from public, anon, authenticated;

-- User-facing RPCs require an authenticated session only.
revoke execute on function public.create_savings_goal(text,numeric,numeric,date,text,text,numeric,text) from public, anon;
revoke execute on function public.record_savings_entry(uuid,numeric,text,text) from public, anon;
grant execute on function public.create_savings_goal(text,numeric,numeric,date,text,text,numeric,text) to authenticated;
grant execute on function public.record_savings_entry(uuid,numeric,text,text) to authenticated;