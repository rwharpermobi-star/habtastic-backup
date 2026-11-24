import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { toast } from 'sonner';
import { getWinstonVoiceServiceMessage } from '@/lib/winstonServiceErrors';
import { explainPermission } from '@/lib/permissionRationale';
import { edgeFunctionFetch, getFreshAccessToken } from '@/lib/edgeFunctionFetch';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted';

const TTS_FUNCTION = 'elevenlabs-tts';

// Android WebView may not expose the browser SpeechSynthesis API at all.
// Winston uses ElevenLabs for actual voice output, so this fallback only
// prevents optional browser-TTS cleanup calls from throwing ReferenceError.
const speechSynthesis =
  typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : {
        cancel: () => undefined,
        getVoices: () => [],
        onvoiceschanged: null as ((this: SpeechSynthesis, ev: Event) => any) | null,
      };

// Available free voices
export const WINSTON_VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Winston', desc: 'Warm & conversational' },
] as const;

/** Single source of truth for Winston-related localStorage keys. Import
 *  from here everywhere that reads/writes these preferences to prevent
 *  typo-induced silent divergence between components. */
export const WINSTON_KEYS = {
  voiceId: 'winston-voice-id',
  speed: 'winston-speed',
  expressiveness: 'winston-expressiveness',
  warmth: 'winston-warmth',
  voiceEnabled: 'winston-voice-enabled',
} as const;

function getVoiceSettings() {
  const savedVoiceId = localStorage.getItem(WINSTON_KEYS.voiceId);
  const voiceId = !savedVoiceId || savedVoiceId === 'bIHbv24MWmeRgasZH58o' ? 'pNInz6obpgDQGcFmaJgB' : savedVoiceId;
  if (voiceId !== savedVoiceId) localStorage.setItem(WINSTON_KEYS.voiceId, voiceId);
  return {
    voiceId,
    speed: parseFloat(localStorage.getItem(WINSTON_KEYS.speed) || '0.95'),
    style: parseFloat(localStorage.getItem(WINSTON_KEYS.expressiveness) || '0.60'),
    stability: parseFloat(localStorage.getItem(WINSTON_KEYS.warmth) || '0.45'),
  };
}

