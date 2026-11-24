
-- =========================================================================
-- 1. Helper: create_notification (SECURITY DEFINER, safe insert)
-- =========================================================================
create or replace function public.create_notification(
  _user_id uuid,
  _kind text,
  _title text,
  _body text default '',
  _payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _id uuid;
begin
  if _user_id is null or _kind is null or _title is null then return null; end if;
  insert into public.notifications(user_id, kind, title, body, payload)
  values (_user_id, _kind, _title, coalesce(_body,''), coalesce(_payload,'{}'::jsonb))
  returning id into _id;
  return _id;
end $$;

revoke execute on function public.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, text, text, text, jsonb) to service_role;

-- =========================================================================
-- 2. Trigger: mirror every notification_log push into the in-app bell
--    → single write covers reminders/streak/comeback/weekly-recap.
-- =========================================================================
create or replace function public.trg_notification_log_to_bell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_notification(
    NEW.user_id,
    NEW.kind,
    NEW.title,
    NEW.body,
    jsonb_build_object('habit_id', NEW.habit_id, 'dedup_key', NEW.dedup_key, 'source', 'push')
  );
  return NEW;
end $$;

drop trigger if exists notification_log_to_bell on public.notification_log;
create trigger notification_log_to_bell
  after insert on public.notification_log
  for each row execute function public.trg_notification_log_to_bell();

-- =========================================================================
-- 3. Trigger: referral retention reward → bell entry
-- =========================================================================
create or replace function public.trg_referral_reward_bell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.retention_xp_awarded = true and coalesce(OLD.retention_xp_awarded, false) = false then
    perform public.create_notification(
      NEW.referrer_id,
      'referral',
      '🎁 Referral reward earned!',
      'Your friend stuck with HabTastic — you just earned bonus XP + Premium days.',
      jsonb_build_object('referral_id', NEW.id, 'url', '/referrals')
    );
  end if;
  return NEW;
end $$;

drop trigger if exists referral_reward_bell on public.referrals;
create trigger referral_reward_bell
  after update of retention_xp_awarded on public.referrals
  for each row execute function public.trg_referral_reward_bell();

-- =========================================================================
-- 4. Trigger: subscription becomes active → premium welcome
-- =========================================================================
create or replace function public.trg_subscription_active_bell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status in ('active','trialing') and
     (TG_OP = 'INSERT' or coalesce(OLD.status,'') not in ('active','trialing')) then
    perform public.create_notification(
      NEW.user_id,
      'premium',
      '👑 Welcome to HabTastic Premium',
      'Unlimited AI coaching, all habits unlocked, and every premium feature is live.',
      jsonb_build_object('plan', NEW.plan_code, 'url', '/profile')
    );
  elsif NEW.status = 'past_due' and coalesce(OLD.status,'') <> 'past_due' then
    perform public.create_notification(
      NEW.user_id,
      'payment',
      '⚠️ Payment issue',
      'We could not process your Premium payment. Update your card to keep Premium active.',
      jsonb_build_object('url', '/profile')
    );
  elsif NEW.status = 'canceled' and coalesce(OLD.status,'') <> 'canceled' then
    perform public.create_notification(
      NEW.user_id,
      'premium',
      'Premium canceled',
      'You will keep Premium access until the end of your current period.',
      jsonb_build_object('ends_at', NEW.current_period_end, 'url', '/profile')
    );
  end if;
  return NEW;
end $$;

drop trigger if exists subscription_active_bell on public.subscriptions;
create trigger subscription_active_bell
  after insert or update on public.subscriptions
  for each row execute function public.trg_subscription_active_bell();

-- =========================================================================
-- 5. Trigger: friendship accepted → notify the requester
-- =========================================================================
create or replace function public.trg_friend_accept_bell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'accepted' and coalesce(OLD.status,'') <> 'accepted' then
    perform public.create_notification(
      NEW.requester_id,
      'friend',
      '🤝 Friend request accepted',
      'You are now connected — see their progress on your Friends tab.',
      jsonb_build_object('friendship_id', NEW.id, 'url', '/friends')
    );
  end if;
  return NEW;
end $$;

drop trigger if exists friend_accept_bell on public.friendships;
create trigger friend_accept_bell
  after update of status on public.friendships
  for each row execute function public.trg_friend_accept_bell();

-- =========================================================================
-- 6. Trigger: leaderboard crown awarded → notify recipient
-- =========================================================================
create or replace function public.trg_crown_award_bell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare _title text; _body text;
begin
  _title := case NEW.place
    when 1 then '👑 You won 1st place!'
    when 2 then '🥈 You placed 2nd!'
    when 3 then '🥉 You placed 3rd!'
    else '🏆 You placed on the leaderboard'
  end;
  _body := 'Monthly leaderboard for ' || to_char(NEW.period_start, 'Mon YYYY') || ' has been finalized.';
  perform public.create_notification(
    NEW.user_id,
    'crown',
    _title,
    _body,
    jsonb_build_object('place', NEW.place, 'period_start', NEW.period_start, 'url', '/leaderboard')
  );
  return NEW;
end $$;

drop trigger if exists crown_award_bell on public.leaderboard_crowns;
create trigger crown_award_bell
  after insert on public.leaderboard_crowns
  for each row execute function public.trg_crown_award_bell();

-- =========================================================================
-- 7. device_tokens table for native FCM (Android) / APNs (iOS) push
-- =========================================================================
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android','ios','web')),
  token text not null,
  device_id text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(token)
);

create index if not exists device_tokens_user_idx on public.device_tokens(user_id);

grant select, insert, update, delete on public.device_tokens to authenticated;
grant all on public.device_tokens to service_role;

alter table public.device_tokens enable row level security;

drop policy if exists "users read own tokens" on public.device_tokens;
create policy "users read own tokens" on public.device_tokens
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users delete own tokens" on public.device_tokens;
create policy "users delete own tokens" on public.device_tokens
  for delete to authenticated using (auth.uid() = user_id);

-- Inserts/updates go through the edge function using the service role,
-- so no client insert/update policy is exposed.
