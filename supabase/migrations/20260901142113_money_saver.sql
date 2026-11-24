-- HabTastic Money Saver
-- Structured savings data is user-owned and protected by RLS.

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  target_amount numeric(14,2) not null check (target_amount > 0),
  starting_amount numeric(14,2) not null default 0 check (starting_amount >= 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason text check (reason is null or char_length(reason) <= 500),
  regular_saving_amount numeric(14,2) check (regular_saving_amount is null or regular_saving_amount >= 0),
  saving_frequency text not null default 'weekly' check (saving_frequency in ('daily','weekly','monthly')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  saved_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','initial','winston','challenge')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  constraint savings_entries_goal_owner_fk
    foreign key (goal_id, user_id)
    references public.savings_goals(id, user_id)
    on delete cascade
);

create table if not exists public.savings_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  title text not null check (char_length(title) between 1 and 120),
  challenge_type text not null check (challenge_type in ('daily_amount','weekly_amount','no_spend_weekend','seven_day','thirty_day','custom')),
  target_amount numeric(14,2) check (target_amount is null or target_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  start_date date not null default current_date,
  end_date date not null,
  completed_dates date[] not null default '{}'::date[],
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_challenges_goal_owner_fk
    foreign key (goal_id, user_id)
    references public.savings_goals(id, user_id)
    on delete cascade,
  check (end_date >= start_date)
);

-- Short-lived confirmation state for Winston Money Saver writes.
-- This is action state, not a second memory system.
create table if not exists public.winston_money_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('record_savings','create_goal','update_target_amount','update_target_date','start_challenge')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','expired')),
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_savings_goals_user_status on public.savings_goals(user_id, status, updated_at desc);
create index if not exists idx_savings_entries_user_goal_date on public.savings_entries(user_id, goal_id, saved_at desc);
create index if not exists idx_savings_challenges_user_status on public.savings_challenges(user_id, status, start_date desc);
create index if not exists idx_winston_money_actions_user_pending on public.winston_money_actions(user_id, status, created_at desc);

create or replace function public.money_saver_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The savings_entries ledger is the only source of truth for a goal balance.
-- This prevents direct goal INSERT/UPDATE calls from manufacturing current_amount
-- and also recalculates active/completed whenever the target changes.
create or replace function public.money_saver_sync_goal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total numeric(14,2);
begin
  select coalesce(sum(amount), 0)::numeric(14,2)
    into v_total
    from public.savings_entries
   where goal_id = new.id;

  new.current_amount = v_total;
  if new.status <> 'archived' then
    new.status = case when v_total >= new.target_amount then 'completed' else 'active' end;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.money_saver_recompute_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal_id uuid;
  v_old_goal_id uuid;
  v_total numeric(14,2);
begin
  if tg_op = 'DELETE' then
    v_goal_id := old.goal_id;
  elsif tg_op = 'INSERT' then
    v_goal_id := new.goal_id;
  else
    v_goal_id := new.goal_id;
    v_old_goal_id := old.goal_id;
  end if;

  select coalesce(sum(amount), 0)::numeric(14,2)
    into v_total
    from public.savings_entries
   where goal_id = v_goal_id;

  update public.savings_goals
     set current_amount = v_total,
         status = case
           when status = 'archived' then 'archived'
           when v_total >= target_amount then 'completed'
           else 'active'
         end,
         updated_at = now()
   where id = v_goal_id;

  -- If an existing entry is moved to another goal, both ledgers changed.
  if tg_op = 'UPDATE' and v_old_goal_id is distinct from v_goal_id then
    select coalesce(sum(amount), 0)::numeric(14,2)
      into v_total
      from public.savings_entries
     where goal_id = v_old_goal_id;

    update public.savings_goals
       set current_amount = v_total,
           status = case
             when status = 'archived' then 'archived'
             when v_total >= target_amount then 'completed'
             else 'active'
           end,
           updated_at = now()
     where id = v_old_goal_id;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.create_savings_goal(
  _name text,
  _target_amount numeric,
  _already_saved numeric,
  _target_date date,
  _currency text,
  _reason text default null,
  _regular_saving_amount numeric default null,
  _saving_frequency text default 'weekly'
)
returns public.savings_goals
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_goal public.savings_goals;
  v_saved numeric := greatest(coalesce(_already_saved, 0), 0);
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if _target_amount is null or _target_amount <= 0 then raise exception 'target_amount_must_be_positive'; end if;
  if _target_date is null then raise exception 'target_date_required'; end if;
  if upper(coalesce(_currency,'')) !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;

  insert into public.savings_goals (
    user_id, name, target_amount, starting_amount, current_amount,
    target_date, currency, reason, regular_saving_amount, saving_frequency
  ) values (
    v_user, trim(_name), _target_amount, v_saved, 0,
    _target_date, upper(_currency), nullif(trim(coalesce(_reason,'')), ''),
    _regular_saving_amount,
    case when _saving_frequency in ('daily','weekly','monthly') then _saving_frequency else 'weekly' end
  ) returning * into v_goal;

  if v_saved > 0 then
    insert into public.savings_entries(user_id, goal_id, amount, source, note)
    values (v_user, v_goal.id, v_saved, 'initial', 'Starting savings');
  end if;

  select * into v_goal from public.savings_goals where id = v_goal.id and user_id = v_user;
  return v_goal;
end;
$$;

create or replace function public.record_savings_entry(
  _goal_id uuid,
  _amount numeric,
  _source text default 'manual',
  _note text default null
)
returns public.savings_goals
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_goal public.savings_goals;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if _amount is null or _amount <= 0 then raise exception 'amount_must_be_positive'; end if;

  insert into public.savings_entries(user_id, goal_id, amount, source, note)
  values (
    v_user,
    _goal_id,
    _amount,
    case when _source in ('manual','initial','winston','challenge') then _source else 'manual' end,
    nullif(trim(coalesce(_note,'')), '')
  );

  select * into v_goal from public.savings_goals where id = _goal_id and user_id = v_user;
  if v_goal.id is null then raise exception 'goal_not_found'; end if;
  return v_goal;
end;
$$;

drop trigger if exists trg_savings_goals_updated_at on public.savings_goals;
create trigger trg_savings_goals_updated_at before insert or update on public.savings_goals
for each row execute function public.money_saver_sync_goal();

drop trigger if exists trg_savings_challenges_updated_at on public.savings_challenges;
create trigger trg_savings_challenges_updated_at before update on public.savings_challenges
for each row execute function public.money_saver_set_updated_at();

drop trigger if exists trg_savings_entries_recompute_goal on public.savings_entries;
create trigger trg_savings_entries_recompute_goal
after insert or update or delete on public.savings_entries
for each row execute function public.money_saver_recompute_goal();

alter table public.savings_goals enable row level security;
alter table public.savings_entries enable row level security;
alter table public.savings_challenges enable row level security;
alter table public.winston_money_actions enable row level security;

create policy "Users can read own savings goals" on public.savings_goals for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert own savings goals" on public.savings_goals for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own savings goals" on public.savings_goals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own savings goals" on public.savings_goals for delete to authenticated using (auth.uid() = user_id);

create policy "Users can read own savings entries" on public.savings_entries for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert own savings entries" on public.savings_entries for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own savings entries" on public.savings_entries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own savings entries" on public.savings_entries for delete to authenticated using (auth.uid() = user_id);

create policy "Users can read own savings challenges" on public.savings_challenges for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert own savings challenges" on public.savings_challenges for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own savings challenges" on public.savings_challenges for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own savings challenges" on public.savings_challenges for delete to authenticated using (auth.uid() = user_id);

-- Winston pending actions can be inspected by their owner, but only server code
-- using the service role may create/resolve them.
create policy "Users can read own Winston money actions" on public.winston_money_actions
for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.winston_money_actions from anon, authenticated;
grant select on public.winston_money_actions to authenticated;

grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, update, delete on public.savings_entries to authenticated;
grant select, insert, update, delete on public.savings_challenges to authenticated;
grant execute on function public.create_savings_goal(text,numeric,numeric,date,text,text,numeric,text) to authenticated;
grant execute on function public.record_savings_entry(uuid,numeric,text,text) to authenticated;