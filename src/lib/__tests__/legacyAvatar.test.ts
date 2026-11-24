import { describe, expect, it } from 'vitest';
import { isLegacyInstantAvatarUrl, visibleAvatarUrl } from '../legacyAvatar';
import { PRESET_AVATARS } from '../../../supabase/functions/generate-avatar/presets';

const base = 'https://votldorvfuktonwewuhm.supabase.co/storage/v1';
const uid = '3f1c2a9e-1b2c-4d5e-8f90-123456789abc';

describe('isLegacyInstantAvatarUrl', () => {
  it('matches old instant avatars saved as signed SVG or PNG URLs', () => {
    expect(isLegacyInstantAvatarUrl(`${base}/object/sign/avatars/${uid}/instant-avatar-0b5e7c1d-1111-2222-3333-444455556666.svg?token=abc.def`)).toBe(true);
    expect(isLegacyInstantAvatarUrl(`${base}/object/sign/avatars/${uid}/instant-avatar-0b5e7c1d-1111-2222-3333-444455556666.png?token=abc`)).toBe(true);
    expect(isLegacyInstantAvatarUrl(`${base}/object/public/avatars/${uid}/instant-avatar-abc.svg`)).toBe(true);
    expect(isLegacyInstantAvatarUrl(`${base}/render/image/sign/avatars/${uid}/instant-avatar-abc.png?token=x&width=96`)).toBe(true);
    expect(isLegacyInstantAvatarUrl(`avatars/${uid}/instant-avatar-abc.svg`)).toBe(true);
    expect(isLegacyInstantAvatarUrl(`${base}/object/sign/avatars%2F${uid}%2Finstant-avatar-abc.svg?token=x`)).toBe(true);
  });

  it('matches the old DiceBear cartoon avatars', () => {
    expect(isLegacyInstantAvatarUrl('https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4')).toBe(true);
  });

  it('never matches the 60 3D presets', () => {
    expect(PRESET_AVATARS).toHaveLength(60);
    for (const preset of PRESET_AVATARS) expect(isLegacyInstantAvatarUrl(preset.url)).toBe(false);
  });

  it('never matches uploaded photos, AI avatars or other images', () => {
    expect(isLegacyInstantAvatarUrl(`${base}/object/sign/avatars/${uid}/1731990000000.jpg?token=abc`)).toBe(false);
    expect(isLegacyInstantAvatarUrl(`${base}/object/sign/avatars/${uid}/1731990000000.png?token=abc`)).toBe(false);
    expect(isLegacyInstantAvatarUrl(`${base}/object/sign/avatars/${uid}/ai-1731990000000.png?token=abc`)).toBe(false);
    expect(isLegacyInstantAvatarUrl(`${base}/object/sign/avatars/${uid}/my-instant-avatar.jpg?token=abc`)).toBe(false);
    expect(isLegacyInstantAvatarUrl('https://lh3.googleusercontent.com/a/photo=s96-c')).toBe(false);
    expect(isLegacyInstantAvatarUrl('https://example.com/instant-avatar-abc.svg')).toBe(false);
    expect(isLegacyInstantAvatarUrl(null)).toBe(false);
    expect(isLegacyInstantAvatarUrl(undefined)).toBe(false);
    expect(isLegacyInstantAvatarUrl('')).toBe(false);
  });
});

describe('visibleAvatarUrl', () => {
  it('hides old 2D avatars and keeps everything else', () => {
    expect(visibleAvatarUrl(`${base}/object/sign/avatars/${uid}/instant-avatar-abc.svg?token=x`)).toBeNull();
    expect(visibleAvatarUrl('https://api.dicebear.com/9.x/avataaars/svg?seed=Max')).toBeNull();
    expect(visibleAvatarUrl(PRESET_AVATARS[0].url)).toBe(PRESET_AVATARS[0].url);
    const photo = `${base}/object/sign/avatars/${uid}/1731990000000.jpg?token=abc`;
    expect(visibleAvatarUrl(photo)).toBe(photo);
    expect(visibleAvatarUrl(null)).toBeNull();
  });
});
