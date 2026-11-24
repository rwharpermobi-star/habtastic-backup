import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRESET_AVATARS, PRESET_GROUPS, PRESET_AGES, presetsForAge, isPresetAvatarUrl } from '../../../supabase/functions/generate-avatar/presets';
import { buildSpecification, buildPrompt, parsePreferences } from '../../../supabase/functions/generate-avatar/specification';

describe('Bundled preset avatars', () => {
  it('has 60 unique avatars', () => {
    expect(PRESET_AVATARS).toHaveLength(60);
    expect(new Set(PRESET_AVATARS.map(p => p.id)).size).toBe(60);
  });
  it('has 12 per group with 2 male and 2 female in each age band', () => {
    for (const group of PRESET_GROUPS) {
      expect(PRESET_AVATARS.filter(p => p.group === group.key)).toHaveLength(12);
      for (const age of PRESET_AGES) {
        const band = PRESET_AVATARS.filter(p => p.group === group.key && p.age === age.key);
        expect(band.filter(p => p.gender === 'male')).toHaveLength(2);
        expect(band.filter(p => p.gender === 'female')).toHaveLength(2);
      }
    }
  });
  it('filters 20 avatars per age and 60 for all', () => {
    expect(presetsForAge('teen')).toHaveLength(20);
    expect(presetsForAge('mid')).toHaveLength(20);
    expect(presetsForAge('old')).toHaveLength(20);
    expect(presetsForAge('all')).toHaveLength(60);
  });
  it('bundles every image in the app under 100 KB', () => {
    for (const preset of PRESET_AVATARS) {
      const file = resolve(process.cwd(), 'public', preset.url.slice(1));
      expect(existsSync(file), preset.url).toBe(true);
      expect(statSync(file).size).toBeLessThan(100 * 1024);
    }
  });
  it('only treats catalog paths as presets', () => {
    expect(isPresetAvatarUrl('/avatars/presets/black-teen-m1.webp')).toBe(true);
    expect(isPresetAvatarUrl('/avatars/presets/unknown.webp')).toBe(false);
    expect(isPresetAvatarUrl(null)).toBe(false);
  });
});

describe('AI avatar style', () => {
  it('never asks for scars, even for adults', () => {
    for (let i = 0; i < 20; i++) {
      const spec = buildSpecification(parsePreferences({ gender: 'Male', ageRange: 'Mature', style: 'Bold & Edgy' }), 'Male', null, () => i / 20);
      expect(spec.skinDetail).not.toMatch(/scar/);
    }
  });
  it('uses the 3D Pixar-style funky look', () => {
    const prompt = buildPrompt(buildSpecification(parsePreferences({}), 'Female'));
    expect(prompt).toContain('3D Pixar-style');
    expect(prompt).toContain('Never draw scars');
  });
});
