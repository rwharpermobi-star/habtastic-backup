// Per-user defaults for habit reminder sounds.
// Stored in localStorage; per-habit value (DB column `sound_mode`) overrides this.

export type SoundMode = 'normal' | 'siren';

const KEY_DEFAULT_HARD = 'fm-hard-default-sound-mode';

export function getDefaultHardSoundMode(): SoundMode {
  try {
    const v = localStorage.getItem(KEY_DEFAULT_HARD);
    return v === 'siren' ? 'siren' : 'normal';
  } catch {
    return 'normal';
  }
}

export function setDefaultHardSoundMode(mode: SoundMode) {
  try { localStorage.setItem(KEY_DEFAULT_HARD, mode); } catch { /* noop */ }
}

/** Resolve which sound a habit should fire with, given its column value & difficulty. */
export function resolveSoundMode(
  difficulty: string,
  habitSoundMode: string | null | undefined,
): SoundMode {
  if (habitSoundMode === 'siren') return 'siren';
  if (habitSoundMode === 'normal') return 'normal';
  // Unset → fall back to user default (only meaningful for hard habits)
  if (difficulty === 'hard') return getDefaultHardSoundMode();
  return 'normal';
}
