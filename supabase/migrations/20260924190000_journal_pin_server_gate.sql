create extension if not exists pgcrypto with schema extensions;
create table if not exists public.journal_pin_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failures integer not null default 0,
  blocked_until timestamptz,
  unlocked_session text,
  unlocked_until timestamptz
);
alter table public.journal_pin_state enable row level security;
revoke all on public.journal_pin_state from public, anon, authenticated;

create or replace function public.journal_is_unlocked(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
 select p_user_id = (select auth.uid())
 and exists (
   select 1 from public.journal_pin_state s
   where s.user_id = p_user_id
     and s.unlocked_session = (select auth.jwt()->>'session_id')
     and s.unlocked_session is not null
     and s.unlocked_until > now()
 );
$$;
revoke all on function public.journal_is_unlocked(uuid) from public, anon;
grant execute on function public.journal_is_unlocked(uuid) to authenticated;

create or replace function public.journal_pin_status()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
 select (select auth.uid()) is not null
 and exists (select 1 from public.journal_passcodes where user_id = (select auth.uid()));
$$;
revoke all on function public.journal_pin_status() from public, anon;
grant execute on function public.journal_pin_status() to authenticated;

create or replace function public.journal_pin_set(p_pin text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_uid uuid := auth.uid(); v_session text := auth.jwt()->>'session_id';
begin
 if v_uid is null or v_session is null or p_pin !~ '^[0-9]{4}$' then return false; end if;
 insert into public.journal_passcodes(user_id, passcode_hash)
 values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)))
 on conflict (user_id) do nothing;
 if not found then return false; end if;
 insert into public.journal_pin_state(user_id, failures, blocked_until, unlocked_session, unlocked_until)
 values (v_uid, 0, null, v_session, now() + interval '15 minutes')
 on conflict (user_id) do update set failures=0, blocked_until=null,
 unlocked_session=excluded.unlocked_session, unlocked_until=excluded.unlocked_until;
 return true;
end;
$$;
revoke all on function public.journal_pin_set(text) from public, anon;
grant execute on function public.journal_pin_set(text) to authenticated;

create or replace function public.journal_pin_verify(p_pin text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_uid uuid := auth.uid(); v_session text := auth.jwt()->>'session_id';
 v_state public.journal_pin_state%rowtype; v_hash text; v_ok boolean;
begin
 if v_uid is null or v_session is null or p_pin !~ '^[0-9]{4}$' then return false; end if;
 insert into public.journal_pin_state(user_id) values (v_uid) on conflict do nothing;
 select * into v_state from public.journal_pin_state where user_id=v_uid for update;
 if v_state.blocked_until > now() then return false; end if;
 select passcode_hash into v_hash from public.journal_passcodes where user_id=v_uid;
 if v_hash is null then return false; end if;
 v_ok := case when v_hash ~ '^[a-f0-9]{64}$'
   then v_hash = encode(extensions.digest(p_pin, 'sha256'),'hex')
   else v_hash = extensions.crypt(p_pin, v_hash) end;
 if v_ok then
   update public.journal_pin_state set failures=0, blocked_until=null,
     unlocked_session=v_session, unlocked_until=now()+interval '15 minutes'
   where user_id=v_uid;
   if v_hash ~ '^[a-f0-9]{64}$' then
     update public.journal_passcodes set passcode_hash=extensions.crypt(p_pin, extensions.gen_salt('bf',12))
     where user_id=v_uid;
   end if;
 else
   update public.journal_pin_state set failures=case when failures >= 4 then 0 else failures+1 end,
   blocked_until=case when failures >= 4 then now()+interval '15 minutes' else null end,
   unlocked_session=null, unlocked_until=null where user_id=v_uid;
 end if;
 return v_ok;
end;
$$;
revoke all on function public.journal_pin_verify(text) from public, anon;
grant execute on function public.journal_pin_verify(text) to authenticated;

create or replace function public.journal_pin_lock()
returns void language sql security definer
set search_path = pg_catalog, public
as $$
 update public.journal_pin_state set unlocked_session=null, unlocked_until=null
 where user_id=(select auth.uid()) and unlocked_session=(select auth.jwt()->>'session_id');
$$;
revoke all on function public.journal_pin_lock() from public, anon;
grant execute on function public.journal_pin_lock() to authenticated;

drop policy if exists "Users can read own passcode" on public.journal_passcodes;
drop policy if exists "Users can insert own passcode" on public.journal_passcodes;
drop policy if exists "Users can update own passcode" on public.journal_passcodes;
revoke all on public.journal_passcodes from anon, authenticated;

drop policy if exists "Users can read own journal entries" on public.journal_entries;
create policy "Users can read unlocked journal entries" on public.journal_entries
for select to authenticated using ((select auth.uid())=user_id and (select public.journal_is_unlocked(user_id)));
drop policy if exists "Users can read own memories" on public.journal_memories;
create policy "Users can read unlocked journal memories" on public.journal_memories
for select to authenticated using ((select auth.uid())=user_id and (select public.journal_is_unlocked(user_id)));
drop policy if exists "Users can read own folders" on public.journal_folders;
create policy "Users can read unlocked journal folders" on public.journal_folders
for select to authenticated using ((select auth.uid())=user_id and (select public.journal_is_unlocked(user_id)));
