// Helper that rewrites Supabase Storage public URLs to use the on-the-fly
// image transformer so avatars are delivered at the size they're actually
// rendered, with WebP negotiation and compression. Non-Supabase URLs are
// returned unchanged so external avatars (Gravatar etc.) keep working.

const TRANSFORM_PREFIX = '/storage/v1/render/image/public/';
const OBJECT_PREFIX = '/storage/v1/object/public/';

export interface AvatarOpts {
  size: number;       // CSS px the image will be rendered at
  dpr?: number;       // optional override; defaults to window.devicePixelRatio
  quality?: number;   // 20-100, default 70
}

export function optimizeAvatarUrl(url: string | null | undefined, opts: AvatarOpts): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    // Only Supabase public storage URLs support the render transform.
    if (!u.pathname.includes(OBJECT_PREFIX)) return url;

    const dpr = Math.min(opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), 3);
    const px = Math.round(opts.size * dpr);
    const quality = opts.quality ?? 70;

    u.pathname = u.pathname.replace(OBJECT_PREFIX, TRANSFORM_PREFIX);
    u.searchParams.set('width', String(px));
    u.searchParams.set('height', String(px));
    u.searchParams.set('resize', 'cover');
    u.searchParams.set('quality', String(quality));
    return u.toString();
  } catch {
    return url ?? null;
  }
}
