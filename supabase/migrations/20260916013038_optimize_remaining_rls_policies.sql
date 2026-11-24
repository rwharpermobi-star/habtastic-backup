-- Keep auth.uid() evaluated once per statement rather than once per row.
-- The friendship UPDATE policy also uses WITH CHECK so an authenticated user
-- cannot move a friendship row to arbitrary requester/addressee IDs.

drop policy if exists "Users can insert own purchases" on public.shop_purchases;
create policy "Users can insert own purchases" on public.shop_purchases
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists fr_delete on public.friendships;
create policy fr_delete on public.friendships
  for delete to authenticated
  using (((select auth.uid()) = requester_id) or ((select auth.uid()) = addressee_id));

drop policy if exists fr_insert on public.friendships;
create policy fr_insert on public.friendships
  for insert to authenticated
  with check ((select auth.uid()) = requester_id);

drop policy if exists fr_update on public.friendships;
create policy fr_update on public.friendships
  for update to authenticated
  using (((select auth.uid()) = requester_id) or ((select auth.uid()) = addressee_id))
  with check (((select auth.uid()) = requester_id) or ((select auth.uid()) = addressee_id));

drop policy if exists fr_view on public.friendships;
create policy fr_view on public.friendships
  for select to authenticated
  using (((select auth.uid()) = requester_id) or ((select auth.uid()) = addressee_id));

drop policy if exists fc_delete on public.friend_challenges;
create policy fc_delete on public.friend_challenges
  for delete to authenticated
  using (((select auth.uid()) = creator_id) or ((select auth.uid()) = opponent_id));

drop policy if exists fc_insert on public.friend_challenges;
create policy fc_insert on public.friend_challenges
  for insert to authenticated
  with check ((select auth.uid()) = creator_id);

drop policy if exists fc_view on public.friend_challenges;
create policy fc_view on public.friend_challenges
  for select to authenticated
  using (((select auth.uid()) = creator_id) or ((select auth.uid()) = opponent_id));

drop policy if exists fb_insert on public.feedback;
create policy fb_insert on public.feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists fb_own on public.feedback;
create policy fb_own on public.feedback
  for select to authenticated
  using (((select auth.uid()) = user_id) or public.has_role((select auth.uid()), 'admin'::public.app_role));

-- This is an internal no-op helper and is not part of the client API.
revoke execute on function public.unlock_eligible_cosmetics() from anon, authenticated;
