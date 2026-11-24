export interface WellnessSession {
  id: string;
  title: string;
  description: string;
  duration: number; // minutes
  category: 'meditation' | 'yoga' | 'breathing';
  emoji: string;
  gradient: string;
}

export const WELLNESS_SESSIONS: WellnessSession[] = [
  { id: '1', title: 'Morning Calm', description: 'Start your day with peaceful mindfulness', duration: 5, category: 'meditation', emoji: '🧘', gradient: 'from-[#1E88E5] to-[#64B5F6]' },
  { id: '2', title: 'Deep Focus', description: 'Clear your mind for deep concentration', duration: 10, category: 'meditation', emoji: '🎯', gradient: 'from-[#7C4DFF] to-[#B388FF]' },
  { id: '3', title: 'Stress Relief', description: 'Release tension and find inner peace', duration: 15, category: 'meditation', emoji: '🌊', gradient: 'from-[#00BCD4] to-[#80DEEA]' },
  { id: '4', title: 'Sleep Well', description: 'Wind down for a restful night', duration: 20, category: 'meditation', emoji: '🌙', gradient: 'from-[#5C6BC0] to-[#9FA8DA]' },
  { id: '5', title: 'Sun Salutation', description: 'Energizing morning yoga flow', duration: 10, category: 'yoga', emoji: '☀️', gradient: 'from-[#FF6D00] to-[#FFB74D]' },
  { id: '6', title: 'Gentle Stretch', description: 'Easy stretches for flexibility', duration: 15, category: 'yoga', emoji: '🌿', gradient: 'from-[#43A047] to-[#81C784]' },
  { id: '7', title: 'Power Flow', description: 'Build strength and balance', duration: 20, category: 'yoga', emoji: '💪', gradient: 'from-[#E53935] to-[#EF9A9A]' },
  { id: '8', title: 'Box Breathing', description: '4-4-4-4 breathing for calm', duration: 3, category: 'breathing', emoji: '🫁', gradient: 'from-[#A3E635] to-[#D4FC79]' },
  { id: '9', title: '4-7-8 Relaxation', description: 'Deep relaxation breathing technique', duration: 5, category: 'breathing', emoji: '💨', gradient: 'from-[#26C6DA] to-[#80DEEA]' },
  { id: '10', title: 'Wim Hof Method', description: 'Energizing breathwork for vitality', duration: 10, category: 'breathing', emoji: '🔥', gradient: 'from-[#FF6D00] to-[#FFAB40]' },
];

export const WELLNESS_STATE_KEY = 'wellness-session-state-v1';

export interface PersistedWellnessState {
  sessionId: string;
  remaining: number; // seconds
  playing: boolean;
  savedAt: number; // ms
}

export function saveWellnessState(s: PersistedWellnessState | null) {
  try {
    if (!s) localStorage.removeItem(WELLNESS_STATE_KEY);
    else localStorage.setItem(WELLNESS_STATE_KEY, JSON.stringify(s));
  } catch { /* ignore: best effort */ }
}

export function loadWellnessState(): PersistedWellnessState | null {
  try {
    const raw = localStorage.getItem(WELLNESS_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWellnessState;
    if (!parsed?.sessionId || typeof parsed.remaining !== 'number') return null;
    // If it was playing, decay remaining by elapsed wall-clock time
    if (parsed.playing && parsed.savedAt) {
      const elapsed = Math.floor((Date.now() - parsed.savedAt) / 1000);
      parsed.remaining = Math.max(0, parsed.remaining - elapsed);
    }
    if (parsed.remaining <= 0) {
      localStorage.removeItem(WELLNESS_STATE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ---------- Session history ----------
export const WELLNESS_HISTORY_KEY = 'wellness-session-history-v1';

export type WellnessFeeling = 'great' | 'good' | 'okay' | 'meh';

export interface WellnessHistoryEntry {
  id: string; // unique entry id
  sessionId: string;
  title: string;
  emoji: string;
  category: WellnessSession['category'];
  duration: number; // minutes
  completedAt: number; // ms
  feeling?: WellnessFeeling;
  note?: string;
}

export function loadWellnessHistory(): WellnessHistoryEntry[] {
  try {
    const raw = localStorage.getItem(WELLNESS_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendWellnessHistory(entry: WellnessHistoryEntry) {
  try {
    const list = loadWellnessHistory();
    list.unshift(entry);
    localStorage.setItem(WELLNESS_HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
  } catch { /* ignore: best effort */ }
}

export function updateWellnessHistoryEntry(
  id: string,
  patch: Partial<Pick<WellnessHistoryEntry, 'feeling' | 'note'>>
) {
  try {
    const list = loadWellnessHistory();
    const next = list.map((e) => (e.id === id ? { ...e, ...patch } : e));
    localStorage.setItem(WELLNESS_HISTORY_KEY, JSON.stringify(next));
  } catch { /* ignore: best effort */ }
}

export function getNextSuggestion(currentId: string): WellnessSession {
  const cur = WELLNESS_SESSIONS.find((s) => s.id === currentId);
  if (cur) {
    const sameCat = WELLNESS_SESSIONS.find((s) => s.id !== currentId && s.category === cur.category);
    if (sameCat) return sameCat;
  }
  return WELLNESS_SESSIONS.find((s) => s.id !== currentId) ?? WELLNESS_SESSIONS[0];
}
