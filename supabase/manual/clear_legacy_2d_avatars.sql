-- Clear old 2D avatars from profiles (run by hand in the Supabase SQL editor).
--
-- Matches only:
--  * instant avatars saved by the removed saveInstantAvatar():
--    .../storage/v1/object/sign/avatars/{userId}/instant-avatar-{id}.svg|png?token=...
--  * DiceBear cartoon URLs from the early avatar stub (https://api.dicebear.com/...)
-- Never matches the 60 bundled 3D presets (/avatars/presets/*.webp), uploaded
-- photos ({userId}/avatar.{ext}) or AI avatars ({userId}/ai-avatar-{id}.{ext}).
-- Same rule as src/lib/legacyAvatar.ts.

-- 1) Read-only check: how many profiles still point at an old 2D avatar.
select count(*) as legacy_2d_avatars
from public.profiles
where avatar_url ~* '(^|/)avatars/[^/?#]+/instant-avatar-[^/?#]+\.(svg|png)([?#]|$)'
   or avatar_url ~* '^https?://([a-z0-9-]+\.)*dicebear\.com/';

-- 2) Clear them (shows as no avatar straight away, even before a new app build).
update public.profiles
set avatar_url = null
where avatar_url ~* '(^|/)avatars/[^/?#]+/instant-avatar-[^/?#]+\.(svg|png)([?#]|$)'
   or avatar_url ~* '^https?://([a-z0-9-]+\.)*dicebear\.com/';

-- The image files themselves stay in the private `avatars` bucket
-- ({userId}/instant-avatar-*.svg|png). Nothing shows them once avatar_url is
-- cleared. Supabase does not allow deleting files with SQL on storage.objects;
-- remove them from the Storage page if wanted.
