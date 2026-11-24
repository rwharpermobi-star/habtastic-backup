import { buildPrompt, buildSpecification, parsePreferences, type AvatarSpecification } from './specification.ts';

export const AVATAR_MODEL = 'gpt-image-2';
export const AVATAR_ENDPOINT = 'https://api.openai.com/v1/images/generations';

// Shown to users whenever the provider is out of credit, rate limited, needs
// billing or rejects the key. Never mention the provider or its billing.
export const AVATAR_SERVICE_BREAK_MESSAGE = 'AI avatars are taking a break right now. Pick one of the 60 avatars instead — no credits were used.';
const GENERIC_FAILURE_MESSAGE = 'Avatar generation is unavailable right now. Your HabTastic avatar credits have not been used.';
// OpenAI reports an exhausted balance or hard spend limit with these codes,
// sometimes on a 400 rather than a 429/402.
const PROVIDER_BILLING_CODES = new Set(['insufficient_quota', 'billing_hard_limit_reached', 'billing_not_active']);

export function decodeImage(image: unknown): { bytes: Uint8Array; contentType: string; extension: string } {
  if (typeof image !== 'string') throw new Error('The AI service did not return an image. No avatar credit was charged.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match || !match[2] || match[2].length > 20 * 1024 * 1024) throw new Error('The AI service returned an invalid image. No avatar credit was charged.');
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  const type = match[1];
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (bytes.length < 32 || !(type === 'png' && png || type === 'jpeg' && jpeg || type === 'webp' && webp)) throw new Error('The AI service returned invalid image bytes. No avatar credit was charged.');
  return { bytes, contentType: `image/${type}`, extension: type === 'jpeg' ? 'jpg' : type ?? 'png' };
}

export function extractImage(data: any): unknown {
  const image = data.data?.[0];
  if (typeof image?.b64_json === 'string') return `data:image/png;base64,${image.b64_json}`;
  if (typeof image?.url === 'string') return image.url;
  return undefined;
}

type Dependencies = { admin: any; fetchGateway: typeof fetch; apiKey: string };

export async function generateAvatar(userId: string, body: unknown, dependencies: Dependencies): Promise<{ status: number; payload: any }> {
  let preferences;
  let requestId: string;
  try {
    preferences = parsePreferences(body);
    const suppliedId = (body as Record<string, unknown>).requestId;
    if (suppliedId !== undefined && (typeof suppliedId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suppliedId))) throw new Error('Invalid request ID');
    requestId = typeof suppliedId === 'string' ? suppliedId : crypto.randomUUID();
  } catch (error) {
    return { status: 400, payload: { error: error instanceof Error ? error.message : 'Invalid avatar preferences' } };
  }
  const { admin } = dependencies;
  const { data: start, error: startError } = await admin.rpc('begin_avatar_generation', { _user_id: userId, _request_id: requestId, _preferences: preferences });
  if (startError || !start) return { status: 500, payload: { error: 'Could not check avatar credits. No avatar credit was charged.' } };
  if (start.allowed !== true) return { status: start.status ?? (start.url ? 200 : start.code === 'DAILY_LIMIT_REACHED' ? 200 : 409), payload: start };
  const specification = buildSpecification(preferences, start.gender, start.previousSpecification as AvatarSpecification | null);
  const finish = async (success: boolean, result: any, blocked = false) => admin.rpc('finish_avatar_generation', {
    _user_id: userId, _request_id: requestId, _success: success, _specification: specification, _result: result, _blocked: blocked,
  });
  let path: string | undefined;
  // Once final accounting is attempted, a lost database response is ambiguous.
  // Never delete the stored image or retry generation in that state.
  let accountingAttempted = false;
  try {
    const response = await dependencies.fetchGateway(AVATAR_ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${dependencies.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: AVATAR_MODEL, prompt: buildPrompt(specification), size: '1024x1024', quality: 'medium', output_format: 'png', n: 1 }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const status = response.ok ? 400 : response.status;
      const providerMessage = typeof data.error?.message === 'string' ? data.error.message : typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : '';
      const providerCode = typeof data.error?.code === 'string' ? data.error.code : typeof data.error?.type === 'string' ? data.error.type : '';
      // Provider details (key, billing, limits) are for operators only: log them, never return them.
      console.error('[generate-avatar] provider error', { status, code: providerCode, message: providerMessage });
      // A provider-side 402 means the AI gateway's own balance/quota is empty,
      // not that this user has spent their Habtastic avatar credits. Never store
      // it as a global block or tell users their personal credits are exhausted.
      const blocked = status === 403 || status === 404;
      const billing = status === 402 || PROVIDER_BILLING_CODES.has(providerCode);
      const code = blocked ? 'SERVICE_PAUSED' : status === 429 ? 'RATE_LIMITED' : billing ? 'PROVIDER_BILLING_REQUIRED' : status === 401 ? 'API_KEY_INVALID' : 'GENERATION_FAILED';
      const payload = { error: code === 'GENERATION_FAILED' ? GENERIC_FAILURE_MESSAGE : AVATAR_SERVICE_BREAK_MESSAGE, code, status };
      const { error } = await finish(false, payload, blocked);
      if (error) throw new Error('Could not record the failed generation. Please do not retry automatically.');
      return { status, payload };
    }
    const image = decodeImage(extractImage(data));
    path = `${userId}/ai-avatar-${requestId}.${image.extension}`;
    const bucket = admin.storage.from('avatars');
    const { error: uploadError } = await bucket.upload(path, image.bytes, { contentType: image.contentType, upsert: false });
    if (uploadError) throw new Error('Could not store your avatar. No avatar credit was charged.');
    const { data: signed, error: signError } = await bucket.createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signError || !signed?.signedUrl) throw new Error('Could not access your avatar. No avatar credit was charged.');
    accountingAttempted = true;
    const { data: result, error: finishError } = await finish(true, { url: signed.signedUrl, creditsLimit: start.creditsLimit, specification });
    if (finishError || !result?.url) return { status: 503, payload: { error: 'Your image was stored, but credit confirmation was interrupted. Retry this same request to recover it without generating or charging again.', code: 'CONFIRMATION_INTERRUPTED', requestId } };
    return { status: 200, payload: result };
  } catch (error) {
    if (accountingAttempted) return { status: 503, payload: { error: 'Credit confirmation was interrupted. Retry this same request to recover your avatar.', code: 'CONFIRMATION_INTERRUPTED', requestId } };
    if (path) await admin.storage.from('avatars').remove([path]).catch(() => undefined);
    const payload = { error: error instanceof Error ? error.message : 'Avatar generation failed. No avatar credit was charged.', code: 'GENERATION_FAILED' };
    await finish(false, payload);
    return { status: 500, payload };
  }
}