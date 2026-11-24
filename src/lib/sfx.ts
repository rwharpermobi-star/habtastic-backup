// ============================================================================
// HabTastic AI — unified sound system
//
// Design goals
//  • Zero external audio files → instant, tiny bundle, no CDN latency
//  • Every event is a short (<1s), soft, tuneful phrase in the same key
//    family so the app feels like one instrument
//  • Master volume + on/off + haptics toggle, all persisted
//  • Respect prefers-reduced-motion & the device silent path via user opt-out
//  • Signature "HabTastic" identity: bright bell/marimba timbres, cheerful
//    major intervals, gentle envelope — friendly, motivating, premium
// ============================================================================

const AudioCtx =
  typeof AudioContext !== "undefined"
    ? AudioContext
    : typeof (window as any).webkitAudioContext !== "undefined"
      ? (window as any).webkitAudioContext
      : null;

// ---------------------------------------------------------------- persistence
const SFX_ENABLED_KEY  = "fm-sfx-enabled";
const SFX_VOLUME_KEY   = "fm-sfx-volume";       // 0..1
const HAPTICS_KEY      = "fm-haptics-enabled";

export function isSfxEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SFX_ENABLED_KEY) !== "false";
}
export function setSfxEnabled(enabled: boolean) {
  localStorage.setItem(SFX_ENABLED_KEY, String(enabled));
}

export function getSfxVolume(): number {
  if (typeof window === "undefined") return 0.7;
  const raw = localStorage.getItem(SFX_VOLUME_KEY);
  if (!raw) return 0.7;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.7;
}
export function setSfxVolume(v: number) {
  const clamped = Math.min(1, Math.max(0, v));
  localStorage.setItem(SFX_VOLUME_KEY, String(clamped));
}

export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(HAPTICS_KEY) !== "false";
}
export function setHapticsEnabled(enabled: boolean) {
  localStorage.setItem(HAPTICS_KEY, String(enabled));
}

// ---------------------------------------------------------------- audio graph
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;

function getCtx(): AudioContext | null {
  if (!AudioCtx) return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioCtx();
    // gentle limiter so no single event can spike
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    masterGain = ctx.createGain();
    masterGain.gain.value = getSfxVolume();

    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  if (masterGain) masterGain.gain.value = getSfxVolume();
  return ctx;
}

/** Public: refresh the live master gain after a settings change. */
export function refreshVolume() {
  if (masterGain) masterGain.gain.value = getSfxVolume();
}

// ---------------------------------------------------------------- primitives
type ToneOpts = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;         // seconds
  attack?: number;        // seconds
  sweepTo?: number;       // Hz, linear ramp
  detune?: number;        // cents
};

function tone(o: ToneOpts) {
  if (!isSfxEnabled()) return;
  const c = getCtx();
  if (!c || !masterGain) return;

  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.sweepTo) osc.frequency.linearRampToValueAtTime(o.sweepTo, t0 + o.duration);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

  const peak    = o.vol ?? 0.12;
  const attack  = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);

  osc.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + o.duration + 0.02);
}

/** Layered soft-noise "sparkle" burst for celebratory events */
function sparkle(delay = 0, duration = 0.18, vol = 0.05) {
  if (!isSfxEnabled()) return;
  const c = getCtx();
  if (!c || !masterGain) return;
  const t0 = c.currentTime + delay;
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // brighter high-passed noise
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(hp); hp.connect(g); g.connect(masterGain);
  src.start(t0); src.stop(t0 + duration + 0.02);
}

// ============================================================================
// PUBLIC EVENT SOUNDS  (all < 1s, tuned in C major family)
// ============================================================================

// ---- UI micro-feedback ------------------------------------------------------

/** Soft tap for button presses. Ultra-short. */
export function playTap() {
  tone({ freq: 680, duration: 0.06, type: "sine", vol: 0.045, attack: 0.002 });
}

/** Toggle click — used for switches / chips */
export function playToggle(on = true) {
  tone({ freq: on ? 720 : 520, duration: 0.07, type: "triangle", vol: 0.05 });
}

/** Tab / navigation whoosh */
export function playNavigate() {
  tone({ freq: 460, sweepTo: 260, duration: 0.14, type: "sine", vol: 0.06 });
}

/** Gentle "save successful" confirm */
export function playSuccess() {
  tone({ freq: 659.25, duration: 0.10, type: "sine", vol: 0.08 });               // E5
  tone({ freq: 987.77, duration: 0.16, type: "triangle", vol: 0.07, delay: 0.07 }); // B5
}

