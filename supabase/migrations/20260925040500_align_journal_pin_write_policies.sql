-- Keep journal PIN enforcement consistent for every data mutation.
-- This forward migration mirrors the live hardening applied after the initial
-- server-side PIN gate and makes fresh/rebuilt environments match production.

-- Entries
drop policy if exists "Users can insert own journal entries" on public.journal_entries;
drop policy if exists "Users can update own journal entries" on public.journal_entries;
drop policy if exists "Users can delete own journal entries" on public.journal_entries;
drop policy if exists "Users can insert unlocked journal entries" on public.journal_entries;
drop policy if exists "Users can update unlocked journal entries" on public.journal_entries;
drop policy if exists "Users can delete unlocked journal entries" on public.journal_entries;

create policy "Users can insert unlocked journal entries"
on public.journal_entries for insert to authenticated
with check (auth.uid() = user_id and public.journal_is_unlocked(user_id));

create policy "Users can update unlocked journal entries"
on public.journal_entries for update to authenticated
using (auth.uid() = user_id and public.journal_is_unlocked(user_id))
with check (auth.uid() = user_id and public.journal_is_unlocked(user_id));

create policy "Users can delete unlocked journal entries"
on public.journal_entries for delete to authenticated
using (auth.uid() = user_id and public.journal_is_unlocked(user_id));

-- Folders
drop policy if exists "Users can insert own folders" on public.journal_folders;
drop policy if exists "Users can update own folders" on public.journal_folders;
drop policy if exists "Users can delete own folders" on public.journal_folders;
drop policy if exists "Users can insert unlocked journal folders" on public.journal_folders;
drop policy if exists "Users can update unlocked journal folders" on public.journal_folders;
drop policy if exists "Users can delete unlocked journal folders" on public.journal_folders;

create policy "Users can insert unlocked journal folders"
on public.journal_folders for insert to authenticated
with check (auth.uid() = user_id and public.journal_is_unlocked(user_id));

create policy "Users can update unlocked journal folders"
on public.journal_folders for update to authenticated
using (auth.uid() = user_id and public.journal_is_unlocked(user_id))
with check (auth.uid() = user_id and public.journal_is_unlocked(user_id));

create policy "Users can delete unlocked journal folders"
on public.journal_folders for delete to authenticated
using (auth.uid() = user_id and public.journal_is_unlocked(user_id));

-- Memories
drop policy if exists "Users can insert own memories" on public.journal_memories;
drop policy if exists "Users can update own memories" on public.journal_memories;
drop policy if exists "Users can delete own memories" on public.journal_memories;
drop policy if exists "Users can insert unlocked journal memories" on public.journal_memories;
drop policy if exists "Users can update unlocked journal memories" on public.journal_memories;
drop policy if exists "Users can delete unlocked journal memories" on public.journal_memories;

create policy "Users can insert unlocked journal memories"
on public.journal_memories for insert to authenticated
with check (auth.uid() = user_id and public.journal_is_unlocked(user_id));

create policy "Users can update unlocked journal memories"
on public.journal_memories for update to authenticated
using (auth.uid() = user_id and public.journal_is_unlocked(user_id))
with check (auth.uid() = user_id and public.journal_is_unlocked(user_id));

create policy "Users can delete unlocked journal memories"
on public.journal_memories for delete to authenticated
using (auth.uid() = user_id and public.journal_is_unlocked(user_id));
