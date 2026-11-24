// Bundled preset avatar catalog. Images ship inside the app (public/avatars/presets)
// so they never use Supabase storage or bandwidth. The stored profile value is the
// stable relative path, which resolves locally on web and inside the Android app.

export const PRESET_GROUPS = [
  { key: 'black', label: 'Black African' },
  { key: 'white', label: 'White' },
  { key: 'coloured', label: 'Coloured / mixed race' },
  { key: 'asian', label: 'East Asian' },
  { key: 'indian', label: 'Indian' },
] as const;

export const PRESET_AGES = [
  { key: 'teen', label: 'Teen' },
  { key: 'mid', label: 'Middle-aged' },
  { key: 'old', label: 'Older' },
] as const;

export const PRESET_SLOTS = ['m1', 'm2', 'f1', 'f2'] as const;

export type PresetAgeKey = typeof PRESET_AGES[number]['key'];
export type PresetAvatar = {
  id: string;
  url: string;
  group: typeof PRESET_GROUPS[number]['key'];
  age: PresetAgeKey;
  gender: 'male' | 'female';
  label: string;
};

export const PRESET_PATH_PREFIX = '/avatars/presets/';

export const PRESET_AVATARS: readonly PresetAvatar[] = PRESET_GROUPS.flatMap(group =>
  PRESET_AGES.flatMap(age =>
    PRESET_SLOTS.map((slot, index) => {
      const id = `${group.key}-${age.key}-${slot}`;
      const gender = slot.startsWith('m') ? 'male' : 'female';
      return {
        id,
        url: `${PRESET_PATH_PREFIX}${id}.webp`,
        group: group.key,
        age: age.key,
        gender,
        label: `${group.label} ${age.label.toLowerCase()} ${gender} avatar ${(index % 2) + 1}`,
      } as PresetAvatar;
    }),
  ),
);

export function presetsForAge(age: PresetAgeKey | 'all'): PresetAvatar[] {
  return PRESET_AVATARS.filter(preset => age === 'all' || preset.age === age);
}

export function isPresetAvatarUrl(url: string | null | undefined): boolean {
  return !!url && PRESET_AVATARS.some(preset => preset.url === url);
}
