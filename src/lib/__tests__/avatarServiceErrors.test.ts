import { describe, expect, it } from 'vitest';
import { AVATAR_SERVICE_BREAK_MESSAGE, isAvatarProviderUnavailable } from '../avatarServiceErrors';
import { AVATAR_SERVICE_BREAK_MESSAGE as SERVER_MESSAGE } from '../../../supabase/functions/generate-avatar/generation';

describe('isAvatarProviderUnavailable', () => {
  it.each(['RATE_LIMITED', 'PROVIDER_BILLING_REQUIRED', 'SERVICE_PAUSED', 'API_KEY_INVALID'])('treats %s as a provider outage', code => {
    expect(isAvatarProviderUnavailable(500, { code })).toBe(true);
    expect(isAvatarProviderUnavailable(200, { code })).toBe(true);
  });

  it.each([429, 402])('treats HTTP %i as a provider outage', status => {
    expect(isAvatarProviderUnavailable(status, { error: 'Too many requests' })).toBe(true);
  });

  it('treats a provider 401 as an outage but a plain 401 as an expired sign-in', () => {
    expect(isAvatarProviderUnavailable(401, { code: 'API_KEY_INVALID' })).toBe(true);
    expect(isAvatarProviderUnavailable(401, { error: 'Unauthorized' })).toBe(false);
  });

  it('recognises replayed provider failures and old OpenAI billing text', () => {
    expect(isAvatarProviderUnavailable(409, { code: 'REQUEST_FINISHED', status: 429 })).toBe(true);
    expect(isAvatarProviderUnavailable(400, { code: 'GENERATION_FAILED', error: 'OpenAI API rate limit or usage limit reached. Check your OpenAI API billing and limits.' })).toBe(true);
  });

  it('leaves daily limits, in-progress requests and ordinary failures alone', () => {
    expect(isAvatarProviderUnavailable(200, { code: 'DAILY_LIMIT_REACHED', error: 'You have used all your avatar credits today.' })).toBe(false);
    expect(isAvatarProviderUnavailable(409, { code: 'IN_PROGRESS' })).toBe(false);
    expect(isAvatarProviderUnavailable(503, { code: 'CONFIRMATION_INTERRUPTED' })).toBe(false);
    expect(isAvatarProviderUnavailable(500, { code: 'GENERATION_FAILED', error: 'Could not store your avatar. No avatar credit was charged.' })).toBe(false);
    expect(isAvatarProviderUnavailable(200, { url: 'https://example.com/a.png' } as never)).toBe(false);
  });

  it('uses the same friendly text as the server, with no provider details', () => {
    expect(AVATAR_SERVICE_BREAK_MESSAGE).toBe(SERVER_MESSAGE);
    expect(AVATAR_SERVICE_BREAK_MESSAGE).not.toMatch(/openai|billing/i);
  });
});