export function useWinstonVoice() {
  const [state, setState] = useState<VoiceState>('idle');
  const [liveCaption, setLiveCaption] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [voiceServiceMessage, setVoiceServiceMessage] = useState<string | null>(null);
  const [needsUserGestureToPlay, setNeedsUserGestureToPlay] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Push-to-talk is controlled by the user's finger, not by the speech engine's
  // silence timeout. Browsers/Android WebView can end SpeechRecognition after a
  // pause even while the mic button is still being held, so we keep the logical
  // session alive and transparently restart recognition until release.
  const keepListeningRef = useRef(false);
  const stopListeningSessionRef = useRef<(() => void) | null>(null);
  const listeningSessionIdRef = useRef(0);
  const pointerHeldRef = useRef(false);

  const isNativePlatform = Capacitor.isNativePlatform();
  const supportsSTT = isNativePlatform || (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window));

  // PermissionStatus is an EventTarget. Remove the listener on unmount so
  // repeatedly opening/closing Coach doesn't accumulate callbacks in WebView.
  useEffect(() => {
    if (isNativePlatform) {
      let active = true;
      SpeechRecognition.checkPermissions().then(permission => {
        if (active) setMicPermission(permission.speechRecognition === 'prompt-with-rationale' ? 'prompt' : permission.speechRecognition);
      }).catch(() => {});
      return () => { active = false; };
    }
    if (typeof navigator === 'undefined' || !navigator.permissions) return;

    let active = true;
    let permissionStatus: PermissionStatus | null = null;
    const onPermissionChange = () => {
      if (!active || !permissionStatus) return;
      setMicPermission(permissionStatus.state as 'prompt' | 'granted' | 'denied');
    };

    navigator.permissions.query({ name: 'microphone' as PermissionName }).then(result => {
      if (!active) return;
      permissionStatus = result;
      onPermissionChange();
      result.addEventListener('change', onPermissionChange);
    }).catch(() => {});

    return () => {
      active = false;
      permissionStatus?.removeEventListener('change', onPermissionChange);
    };
  }, [isNativePlatform]);

  // Track the physical pointer globally in capture phase. Coach.tsx currently
  // calls stopListening on pointer-leave as a safety fallback; on touch that can
  // happen from a tiny finger drift even though the user is still pressing.
  // Ignore that leave while the pointer is physically down, then stop exactly
  // on pointer-up/cancel even if the thumb has moved outside the round button.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onPointerDown = () => {
      pointerHeldRef.current = true;
    };
    const onPointerRelease = () => {
      pointerHeldRef.current = false;
      if (keepListeningRef.current) {
        keepListeningRef.current = false;
        stopListeningSessionRef.current?.();
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerRelease, true);
    window.addEventListener('pointercancel', onPointerRelease, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerRelease, true);
      window.removeEventListener('pointercancel', onPointerRelease, true);
    };
  }, []);

  // Release native/WebView speech and Blob resources when Coach unmounts.
  useEffect(() => {
    return () => {
      listeningSessionIdRef.current += 1;
      pointerHeldRef.current = false;
      keepListeningRef.current = false;
      stopListeningSessionRef.current = null;
      try { recognitionRef.current?.abort?.(); } catch { /* ignore: best effort */ }
      recognitionRef.current = null;
      if (isNativePlatform) {
        SpeechRecognition.stop().catch(() => {});
        SpeechRecognition.removeAllListeners().catch(() => {});
      }
      abortRef.current?.abort();
      abortRef.current = null;
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch { /* ignore: best effort */ }
        audioRef.current.src = '';
        audioRef.current = null;
      }
      pendingAudioRef.current = null;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      speechSynthesis?.cancel?.();
    };
  }, [isNativePlatform]);

  const requestMicPermission = useCallback(async () => {
    try {
      if (isNativePlatform) {
        const existing = await SpeechRecognition.checkPermissions();
        if (existing.speechRecognition !== 'granted' && !(await explainPermission('microphone'))) return false;
        const permission = existing.speechRecognition === 'granted'
          ? existing
          : await SpeechRecognition.requestPermissions();
        const granted = permission.speechRecognition === 'granted';
        setMicPermission(granted ? 'granted' : 'denied');
        setMicError(granted ? null : 'Microphone access denied. Please allow microphone access in Android settings.');
        return granted;
      }
      const browserState = await navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((p) => p.state).catch(() => 'prompt');
      if (browserState === 'prompt' && !(await explainPermission('microphone'))) return false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicPermission('granted');
      setMicError(null);
      return true;
    } catch {
      setMicPermission('denied');
      setMicError('Microphone access denied. Please allow mic access in your browser settings.');
      return false;
    }
  }, [isNativePlatform]);

  const stopAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      audioRef.current = null;
    }
    pendingAudioRef.current = null;
    setNeedsUserGestureToPlay(false);
    setVoiceServiceMessage(null);
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    // Resume background music if it was ducked
    window.dispatchEvent(new Event('bg-music:unduck'));
  }, []);

  const startListening = useCallback(async () => {
    if (!supportsSTT) {
      setMicError('Voice input not supported in this browser');
      return null;
    }

    // Invalidate any older push-to-talk session before starting a new one.
    stopListeningSessionRef.current?.();
    const sessionId = ++listeningSessionIdRef.current;
    keepListeningRef.current = true;

    if (state === 'speaking') {
      stopAudio();
      setState('interrupted');
      await new Promise(r => setTimeout(r, 150));
    }

    if (micPermission !== 'granted') {
      const granted = await requestMicPermission();
      if (!granted) {
        keepListeningRef.current = false;
        return null;
      }
    }

    // The user may have released while the permission prompt was open.
    if (!keepListeningRef.current || sessionId !== listeningSessionIdRef.current) {
      setState('idle');
      return null;
    }

    setMicError(null);
    setLiveCaption('');

    if (isNativePlatform) {
      return new Promise<string | null>((resolve) => {
        let settled = false;
        let finalText = '';
        let settleTimer: number | null = null;
        const settle = (value: string | null = finalText || null) => {
          if (settled) return;
          settled = true;
          if (settleTimer !== null) window.clearTimeout(settleTimer);
          keepListeningRef.current = false;
          stopListeningSessionRef.current = null;
          recognitionRef.current = null;
          setState('idle');
          void SpeechRecognition.removeAllListeners().catch(() => {});
          resolve(value?.trim() || null);
        };
        const finishSoon = () => {
          if (settleTimer !== null) window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(() => settle(), 1200);
        };

        void SpeechRecognition.removeAllListeners().then(async () => {
          await SpeechRecognition.addListener('partialResults', event => {
            const transcript = event.matches?.[0]?.trim();
            if (!transcript || settled) return;
            finalText = transcript;
            setLiveCaption(transcript);
          });
          await SpeechRecognition.addListener('listeningState', event => {
            if (event.status === 'started' && !settled) setState('listening');
            if (event.status === 'stopped' && !keepListeningRef.current) finishSoon();
          });
          if (settled || !keepListeningRef.current || sessionId !== listeningSessionIdRef.current) {
            settle();
            return;
          }
          recognitionRef.current = { native: true };
          stopListeningSessionRef.current = () => {
            if (settled || sessionId !== listeningSessionIdRef.current) return;
            keepListeningRef.current = false;
            void SpeechRecognition.stop().catch(() => {});
            finishSoon();
          };
          await SpeechRecognition.start({ language: 'en-US', maxResults: 1, partialResults: true, popup: false });
          if (settled) return;
          setState('listening');
        }).catch((error: unknown) => {
          if (settled) return;
          keepListeningRef.current = false;
          setMicError(error instanceof Error ? `Voice error: ${error.message}` : 'Voice recognition could not start. Please try again.');
          settle(null);
        });
      });
    }

    return new Promise<string | null>((resolve) => {
      let settled = false;
      let committedText = '';
      let currentFinal = '';
      let currentInterim = '';
      let restartTimer: number | null = null;
      let releaseFallbackTimer: number | null = null;

      const combinedCurrentText = () => [currentFinal, currentInterim].filter(Boolean).join(' ').trim();

      const settle = (forcedValue?: string | null) => {
        if (settled) return;
        settled = true;
        if (restartTimer !== null) window.clearTimeout(restartTimer);
        if (releaseFallbackTimer !== null) window.clearTimeout(releaseFallbackTimer);
        if (sessionId === listeningSessionIdRef.current) {
          keepListeningRef.current = false;
          stopListeningSessionRef.current = null;
          recognitionRef.current = null;
          setState('idle');
        }
        const latest = combinedCurrentText();
        const text = forcedValue !== undefined
          ? forcedValue
          : [committedText, latest].filter(Boolean).join(' ').trim();
        resolve(text?.trim() ? text.trim() : null);
      };

      const commitCurrent = () => {
        const heard = combinedCurrentText();
        if (heard) committedText = [committedText, heard].filter(Boolean).join(' ').trim();
        currentFinal = '';
        currentInterim = '';
      };

      const startRecognitionCycle = () => {
        if (settled || !keepListeningRef.current || sessionId !== listeningSessionIdRef.current) {
          settle();
          return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        // Continuous mode reduces browser silence cut-offs. Some Android WebViews
        // still end anyway; onend below restarts while the button is held.
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        currentFinal = '';
        currentInterim = '';

        recognition.onstart = () => {
          if (!settled && keepListeningRef.current && sessionId === listeningSessionIdRef.current) {
            setState('listening');
          }
        };

        recognition.onresult = (event: any) => {
          let finalText = '';
          let interim = '';
          for (let i = 0; i < event.results.length; i++) {
            const r = event.results[i];
            if (r.isFinal) finalText += r[0].transcript;
            else interim += r[0].transcript;
          }
          currentFinal = finalText.trim();
          currentInterim = interim.trim();
          const caption = [committedText, currentFinal || currentInterim].filter(Boolean).join(' ').trim();
          setLiveCaption(caption);
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed') {
            keepListeningRef.current = false;
            setMicError('Microphone access denied.');
            setMicPermission('denied');
            settle(null);
            return;
          }

          if (event.error === 'no-speech') {
            // Silence is NOT a release. Do not kick the user off while they are
            // thinking; onend will restart recognition if the button is held.
            setMicError(null);
            return;
          }

          if (event.error === 'aborted') {
            // Expected when a session is explicitly interrupted/released.
            if (!keepListeningRef.current) settle();
            return;
          }

          // For a real recognition failure, end this session instead of looping.
          keepListeningRef.current = false;
          setMicError('Voice error: ' + event.error);
          settle(null);
        };

        recognition.onend = () => {
          if (settled || sessionId !== listeningSessionIdRef.current) return;

          commitCurrent();
          recognitionRef.current = null;

          if (keepListeningRef.current) {
            // The speech engine ended because of silence/implementation limits,
            // but the user's finger is still down. Restart without sending.
            setState('listening');
            restartTimer = window.setTimeout(startRecognitionCycle, 60);
            return;
          }

          settle();
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          if (keepListeningRef.current) {
            restartTimer = window.setTimeout(startRecognitionCycle, 120);
          } else {
            settle();
          }
        }
      };

      stopListeningSessionRef.current = () => {
        if (settled || sessionId !== listeningSessionIdRef.current) return;
        keepListeningRef.current = false;
        if (restartTimer !== null) {
          window.clearTimeout(restartTimer);
          restartTimer = null;
        }

        const recognition = recognitionRef.current;
        if (recognition) {
          try {
            // stop() asks the engine to finalize the current words before onend.
            recognition.stop();
          } catch {
            settle();
          }
          // Defensive fallback for WebViews that occasionally fail to emit onend.
          releaseFallbackTimer = window.setTimeout(() => settle(), 900);
        } else {
          // We may be in the tiny gap between an automatic end and restart.
          settle();
        }
      };

      startRecognitionCycle();
    });
  }, [supportsSTT, isNativePlatform, state, micPermission, requestMicPermission, stopAudio]);

  const stopListening = useCallback(() => {
    // A pointer-leave while the thumb is still physically down must not end the
    // recording. Global pointer-up/cancel above is the authoritative release.
    if (pointerHeldRef.current) return;
    keepListeningRef.current = false;
    stopListeningSessionRef.current?.();
  }, []);

  // Monotonically increasing speak-id. Any stale fetch/audio whose id is no
  // longer current is discarded — this is what prevents two voices from
  // ever overlapping (e.g. rapid replay taps or back-to-back assistant chunks).
  const speakIdRef = useRef(0);

  const speak = useCallback(async (text: string): Promise<void> => {
    // Hard-stop anything already playing or in-flight before we even start.
    stopAudio();
    speechSynthesis?.cancel?.();

    const mySpeakId = ++speakIdRef.current;
    setLastResponse(text);
    setLiveCaption(text);

    // Respect "Voice Responses" toggle
    let voiceEnabled = true;
    try { voiceEnabled = localStorage.getItem(WINSTON_KEYS.voiceEnabled) !== 'false'; } catch { /* ignore: best effort */ }
    if (!voiceEnabled) {
      setState('idle');
      return;
    }

    const { voiceId, speed, style, stability } = getVoiceSettings();
    setVoiceServiceMessage(null);

    const accessToken = await getFreshAccessToken().catch(() => null);
    if (mySpeakId !== speakIdRef.current) return;
    if (!accessToken) {
      setVoiceServiceMessage('Your sign-in has expired, so Winston cannot speak. Please sign out and sign in again.');
      setState('idle');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setState('processing');
      // edgeFunctionFetch bypasses CapacitorHttp on Android, which would
      // otherwise decode the MP3 as text and corrupt it.
      const resp = await edgeFunctionFetch(TTS_FUNCTION, {
        method: 'POST',
        accessToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId, speed, style, stability }),
        signal: controller.signal,
      });

      // Stale request — a newer speak() has already started, drop this one.
      if (mySpeakId !== speakIdRef.current) return;

      const ct = resp.headers.get('content-type') || '';
      if (!resp.ok || ct.includes('application/json')) {
        if (!resp.ok) {
          const serviceMessage = resp.status === 401
            ? 'Your sign-in has expired, so Winston cannot speak. Please sign out and sign in again.'
            : getWinstonVoiceServiceMessage(resp.status);
          if (serviceMessage) {
            setVoiceServiceMessage(serviceMessage);
            toast.error(serviceMessage, { duration: 6000 });
          }
        } else {
          setVoiceServiceMessage("Winston's voice is unavailable right now. Please try again.");
        }
        // No robotic fallback. Surface the failure and stay silent so the
        // single human voice is the only voice the user ever hears.
        if (!resp.ok && resp.status !== 0) {
          if (resp.status !== 401 && !getWinstonVoiceServiceMessage(resp.status)) {
            toast.error("Winston's voice is unavailable right now.", { duration: 2500 });
          }
        }
        setState('idle');
        return;
      }

      const blob = await resp.blob();
      if (controller.signal.aborted || mySpeakId !== speakIdRef.current) return;

      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      const releaseUrl = () => {
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
      };

      audio.onplay = () => {
        if (mySpeakId !== speakIdRef.current) { audio.pause(); return; }
        setState('speaking');
        window.dispatchEvent(new Event('bg-music:duck'));
      };
      audio.onended = () => {
        releaseUrl();
        if (audioRef.current === audio) audioRef.current = null;
        if (pendingAudioRef.current === audio) pendingAudioRef.current = null;
        setNeedsUserGestureToPlay(false);
        window.dispatchEvent(new Event('bg-music:unduck'));
        if (mySpeakId === speakIdRef.current) setState('idle');
      };
      audio.onerror = () => {
        releaseUrl();
        if (audioRef.current === audio) audioRef.current = null;
        window.dispatchEvent(new Event('bg-music:unduck'));
        if (mySpeakId === speakIdRef.current) {
          setVoiceServiceMessage("Winston's voice couldn't play on this device. Check your media volume and try again.");
          setState('idle');
        }
      };

      await audio.play().catch(() => {
        if (mySpeakId === speakIdRef.current) {
          pendingAudioRef.current = audio;
          setNeedsUserGestureToPlay(true);
          setState('idle');
        }
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Aborting is a normal user action (replay, interrupt, unmount, etc.).
        // The old code returned while leaving the hook stuck in "processing"
        // when the abort was not immediately followed by another state change.
        if (mySpeakId === speakIdRef.current) setState('idle');
        return;
      }
      if (mySpeakId === speakIdRef.current) {
        setVoiceServiceMessage("Winston's voice couldn't load. Check your connection and try again.");
        setState('idle');
      }
    }
  }, [stopAudio]);

  const playPendingAudio = useCallback(async () => {
    const audio = pendingAudioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setNeedsUserGestureToPlay(false);
    } catch {
      toast.error("Winston's voice still can't play. Check your device's media volume and try again.");
    }
  }, []);

  const interrupt = useCallback(() => {
    // Invalidate any in-flight speak() so its late audio can't start playing.
    speakIdRef.current++;
    pointerHeldRef.current = false;
    keepListeningRef.current = false;
    stopListeningSessionRef.current?.();
    recognitionRef.current?.abort?.();
    recognitionRef.current?.stop?.();
    stopAudio();
    speechSynthesis?.cancel?.();
    setState('idle');
    setLiveCaption('');
    setNeedsUserGestureToPlay(false);
  }, [stopAudio]);

  const endSession = useCallback(() => {
    interrupt();
      setLiveCaption('');
    setLastResponse('');
  }, [interrupt]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const previous = synth.onvoiceschanged;
    const onVoicesChanged = () => { synth.getVoices(); };
    synth.getVoices();
    synth.onvoiceschanged = onVoicesChanged;
    return () => {
      if (synth.onvoiceschanged === onVoicesChanged) synth.onvoiceschanged = previous;
    };
  }, []);

  return {
    state,
    setState,
    liveCaption,
    setLiveCaption,
    lastResponse,
    micError,
    micPermission,
    supportsSTT,
    startListening,
    stopListening,
    speak,
    stopAudio,
    playPendingAudio,
    needsUserGestureToPlay,
    voiceServiceMessage,
    interrupt,
    endSession,
    requestMicPermission,
  };
}