/** Soft error — descending minor third, never harsh */
export function playError() {
  tone({ freq: 440, duration: 0.10, type: "sine", vol: 0.07 });
  tone({ freq: 349.23, duration: 0.18, type: "sine", vol: 0.08, delay: 0.08 });
}

/** Notification blip — used for toasts / generic pings */
export function playNotification() {
  tone({ freq: 880, duration: 0.10, type: "triangle", vol: 0.06 });
  tone({ freq: 1174.66, duration: 0.14, type: "sine",  vol: 0.05, delay: 0.06 });
}

// ---- Progress + rewards -----------------------------------------------------

/** Cheerful three-note chime for habit completion — signature sound */
export function playHabitComplete() {
  tone({ freq: 523.25, duration: 0.14, type: "sine", vol: 0.10 });                  // C5
  tone({ freq: 659.25, duration: 0.18, type: "sine", vol: 0.10, delay: 0.10 });     // E5
  tone({ freq: 783.99, duration: 0.24, type: "triangle", vol: 0.09, delay: 0.22 }); // G5
  sparkle(0.24, 0.16, 0.03);
}

/** XP shimmer — fast rising sparkle */
export function playXPEarned() {
  tone({ freq: 880,     duration: 0.08, type: "sine",     vol: 0.07 });                     // A5
  tone({ freq: 1108.73, duration: 0.08, type: "sine",     vol: 0.05, delay: 0.06 });        // C#6
  tone({ freq: 1318.51, duration: 0.10, type: "triangle", vol: 0.05, delay: 0.14 });        // E6
  sparkle(0.10, 0.12, 0.025);
}

/** Coin drop — bright metallic tick */
export function playCoinDrop() {
  tone({ freq: 1200, duration: 0.06, type: "sine",     vol: 0.07 });
  tone({ freq: 1600, duration: 0.06, type: "sine",     vol: 0.05, delay: 0.05 });
  tone({ freq: 2000, duration: 0.10, type: "triangle", vol: 0.045, delay: 0.10 });
}

/** Multi-coin cascade — used when a chunk of coins is awarded */
export function playCoinCascade() {
  for (let i = 0; i < 5; i++) {
    tone({ freq: 900 + i * 220, duration: 0.08, type: "triangle", vol: 0.045, delay: i * 0.055 });
  }
}

// ---- Milestone celebrations -------------------------------------------------

/** Streak fanfare — pass big=true for major milestones (30/100/365) */
export function playStreakFanfare(big = false) {
  tone({ freq: 523.25, duration: 0.14, type: "sine",     vol: 0.09 });
  tone({ freq: 659.25, duration: 0.14, type: "sine",     vol: 0.09, delay: 0.10 });
  tone({ freq: 783.99, duration: 0.14, type: "sine",     vol: 0.09, delay: 0.20 });
  tone({ freq: 1046.5, duration: 0.22, type: "triangle", vol: 0.10, delay: 0.30 });
  sparkle(0.30, 0.20, 0.035);
  if (big) {
    tone({ freq: 1318.51, duration: 0.16, type: "sine",     vol: 0.08, delay: 0.42 });
    tone({ freq: 1567.98, duration: 0.30, type: "triangle", vol: 0.09, delay: 0.54 });
    sparkle(0.55, 0.30, 0.045);
  }
}

/** Level up — signature ascending flourish */
export function playLevelUp() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  notes.forEach((f, i) => {
    tone({ freq: f, duration: 0.14, type: i > 2 ? "triangle" : "sine", vol: 0.09, delay: i * 0.07 });
  });
  tone({ freq: 2093, duration: 0.34, type: "sine", vol: 0.08, delay: notes.length * 0.07 });
  sparkle(0.30, 0.28, 0.045);
}

/** Achievement / badge unlock — regal chord swell */
export function playAchievement() {
  // Cmaj chord stack
  tone({ freq: 523.25, duration: 0.28, type: "triangle", vol: 0.07 });
  tone({ freq: 659.25, duration: 0.28, type: "triangle", vol: 0.07 });
  tone({ freq: 783.99, duration: 0.32, type: "sine",     vol: 0.08 });
  // Sparkle tail
  sparkle(0.18, 0.30, 0.05);
  tone({ freq: 1567.98, duration: 0.22, type: "sine",    vol: 0.06, delay: 0.18 });
}

