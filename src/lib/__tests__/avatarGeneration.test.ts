import { describe, it, expect, vi } from 'vitest';
import { AVATAR_STYLES, buildSpecification, buildPrompt, parsePreferences, FREE_AVATAR_LIMIT, PREMIUM_AVATAR_LIMIT, HAIR_STYLES } from '../../../supabase/functions/generate-avatar/specification';
import { AVATAR_SERVICE_BREAK_MESSAGE, generateAvatar } from '../../../supabase/functions/generate-avatar/generation';

const request = { gender: 'Male', ageRange: 'Teen', style: 'Punk & Rebellious', requestId: '11111111-1111-4111-8111-111111111111' };
function setup(options: { failed?: boolean; empty?: boolean; replay?: boolean; uploadFailed?: boolean } = {}) {
  let credits = 0;
  let result;
  const rpc = vi.fn(async (name: string, args) => {
    if (name === 'begin_avatar_generation') return { data: result ? { ...result, replayed: true } : { allowed: true, gender: args._preferences.gender, creditsLimit: 3 } };
    if (args._success) { credits += 1; result = { ...args._result, creditsUsed: credits }; }
    return { data: args._success ? result : args._result };
  });
  const bytes = new Uint8Array(40); bytes.set([137,80,78,71,13,10,26,10]);
  const image = `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
  const fetchGateway = vi.fn(async () => new Response(JSON.stringify(options.failed ? { error: { message: 'Provider refused' } } : { data: options.empty ? [] : [{ b64_json: image.slice('data:image/png;base64,'.length) }] }), { status: options.failed ? 403 : 200 }));
  const storage = { upload: vi.fn(async () => ({ error: options.uploadFailed ? new Error('storage failed') : null })), createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.com/storage/v1/object/sign/avatars/test.png' } })), remove: vi.fn(async () => ({})) };
  return { dependencies: { admin: { rpc, storage: { from: () => storage } }, fetchGateway: fetchGateway as typeof fetch, apiKey: 'test-placeholder' }, rpc, fetchGateway, credits: () => credits };
}

describe('Avatar specification rules', () => {
  it('preserves explicit gender and age for every real preset', () => {
    for (const style of Object.keys(AVATAR_STYLES)) {
      const preferences = parsePreferences({ gender: 'Female', ageRange: '30s-40s', style });
      const specification = buildSpecification(preferences, 'Female');
      expect(specification.gender).toBe('Female'); expect(specification.ageRange).toBe('30s-40s');
      expect(specification.clothing).toBe(AVATAR_STYLES[preferences.style]);
      expect(buildPrompt(specification)).toContain(JSON.stringify(specification));
    }
  });
  it('retains 3 free and 30 premium avatar credits', () => { expect(FREE_AVATAR_LIMIT).toBe(3); expect(PREMIUM_AVATAR_LIMIT).toBe(30); });
  it('uses balanced server default selection rather than defaulting to female', () => { expect(parsePreferences({}).gender).toBe('Surprise me'); });
  it('regeneration avoids immediately repeated independent features', () => {
    const preferences = parsePreferences(request);
    const first = buildSpecification(preferences, 'Male', null, () => 0);
    const next = buildSpecification(preferences, 'Male', first, () => 0);
    for (const key of ['headProportions','faceShape','skinTone','hairstyle','eyes','accessory','background']) expect(next[key]).not.toBe(first[key]);
    expect(next.gender).toBe('Male'); expect(next.style).toBe('Punk & Rebellious'); expect(next.ageRange).toBe('Teen');
  });
  it('keeps teens age appropriate', () => {
    const specification = buildSpecification(parsePreferences(request), 'Male', null, () => 0.99);
    expect(specification.facialHair).toBe('clean-shaven'); expect(specification.skinDetail).not.toMatch(/tattoo|scar/);
  });
  it('supports the requested unrestricted hair silhouettes', () => { for (const silhouette of ['mohawk','liberty spikes','mullet','afro','locs','cornrows','bald head']) expect(HAIR_STYLES.some(hair => hair.includes(silhouette))).toBe(true); });
  it('rejects invalid preferences', () => { expect(() => parsePreferences({ gender: 'invalid' })).toThrow(); });
});

describe('Success-only avatar accounting', () => {
  it('passes actual age/gender/style specification to the provider and charges once on replay', async () => {
    const mock = setup();
    const response = await generateAvatar('user', request, mock.dependencies);
    expect(response.status).toBe(200); expect(response.payload.url).toContain('https://'); expect(mock.credits()).toBe(1);
    const gatewayCalls = mock.fetchGateway.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const body = JSON.parse(String(gatewayCalls[0]?.[1]?.body ?? '{}'));
    const prompt = String(body.prompt ?? '');
    expect(prompt).toContain('Punk & Rebellious'); expect(prompt).toContain('Teen'); expect(prompt).toContain('Male');
    await generateAvatar('user', request, mock.dependencies);
    expect(mock.fetchGateway).toHaveBeenCalledTimes(1); expect(mock.credits()).toBe(1);
  });
  it.each([{ failed: true }, { empty: true }, { uploadFailed: true }])('does not deduct on generation/storage failure %j', async options => {
    const mock = setup(options); const response = await generateAvatar('user', request, mock.dependencies);
    expect(response.status).toBeGreaterThanOrEqual(400); expect(mock.credits()).toBe(0);
    expect(mock.rpc.mock.calls.filter(([name,args]) => name === 'finish_avatar_generation' && args._success)).toHaveLength(0);
  });
  it.each([
    [429, {}, 'RATE_LIMITED'],
    [402, {}, 'PROVIDER_BILLING_REQUIRED'],
    [401, {}, 'API_KEY_INVALID'],
    [403, {}, 'SERVICE_PAUSED'],
    [400, { code: 'billing_hard_limit_reached' }, 'PROVIDER_BILLING_REQUIRED'],
    [429, { code: 'insufficient_quota' }, 'RATE_LIMITED'],
  ])('never tells users about OpenAI billing (HTTP %i %j)', async (status, providerError, code) => {
    const mock = setup();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mock.fetchGateway.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details.', ...providerError } }), { status }));
    const response = await generateAvatar('user', request, mock.dependencies);
    errorLog.mockRestore();
    expect(response.status).toBe(status);
    expect(response.payload.code).toBe(code);
    expect(response.payload.error).toBe(AVATAR_SERVICE_BREAK_MESSAGE);
    expect(response.payload.error).not.toMatch(/openai|billing|api key/i);
    expect(mock.credits()).toBe(0);
  });
  it('does not pass raw provider messages to users on other failures', async () => {
    const mock = setup();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mock.fetchGateway.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Invalid OpenAI request parameter' } }), { status: 400 }));
    const response = await generateAvatar('user', request, mock.dependencies);
    errorLog.mockRestore();
    expect(response.payload.code).toBe('GENERATION_FAILED');
    expect(response.payload.error).not.toMatch(/openai/i);
    expect(response.payload.error).toContain('credits have not been used');
  });
  it('blocks overlapping requests before calling the provider', async () => {
    const mock = setup(); mock.rpc.mockResolvedValueOnce({ data: { code: 'IN_PROGRESS' } });
    expect((await generateAvatar('user', request, mock.dependencies)).status).toBe(409); expect(mock.fetchGateway).not.toHaveBeenCalled();
  });
});