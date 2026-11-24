// The old 2D avatars were removed from the app. Profiles that saved one still
// hold its URL, so every avatar on screen goes through visibleAvatarUrl() and
// those URLs show as "no avatar" (initials or blank), never as the 2D image.
//
// Two kinds of old 2D avatar are matched, and nothing else:
//  - Instant avatars: saved by the removed saveInstantAvatar() to the private
//    `avatars` bucket as `{userId}/instant-avatar-{id}.svg` (or `.png`), and
//    stored on the profile as a signed URL:
//    .../storage/v1/object/sign/avatars/{userId}/instant-avatar-{id}.svg?token=...
//  - DiceBear cartoons from the early avatar stub: https://api.dicebear.com/...
//
// The 60 bundled 3D presets (/avatars/presets/*.webp), uploaded photos
// ({userId}/{timestamp}.{ext}) and real AI avatars are never matched.

const INSTANT_AVATAR_PATH = /(?:^|\/)avatars\/[^/?#]+\/instant-avatar-[^/?#]+\.(?:svg|png)$/i;

export function isLegacyInstantAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const value = url.trim();
  if (!value) return false;
  let host = '';
  let path = value;
  try {
    const parsed = new URL(value, 'https://placeholder.invalid');
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname;
  } catch {
    path = value.split(/[?#]/)[0] ?? value;
  }
  if (host === 'api.dicebear.com' || host.endsWith('.dicebear.com')) return true;
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* keep the raw path */ }
  return INSTANT_AVATAR_PATH.test(decoded);
}

/** The avatar URL to show, or null when there is none or it is an old 2D avatar. */
export function visibleAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return isLegacyInstantAvatarUrl(url) ? null : url;
}
