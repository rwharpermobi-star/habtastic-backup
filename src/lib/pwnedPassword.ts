/**
 * Checks candidate passwords against the Have I Been Pwned Pwned Passwords
 * range API using k-anonymity. The raw password and full SHA-1 hash never
 * leave this device; only the first five hash characters are requested.
 */
import { getSupabase } from '@/integrations/supabase/lazyClient';

export class PasswordSafetyUnavailableError extends Error {
  constructor() {
    super('Password safety check is temporarily unavailable. Please try again.');
    this.name = 'PasswordSafetyUnavailableError';
  }
}

export class CompromisedPasswordError extends Error {
  constructor() {
    super('This password has appeared in a known data breach. Choose a different password.');
    this.name = 'CompromisedPasswordError';
  }
}

async function sha1Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new PasswordSafetyUnavailableError();
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function getPwnedPasswordCount(password: string): Promise<number> {
  if (!password) return 0;

  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let body: string;
  try {
    // Browsers cannot set the User-Agent header required by HIBP. The public
    // Supabase Edge Function proxies only the 5-character k-anonymity prefix
    // and adds the required User-Agent server-side.
    const client = await getSupabase();
    const { data, error } = await client.functions.invoke('pwned-password-range', {
      body: { prefix },
    });

    if (error || typeof data !== 'string') {
      throw new PasswordSafetyUnavailableError();
    }

    body = data;
  } catch {
    throw new PasswordSafetyUnavailableError();
  }
  for (const line of body.split(/\r?\n/)) {
    const [candidateSuffix, rawCount] = line.split(':');
    if (candidateSuffix?.trim().toUpperCase() === suffix) {
      const count = Number.parseInt(rawCount?.trim() || '0', 10);
      return Number.isFinite(count) ? count : 1;
    }
  }
  return 0;
}

export async function assertPasswordIsNotCompromised(password: string): Promise<void> {
  const count = await getPwnedPasswordCount(password);
  if (count > 0) throw new CompromisedPasswordError();
}
