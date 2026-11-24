/**
 * Reads a same-origin relative return path from the current query string.
 *
 * Only accepts values that start with a single "/" (rejects "//host",
 * "http://…", "javascript:" and any other absolute/protocol-relative form),
 * so a login return path can never be used for open-redirect abuse.
 */
export function getSafeRedirect(search: string = window.location.search): string | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const raw = params.get('redirect') ?? params.get('next');
  if (!raw) return null;

  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\') || [...value].some((ch) => ch.charCodeAt(0) <= 0x1f)) return null;

  return value;
}