/** Daily Reward Chest open — dramatic reveal */
export function playChestOpen() {
  // Wood-creak sweep
  tone({ freq: 180, sweepTo: 320, duration: 0.30, type: "sawtooth", vol: 0.045 });
  // Chime reveal
  tone({ freq: 783.99,  duration: 0.20, type: "triangle", vol: 0.09, delay: 0.28 });
  tone({ freq: 987.77,  duration: 0.22, type: "sine",     vol: 0.09, delay: 0.36 });
  tone({ freq: 1318.51, duration: 0.30, type: "triangle", vol: 0.08, delay: 0.46 });
  sparkle(0.30, 0.40, 0.06);
}

/** Challenge complete — victorious two-chord resolve */
export function playChallengeComplete() {
  // G → C resolution
  tone({ freq: 587.33, duration: 0.16, type: "triangle", vol: 0.08 });               // D5
  tone({ freq: 783.99, duration: 0.16, type: "triangle", vol: 0.08 });               // G5
  tone({ freq: 523.25, duration: 0.24, type: "sine",     vol: 0.09, delay: 0.16 });  // C5
  tone({ freq: 659.25, duration: 0.24, type: "sine",     vol: 0.09, delay: 0.16 });  // E5
  tone({ freq: 987.77, duration: 0.28, type: "triangle", vol: 0.08, delay: 0.20 });  // B5
  sparkle(0.22, 0.24, 0.04);
}

/** Premium purchase — luxurious gold shimmer */
export function playPremiumPurchase() {
  tone({ freq: 659.25,  duration: 0.16, type: "sine",     vol: 0.09 });
  tone({ freq: 987.77,  duration: 0.18, type: "sine",     vol: 0.09, delay: 0.10 });
  tone({ freq: 1318.51, duration: 0.22, type: "triangle", vol: 0.08, delay: 0.22 });
  tone({ freq: 1975.53, duration: 0.30, type: "sine",     vol: 0.07, delay: 0.38 });
  sparkle(0.10, 0.55, 0.05);
  sparkle(0.35, 0.35, 0.04);
}

// ---- Winston ---------------------------------------------------------------

/** Winston message ping — friendly two-note "hey" motif */
export function playWinstonMessage() {
  tone({ freq: 659.25, duration: 0.10, type: "triangle", vol: 0.07 });               // E5
  tone({ freq: 880,    duration: 0.16, type: "sine",     vol: 0.07, delay: 0.08 }); // A5
}

/** Winston challenge nudge — same motif, extra rising sparkle */
export function playWinstonChallenge() {
  tone({ freq: 659.25,  duration: 0.10, type: "triangle", vol: 0.07 });
  tone({ freq: 880,     duration: 0.12, type: "sine",     vol: 0.07, delay: 0.08 });
  tone({ freq: 1174.66, duration: 0.18, type: "triangle", vol: 0.07, delay: 0.20 });
  sparkle(0.22, 0.16, 0.03);
}

// ---- Utility ---------------------------------------------------------------

/** Emergency-style siren — kept for Hard habit "Siren Mode" reminders. */
export function playSirenLoop(durationMs = 4000): () => void {
  if (!isSfxEnabled()) return () => {};
  const c = getCtx();
  if (!c || !masterGain) return () => {};
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  const start = c.currentTime;
  const end   = start + durationMs / 1000;
  const sweep = 0.5;
  for (let t = start; t < end; t += sweep) {
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(1100, t + sweep / 2);
    osc.frequency.linearRampToValueAtTime(600, t + sweep);
  }
  gain.gain.setValueAtTime(0.18, start);
  gain.gain.setValueAtTime(0.18, end - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(start); osc.stop(end);
  return () => { try { osc.stop(); } catch { /* noop */ } };
}

/** Preview helper — used by the Sound Settings screen "Test" buttons. */
export function playPreview(kind:
  | "tap" | "success" | "error" | "notification" | "navigate" | "toggle"
  | "habit" | "xp" | "coin" | "coinCascade"
  | "streak" | "streakBig" | "levelUp" | "achievement"
  | "chest" | "challenge" | "premium"
  | "winston" | "winstonChallenge") {
  const map: Record<string, () => void> = {
    tap: playTap, success: playSuccess, error: playError, notification: playNotification,
    navigate: playNavigate, toggle: () => playToggle(true),
    habit: playHabitComplete, xp: playXPEarned, coin: playCoinDrop, coinCascade: playCoinCascade,
    streak: () => playStreakFanfare(false), streakBig: () => playStreakFanfare(true),
    levelUp: playLevelUp, achievement: playAchievement,
    chest: playChestOpen, challenge: playChallengeComplete, premium: playPremiumPurchase,
    winston: playWinstonMessage, winstonChallenge: playWinstonChallenge,
  };
  map[kind]?.();
}
